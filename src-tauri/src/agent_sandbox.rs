//! Preflights operating-system confinement backends and compiles restricted
//! launch policies for external agents.
//!
//! A successful probe or policy compilation does not change an agent launch,
//! produce connection scope evidence, or unlock unattended work.

#[cfg(any(target_os = "linux", test))]
use std::collections::{HashSet, VecDeque};
#[cfg(any(target_os = "linux", test))]
use std::ffi::OsString;
#[cfg(any(target_os = "linux", test))]
use std::path::{Path, PathBuf};

use serde::Serialize;

#[cfg(any(target_os = "linux", test))]
const MAX_POLICY_ENTRIES: usize = 100_000;
#[cfg(any(target_os = "linux", test))]
const MAX_POLICY_DEPTH: usize = 64;

#[cfg(any(target_os = "linux", test))]
#[cfg_attr(target_os = "linux", allow(dead_code))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LinuxSandboxNetworkMode {
    Disabled,
    Host,
}

#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LinuxSandboxLaunchPlan {
    pub(crate) arguments: Vec<OsString>,
}

/// Compile the complete Bubblewrap argument list without starting a process.
///
/// The root namespace starts empty. Only selected system runtime paths, exact
/// app-owned runtime roots, and the bound bundle are mounted read-only. Known
/// protected bundle paths are then hidden behind empty mounts.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn linux_launch_plan(
    bundle_root: &Path,
    executable: &Path,
    arguments: &[String],
    runtime_roots: &[PathBuf],
    network: LinuxSandboxNetworkMode,
) -> Result<LinuxSandboxLaunchPlan, String> {
    linux_launch_plan_with_system_roots(
        bundle_root,
        executable,
        arguments,
        runtime_roots,
        &linux_system_runtime_roots(network),
        network,
    )
}

#[cfg(any(target_os = "linux", test))]
fn linux_launch_plan_with_system_roots(
    bundle_root: &Path,
    executable: &Path,
    command_arguments: &[String],
    runtime_roots: &[PathBuf],
    system_roots: &[PathBuf],
    network: LinuxSandboxNetworkMode,
) -> Result<LinuxSandboxLaunchPlan, String> {
    let bundle_root = require_canonical_directory(bundle_root, "bundle root")?;
    let executable = require_canonical_file(executable, "agent executable")?;
    let system_roots = canonical_existing_roots(system_roots, "system runtime path", true)?;
    let runtime_roots = canonical_existing_roots(runtime_roots, "agent runtime path", false)?;

    let executable_visible = executable.starts_with(&bundle_root)
        || system_roots
            .iter()
            .any(|mount| executable.starts_with(&mount.source))
        || runtime_roots
            .iter()
            .any(|mount| executable.starts_with(&mount.source));
    if !executable_visible {
        return Err(
            "The agent executable is outside the restricted profile's read-only mounts."
                .to_string(),
        );
    }

    // The profile mounts private filesystems over these paths after the
    // read-only binds, which would silently shadow any grant below them.
    // Refuse the launch instead of exposing an empty directory as the bundle.
    reject_shadowed_mount(&bundle_root, "bundle root")?;
    for mount in &runtime_roots {
        reject_shadowed_mount(&mount.source, "agent runtime path")?;
    }

    let mut arguments = Vec::new();
    for mount in system_roots.iter().chain(runtime_roots.iter()) {
        push_mount(
            &mut arguments,
            "--ro-bind",
            &mount.source,
            &mount.destination,
        );
    }
    push_mount(&mut arguments, "--ro-bind", &bundle_root, &bundle_root);
    arguments.extend([
        "--proc".into(),
        "/proc".into(),
        "--dev".into(),
        "/dev".into(),
        "--perms".into(),
        "0700".into(),
        "--tmpfs".into(),
        "/tmp".into(),
        "--perms".into(),
        "0700".into(),
        "--dir".into(),
        "/run".into(),
    ]);

    for protected in protected_bundle_paths(&bundle_root)? {
        if protected.is_dir {
            arguments.push("--perms".into());
            arguments.push("0000".into());
            arguments.push("--tmpfs".into());
            arguments.push(protected.path.into_os_string());
        } else {
            push_mount(
                &mut arguments,
                "--ro-bind",
                Path::new("/dev/null"),
                &protected.path,
            );
        }
    }

    // --unshare-all only *tries* the user namespace; --disable-userns needs
    // it unshared unconditionally (bwrap 0.9 rejects the pair otherwise), and
    // a hard failure beats silently launching without the denial.
    arguments.push("--unshare-user".into());
    arguments.push("--unshare-all".into());
    if network == LinuxSandboxNetworkMode::Host {
        arguments.push("--share-net".into());
    }
    arguments.extend([
        "--disable-userns".into(),
        "--new-session".into(),
        "--die-with-parent".into(),
        "--chdir".into(),
        bundle_root.into_os_string(),
        "--".into(),
        executable.into_os_string(),
    ]);
    arguments.extend(command_arguments.iter().map(OsString::from));

    Ok(LinuxSandboxLaunchPlan { arguments })
}

