use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

pub(crate) const MAX_SOURCE_ATTACHMENTS: usize = 8;
pub(crate) const MAX_SOURCE_CONTENT_CHARS: usize = 256 * 1024;
pub(crate) const MAX_SOURCE_TOTAL_CHARS: usize = 512 * 1024;
pub(crate) const MAX_SOURCE_TITLE_CHARS: usize = 256;
const MAX_SOURCE_FILE_BYTES: u64 = MAX_SOURCE_CONTENT_CHARS as u64;
const MAX_SELECTED_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSourceInput {
    pub(crate) title: String,
    pub(crate) content: String,
    pub(crate) origin: Option<String>,
    pub(crate) media_type: Option<String>,
    pub(crate) source_digest: Option<String>,
    pub(crate) warning: Option<String>,
}

pub(crate) fn pick_text_sources(
    app: &AppHandle,
    requested_limit: usize,
) -> Result<Vec<AgentSourceInput>, String> {
    if requested_limit == 0 {
        return Err("The source tray is full.".to_string());
    }
    let limit = requested_limit.min(MAX_SOURCE_ATTACHMENTS);
    let selected = app
        .dialog()
        .file()
        .add_filter(
            "PDF, text, Markdown, HTML, CSV, and JSON",
            &["pdf", "txt", "md", "markdown", "html", "htm", "csv", "json"],
        )
        .blocking_pick_files()
        .unwrap_or_default();
    if selected.len() > limit {
        return Err(format!("Select at most {limit} more source files."));
    }
    let paths = selected
        .into_iter()
        .map(|path| {
            path.into_path().map_err(|_| {
                "A selected source path is not available on this platform.".to_string()
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    read_text_sources(&paths, limit)
}

fn read_text_sources(paths: &[PathBuf], limit: usize) -> Result<Vec<AgentSourceInput>, String> {
    if limit == 0 {
        return Err("Select at most 0 more source files.".to_string());
    }
    if paths.len() > limit || paths.len() > MAX_SOURCE_ATTACHMENTS {
        return Err(format!("Select at most {limit} more source files."));
    }
    let mut total_file_bytes = 0_u64;
    let mut total_content_chars = 0_usize;
    let mut sources = Vec::with_capacity(paths.len());
    for path in paths {
        let media_type = media_type_for_path(path)?;
        let title = path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "A selected source has no usable filename.".to_string())?
            .to_string();
        if title.chars().count() > MAX_SOURCE_TITLE_CHARS || title.chars().any(char::is_control) {
            return Err("A selected source filename is too long or contains controls.".to_string());
        }
        let metadata = path
            .metadata()
            .map_err(|error| format!("Could not inspect {title}: {error}"))?;
        if !metadata.is_file() {
            return Err(format!("{title} is not a file."));
        }
        let file_limit = if media_type == "application/pdf" {
            crate::agent_pdf::MAX_PDF_BYTES
        } else {
            MAX_SOURCE_FILE_BYTES
        };
        if metadata.len() > file_limit {
            return Err(if media_type == "application/pdf" {
                format!("{title} exceeds the 16 MiB PDF limit.")
            } else {
                format!("{title} exceeds the 256 KiB source limit.")
            });
        }
        total_file_bytes = total_file_bytes.saturating_add(metadata.len());
        if total_file_bytes > MAX_SELECTED_FILE_BYTES {
            return Err("Selected source files exceed the 32 MiB combined limit.".to_string());
        }

        let (content, source_digest, warning) = if media_type == "application/pdf" {
            let extraction = crate::agent_pdf::extract_in_helper(path)?;
            (
                extraction.content,
                Some(extraction.source_digest),
                extraction.warning,
            )
        } else {
            let mut bytes = Vec::with_capacity(metadata.len() as usize);
            File::open(path)
                .and_then(|file| file.take(file_limit + 1).read_to_end(&mut bytes))
                .map_err(|error| format!("Could not read {title}: {error}"))?;
            if bytes.len() as u64 > file_limit {
                return Err(format!("{title} exceeds the 256 KiB source limit."));
            }
            let content = String::from_utf8(bytes)
                .map_err(|_| format!("{title} is not valid UTF-8 text."))?;
            (content, None, None)
        };
        if content.trim().is_empty() {
            return Err(format!("{title} is empty."));
        }
        total_content_chars = total_content_chars.saturating_add(content.chars().count());
        if total_content_chars > MAX_SOURCE_TOTAL_CHARS {
            return Err(
                "Extracted source text exceeds the 524,288 character combined limit.".to_string(),
            );
        }
        sources.push(AgentSourceInput {
            title: title.clone(),
            content,
            origin: Some(title),
            media_type: Some(media_type.to_string()),
            source_digest,
            warning,
        });
    }
    Ok(sources)
}

fn media_type_for_path(path: &Path) -> Result<&'static str, String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("txt") => Ok("text/plain"),
        Some("md" | "markdown") => Ok("text/markdown"),
        Some("html" | "htm") => Ok("text/html"),
        Some("csv") => Ok("text/csv"),
        Some("json") => Ok("application/json"),
        Some("pdf") => Ok("application/pdf"),
        _ => Err("Sources must be PDF, text, Markdown, HTML, CSV, or JSON files.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("okf-agent-sources-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp directory");
        path
    }

    #[test]
    fn reads_supported_text_without_disclosing_its_path() {
        let root = temp_dir();
        let path = root.join("Research.md");
        fs::write(&path, "# Notes\n\nVerified.").expect("write source");

        let sources = read_text_sources(&[path], 1).expect("read source");

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].title, "Research.md");
        assert_eq!(sources[0].origin.as_deref(), Some("Research.md"));
        assert_eq!(sources[0].media_type.as_deref(), Some("text/markdown"));
        assert_eq!(sources[0].content, "# Notes\n\nVerified.");
        let serialized = serde_json::to_string(&sources).expect("serialize sources");
        assert!(!serialized.contains(root.to_string_lossy().as_ref()));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn labels_structured_text_with_its_media_type() {
        let root = temp_dir();
        let cases = [
            ("page.html", "<h1>Report</h1>", "text/html"),
            ("rows.csv", "name,value\nalpha,1", "text/csv"),
            ("record.json", r#"{"name":"alpha"}"#, "application/json"),
        ];
        for (name, content, expected_media_type) in cases {
            let path = root.join(name);
            fs::write(&path, content).expect("write structured source");
            let sources = read_text_sources(&[path], 1).expect("read structured source");
            assert_eq!(sources[0].media_type.as_deref(), Some(expected_media_type));
        }
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_unsupported_binary_and_oversized_sources() {
        let root = temp_dir();
        let unsupported = root.join("notes.xml");
        fs::write(&unsupported, "<notes />").expect("write unsupported source");
        assert!(read_text_sources(&[unsupported], 1)
            .expect_err("reject unsupported extension")
            .contains("text"));

        let binary = root.join("binary.txt");
        fs::write(&binary, [0xff, 0xfe]).expect("write binary source");
        assert!(read_text_sources(&[binary], 1)
            .expect_err("reject binary source")
            .contains("UTF-8"));

        let oversized = root.join("large.md");
        fs::write(&oversized, vec![b'a'; MAX_SOURCE_FILE_BYTES as usize + 1])
            .expect("write oversized source");
        assert!(read_text_sources(&[oversized], 1)
            .expect_err("reject oversized source")
            .contains("256 KiB"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn enforces_the_requested_selection_limit() {
        let root = temp_dir();
        let first = root.join("first.txt");
        let second = root.join("second.txt");
        fs::write(&first, "first").expect("write first source");
        fs::write(&second, "second").expect("write second source");

        assert!(read_text_sources(&[first, second], 1)
            .expect_err("reject excess selection")
            .contains("at most 1"));
        assert!(read_text_sources(&[], 0)
            .expect_err("reject a full tray")
            .contains("at most 0"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_a_selection_above_the_combined_byte_limit() {
        let root = temp_dir();
        let paths = ["first.txt", "second.md", "third.markdown"].map(|name| root.join(name));
        for path in &paths {
            fs::write(path, vec![b'a'; 180 * 1024]).expect("write source");
        }

        assert!(read_text_sources(&paths, 3)
            .expect_err("reject combined source size")
            .contains("524,288 character"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }
}
