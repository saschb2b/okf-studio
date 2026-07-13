//! Preflights operating-system confinement backends for external agents.
//!
//! A successful probe reports backend readiness only. It does not change an
//! agent launch, produce connection scope evidence, or unlock unattended work.

use serde::Serialize;

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
    use std::collections::HashSet;
    use std::fs;
    use std::os::unix::fs::MetadataExt;

    let mut saw_setuid = false;
    let mut saw_untrusted = false;
    let mut visited = HashSet::new();
    let Some(path) = std::env::var_os("PATH") else {
        return linux_result(AgentSecurityHostState::NotFound);
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
                    return linux_result(AgentSecurityHostState::Ready);
                }
                return linux_result(AgentSecurityHostState::ProbeFailed);
            }
        }
    }

    if saw_setuid {
        linux_result(AgentSecurityHostState::SetuidRejected)
    } else if saw_untrusted {
        linux_result(AgentSecurityHostState::UntrustedBinary)
    } else {
        linux_result(AgentSecurityHostState::NotFound)
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
        launch_profile_available: false,
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
        "--unshare-net".into(),
        "--unshare-ipc".into(),
        "--unshare-pid".into(),
        "--unshare-uts".into(),
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
            "--unshare-net",
            "--unshare-ipc",
            "--unshare-pid",
            "--unshare-uts",
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