#[cfg(any(target_os = "linux", test))]
fn reject_shadowed_mount(path: &Path, label: &str) -> Result<(), String> {
    const PRIVATE_SANDBOX_PATHS: &[&str] = &["/tmp", "/run", "/proc", "/dev"];
    if PRIVATE_SANDBOX_PATHS
        .iter()
        .any(|private| path.starts_with(private))
    {
        return Err(format!(
            "The {label} lies under a private sandbox filesystem and would be hidden by the restricted profile."
        ));
    }
    Ok(())
}

#[cfg(any(target_os = "linux", test))]
fn linux_system_runtime_roots(network: LinuxSandboxNetworkMode) -> Vec<PathBuf> {
    let mut roots = [
        "/usr",
        "/bin",
        "/sbin",
        "/lib",
        "/lib64",
        "/etc/ld.so.cache",
        "/etc/ld.so.conf",
        "/etc/ld.so.conf.d",
        "/etc/passwd",
        "/etc/group",
        "/etc/nsswitch.conf",
        "/etc/ssl",
        "/etc/pki",
        "/etc/ca-certificates",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect::<Vec<_>>();
    if network == LinuxSandboxNetworkMode::Host {
        roots.extend(
            ["/etc/hosts", "/etc/resolv.conf"]
                .into_iter()
                .map(PathBuf::from),
        );
    }
    roots
}

#[cfg(any(target_os = "linux", test))]
fn require_canonical_directory(path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("The restricted {label} is unavailable: {error}"))?;
    if canonical != path || !canonical.is_dir() {
        return Err(format!(
            "The restricted {label} must be an existing canonical directory."
        ));
    }
    Ok(canonical)
}

#[cfg(any(target_os = "linux", test))]
fn require_canonical_file(path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("The restricted {label} is unavailable: {error}"))?;
    if canonical != path || !canonical.is_file() {
        return Err(format!(
            "The restricted {label} must be an existing canonical file."
        ));
    }
    Ok(canonical)
}

#[cfg(any(target_os = "linux", test))]
struct ReadOnlyMount {
    source: PathBuf,
    destination: PathBuf,
}

#[cfg(any(target_os = "linux", test))]
fn canonical_existing_roots(
    paths: &[PathBuf],
    label: &str,
    skip_missing: bool,
) -> Result<Vec<ReadOnlyMount>, String> {
    let mut seen = HashSet::new();
    let mut roots = Vec::new();
    for path in paths {
        if !path.exists() {
            if skip_missing {
                continue;
            }
            return Err(format!("The restricted {label} is unavailable."));
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("The restricted {label} is unavailable: {error}"))?;
        if !path.is_absolute()
            || !canonical.is_absolute()
            || (!canonical.is_dir() && !canonical.is_file())
        {
            return Err(format!(
                "The restricted {label} must be an existing absolute file or directory."
            ));
        }
        if seen.insert(path.clone()) {
            roots.push(ReadOnlyMount {
                source: canonical,
                destination: path.clone(),
            });
        }
    }
    Ok(roots)
}

