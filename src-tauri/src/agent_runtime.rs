use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::agent_catalog::{AgentNodeDistribution, AgentNodeRuntime};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_RUNTIME_ARCHIVE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_RUNTIME_UNPACKED_BYTES: u64 = 512 * 1024 * 1024;
const USER_AGENT: &str = concat!("okf-studio/", env!("CARGO_PKG_VERSION"));

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRuntimeReceipt {
    version: String,
    target: String,
    node_path: String,
    npm_path: String,
    sha256: String,
    already_installed: bool,
}

pub fn ensure(
    app: &AppHandle,
    runtime: &AgentNodeRuntime,
    distribution: &AgentNodeDistribution,
    install_id: &str,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(&'static str, u64, u64),
) -> Result<NodeRuntimeReceipt, String> {
    validate_distribution(distribution)?;
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("No cache directory is available: {error}"))?
        .join("agents")
        .join("runtime")
        .join("node");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Studio could not create the runtime cache: {error}"))?;
    let destination = root.join(&runtime.version);
    if let Some(receipt) = installed_receipt(&destination, runtime, distribution)? {
        return Ok(receipt);
    }

    let extension = if distribution.archive == "zip" {
        "zip"
    } else {
        "tar.gz"
    };
    let archive = root.join(format!(".install-{install_id}.{extension}"));
    let staging = root.join(format!(".install-{install_id}"));
    remove_path(&archive)?;
    remove_path(&staging)?;

    let result = (|| {
        progress("runtime-downloading", 0, distribution.download_size);
        download(distribution, &archive, cancelled, |downloaded| {
            progress(
                "runtime-downloading",
                downloaded,
                distribution.download_size,
            );
        })?;
        check_cancelled(cancelled)?;
        progress(
            "runtime-extracting",
            distribution.download_size,
            distribution.download_size,
        );
        fs::create_dir_all(&staging)
            .map_err(|error| format!("Studio could not create runtime staging: {error}"))?;
        match distribution.archive.as_str() {
            "zip" => extract_zip(&archive, &staging, &distribution.root, cancelled)?,
            "tar-gz" => extract_tar(&archive, &staging, &distribution.root, cancelled)?,
            _ => return Err("The managed Node archive kind is unsupported.".to_string()),
        }
        check_cancelled(cancelled)?;

        let extracted = staging.join(&distribution.root);
        validate_runtime_files(&extracted)?;
        remove_path(&destination)?;
        fs::rename(&extracted, &destination)
            .map_err(|error| format!("Studio could not finish the Node installation: {error}"))?;
        let _ = remove_path(&staging);

        let (node, npm) = runtime_paths(&destination);
        let receipt = NodeRuntimeReceipt {
            version: runtime.version.clone(),
            target: distribution.target.clone(),
            node_path: node.to_string_lossy().into_owned(),
            npm_path: npm.to_string_lossy().into_owned(),
            sha256: distribution.sha256.clone(),
            already_installed: false,
        };
        let marker = serde_json::to_vec_pretty(&receipt)
            .map_err(|error| format!("Studio could not record the Node runtime: {error}"))?;
        fs::write(destination.join(".okf-studio-node.json"), marker)
            .map_err(|error| format!("Studio could not record the Node runtime: {error}"))?;
        Ok(receipt)
    })();

    let _ = remove_path(&archive);
    if result.is_err() {
        let _ = remove_path(&staging);
    }
    result
}

fn download(
    distribution: &AgentNodeDistribution,
    destination: &Path,
    cancelled: &AtomicBool,
    on_progress: impl FnMut(u64),
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout_read(READ_TIMEOUT)
        .user_agent(USER_AGENT)
        .build();
    let response = agent
        .get(&distribution.url)
        .call()
        .map_err(|error| format!("Studio could not download managed Node: {error}"))?;
    let mut file = File::create(destination)
        .map_err(|error| format!("Studio could not create the Node archive: {error}"))?;
    copy_verified(
        response.into_reader(),
        &mut file,
        distribution.download_size,
        &distribution.sha256,
        cancelled,
        on_progress,
    )
}

