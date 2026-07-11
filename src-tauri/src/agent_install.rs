use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use tauri::{AppHandle, Emitter, Manager};

use crate::agent_catalog::{self, AgentDistribution};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_PACKAGE_BYTES: u64 = 64 * 1024 * 1024;
const USER_AGENT: &str = concat!("okf-studio/", env!("CARGO_PKG_VERSION"));

#[derive(Default)]
pub struct AgentInstallState {
    jobs: Mutex<HashMap<String, InstallJob>>,
}

struct InstallJob {
    agent_id: String,
    cancelled: Arc<AtomicBool>,
}

impl AgentInstallState {
    pub fn start(&self, install_id: &str, agent_id: &str) -> Result<Arc<AtomicBool>, String> {
        safe_id(install_id, "install")?;
        let mut jobs = self
            .jobs
            .lock()
            .map_err(|_| "The installer state is unavailable.".to_string())?;
        if jobs.contains_key(install_id) {
            return Err("That installation is already running.".to_string());
        }
        if jobs.values().any(|job| job.agent_id == agent_id) {
            return Err("This agent is already being installed.".to_string());
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        jobs.insert(
            install_id.to_string(),
            InstallJob {
                agent_id: agent_id.to_string(),
                cancelled: Arc::clone(&cancelled),
            },
        );
        Ok(cancelled)
    }

    pub fn cancel(&self, install_id: &str) -> Result<bool, String> {
        let jobs = self
            .jobs
            .lock()
            .map_err(|_| "The installer state is unavailable.".to_string())?;
        let Some(job) = jobs.get(install_id) else {
            return Ok(false);
        };
        job.cancelled.store(true, Ordering::Release);
        Ok(true)
    }

    pub fn finish(&self, install_id: &str) {
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.remove(install_id);
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallReceipt {
    pub agent_id: String,
    pub version: String,
    pub package_dir: String,
    pub integrity: String,
    pub already_installed: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentInstallProgress {
    install_id: String,
    agent_id: String,
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: u64,
}

pub fn install(
    app: &AppHandle,
    agent_id: &str,
    install_id: &str,
    cancelled: Arc<AtomicBool>,
) -> Result<AgentInstallReceipt, String> {
    safe_id(agent_id, "agent")?;
    let catalog = agent_catalog::load()?;
    let entry = catalog
        .entries
        .iter()
        .find(|entry| entry.id == agent_id)
        .ok_or_else(|| "The selected agent is not in the bundled catalog.".to_string())?;
    let distribution = entry
        .distribution
        .as_ref()
        .filter(|distribution| distribution.kind == "npm")
        .ok_or_else(|| "This agent is not installable yet.".to_string())?;
    validate_distribution(distribution)?;

    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("No cache directory is available: {error}"))?
        .join("agents")
        .join("packages")
        .join(agent_id);
    fs::create_dir_all(&root)
        .map_err(|error| format!("Studio could not create the agent cache: {error}"))?;

    let destination = root.join(&distribution.version);
    if let Some(receipt) = installed_receipt(&destination, distribution)? {
        return Ok(receipt);
    }

    let staging = root.join(format!(".install-{install_id}"));
    let archive = root.join(format!(".install-{install_id}.tgz"));
    remove_path(&staging)?;
    remove_path(&archive)?;

    let result = (|| {
        emit_progress(
            app,
            install_id,
            agent_id,
            "downloading",
            0,
            distribution.download_size,
        );
        download(
            app,
            install_id,
            agent_id,
            distribution,
            &archive,
            &cancelled,
        )?;
        check_cancelled(&cancelled)?;
        emit_progress(
            app,
            install_id,
            agent_id,
            "extracting",
            distribution.download_size,
            distribution.download_size,
        );
        fs::create_dir_all(&staging)
            .map_err(|error| format!("Studio could not create the staging directory: {error}"))?;
        extract_package(&archive, &staging, distribution.unpacked_size, &cancelled)?;
        check_cancelled(&cancelled)?;

        remove_path(&destination)?;
        fs::rename(&staging, &destination)
            .map_err(|error| format!("Studio could not finish the installation: {error}"))?;

        let receipt = AgentInstallReceipt {
            agent_id: agent_id.to_string(),
            version: distribution.version.clone(),
            package_dir: destination.to_string_lossy().into_owned(),
            integrity: distribution.integrity.clone(),
            already_installed: false,
        };
        let marker = serde_json::to_vec_pretty(&receipt)
            .map_err(|error| format!("Studio could not record the installation: {error}"))?;
        fs::write(destination.join(".okf-studio-install.json"), marker)
            .map_err(|error| format!("Studio could not record the installation: {error}"))?;
        emit_progress(
            app,
            install_id,
            agent_id,
            "complete",
            distribution.download_size,
            distribution.download_size,
        );
        Ok(receipt)
    })();

    let _ = remove_path(&archive);
    if result.is_err() {
        let _ = remove_path(&staging);
        if cancelled.load(Ordering::Acquire) {
            emit_progress(
                app,
                install_id,
                agent_id,
                "cancelled",
                0,
                distribution.download_size,
            );
        }
    }
    result
}

fn download(
    app: &AppHandle,
    install_id: &str,
    agent_id: &str,
    distribution: &AgentDistribution,
    destination: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout_read(READ_TIMEOUT)
        .user_agent(USER_AGENT)
        .build();
    let response = agent
        .get(&distribution.tarball)
        .call()
        .map_err(|error| format!("Studio could not download the agent package: {error}"))?;
    let mut file = File::create(destination)
        .map_err(|error| format!("Studio could not create the package archive: {error}"))?;
    copy_verified(
        response.into_reader(),
        &mut file,
        distribution.download_size,
        &distribution.integrity,
        cancelled,
        |downloaded| {
            emit_progress(
                app,
                install_id,
                agent_id,
                "downloading",
                downloaded,
                distribution.download_size,
            );
        },
    )
}

fn copy_verified<R: Read, W: Write>(
    mut reader: R,
    mut writer: W,
    expected_size: u64,
    expected_integrity: &str,
    cancelled: &AtomicBool,
    mut on_progress: impl FnMut(u64),
) -> Result<(), String> {
    let mut digest = Sha512::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 32 * 1024];
    loop {
        check_cancelled(cancelled)?;
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("The agent package download failed: {error}"))?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > MAX_PACKAGE_BYTES || total > expected_size {
            return Err("The agent package was larger than its catalog entry.".to_string());
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|error| format!("Studio could not cache the agent package: {error}"))?;
        digest.update(&buffer[..read]);
        on_progress(total);
    }
    if total != expected_size {
        return Err(format!(
            "The agent package size did not match the catalog (expected {expected_size}, received {total})."
        ));
    }
    let actual = format!(
        "sha512-{}",
        base64::engine::general_purpose::STANDARD.encode(digest.finalize())
    );
    if actual != expected_integrity {
        return Err("The agent package failed its SHA-512 integrity check.".to_string());
    }
    Ok(())
}

fn extract_package(
    archive: &Path,
    destination: &Path,
    expected_unpacked_size: u64,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let file = File::open(archive)
        .map_err(|error| format!("Studio could not open the package archive: {error}"))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    let mut total = 0_u64;
    for item in tar
        .entries()
        .map_err(|error| format!("The agent package archive is invalid: {error}"))?
    {
        check_cancelled(cancelled)?;
        let mut entry =
            item.map_err(|error| format!("The agent package archive is invalid: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("The agent package contains an invalid path: {error}"))?;
        validate_archive_path(&path)?;
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            return Err("The agent package contains a link or unsupported entry.".to_string());
        }
        if kind.is_file() {
            total = total.saturating_add(entry.size());
            if total > expected_unpacked_size {
                return Err("The agent package expanded beyond its catalog size.".to_string());
            }
        }
        if !entry
            .unpack_in(destination)
            .map_err(|error| format!("Studio could not extract the agent package: {error}"))?
        {
            return Err("The agent package tried to escape its staging directory.".to_string());
        }
    }
    if !destination.join("package").join("package.json").is_file() {
        return Err("The agent package does not contain package/package.json.".to_string());
    }
    Ok(())
}

fn validate_archive_path(path: &Path) -> Result<(), String> {
    let mut components = path.components();
    if components.next() != Some(Component::Normal("package".as_ref()))
        || components.any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("The agent package contains a path outside package/.".to_string());
    }
    Ok(())
}

fn validate_distribution(distribution: &AgentDistribution) -> Result<(), String> {
    if !distribution
        .tarball
        .starts_with("https://registry.npmjs.org/")
    {
        return Err("The catalog package is not hosted on the npm registry.".to_string());
    }
    if !distribution.integrity.starts_with("sha512-") {
        return Err("The catalog package has no SHA-512 integrity value.".to_string());
    }
    if distribution.download_size == 0 || distribution.download_size > MAX_PACKAGE_BYTES {
        return Err("The catalog package has an invalid download size.".to_string());
    }
    if distribution.unpacked_size < distribution.download_size {
        return Err("The catalog package has an invalid unpacked size.".to_string());
    }
    Ok(())
}

fn installed_receipt(
    destination: &Path,
    distribution: &AgentDistribution,
) -> Result<Option<AgentInstallReceipt>, String> {
    let marker = destination.join(".okf-studio-install.json");
    if !marker.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&marker)
        .map_err(|error| format!("Studio could not read the install record: {error}"))?;
    let mut receipt: AgentInstallReceipt = serde_json::from_slice(&bytes)
        .map_err(|error| format!("The install record is invalid: {error}"))?;
    if receipt.version != distribution.version || receipt.integrity != distribution.integrity {
        return Ok(None);
    }
    receipt.already_installed = true;
    Ok(Some(receipt))
}

