//! Building the ACP prompt context from the bundle and attached sources.
//! Serves bounded, containment-checked bundle text to the active session,
//! turns explicit concept paths into resource links, and validates and
//! reduces attached sources to labelled content blocks before the user
//! prompt. See docs/architecture/agent-system.md.

use super::*;

pub(crate) fn read_bundle_text(
    sessions: &Mutex<HashMap<String, PathBuf>>,
    stages: &SessionStages,
    request: &ReadTextFileRequest,
) -> Result<String, String> {
    let session_id = request.session_id.to_string();
    let bundle_root = sessions
        .lock()
        .map_err(|_| "Bundle read state is unavailable.".to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Bundle read denied: the ACP session is not active.".to_string())?;
    if !request.path.is_absolute() {
        return Err("Bundle read denied: ACP file paths must be absolute.".to_string());
    }
    let start_line = request.line.unwrap_or(1);
    if start_line == 0 {
        return Err("Bundle read denied: the starting line must be 1 or greater.".to_string());
    }
    // Staged content overlays the bundle so a granted agent observes its own
    // writes, including files that do not exist on disk yet.
    if let Some(staged) = stages.staged_content(&session_id, &request.path) {
        let limit = request.limit.map_or(usize::MAX, |value| value as usize);
        return Ok(staged
            .split_inclusive('\n')
            .skip((start_line - 1) as usize)
            .take(limit)
            .collect());
    }
    let path = request
        .path
        .canonicalize()
        .map_err(|_| "Bundle file is unavailable.".to_string())?;
    if !path.starts_with(&bundle_root) {
        return Err("Bundle read denied: the file is outside the active bundle root.".to_string());
    }
    let relative = path.strip_prefix(&bundle_root).map_err(|_| {
        "Bundle read denied: the file is outside the active bundle root.".to_string()
    })?;
    if let Some(reason) = protected_bundle_path_reason(relative) {
        return Err(format!("Bundle read denied: {reason}"));
    }
    if !path.is_file() {
        return Err("Bundle read denied: the requested path is not a file.".to_string());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(&path)
        .map_err(|_| "Bundle file is unavailable.".to_string())?
        .take((MAX_AGENT_READ_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Bundle file could not be read.".to_string())?;
    if bytes.len() > MAX_AGENT_READ_BYTES {
        return Err(format!(
            "Bundle read denied: text files are limited to {MAX_AGENT_READ_BYTES} bytes."
        ));
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| "Bundle read denied: the requested file is not UTF-8 text.".to_string())?;
    let limit = request.limit.map_or(usize::MAX, |value| value as usize);
    Ok(text
        .split_inclusive('\n')
        .skip((start_line - 1) as usize)
        .take(limit)
        .collect())
}

pub(crate) fn context_resource_links(
    bundle_root: &std::path::Path,
    context_paths: &[String],
) -> Result<Vec<ContentBlock>, String> {
    let mut seen = HashSet::new();
    context_paths
        .iter()
        .filter(|relative| seen.insert((*relative).clone()))
        .map(|relative| {
            let relative_path = std::path::Path::new(relative);
            if relative_path.is_absolute()
                || relative_path
                    .components()
                    .any(|component| !matches!(component, std::path::Component::Normal(_)))
            {
                return Err(
                    "Context attachment denied: paths must be bundle-relative files.".to_string(),
                );
            }
            let path = bundle_root
                .join(relative_path)
                .canonicalize()
                .map_err(|_| "Context attachment is unavailable.".to_string())?;
            if !path.starts_with(bundle_root) || !path.is_file() {
                return Err(
                    "Context attachment denied: the file is outside the active bundle root."
                        .to_string(),
                );
            }
            let canonical_relative = path.strip_prefix(bundle_root).map_err(|_| {
                "Context attachment denied: the file is outside the active bundle root.".to_string()
            })?;
            if let Some(reason) = protected_bundle_path_reason(canonical_relative) {
                return Err(format!("Context attachment denied: {reason}"));
            }
            let uri = url::Url::from_file_path(&path).map_err(|()| {
                "Context attachment could not be represented as a file URL.".to_string()
            })?;
            Ok(ContentBlock::ResourceLink(
                ResourceLink::new(format!("Context: {relative}"), uri.to_string())
                    .description("User-attached OKF concept from the active bundle.")
                    .mime_type("text/markdown"),
            ))
        })
        .collect()
}

pub(crate) fn validate_sources(sources: &[AgentSourceInput]) -> Result<(), String> {
    if sources.len() > MAX_SOURCE_ATTACHMENTS {
        return Err(format!(
            "A prompt can attach at most {MAX_SOURCE_ATTACHMENTS} text sources."
        ));
    }
    let mut total_chars = 0_usize;
    let mut total_image_bytes = 0_u64;
    for source in sources {
        let title = source.title.trim();
        if title.is_empty()
            || title.chars().count() > MAX_SOURCE_TITLE_CHARS
            || title.chars().any(char::is_control)
        {
            return Err(
                "Source titles must be non-empty, bounded, and contain no controls.".to_string(),
            );
        }
        let is_image = source.image_data.is_some();
        if is_image {
            if !source.content.is_empty()
                || !matches!(
                    source.media_type.as_deref(),
                    Some("image/png" | "image/jpeg" | "image/webp")
                )
            {
                return Err(
                    "Image sources must use a supported image media type and no text body."
                        .to_string(),
                );
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(source.image_data.as_deref().unwrap_or_default())
                .map_err(|_| "Image sources must contain valid base64 data.".to_string())?;
            if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_SOURCE_BYTES {
                return Err("Image sources must be non-empty and no larger than 8 MiB.".to_string());
            }
            if !image_bytes_match_media_type(
                &bytes,
                source.media_type.as_deref().unwrap_or_default(),
            ) {
                return Err("Image source bytes do not match their media type.".to_string());
            }
            total_image_bytes = total_image_bytes.saturating_add(bytes.len() as u64);
            if total_image_bytes > MAX_IMAGE_TOTAL_BYTES {
                return Err("Attached images cannot exceed 16 MiB in total.".to_string());
            }
            let digest = format!("{:x}", Sha256::digest(&bytes));
            if source.source_digest.as_deref() != Some(digest.as_str()) {
                return Err("Image source digests must match the attached bytes.".to_string());
            }
        } else {
            let content_chars = source.content.chars().count();
            if source.content.trim().is_empty() || content_chars > MAX_SOURCE_CONTENT_CHARS {
                return Err(format!(
                    "Source content must be non-empty and cannot exceed {MAX_SOURCE_CONTENT_CHARS} characters."
                ));
            }
            total_chars = total_chars.saturating_add(content_chars);
        }
        if let Some(origin) = &source.origin {
            let origin = origin.trim();
            if origin.is_empty()
                || origin.chars().count() > MAX_SOURCE_ORIGIN_CHARS
                || origin.chars().any(char::is_control)
            {
                return Err("Source origins must be bounded and contain no controls.".to_string());
            }
        }
        if source
            .media_type
            .as_deref()
            .is_some_and(|media_type| !SOURCE_MEDIA_TYPES.contains(&media_type))
        {
            return Err("Source media types must use a supported text format.".to_string());
        }
        if source.source_digest.as_deref().is_some_and(|digest| {
            digest.len() != 64
                || !digest
                    .chars()
                    .all(|character| matches!(character, '0'..='9' | 'a'..='f'))
        }) {
            return Err("Source digests must be lowercase SHA-256 values.".to_string());
        }
        if source.warning.as_deref().is_some_and(|warning| {
            warning.trim().is_empty()
                || warning.chars().count() > MAX_SOURCE_TITLE_CHARS * 2
                || warning.chars().any(char::is_control)
        }) {
            return Err("Source warnings must be bounded and contain no controls.".to_string());
        }
        if let Some(receipt) = &source.adapter_receipt {
            validate_source_receipt(source, receipt)?;
        }
    }
    if total_chars > MAX_SOURCE_TOTAL_CHARS {
        return Err(format!(
            "Attached sources cannot exceed {MAX_SOURCE_TOTAL_CHARS} characters in total."
        ));
    }
    Ok(())
}

fn validate_source_receipt(
    source: &AgentSourceInput,
    receipt: &crate::agent_source_adapter::SourceAdapterReceipt,
) -> Result<(), String> {
    if receipt.schema_version != crate::agent_source_adapter::ADAPTER_SCHEMA_VERSION
        || receipt.adapter_version == 0
    {
        return Err("Source adapter receipts must use a supported positive version.".to_string());
    }
    if receipt.adapter_id.is_empty()
        || receipt.adapter_id.len() > 64
        || !receipt
            .adapter_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || receipt.trust != "untrusted"
    {
        return Err(
            "Source adapter receipts must identify a bounded adapter and untrusted evidence."
                .to_string(),
        );
    }
    if source.origin.as_deref() != Some(receipt.origin.as_str())
        || source.media_type.as_deref() != Some(receipt.media_type.as_str())
    {
        return Err("Source adapter provenance must match the attached source.".to_string());
    }
    let source_digest = source.source_digest.as_deref().ok_or_else(|| {
        "Sources with adapter receipts must include their original SHA-256 digest.".to_string()
    })?;
    if receipt.source_fingerprint != format!("sha256-{source_digest}") {
        return Err(
            "Source adapter source fingerprints must match the attached source.".to_string(),
        );
    }
    let evidence_digest = if let Some(image_data) = &source.image_data {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(image_data)
            .map_err(|_| "Image source receipts require valid image data.".to_string())?;
        format!("{:x}", Sha256::digest(bytes))
    } else {
        format!("{:x}", Sha256::digest(source.content.as_bytes()))
    };
    if receipt.evidence_fingerprint != format!("sha256-{evidence_digest}") {
        return Err(
            "Source adapter evidence fingerprints must match the normalized evidence.".to_string(),
        );
    }
    let refresh_digest = format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{}\0{}\0{}\0{}",
                receipt.schema_version, receipt.adapter_id, receipt.adapter_version, source_digest
            )
            .as_bytes()
        )
    );
    if receipt.refresh_fingerprint != format!("source-refresh-v1-{refresh_digest}") {
        return Err("Source adapter refresh fingerprints must match their contract.".to_string());
    }
    if receipt.diagnostics.len() > 16
        || receipt.diagnostics.iter().any(|diagnostic| {
            diagnostic.code.is_empty()
                || diagnostic.code.len() > 64
                || !diagnostic
                    .code
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
                || diagnostic.message.trim().is_empty()
                || diagnostic.message.chars().count() > 512
                || diagnostic.message.chars().any(char::is_control)
        })
    {
        return Err("Source adapter diagnostics must be bounded and actionable.".to_string());
    }
    Ok(())
}

fn image_bytes_match_media_type(bytes: &[u8], media_type: &str) -> bool {
    match media_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

pub(crate) fn source_content_blocks(sources: Vec<AgentSourceInput>) -> Vec<ContentBlock> {
    sources
        .into_iter()
        .flat_map(|source| {
            if let (Some(data), Some(media_type)) =
                (source.image_data.clone(), source.media_type.clone())
            {
                let origin = source.origin.as_deref().unwrap_or("selected image");
                let digest = source.source_digest.as_deref().unwrap_or("unavailable");
                let adapter = source.adapter_receipt.as_ref().map_or_else(String::new, |receipt| {
                    format!(
                        "\nAdapter: {} v{}\nEvidence fingerprint: {}\nRefresh fingerprint: {}\nTrust: {}",
                        receipt.adapter_id,
                        receipt.adapter_version,
                        receipt.evidence_fingerprint,
                        receipt.refresh_fingerprint,
                        receipt.trust
                    )
                });
                return vec![
                    ContentBlock::Text(TextContent::new(format!(
                        "## Attached user image: {}\n\nOrigin: {}\nMedia type: {}\nOriginal source SHA-256: {}{}",
                        source.title.trim(),
                        origin,
                        media_type,
                        digest,
                        adapter
                    ))),
                    ContentBlock::Image(ImageContent::new(data, media_type)),
                ];
            }
            let digest = format!("{:x}", Sha256::digest(source.content.as_bytes()));
            let origin = source.origin.as_deref().unwrap_or("pasted text");
            let media_type = source
                .media_type
                .as_deref()
                .map(|value| format!("\nMedia type: {value}"))
                .unwrap_or_default();
            let source_digest = source
                .source_digest
                .as_deref()
                .map(|value| format!("\nOriginal source SHA-256: {value}"))
                .unwrap_or_default();
            let warning = source
                .warning
                .as_deref()
                .map(|value| format!("\nExtraction warning: {value}"))
                .unwrap_or_default();
            let adapter = source.adapter_receipt.as_ref().map_or_else(String::new, |receipt| {
                format!(
                    "\nAdapter: {} v{}\nEvidence fingerprint: {}\nRefresh fingerprint: {}\nTrust: {}",
                    receipt.adapter_id,
                    receipt.adapter_version,
                    receipt.evidence_fingerprint,
                    receipt.refresh_fingerprint,
                    receipt.trust
                )
            });
            vec![ContentBlock::Text(TextContent::new(format!(
                "## Attached user source: {}\n\nOrigin: {}{}{}{}{}\nContent SHA-256: {}\n\n{}",
                source.title.trim(),
                origin,
                media_type,
                source_digest,
                warning,
                adapter,
                digest,
                source.content
            )))]
        })
        .collect()
}