fn copy_verified<R: Read, W: Write>(
    mut reader: R,
    mut writer: W,
    expected_size: u64,
    expected_sha256: &str,
    cancelled: &AtomicBool,
    mut on_progress: impl FnMut(u64),
) -> Result<(), String> {
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        check_cancelled(cancelled)?;
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("The managed Node download failed: {error}"))?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > MAX_RUNTIME_ARCHIVE_BYTES || total > expected_size {
            return Err("The managed Node archive exceeded its pinned size.".to_string());
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|error| format!("Studio could not cache managed Node: {error}"))?;
        digest.update(&buffer[..read]);
        on_progress(total);
    }
    if total != expected_size {
        return Err(format!(
            "The managed Node size did not match the manifest (expected {expected_size}, received {total})."
        ));
    }
    let actual = format!("{:x}", digest.finalize());
    if actual != expected_sha256 {
        return Err("The managed Node archive failed its SHA-256 check.".to_string());
    }
    Ok(())
}

fn extract_tar(
    archive: &Path,
    destination: &Path,
    expected_root: &str,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let file = File::open(archive)
        .map_err(|error| format!("Studio could not open the Node archive: {error}"))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    let mut total = 0_u64;
    for item in tar
        .entries()
        .map_err(|error| format!("The Node archive is invalid: {error}"))?
    {
        check_cancelled(cancelled)?;
        let mut entry = item.map_err(|error| format!("The Node archive is invalid: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("The Node archive contains an invalid path: {error}"))?;
        validate_archive_path(&path, expected_root)?;
        let kind = entry.header().entry_type();
        if kind.is_symlink() {
            let target = entry
                .link_name()
                .map_err(|error| format!("The Node archive has an invalid link: {error}"))?
                .ok_or_else(|| "The Node archive has a link without a target.".to_string())?;
            validate_symlink_target(&path, &target, expected_root)?;
        } else if !kind.is_file() && !kind.is_dir() {
            return Err("The Node archive contains a hard link or unsupported entry.".to_string());
        }
        if kind.is_file() {
            total = checked_unpacked_size(total, entry.size())?;
        }
        if !entry
            .unpack_in(destination)
            .map_err(|error| format!("Studio could not extract managed Node: {error}"))?
        {
            return Err("The Node archive tried to escape its staging directory.".to_string());
        }
    }
    Ok(())
}

fn extract_zip(
    archive: &Path,
    destination: &Path,
    expected_root: &str,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let file = File::open(archive)
        .map_err(|error| format!("Studio could not open the Node archive: {error}"))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|error| format!("The Node archive is invalid: {error}"))?;
    let mut total = 0_u64;
    for index in 0..zip.len() {
        check_cancelled(cancelled)?;
        let mut entry = zip
            .by_index(index)
            .map_err(|error| format!("The Node archive is invalid: {error}"))?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("The Node archive contains a symbolic link.".to_string());
        }
        let path = entry
            .enclosed_name()
            .ok_or_else(|| "The Node archive contains an unsafe path.".to_string())?;
        validate_archive_path(&path, expected_root)?;
        let target = destination.join(path);
        if entry.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("Studio could not extract managed Node: {error}"))?;
            continue;
        }
        total = checked_unpacked_size(total, entry.size())?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Studio could not extract managed Node: {error}"))?;
        }
        let mut output = File::create(&target)
            .map_err(|error| format!("Studio could not extract managed Node: {error}"))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Studio could not extract managed Node: {error}"))?;
    }
    Ok(())
}

fn validate_archive_path(path: &Path, expected_root: &str) -> Result<(), String> {
    let mut components = path.components();
    match components.next() {
        Some(Component::Normal(root)) if root == expected_root => {}
        _ => return Err("The Node archive contains an unexpected root path.".to_string()),
    }
    if components.any(|component| !matches!(component, Component::Normal(_))) {
        return Err("The Node archive contains an unsafe path.".to_string());
    }
    Ok(())
}

fn validate_symlink_target(
    link_path: &Path,
    target: &Path,
    expected_root: &str,
) -> Result<(), String> {
    if target.is_absolute() {
        return Err("The Node archive contains an absolute symbolic link.".to_string());
    }
    let mut resolved = link_path
        .parent()
        .into_iter()
        .flat_map(Path::components)
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_os_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    for component in target.components() {
        match component {
            Component::Normal(part) => resolved.push(part.to_os_string()),
            Component::CurDir => {}
            Component::ParentDir if resolved.len() > 1 => {
                resolved.pop();
            }
            _ => {
                return Err(
                    "The Node archive contains a symbolic link outside its root.".to_string(),
                );
            }
        }
    }
    if resolved.first().is_none_or(|part| part != expected_root) {
        return Err("The Node archive contains a symbolic link outside its root.".to_string());
    }
    Ok(())
}

fn checked_unpacked_size(total: u64, size: u64) -> Result<u64, String> {
    let next = total.saturating_add(size);
    if next > MAX_RUNTIME_UNPACKED_BYTES {
        Err("The managed Node archive expanded beyond the safety limit.".to_string())
    } else {
        Ok(next)
    }
}