#[cfg(any(target_os = "linux", test))]
fn push_mount(arguments: &mut Vec<OsString>, option: &str, source: &Path, destination: &Path) {
    arguments.push(option.into());
    arguments.push(source.as_os_str().to_owned());
    arguments.push(destination.as_os_str().to_owned());
}

#[cfg(any(target_os = "linux", test))]
struct ProtectedBundlePath {
    path: PathBuf,
    is_dir: bool,
}

#[cfg(any(target_os = "linux", test))]
fn protected_bundle_paths(bundle_root: &Path) -> Result<Vec<ProtectedBundlePath>, String> {
    let mut pending = VecDeque::from([(bundle_root.to_path_buf(), 0usize)]);
    let mut protected = Vec::new();
    let mut visited = 0usize;

    while let Some((directory, depth)) = pending.pop_front() {
        if depth > MAX_POLICY_DEPTH {
            return Err("The bundle is too deeply nested for a restricted launch.".to_string());
        }
        let entries = std::fs::read_dir(&directory).map_err(|error| {
            format!("Studio could not inspect the bundle's protected paths: {error}")
        })?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!("Studio could not inspect the bundle's protected paths: {error}")
            })?;
            visited += 1;
            if visited > MAX_POLICY_ENTRIES {
                return Err("The bundle has too many entries for a restricted launch.".to_string());
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(bundle_root)
                .map_err(|_| "A bundle entry escaped the restricted launch root.".to_string())?;
            let metadata = std::fs::symlink_metadata(&path).map_err(|error| {
                format!("Studio could not inspect the bundle's protected paths: {error}")
            })?;
            if crate::agent_stage::protected_bundle_path_reason(relative).is_some() {
                protected.push(ProtectedBundlePath {
                    path,
                    is_dir: metadata.is_dir(),
                });
                continue;
            }
            if metadata.is_dir() {
                pending.push_back((path, depth + 1));
            }
        }
    }

    protected.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(protected)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSecurityHostStatus {
    platform: AgentSecurityPlatform,
    backend: Option<AgentSecurityBackend>,
    state: AgentSecurityHostState,
    launch_profile_available: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityPlatform {
    #[cfg(target_os = "linux")]
    Linux,
    #[cfg(target_os = "macos")]
    Macos,
    #[cfg(target_os = "windows")]
    Windows,
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityBackend {
    #[cfg(target_os = "linux")]
    Bubblewrap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentSecurityHostState {
    #[cfg(target_os = "linux")]
    Ready,
    #[cfg(not(target_os = "linux"))]
    UnsupportedPlatform,
    #[cfg(target_os = "linux")]
    NotFound,
    #[cfg(target_os = "linux")]
    SetuidRejected,
    #[cfg(target_os = "linux")]
    UntrustedBinary,
    #[cfg(target_os = "linux")]
    ProbeFailed,
}

pub(crate) async fn status() -> AgentSecurityHostStatus {
    #[cfg(target_os = "linux")]
    {
        linux_status().await
    }

    #[cfg(target_os = "macos")]
    {
        unsupported(AgentSecurityPlatform::Macos)
    }

    #[cfg(target_os = "windows")]
    {
        unsupported(AgentSecurityPlatform::Windows)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        unsupported(AgentSecurityPlatform::Other)
    }
}

#[cfg(not(target_os = "linux"))]
fn unsupported(platform: AgentSecurityPlatform) -> AgentSecurityHostStatus {
    AgentSecurityHostStatus {
        platform,
        backend: None,
        state: AgentSecurityHostState::UnsupportedPlatform,
        launch_profile_available: false,
    }
}

#[cfg(target_os = "linux")]
async fn linux_status() -> AgentSecurityHostStatus {
    match trusted_linux_backend().await {
        Ok(_) => linux_result(AgentSecurityHostState::Ready),
        Err(state) => linux_result(state),
    }
}

#[cfg(any(target_os = "linux", test))]
pub(crate) async fn linux_restricted_command(
    bundle_root: &Path,
    executable: &Path,
    arguments: &[String],
    runtime_roots: &[PathBuf],
    network: LinuxSandboxNetworkMode,
) -> Result<tokio::process::Command, String> {
    let binary = trusted_linux_backend()
        .await
        .map_err(|state| format!("The restricted Linux agent host is unavailable ({state:?})."))?;
    let plan = linux_launch_plan(bundle_root, executable, arguments, runtime_roots, network)?;
    let mut command = tokio::process::Command::new(binary);
    command.args(plan.arguments);
    Ok(command)
}

#[cfg(all(test, not(target_os = "linux")))]
async fn trusted_linux_backend() -> Result<PathBuf, AgentSecurityHostState> {
    Err(AgentSecurityHostState::UnsupportedPlatform)
}

#[cfg(target_os = "linux")]
async fn trusted_linux_backend() -> Result<PathBuf, AgentSecurityHostState> {
    use std::collections::HashSet;
    use std::fs;
    use std::os::unix::fs::MetadataExt;

    let mut saw_setuid = false;
    let mut saw_untrusted = false;
    let mut visited = HashSet::new();
    let Some(path) = std::env::var_os("PATH") else {
        return Err(AgentSecurityHostState::NotFound);
    };

    for directory in std::env::split_paths(&path).filter(|path| path.is_absolute()) {
        let candidate = directory.join("bwrap");
        let Ok(candidate) = fs::canonicalize(candidate) else {
            continue;
        };
        if !visited.insert(candidate.clone()) {
            continue;
        }
        let Ok(metadata) = fs::metadata(&candidate) else {
            continue;
        };
        if !metadata.is_file() {
            saw_untrusted = true;
            continue;
        }

        match classify_linux_binary(metadata.uid(), metadata.mode()) {
            LinuxBinaryTrust::Setuid => {
                saw_setuid = true;
            }
            LinuxBinaryTrust::Untrusted => {
                saw_untrusted = true;
            }
            LinuxBinaryTrust::Trusted => {
                if !matches!(linux_has_file_capabilities(&candidate), Ok(false)) {
                    saw_untrusted = true;
                    continue;
                }
                if linux_probe(&candidate).await {
                    return Ok(candidate);
                }
                return Err(AgentSecurityHostState::ProbeFailed);
            }
        }
    }

    if saw_setuid {
        Err(AgentSecurityHostState::SetuidRejected)
    } else if saw_untrusted {
        Err(AgentSecurityHostState::UntrustedBinary)
    } else {
        Err(AgentSecurityHostState::NotFound)
    }
}

#[cfg(target_os = "linux")]
fn linux_has_file_capabilities(path: &std::path::Path) -> std::io::Result<bool> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::other("Bubblewrap path contains a null byte"))?;
    let name = c"security.capability";
    let result = unsafe { libc::getxattr(path.as_ptr(), name.as_ptr(), std::ptr::null_mut(), 0) };
    if result >= 0 {
        return Ok(true);
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ENODATA) {
        Ok(false)
    } else {
        Err(error)
    }
}

#[cfg(target_os = "linux")]
fn linux_result(state: AgentSecurityHostState) -> AgentSecurityHostStatus {
    AgentSecurityHostStatus {
        platform: AgentSecurityPlatform::Linux,
        backend: Some(AgentSecurityBackend::Bubblewrap),
        state,
        launch_profile_available: state == AgentSecurityHostState::Ready,
    }
}

#[cfg(target_os = "linux")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LinuxBinaryTrust {
    Trusted,
    Setuid,
    Untrusted,
}

