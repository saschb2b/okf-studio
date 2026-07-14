use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use tauri::{AppHandle, Emitter, Manager};

use crate::agent_catalog::{self, AgentDistribution};
use crate::agent_runtime;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_PACKAGE_BYTES: u64 = 64 * 1024 * 1024;
const DEPENDENCY_INSTALL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_INSTALL_DIAGNOSTIC_BYTES: usize = 16 * 1024;
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

    pub fn is_installing(&self, agent_id: &str) -> Result<bool, String> {
        let jobs = self
            .jobs
            .lock()
            .map_err(|_| "The installer state is unavailable.".to_string())?;
        Ok(jobs.values().any(|job| job.agent_id == agent_id))
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
    pub dependency_lock_sha256: String,
    pub entrypoint_sha256: String,
    pub already_installed: bool,
}

pub(crate) struct InstalledAgentCommand {
    pub(crate) executable: PathBuf,
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<(String, String)>,
    #[cfg(any(target_os = "linux", test))]
    pub(crate) read_only_roots: Vec<PathBuf>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallPreflight {
    agent_id: String,
    agent_version: String,
    target: String,
    runtime_version: String,
    package_download_size: u64,
    runtime_download_size: u64,
    total_download_size: u64,
    package_installed: bool,
    runtime_installed: bool,
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

pub fn preflight(app: &AppHandle, agent_id: &str) -> Result<AgentInstallPreflight, String> {
    safe_id(agent_id, "agent")?;
    let catalog = agent_catalog::load()?;
    let entry = catalog
        .entries
        .iter()
        .find(|entry| entry.id == agent_id)
        .ok_or_else(|| "The selected agent is not in the bundled catalog.".to_string())?;
    let package = entry
        .distribution
        .as_ref()
        .filter(|distribution| distribution.kind == "npm")
        .ok_or_else(|| "This agent is not installable yet.".to_string())?;
    validate_distribution(package)?;

    let runtime = catalog
        .node_runtime
        .distribution_for(std::env::consts::OS, std::env::consts::ARCH)
        .ok_or_else(|| {
            format!(
                "Managed Node is not available for {}-{}.",
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })?;
    let cache = agent_cache(app)?;
    let package_destination = cache.join("packages").join(agent_id).join(&package.version);
    let package_installed = installed_receipt(&package_destination, package)?.is_some();
    let runtime_installed = agent_runtime::installed(app, &catalog.node_runtime, runtime).is_ok();
    let runtime_download_size = if runtime_installed {
        0
    } else {
        runtime.download_size
    };
    let package_download_size = if package_installed {
        0
    } else {
        package.download_size
    };

    Ok(AgentInstallPreflight {
        agent_id: agent_id.to_string(),
        agent_version: package.version.clone(),
        target: runtime.target.clone(),
        runtime_version: catalog.node_runtime.version,
        package_download_size,
        runtime_download_size,
        total_download_size: package_download_size.saturating_add(runtime_download_size),
        package_installed,
        runtime_installed,
    })
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
    let runtime_distribution = catalog
        .node_runtime
        .distribution_for(std::env::consts::OS, std::env::consts::ARCH)
        .ok_or_else(|| {
            format!(
                "Managed Node is not available for {}-{}.",
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })?;
    let runtime_receipt = agent_runtime::ensure(
        app,
        &catalog.node_runtime,
        runtime_distribution,
        install_id,
        &cancelled,
        |phase, downloaded, total| {
            emit_progress(app, install_id, agent_id, phase, downloaded, total);
        },
    )?;
    check_cancelled(&cancelled)?;

    let root = agent_cache(app)?.join("packages").join(agent_id);
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
            "package-downloading",
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
            "package-extracting",
            distribution.download_size,
            distribution.download_size,
        );
        fs::create_dir_all(&staging)
            .map_err(|error| format!("Studio could not create the staging directory: {error}"))?;
        extract_package(&archive, &staging, distribution.unpacked_size, &cancelled)?;
        check_cancelled(&cancelled)?;
        emit_progress(app, install_id, agent_id, "dependencies-installing", 0, 1);
        install_dependencies(&runtime_receipt, &staging.join("package"), &cancelled)?;
        check_cancelled(&cancelled)?;

        remove_path(&destination)?;
        fs::rename(&staging, &destination)
            .map_err(|error| format!("Studio could not finish the installation: {error}"))?;

        let dependency_lock_sha256 =
            file_sha256(&destination.join("package").join("package-lock.json"))?;
        let entrypoint_sha256 =
            file_sha256(&destination.join("package").join(&distribution.entrypoint))?;
        let receipt = AgentInstallReceipt {
            agent_id: agent_id.to_string(),
            version: distribution.version.clone(),
            package_dir: destination.to_string_lossy().into_owned(),
            integrity: distribution.integrity.clone(),
            dependency_lock_sha256,
            entrypoint_sha256,
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

/// Remove every cached version of a catalog agent. Callers must first verify
/// that no installation job is running and no connection uses the agent.
pub fn uninstall(app: &AppHandle, agent_id: &str) -> Result<(), String> {
    safe_id(agent_id, "agent")?;
    let catalog = agent_catalog::load()?;
    if !catalog.entries.iter().any(|entry| entry.id == agent_id) {
        return Err("The selected agent is not in the bundled catalog.".to_string());
    }
    remove_path(&agent_cache(app)?.join("packages").join(agent_id))
}

pub(crate) fn installed_command(
    app: &AppHandle,
    agent_id: &str,
) -> Result<InstalledAgentCommand, String> {
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
    let runtime_distribution = catalog
        .node_runtime
        .distribution_for(std::env::consts::OS, std::env::consts::ARCH)
        .ok_or_else(|| {
            format!(
                "Managed Node is not available for {}-{}.",
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })?;
    let runtime = agent_runtime::installed(app, &catalog.node_runtime, runtime_distribution)?;
    let destination = agent_cache(app)?
        .join("packages")
        .join(agent_id)
        .join(&distribution.version);
    installed_receipt(&destination, distribution)?
        .ok_or_else(|| "Install this agent before connecting it.".to_string())?;

    let package_root = destination
        .join("package")
        .canonicalize()
        .map_err(|error| format!("The installed agent package is unavailable: {error}"))?;
    let entrypoint = package_root
        .join(&distribution.entrypoint)
        .canonicalize()
        .map_err(|error| format!("The installed agent entry point is unavailable: {error}"))?;
    if !entrypoint.starts_with(&package_root) || !entrypoint.is_file() {
        return Err("The installed agent entry point escapes its package.".to_string());
    }

    let mut arguments = vec![child_process_path(&entrypoint)
        .to_string_lossy()
        .into_owned()];
    arguments.extend(distribution.arguments.clone());
    // Pinned defaults come after the host passthrough so they win on conflict.
    let mut environment = catalog_environment(&distribution.environment);
    environment.extend(
        distribution
            .environment_defaults
            .iter()
            .map(|(name, value)| (name.clone(), value.clone())),
    );
    Ok(InstalledAgentCommand {
        executable: runtime.node_path(),
        arguments,
        environment,
        #[cfg(any(target_os = "linux", test))]
        read_only_roots: vec![runtime.runtime_root()?, package_root],
    })
}

fn install_dependencies(
    runtime: &agent_runtime::NodeRuntimeReceipt,
    package_root: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let environment = catalog_environment(&[]);
    let redactions = environment
        .iter()
        .map(|(_, value)| value.clone())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let mut command = std::process::Command::new(runtime.node_path());
    command
        // The canonicalized npm path is verbatim (`\\?\`) on Windows, which
        // Node 24 cannot resolve as its main module; hand it the Win32 form.
        .arg(child_process_path(&runtime.npm_cli_path()?))
        .args([
            "install",
            "--ignore-scripts",
            "--omit=dev",
            "--no-audit",
            "--no-fund",
            "--package-lock=true",
            "--registry=https://registry.npmjs.org/",
        ])
        .current_dir(package_root)
        .env_clear()
        .envs(environment)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Studio could not start dependency installation: {error}"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Studio could not capture dependency installation errors.".to_string())?;
    let diagnostics = std::thread::spawn(move || read_process_diagnostics(stderr, &redactions));
    let started = Instant::now();
    let status = loop {
        if cancelled.load(Ordering::Acquire) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = diagnostics.join();
            return Err("Installation cancelled.".to_string());
        }
        if started.elapsed() >= DEPENDENCY_INSTALL_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = diagnostics.join();
            return Err("Agent dependency installation timed out.".to_string());
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Studio could not monitor dependency installation: {error}"))?
        {
            break status;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let diagnostics = diagnostics.join().unwrap_or_default();
    if !status.success() {
        let detail = diagnostics.trim();
        return Err(if detail.is_empty() {
            format!("Agent dependency installation exited with {status}.")
        } else {
            format!("Agent dependency installation exited with {status}: {detail}")
        });
    }
    if !package_root.join("node_modules").is_dir()
        || !package_root.join("package-lock.json").is_file()
    {
        return Err(
            "Agent dependency installation did not produce a complete package.".to_string(),
        );
    }
    Ok(())
}

fn read_process_diagnostics(mut reader: impl Read, redactions: &[String]) -> String {
    let mut retained = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                retained.extend_from_slice(&chunk[..count]);
                if retained.len() > MAX_INSTALL_DIAGNOSTIC_BYTES {
                    retained.drain(..retained.len() - MAX_INSTALL_DIAGNOSTIC_BYTES);
                }
            }
        }
    }
    let mut text = String::from_utf8_lossy(&retained)
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect::<String>();
    for secret in redactions {
        text = text.replace(secret, "[REDACTED]");
    }
    text
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Studio could not read the dependency lock: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn catalog_environment(names: &[String]) -> Vec<(String, String)> {
    const BASE: &[&str] = &[
        "ALL_PROXY",
        "APPDATA",
        "HOME",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "LANG",
        "LC_ALL",
        "LOCALAPPDATA",
        "NODE_EXTRA_CA_CERTS",
        "NO_PROXY",
        "NPM_CONFIG_CAFILE",
        "PATH",
        "PATHEXT",
        "SHELL",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
    ];
    BASE.iter()
        .copied()
        .chain(names.iter().map(String::as_str))
        .filter_map(|name| {
            std::env::var(name)
                .ok()
                .map(|value| (name.to_string(), value))
        })
        .collect()
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
                "package-downloading",
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
    validate_package_path(&distribution.entrypoint)?;
    if distribution.arguments.len() > 32
        || distribution
            .arguments
            .iter()
            .any(|argument| argument.len() > 4096)
    {
        return Err("The catalog package has invalid launch arguments.".to_string());
    }
    if distribution.environment.len() > 32
        || distribution
            .environment
            .iter()
            .any(|name| !valid_environment_name(name))
    {
        return Err("The catalog package has invalid environment names.".to_string());
    }
    if distribution.environment_defaults.len() > 32
        || distribution
            .environment_defaults
            .iter()
            .any(|(name, value)| {
                !valid_environment_name(name)
                    || value.is_empty()
                    || value.len() > 4096
                    || value.chars().any(char::is_control)
            })
    {
        return Err("The catalog package has invalid environment defaults.".to_string());
    }
    Ok(())
}

fn valid_environment_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name.chars().enumerate().all(|(index, character)| {
            character == '_'
                || character.is_ascii_alphanumeric() && (index > 0 || character.is_ascii_alphabetic())
        })
}

fn validate_package_path(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    if path.is_absolute()
        || path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("The catalog package has an invalid entry point.".to_string());
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
    let Some(mut receipt) = parse_install_receipt(&bytes) else {
        return Ok(None);
    };
    if receipt.version != distribution.version || receipt.integrity != distribution.integrity {
        return Ok(None);
    }
    let package_root = destination.join("package");
    let lock = package_root.join("package-lock.json");
    if receipt.dependency_lock_sha256.is_empty()
        || receipt.entrypoint_sha256.is_empty()
        || !package_root.join("node_modules").is_dir()
        || !package_root.join(&distribution.entrypoint).is_file()
        || !lock.is_file()
        || file_sha256(&lock)? != receipt.dependency_lock_sha256
        || file_sha256(&package_root.join(&distribution.entrypoint))? != receipt.entrypoint_sha256
    {
        return Ok(None);
    }
    receipt.already_installed = true;
    Ok(Some(receipt))
}

fn parse_install_receipt(bytes: &[u8]) -> Option<AgentInstallReceipt> {
    serde_json::from_slice(bytes).ok()
}

pub(crate) fn child_process_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        if let Some(path) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{path}"));
        }
        if let Some(path) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(path);
        }
    }
    path.to_path_buf()
}