fn emit_progress(
    app: &AppHandle,
    install_id: &str,
    agent_id: &str,
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: u64,
) {
    let _ = app.emit(
        "agent-install-progress",
        AgentInstallProgress {
            install_id: install_id.to_string(),
            agent_id: agent_id.to_string(),
            phase,
            downloaded_bytes,
            total_bytes,
        },
    );
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::Acquire) {
        Err("Installation cancelled.".to_string())
    } else {
        Ok(())
    }
}

fn safe_id(value: &str, kind: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 64
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(format!("The {kind} ID is invalid."));
    }
    Ok(())
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
    .map_err(|error| format!("Studio could not clear a stale install path: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn integrity(bytes: &[u8]) -> String {
        let digest = Sha512::digest(bytes);
        format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(digest)
        )
    }

    #[test]
    fn verifies_size_and_integrity_while_copying() {
        let bytes = b"verified package";
        let mut output = Vec::new();
        copy_verified(
            Cursor::new(bytes),
            &mut output,
            bytes.len() as u64,
            &integrity(bytes),
            &AtomicBool::new(false),
            |_| {},
        )
        .expect("copy should verify");
        assert_eq!(output, bytes);
    }

    #[test]
    fn rejects_corrupt_and_oversized_packages() {
        let bytes = b"changed package";
        let corrupt = copy_verified(
            Cursor::new(bytes),
            Vec::new(),
            bytes.len() as u64,
            &integrity(b"expected package"),
            &AtomicBool::new(false),
            |_| {},
        );
        assert!(corrupt.unwrap_err().contains("integrity"));

        let oversized = copy_verified(
            Cursor::new(bytes),
            Vec::new(),
            1,
            &integrity(bytes),
            &AtomicBool::new(false),
            |_| {},
        );
        assert!(oversized.unwrap_err().contains("larger"));
    }

    #[test]
    fn cancellation_stops_before_writing() {
        let cancelled = AtomicBool::new(true);
        let mut output = Vec::new();
        let result = copy_verified(
            Cursor::new(b"package"),
            &mut output,
            7,
            &integrity(b"package"),
            &cancelled,
            |_| {},
        );
        assert_eq!(result.unwrap_err(), "Installation cancelled.");
        assert!(output.is_empty());
    }

    #[test]
    fn archive_paths_stay_under_package() {
        assert!(validate_archive_path(Path::new("package/package.json")).is_ok());
        assert!(validate_archive_path(Path::new("other/file")).is_err());
        assert!(validate_archive_path(Path::new("../outside")).is_err());
        assert!(validate_archive_path(Path::new("/absolute")).is_err());
    }

    #[test]
    fn install_state_rejects_duplicate_agent_jobs_and_cancels() {
        let state = AgentInstallState::default();
        let first = state.start("install-1", "codex").expect("first starts");
        assert!(state.start("install-2", "codex").is_err());
        assert!(state.cancel("install-1").expect("cancel succeeds"));
        assert!(first.load(Ordering::Acquire));
        state.finish("install-1");
        assert!(!state.cancel("install-1").expect("finished job is absent"));
    }
}
