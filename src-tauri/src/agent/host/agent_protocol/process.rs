//! Spawning the external ACP agent process and negotiating its handshake.
//! Builds the launch command (standard or the restricted Linux profile),
//! attaches process-tree ownership, records the launcher-produced security
//! scope, and bounds and redacts the child's diagnostics. See
//! docs/architecture/agent-system.md.

use super::*;

pub(crate) struct ProcessSpec {
    pub(crate) executable: PathBuf,
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<(String, String)>,
    #[cfg(any(target_os = "linux", test))]
    pub(crate) read_only_roots: Vec<PathBuf>,
    #[cfg(any(target_os = "linux", test))]
    pub(crate) restricted: Option<LinuxRestrictedProcessSpec>,
}

#[cfg(any(target_os = "linux", test))]
pub(crate) struct LinuxRestrictedProcessSpec {
    pub(crate) bundle_root: PathBuf,
    pub(crate) network: crate::agent_sandbox::LinuxSandboxNetworkMode,
}

impl ProcessSpec {
    pub(crate) fn from_profile(
        profile: &agent_custom::CustomAgentProfile,
        _bundle_root: &Path,
        mode: AgentConnectionMode,
    ) -> Result<Self, String> {
        let environment = profile
            .environment
            .iter()
            .filter_map(|name| std::env::var(name).ok().map(|value| (name.clone(), value)))
            .collect();
        let executable = PathBuf::from(&profile.executable);
        #[cfg(not(any(target_os = "linux", test)))]
        if mode == AgentConnectionMode::RestrictedOffline {
            return Err(
                "Restricted offline connections require the verified Linux Bubblewrap host."
                    .to_string(),
            );
        }
        #[cfg(any(target_os = "linux", test))]
        let (executable, read_only_roots, restricted) = match mode {
            AgentConnectionMode::Standard => (executable, Vec::new(), None),
            AgentConnectionMode::RestrictedOffline => {
                let executable = executable.canonicalize().map_err(|error| {
                    format!("Studio could not resolve the restricted agent executable: {error}")
                })?;
                (
                    executable.clone(),
                    vec![executable.clone()],
                    Some(LinuxRestrictedProcessSpec {
                        bundle_root: _bundle_root.to_path_buf(),
                        network: crate::agent_sandbox::LinuxSandboxNetworkMode::Disabled,
                    }),
                )
            }
        };
        Ok(Self {
            executable,
            arguments: profile.arguments.clone(),
            environment,
            #[cfg(any(target_os = "linux", test))]
            read_only_roots,
            #[cfg(any(target_os = "linux", test))]
            restricted,
        })
    }
}

pub(crate) struct ProcessAgent {
    spec: ProcessSpec,
    security_scope: Arc<OnceLock<AgentSecurityScopeInfo>>,
}

impl ProcessAgent {
    pub(crate) fn new(
        spec: ProcessSpec,
        security_scope: Arc<OnceLock<AgentSecurityScopeInfo>>,
    ) -> Self {
        Self {
            spec,
            security_scope,
        }
    }
}