fn agent_cache(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map_err(|error| format!("No cache directory is available: {error}"))
        .map(|path| path.join("agents"))
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
    fn dependency_diagnostics_are_bounded_and_redacted() {
        let secret = "proxy-password".to_string();
        let input = format!("{} {secret}", "x".repeat(MAX_INSTALL_DIAGNOSTIC_BYTES + 32));
        let diagnostics = read_process_diagnostics(Cursor::new(input), &[secret]);
        assert!(diagnostics.len() <= MAX_INSTALL_DIAGNOSTIC_BYTES);
        assert!(!diagnostics.contains("proxy-password"));
        assert!(diagnostics.contains("[REDACTED]"));
    }

    #[test]
    fn archive_paths_stay_under_package() {
        assert!(validate_archive_path(Path::new("package/package.json")).is_ok());
        assert!(validate_archive_path(Path::new("other/file")).is_err());
        assert!(validate_archive_path(Path::new("../outside")).is_err());
        assert!(validate_archive_path(Path::new("/absolute")).is_err());
    }

    #[test]
    fn every_bundled_distribution_passes_launch_validation() {
        let catalog = agent_catalog::load().expect("catalog should load");
        let distributions = catalog
            .entries
            .iter()
            .filter_map(|entry| entry.distribution.as_ref())
            .collect::<Vec<_>>();
        assert!(distributions.len() >= 8, "expected the expanded catalog");
        for distribution in distributions {
            validate_distribution(distribution).expect("bundled distribution should validate");
        }
    }

    #[test]
    fn catalog_launch_metadata_rejects_traversal_and_invalid_environment_names() {
        let catalog = agent_catalog::load().expect("catalog should load");
        let mut distribution = catalog.entries[0]
            .distribution
            .clone()
            .expect("catalog agent should have a distribution");
        assert!(validate_distribution(&distribution).is_ok());

        distribution.entrypoint = "../outside.js".to_string();
        assert!(validate_distribution(&distribution)
            .unwrap_err()
            .contains("entry point"));

        distribution.entrypoint = "dist/index.js".to_string();
        distribution.environment = vec!["OPENAI_API_KEY=value".to_string()];
        assert!(validate_distribution(&distribution)
            .unwrap_err()
            .contains("environment"));

        distribution.environment = vec![];
        distribution
            .environment_defaults
            .insert("BAD NAME".to_string(), "1".to_string());
        assert!(validate_distribution(&distribution)
            .unwrap_err()
            .contains("environment defaults"));
    }

    #[test]
    fn obsolete_or_malformed_install_receipts_trigger_reinstallation() {
        let obsolete = br#"{
            "agentId": "codex",
            "version": "1.1.2",
            "packageDir": "agent-cache",
            "integrity": "sha512-old",
            "alreadyInstalled": false
        }"#;
        assert!(parse_install_receipt(obsolete).is_none());
        assert!(parse_install_receipt(b"not json").is_none());
    }

    #[cfg(windows)]
    #[test]
    fn removes_windows_verbatim_prefix_before_launching_node() {
        assert_eq!(
            child_process_path(Path::new(r"\\?\C:\cache\package\dist\index.js")),
            PathBuf::from(r"C:\cache\package\dist\index.js")
        );
        assert_eq!(
            child_process_path(Path::new(r"\\?\UNC\server\cache\index.js")),
            PathBuf::from(r"\\server\cache\index.js")
        );
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