fn validate_distribution(distribution: &AgentNodeDistribution) -> Result<(), String> {
    if !distribution.url.starts_with("https://nodejs.org/dist/") {
        return Err("Managed Node is not hosted on nodejs.org.".to_string());
    }
    if distribution.sha256.len() != 64
        || !distribution
            .sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("Managed Node has an invalid SHA-256 value.".to_string());
    }
    if distribution.download_size == 0 || distribution.download_size > MAX_RUNTIME_ARCHIVE_BYTES {
        return Err("Managed Node has an invalid archive size.".to_string());
    }
    if distribution.archive != "zip" && distribution.archive != "tar-gz" {
        return Err("Managed Node has an unsupported archive kind.".to_string());
    }
    Ok(())
}

fn installed_receipt(
    destination: &Path,
    runtime: &AgentNodeRuntime,
    distribution: &AgentNodeDistribution,
) -> Result<Option<NodeRuntimeReceipt>, String> {
    let marker = destination.join(".okf-studio-node.json");
    if !marker.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(marker)
        .map_err(|error| format!("Studio could not read the Node install record: {error}"))?;
    let mut receipt: NodeRuntimeReceipt = serde_json::from_slice(&bytes)
        .map_err(|error| format!("The Node install record is invalid: {error}"))?;
    if receipt.version != runtime.version
        || receipt.target != distribution.target
        || receipt.sha256 != distribution.sha256
        || validate_runtime_files(destination).is_err()
    {
        return Ok(None);
    }
    receipt.already_installed = true;
    Ok(Some(receipt))
}

fn validate_runtime_files(destination: &Path) -> Result<(), String> {
    let (node, npm) = runtime_paths(destination);
    if !node.is_file() || !npm.is_file() {
        return Err("The managed Node archive is missing node or npm.".to_string());
    }
    Ok(())
}

fn runtime_paths(destination: &Path) -> (PathBuf, PathBuf) {
    if cfg!(windows) {
        (destination.join("node.exe"), destination.join("npm.cmd"))
    } else {
        (
            destination.join("bin").join("node"),
            destination.join("bin").join("npm"),
        )
    }
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::Acquire) {
        Err("Installation cancelled.".to_string())
    } else {
        Ok(())
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|error| format!("Studio could not clear a stale runtime path: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn verifies_runtime_size_and_sha256() {
        let bytes = b"managed node";
        let mut output = Vec::new();
        copy_verified(
            Cursor::new(bytes),
            &mut output,
            bytes.len() as u64,
            &sha256(bytes),
            &AtomicBool::new(false),
            |_| {},
        )
        .expect("runtime should verify");
        assert_eq!(output, bytes);
    }

    #[test]
    fn rejects_corrupt_runtime_and_honors_cancellation() {
        let bytes = b"managed node";
        let corrupt = copy_verified(
            Cursor::new(bytes),
            Vec::new(),
            bytes.len() as u64,
            &sha256(b"other"),
            &AtomicBool::new(false),
            |_| {},
        );
        assert!(corrupt.unwrap_err().contains("SHA-256"));

        let cancelled = AtomicBool::new(true);
        let stopped = copy_verified(
            Cursor::new(bytes),
            Vec::new(),
            bytes.len() as u64,
            &sha256(bytes),
            &cancelled,
            |_| {},
        );
        assert_eq!(stopped.unwrap_err(), "Installation cancelled.");
    }

    #[test]
    fn runtime_archive_paths_stay_under_the_pinned_root() {
        assert!(validate_archive_path(Path::new("node-v1/bin/node"), "node-v1").is_ok());
        assert!(validate_archive_path(Path::new("other/bin/node"), "node-v1").is_err());
        assert!(validate_archive_path(Path::new("../node-v1/bin/node"), "node-v1").is_err());
    }

    #[test]
    fn allows_only_symlinks_that_resolve_inside_the_runtime_root() {
        assert!(validate_symlink_target(
            Path::new("node-v1/bin/npm"),
            Path::new("../lib/node_modules/npm/bin/npm-cli.js"),
            "node-v1",
        )
        .is_ok());
        assert!(validate_symlink_target(
            Path::new("node-v1/bin/npm"),
            Path::new("../../../outside"),
            "node-v1",
        )
        .is_err());
        assert!(validate_symlink_target(
            Path::new("node-v1/bin/npm"),
            Path::new("/absolute"),
            "node-v1",
        )
        .is_err());
    }
}