impl ConnectTo<Client> for ProcessAgent {
    async fn connect_to(self, client: impl ConnectTo<Agent>) -> agent_client_protocol::Result<()> {
        let prepared = process_command(&self.spec)
            .await
            .map_err(agent_client_protocol::util::internal_error)?;
        let launch_profile = prepared.launch_profile;
        let mut command = prepared.command;
        command
            .env_clear()
            .envs(self.spec.environment.iter().cloned())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        agent_process::configure(&mut command);

        let mut child = command
            .spawn()
            .map_err(agent_client_protocol::Error::into_internal_error)?;
        let mut process_tree = agent_process::AgentProcessTree::attach(&child)
            .map_err(agent_client_protocol::Error::into_internal_error)?;
        self.security_scope
            .set(AgentSecurityScopeInfo::external_process(
                process_tree.containment(),
                launch_profile,
            ))
            .map_err(|_| {
                agent_client_protocol::util::internal_error(
                    "ACP launcher produced duplicate security scope evidence",
                )
            })?;
        let stdin = child.stdin.take().ok_or_else(|| {
            agent_client_protocol::util::internal_error("Failed to open agent stdin")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            agent_client_protocol::util::internal_error("Failed to open agent stdout")
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            agent_client_protocol::util::internal_error("Failed to open agent stderr")
        })?;
        let mut redactions = self
            .spec
            .environment
            .iter()
            .map(|(_, value)| value.clone())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        redactions.sort_by_key(|value| std::cmp::Reverse(value.len()));
        let diagnostics = tokio::spawn(read_diagnostics(stderr, redactions));
        let protocol = ConnectTo::<Client>::connect_to(
            ByteStreams::new(stdin.compat_write(), stdout.compat()),
            client,
        );
        tokio::pin!(protocol);

        tokio::select! {
            result = &mut protocol => {
                process_tree.terminate();
                let _ = child.kill().await;
                let _ = child.wait().await;
                diagnostics.abort();
                result
            }
            status = child.wait() => {
                let status = status.map_err(agent_client_protocol::Error::into_internal_error)?;
                // Descendants may still hold stderr open after their parent exits.
                process_tree.terminate();
                let diagnostics = diagnostics.await.unwrap_or_default();
                let message = if diagnostics.is_empty() {
                    format!("Agent process exited with {status}")
                } else {
                    format!(
                        "Agent process exited with {status}. {}",
                        diagnostic_summary(&diagnostics)
                    )
                };
                Err(agent_client_protocol::util::internal_error(message))
            }
        }
    }
}

struct PreparedProcessCommand {
    command: Command,
    launch_profile: ExternalProcessLaunchProfile,
}

async fn process_command(spec: &ProcessSpec) -> Result<PreparedProcessCommand, String> {
    #[cfg(any(target_os = "linux", test))]
    if let Some(restricted) = &spec.restricted {
        let command = crate::agent_sandbox::linux_restricted_command(
            &restricted.bundle_root,
            &spec.executable,
            &spec.arguments,
            &spec.read_only_roots,
            restricted.network,
        )
        .await?;
        return Ok(PreparedProcessCommand {
            command,
            launch_profile: ExternalProcessLaunchProfile::LinuxRestrictedOffline,
        });
    }

    let mut command = Command::new(&spec.executable);
    command.args(&spec.arguments);
    Ok(PreparedProcessCommand {
        command,
        launch_profile: ExternalProcessLaunchProfile::Standard,
    })
}

pub(crate) fn diagnostic_summary(diagnostics: &str) -> String {
    let line = diagnostics
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("Error:"))
        .or_else(|| {
            diagnostics
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
        })
        .unwrap_or("No diagnostic was provided.");
    line.chars()
        .take(MAX_CONNECTION_MESSAGE_CHARS / 2)
        .collect()
}

async fn read_diagnostics(
    mut stderr: tokio::process::ChildStderr,
    redactions: Vec<String>,
) -> String {
    let mut retained = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        match stderr.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                retained.extend_from_slice(&chunk[..count]);
                if retained.len() > MAX_DIAGNOSTIC_BYTES {
                    retained.drain(..retained.len() - MAX_DIAGNOSTIC_BYTES);
                }
            }
        }
    }
    sanitize_diagnostics(&retained, &redactions)
}

pub(crate) fn sanitize_diagnostics(bytes: &[u8], redactions: &[String]) -> String {
    let start = bytes.len().saturating_sub(MAX_DIAGNOSTIC_BYTES);
    let mut text = String::from_utf8_lossy(&bytes[start..])
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect::<String>();
    for secret in redactions {
        text = text.replace(secret, "[REDACTED]");
    }
    if text.len() > MAX_DIAGNOSTIC_BYTES {
        let mut start = text.len() - MAX_DIAGNOSTIC_BYTES;
        while !text.is_char_boundary(start) {
            start += 1;
        }
        text.drain(..start);
    }
    text
}