#[cfg(target_os = "linux")]
fn classify_linux_binary(owner: u32, mode: u32) -> LinuxBinaryTrust {
    const SETUID: u32 = 0o4000;
    const GROUP_OR_WORLD_WRITABLE: u32 = 0o022;
    const WORLD_READABLE_AND_EXECUTABLE: u32 = 0o055;

    if mode & SETUID != 0 {
        LinuxBinaryTrust::Setuid
    } else if owner != 0
        || mode & GROUP_OR_WORLD_WRITABLE != 0
        || mode & WORLD_READABLE_AND_EXECUTABLE != WORLD_READABLE_AND_EXECUTABLE
    {
        LinuxBinaryTrust::Untrusted
    } else {
        LinuxBinaryTrust::Trusted
    }
}

#[cfg(target_os = "linux")]
async fn linux_probe(binary: &std::path::Path) -> bool {
    use std::process::Stdio;
    use std::time::Duration;
    use tokio::process::Command;

    let mut command = Command::new(binary);
    command
        .args(linux_probe_arguments(binary))
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);

    matches!(
        tokio::time::timeout(Duration::from_secs(3), command.status()).await,
        Ok(Ok(status)) if status.success()
    )
}

#[cfg(target_os = "linux")]
fn linux_probe_arguments(binary: &std::path::Path) -> Vec<std::ffi::OsString> {
    [
        "--ro-bind".into(),
        "/".into(),
        "/".into(),
        "--unshare-user".into(),
        "--unshare-net".into(),
        "--unshare-ipc".into(),
        "--unshare-pid".into(),
        "--unshare-uts".into(),
        "--disable-userns".into(),
        "--new-session".into(),
        "--die-with-parent".into(),
        "--".into(),
        binary.as_os_str().to_owned(),
        "--version".into(),
    ]
    .into_iter()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct PolicyFixture {
        root: PathBuf,
        bundle: PathBuf,
        runtime: PathBuf,
        executable: PathBuf,
    }

    /// On Linux the fixture must not live under /tmp: the restricted profile
    /// mounts a private tmpfs there and now refuses shadowed grants outright.
    fn fixture_parent() -> PathBuf {
        if cfg!(target_os = "linux") {
            PathBuf::from("/var/tmp")
        } else {
            std::env::temp_dir()
        }
    }

    impl PolicyFixture {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos();
            let root = fixture_parent().join(format!(
                "okf-studio-sandbox-policy-{}-{unique}",
                std::process::id()
            ));
            let bundle = root.join("bundle");
            let runtime = root.join("runtime");
            let executable = runtime.join("bin").join("agent");
            std::fs::create_dir_all(bundle.join(".git")).expect("create protected directory");
            std::fs::create_dir_all(bundle.join("docs")).expect("create bundle content");
            std::fs::create_dir_all(executable.parent().expect("executable parent"))
                .expect("create runtime");
            std::fs::write(bundle.join(".git").join("config"), "secret")
                .expect("write protected metadata");
            std::fs::write(bundle.join(".env"), "TOKEN=secret").expect("write protected file");
            std::fs::write(bundle.join("docs").join("overview.md"), "# Overview")
                .expect("write bundle concept");
            std::fs::write(&executable, "agent").expect("write executable");
            Self {
                root: root.canonicalize().expect("canonical fixture"),
                bundle: bundle.canonicalize().expect("canonical bundle"),
                runtime: runtime.canonicalize().expect("canonical runtime"),
                executable: executable.canonicalize().expect("canonical executable"),
            }
        }
    }

    impl Drop for PolicyFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn contains_sequence(arguments: &[OsString], expected: &[&Path]) -> bool {
        arguments.windows(expected.len()).any(|window| {
            window
                .iter()
                .zip(expected)
                .all(|(actual, expected)| Path::new(actual) == *expected)
        })
    }

    #[test]
    fn restricted_plan_starts_empty_and_hides_protected_bundle_paths() {
        let fixture = PolicyFixture::new();
        let system_root = fixture.root.join("system");
        std::fs::create_dir_all(&system_root).expect("create system root");
        let system_root = system_root.canonicalize().expect("canonical system root");
        let plan = linux_launch_plan_with_system_roots(
            &fixture.bundle,
            &fixture.executable,
            &["--stdio".to_string()],
            std::slice::from_ref(&fixture.runtime),
            std::slice::from_ref(&system_root),
            LinuxSandboxNetworkMode::Disabled,
        )
        .expect("compile restricted launch");

        assert!(contains_sequence(
            &plan.arguments,
            &[Path::new("--ro-bind"), &fixture.bundle, &fixture.bundle]
        ));
        assert!(contains_sequence(
            &plan.arguments,
            &[
                Path::new("--perms"),
                Path::new("0000"),
                Path::new("--tmpfs"),
                &fixture.bundle.join(".git"),
            ]
        ));
        assert!(contains_sequence(
            &plan.arguments,
            &[
                Path::new("--ro-bind"),
                Path::new("/dev/null"),
                &fixture.bundle.join(".env"),
            ]
        ));
        for required in [
            "--unshare-user",
            "--unshare-all",
            "--disable-userns",
            "--new-session",
            "--die-with-parent",
        ] {
            assert!(plan.arguments.iter().any(|argument| argument == required));
        }
        assert!(!plan
            .arguments
            .iter()
            .any(|argument| argument == "--share-net"));
        assert!(contains_sequence(
            &plan.arguments,
            &[
                Path::new("--chdir"),
                &fixture.bundle,
                Path::new("--"),
                &fixture.executable,
                Path::new("--stdio"),
            ]
        ));
    }

    #[test]
    fn restricted_plan_marks_host_network_as_an_explicit_override() {
        let fixture = PolicyFixture::new();
        let plan = linux_launch_plan_with_system_roots(
            &fixture.bundle,
            &fixture.executable,
            &[],
            std::slice::from_ref(&fixture.runtime),
            &[],
            LinuxSandboxNetworkMode::Host,
        )
        .expect("compile host-network launch");

        let unshare = plan
            .arguments
            .iter()
            .position(|argument| argument == "--unshare-all")
            .expect("unshare all");
        let share = plan
            .arguments
            .iter()
            .position(|argument| argument == "--share-net")
            .expect("share network");
        assert_eq!(share, unshare + 1);
    }

    #[test]
    fn restricted_plan_rejects_an_executable_outside_visible_mounts() {
        let fixture = PolicyFixture::new();
        let outside = fixture.root.join("outside-agent");
        std::fs::write(&outside, "agent").expect("write outside executable");
        let outside = outside
            .canonicalize()
            .expect("canonical outside executable");

        let error = linux_launch_plan_with_system_roots(
            &fixture.bundle,
            &outside,
            &[],
            std::slice::from_ref(&fixture.runtime),
            &[],
            LinuxSandboxNetworkMode::Disabled,
        )
        .expect_err("outside executable should fail");
        assert!(error.contains("outside the restricted profile"));
    }

    #[test]
    fn rejects_grants_under_private_sandbox_filesystems() {
        assert!(reject_shadowed_mount(Path::new("/tmp/bundle"), "bundle root").is_err());
        assert!(reject_shadowed_mount(Path::new("/run/agent"), "agent runtime path").is_err());
        assert!(reject_shadowed_mount(Path::new("/dev/shm/bundle"), "bundle root").is_err());
        assert!(reject_shadowed_mount(Path::new("/var/tmp/bundle"), "bundle root").is_ok());
        assert!(reject_shadowed_mount(Path::new("/home/user/bundle"), "bundle root").is_ok());
    }

    #[test]
    fn restricted_plan_rejects_a_missing_declared_runtime_root() {
        let fixture = PolicyFixture::new();
        let missing = fixture.root.join("missing-runtime");

        let error = linux_launch_plan_with_system_roots(
            &fixture.bundle,
            &fixture.executable,
            &[],
            &[fixture.runtime.clone(), missing],
            &[],
            LinuxSandboxNetworkMode::Disabled,
        )
        .expect_err("missing runtime root should fail");
        assert!(error.contains("agent runtime path is unavailable"));
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn restricted_linux_host_enforces_the_compiled_mount_policy() {
        use std::os::unix::fs::PermissionsExt;

        if !matches!(
            std::env::var("OKF_STUDIO_REQUIRE_BWRAP_TEST").as_deref(),
            Ok("1")
        ) {
            return;
        }

        let fixture = PolicyFixture::new();
        let visible = fixture.bundle.join("docs").join("overview.md");
        let protected = fixture.bundle.join(".env");
        let blocked_write = fixture.bundle.join("blocked.txt");
        let custom_root = Path::new("/var/tmp").join(format!(
            "okf-studio-restricted-custom-agent-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&custom_root).expect("create custom agent root");
        let custom_agent = custom_root.join("agent");
        std::fs::write(&custom_agent, "#!/bin/sh\nexec /bin/sh \"$@\"\n")
            .expect("write custom agent wrapper");
        std::fs::set_permissions(&custom_agent, std::fs::Permissions::from_mode(0o700))
            .expect("make custom agent executable");
        let custom_agent = custom_agent
            .canonicalize()
            .expect("canonical custom agent executable");
        // Each check names itself on stderr so a runner failure says which
        // guarantee broke instead of only reporting a nonzero exit.
        let script = concat!(
            r#"fail() { echo "sandbox fixture failed: $1" >&2; exit 1; }; "#,
            r#"test -r "$1" || fail "visible bundle read"; "#,
            r#"test ! -e "$2" || fail "protected path masking"; "#,
            r#"if (printf blocked > "$3") 2>/dev/null; then fail "bundle write rejection"; fi; "#,
            r#"printf private > /tmp/probe || fail "private tmp write"; "#,
            r#"test "$(cat /tmp/probe)" = private || fail "private tmp read""#,
        );
        let arguments = vec![
            "-c".to_string(),
            script.to_string(),
            "okf-studio-sandbox-test".to_string(),
            visible.to_string_lossy().into_owned(),
            protected.to_string_lossy().into_owned(),
            blocked_write.to_string_lossy().into_owned(),
        ];
        let mut command = linux_restricted_command(
            &fixture.bundle,
            &custom_agent,
            &arguments,
            std::slice::from_ref(&custom_agent),
            LinuxSandboxNetworkMode::Disabled,
        )
        .await
        .expect("prepare restricted command");
        command
            .env_clear()
            .stdin(std::process::Stdio::null())
            .kill_on_drop(true);

        let output = tokio::time::timeout(std::time::Duration::from_secs(5), command.output())
            .await
            .expect("restricted command deadline")
            .expect("start restricted command");
        let _ = std::fs::remove_dir_all(&custom_root);
        assert!(
            output.status.success(),
            "restricted fixture exited with {:?}\nstdout: {}\nstderr: {}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
        assert!(!blocked_write.exists());
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn native_windows_reports_no_enforcement_host() {
        let value = serde_json::to_value(status().await).expect("serialize host status");
        assert_eq!(value["platform"], "windows");
        assert_eq!(value["backend"], serde_json::Value::Null);
        assert_eq!(value["state"], "unsupported-platform");
        assert_eq!(value["launchProfileAvailable"].as_bool(), Some(false));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn accepts_only_a_system_owned_non_setuid_binary() {
        assert_eq!(
            classify_linux_binary(0, 0o100755),
            LinuxBinaryTrust::Trusted
        );
        assert_eq!(classify_linux_binary(0, 0o104755), LinuxBinaryTrust::Setuid);
        assert_eq!(
            classify_linux_binary(1000, 0o100755),
            LinuxBinaryTrust::Untrusted
        );
        assert_eq!(
            classify_linux_binary(0, 0o100775),
            LinuxBinaryTrust::Untrusted
        );
        assert_eq!(
            classify_linux_binary(0, 0o100750),
            LinuxBinaryTrust::Untrusted
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn probe_requires_network_and_process_namespaces() {
        let arguments = linux_probe_arguments(std::path::Path::new("/usr/bin/bwrap"));
        let arguments = arguments
            .iter()
            .map(|argument| argument.to_string_lossy())
            .collect::<Vec<_>>();
        for required in [
            "--ro-bind",
            "--unshare-user",
            "--unshare-net",
            "--unshare-ipc",
            "--unshare-pid",
            "--unshare-uts",
            "--disable-userns",
            "--new-session",
            "--die-with-parent",
        ] {
            assert!(arguments.iter().any(|argument| argument == required));
        }
        assert_eq!(arguments[arguments.len() - 2], "/usr/bin/bwrap");
        assert_eq!(
            arguments.last().map(|argument| argument.as_ref()),
            Some("--version")
        );
    }
}
