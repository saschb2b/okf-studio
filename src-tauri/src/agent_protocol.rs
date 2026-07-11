use agent_client_protocol::schema::v1::{
    AgentCapabilities, Implementation, InitializeRequest, InitializeResponse,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{Agent, ByteStreams, Client, ConnectTo, ConnectionTo};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use crate::agent_custom;

const INITIALIZE_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_DIAGNOSTIC_BYTES: usize = 64 * 1024;
const MAX_CONNECTION_MESSAGE_CHARS: usize = 2048;
const CONNECTION_EVENT: &str = "agent-connection-state";
type HandshakeResult = Result<AgentConnectionInfo, String>;
type HandshakeSender = Arc<Mutex<Option<tokio::sync::oneshot::Sender<HandshakeResult>>>>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionInfo {
    connection_id: String,
    profile_id: String,
    protocol_version: String,
    agent: Option<AgentImplementationInfo>,
    auth_methods: Vec<AgentAuthMethodInfo>,
    capabilities: AgentCapabilityInfo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionEvent {
    connection_id: String,
    profile_id: String,
    status: AgentConnectionStatus,
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AgentConnectionStatus {
    Disconnected,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentImplementationInfo {
    name: String,
    title: Option<String>,
    version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentAuthMethodInfo {
    id: String,
    name: String,
    description: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentCapabilityInfo {
    load_session: bool,
    prompt_image: bool,
    prompt_audio: bool,
    prompt_embedded_context: bool,
    mcp_http: bool,
    mcp_sse: bool,
    session_list: bool,
    session_resume: bool,
    session_close: bool,
}

#[derive(Default)]
pub struct AgentHostState {
    workers: Arc<Mutex<HashMap<String, AgentWorker>>>,
}

struct AgentWorker {
    profile_id: String,
    abort: tokio::task::AbortHandle,
}

impl Drop for AgentHostState {
    fn drop(&mut self) {
        let mut workers = self
            .workers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for (_, worker) in workers.drain() {
            worker.abort.abort();
        }
    }
}

pub async fn connect_custom(
    app: &AppHandle,
    state: &AgentHostState,
    profile_id: &str,
) -> Result<AgentConnectionInfo, String> {
    let profile = agent_custom::find(app, profile_id)?;
    let connection_id = format!("connection-{}", uuid::Uuid::new_v4());
    let spec = ProcessSpec::from_profile(&profile);
    let (handshake_tx, handshake_rx) = tokio::sync::oneshot::channel();
    let handshake_tx = Arc::new(Mutex::new(Some(handshake_tx)));
    let worker_id = connection_id.clone();
    let worker_profile_id = profile_id.to_string();
    let workers = Arc::clone(&state.workers);
    let worker_handshake = Arc::clone(&handshake_tx);
    let worker_app = app.clone();
    let (start_tx, start_rx) = tokio::sync::oneshot::channel();

    let worker = tokio::spawn(async move {
        if start_rx.await.is_err() {
            return;
        }
        let result = run_connection(
            ProcessAgent::new(spec),
            worker_id.clone(),
            worker_profile_id.clone(),
            Arc::clone(&worker_handshake),
        )
        .await;
        if let Some(sender) = take_sender(&worker_handshake) {
            let message = result
                .err()
                .unwrap_or_else(|| "Agent connection ended before initialization.".to_string());
            let _ = sender.send(Err(message));
        } else if let Err(error) = result {
            emit_connection_event(
                &worker_app,
                AgentConnectionEvent {
                    connection_id: worker_id.clone(),
                    profile_id: worker_profile_id,
                    status: AgentConnectionStatus::Failed,
                    message: Some(connection_message(&error)),
                },
            );
        }
        if let Ok(mut active) = workers.lock() {
            active.remove(&worker_id);
        }
    });
    {
        let mut active = state
            .workers
            .lock()
            .map_err(|_| "Agent host state is unavailable.".to_string())?;
        if active
            .values()
            .any(|worker| worker.profile_id == profile_id)
        {
            worker.abort();
            return Err("This custom agent profile already has an active connection.".to_string());
        }
        active.insert(
            connection_id.clone(),
            AgentWorker {
                profile_id: profile_id.to_string(),
                abort: worker.abort_handle(),
            },
        );
    }
    let _ = start_tx.send(());

    match tokio::time::timeout(INITIALIZE_TIMEOUT, handshake_rx).await {
        Ok(Ok(Ok(info))) => Ok(info),
        Ok(Ok(Err(error))) => {
            disconnect(app, state, &connection_id)?;
            Err(error)
        }
        Ok(Err(_)) => {
            disconnect(app, state, &connection_id)?;
            Err("Agent connection ended before initialization.".to_string())
        }
        Err(_) => {
            disconnect(app, state, &connection_id)?;
            Err("Agent initialization timed out.".to_string())
        }
    }
}

pub fn disconnect(
    app: &AppHandle,
    state: &AgentHostState,
    connection_id: &str,
) -> Result<bool, String> {
    let worker = state
        .workers
        .lock()
        .map_err(|_| "Agent host state is unavailable.".to_string())?
        .remove(connection_id);
    if let Some(worker) = worker {
        worker.abort.abort();
        emit_connection_event(
            app,
            AgentConnectionEvent {
                connection_id: connection_id.to_string(),
                profile_id: worker.profile_id,
                status: AgentConnectionStatus::Disconnected,
                message: None,
            },
        );
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn disconnect_profile(
    app: &AppHandle,
    state: &AgentHostState,
    profile_id: &str,
) -> Result<usize, String> {
    disconnect_profile_workers(state, profile_id, |connection_id, worker| {
        emit_connection_event(
            app,
            AgentConnectionEvent {
                connection_id: connection_id.to_string(),
                profile_id: worker.profile_id.clone(),
                status: AgentConnectionStatus::Disconnected,
                message: None,
            },
        );
    })
}

fn disconnect_profile_workers(
    state: &AgentHostState,
    profile_id: &str,
    mut on_disconnect: impl FnMut(&str, &AgentWorker),
) -> Result<usize, String> {
    let removed = {
        let mut workers = state
            .workers
            .lock()
            .map_err(|_| "Agent host state is unavailable.".to_string())?;
        let connection_ids = workers
            .iter()
            .filter(|(_, worker)| worker.profile_id == profile_id)
            .map(|(connection_id, _)| connection_id.clone())
            .collect::<Vec<_>>();
        connection_ids
            .into_iter()
            .filter_map(|connection_id| {
                workers
                    .remove(&connection_id)
                    .map(|worker| (connection_id, worker))
            })
            .collect::<Vec<_>>()
    };
    let count = removed.len();
    for (connection_id, worker) in removed {
        worker.abort.abort();
        on_disconnect(&connection_id, &worker);
    }
    Ok(count)
}

fn emit_connection_event(app: &AppHandle, event: AgentConnectionEvent) {
    let _ = app.emit(CONNECTION_EVENT, event);
}

fn connection_message(message: &str) -> String {
    message
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_CONNECTION_MESSAGE_CHARS)
        .collect()
}

fn take_sender(sender: &HandshakeSender) -> Option<tokio::sync::oneshot::Sender<HandshakeResult>> {
    sender.lock().ok()?.take()
}

async fn run_connection(
    agent: impl ConnectTo<Client>,
    connection_id: String,
    profile_id: String,
    handshake: HandshakeSender,
) -> Result<(), String> {
    Client
        .builder()
        .name("okf-studio")
        .on_receive_request(
            async move |_request: RequestPermissionRequest, responder, _connection| {
                responder.respond(RequestPermissionResponse::new(
                    RequestPermissionOutcome::Cancelled,
                ))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async move |connection: ConnectionTo<Agent>| {
            let response = initialize_connection(&connection).await?;
            if let Some(sender) = take_sender(&handshake) {
                sender
                    .send(Ok(connection_info(connection_id, profile_id, response)))
                    .map_err(|_| {
                        agent_client_protocol::util::internal_error(
                            "ACP initialization result receiver closed",
                        )
                    })?;
            }
            std::future::pending::<()>().await;
            #[allow(unreachable_code)]
            Ok(())
        })
        .await
        .map_err(|error| format!("Agent connection failed: {error}"))
}

async fn initialize_connection(
    connection: &ConnectionTo<Agent>,
) -> agent_client_protocol::Result<InitializeResponse> {
    let response = connection
        .send_request(InitializeRequest::new(ProtocolVersion::V1).client_info(
            Implementation::new("okf-studio", env!("CARGO_PKG_VERSION")).title("OKF Studio"),
        ))
        .block_task()
        .await?;
    if response.protocol_version != ProtocolVersion::V1 {
        return Err(agent_client_protocol::util::internal_error(
            "Agent selected an unsupported ACP protocol version",
        ));
    }
    Ok(response)
}

fn connection_info(
    connection_id: String,
    profile_id: String,
    response: InitializeResponse,
) -> AgentConnectionInfo {
    AgentConnectionInfo {
        connection_id,
        profile_id,
        protocol_version: "1".to_string(),
        agent: response.agent_info.map(|info| AgentImplementationInfo {
            name: info.name,
            title: info.title,
            version: info.version,
        }),
        auth_methods: response
            .auth_methods
            .into_iter()
            .map(|method| AgentAuthMethodInfo {
                id: method.id().to_string(),
                name: method.name().to_string(),
                description: method.description().map(str::to_string),
            })
            .collect(),
        capabilities: capability_info(&response.agent_capabilities),
    }
}

fn capability_info(capabilities: &AgentCapabilities) -> AgentCapabilityInfo {
    AgentCapabilityInfo {
        load_session: capabilities.load_session,
        prompt_image: capabilities.prompt_capabilities.image,
        prompt_audio: capabilities.prompt_capabilities.audio,
        prompt_embedded_context: capabilities.prompt_capabilities.embedded_context,
        mcp_http: capabilities.mcp_capabilities.http,
        mcp_sse: capabilities.mcp_capabilities.sse,
        session_list: capabilities.session_capabilities.list.is_some(),
        session_resume: capabilities.session_capabilities.resume.is_some(),
        session_close: capabilities.session_capabilities.close.is_some(),
    }
}

struct ProcessSpec {
    executable: PathBuf,
    arguments: Vec<String>,
    environment: Vec<(String, String)>,
}

impl ProcessSpec {
    fn from_profile(profile: &agent_custom::CustomAgentProfile) -> Self {
        let environment = profile
            .environment
            .iter()
            .filter_map(|name| std::env::var(name).ok().map(|value| (name.clone(), value)))
            .collect();
        Self {
            executable: PathBuf::from(&profile.executable),
            arguments: profile.arguments.clone(),
            environment,
        }
    }
}

struct ProcessAgent {
    spec: ProcessSpec,
}

impl ProcessAgent {
    fn new(spec: ProcessSpec) -> Self {
        Self { spec }
    }
}

impl ConnectTo<Client> for ProcessAgent {
    async fn connect_to(self, client: impl ConnectTo<Agent>) -> agent_client_protocol::Result<()> {
        let mut command = Command::new(&self.spec.executable);
        command
            .args(&self.spec.arguments)
            .env_clear()
            .envs(self.spec.environment.iter().cloned())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000);

        let mut child = command
            .spawn()
            .map_err(agent_client_protocol::Error::into_internal_error)?;
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
                let _ = child.kill().await;
                diagnostics.abort();
                result
            }
            status = child.wait() => {
                let status = status.map_err(agent_client_protocol::Error::into_internal_error)?;
                let diagnostics = diagnostics.await.unwrap_or_default();
                let message = if diagnostics.is_empty() {
                    format!("Agent process exited with {status}")
                } else {
                    format!("Agent process exited with {status}: {diagnostics}")
                };
                Err(agent_client_protocol::util::internal_error(message))
            }
        }
    }
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

fn sanitize_diagnostics(bytes: &[u8], redactions: &[String]) -> String {
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

#[cfg(test)]
async fn negotiate(agent: impl ConnectTo<Client>) -> Result<InitializeResponse, String> {
    negotiate_with_timeout(agent, INITIALIZE_TIMEOUT).await
}

#[cfg(test)]
async fn negotiate_with_timeout(
    agent: impl ConnectTo<Client>,
    timeout: Duration,
) -> Result<InitializeResponse, String> {
    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    let connection = Client
        .builder()
        .name("okf-studio")
        .on_receive_request(
            async move |_request: RequestPermissionRequest, responder, _connection| {
                responder.respond(RequestPermissionResponse::new(
                    RequestPermissionOutcome::Cancelled,
                ))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async move |connection: ConnectionTo<Agent>| {
            let response = initialize_connection(&connection).await?;
            response_tx.send(response).map_err(|_| {
                agent_client_protocol::util::internal_error(
                    "ACP initialization result receiver closed",
                )
            })?;
            Ok(())
        });

    tokio::time::timeout(timeout, connection)
        .await
        .map_err(|_| "Agent initialization timed out.".to_string())?
        .map_err(|error| format!("Agent initialization failed: {error}"))?;
    response_rx
        .await
        .map_err(|_| "Agent initialization ended without a response.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::{
        AgentCapabilities, AuthMethod, AuthMethodAgent, PromptCapabilities,
    };
    use agent_client_protocol::{Dispatch, Responder};

    #[tokio::test(flavor = "current_thread")]
    async fn negotiates_v1_and_records_advertised_capabilities() {
        let fake_agent = Agent.builder().on_receive_request(
            async move |request: InitializeRequest,
                        responder: Responder<InitializeResponse>,
                        _connection: ConnectionTo<Client>| {
                assert_eq!(request.protocol_version, ProtocolVersion::V1);
                assert_eq!(
                    request.client_info.as_ref().map(|info| info.name.as_str()),
                    Some("okf-studio")
                );
                responder.respond(
                    InitializeResponse::new(ProtocolVersion::V1)
                        .agent_info(Implementation::new("fake-agent", "1.0.0"))
                        .agent_capabilities(
                            AgentCapabilities::new()
                                .prompt_capabilities(PromptCapabilities::new().image(true)),
                        )
                        .auth_methods(vec![AuthMethod::Agent(AuthMethodAgent::new(
                            "login", "Sign in",
                        ))]),
                )
            },
            agent_client_protocol::on_receive_request!(),
        );

        let response = negotiate(fake_agent)
            .await
            .expect("agent should initialize");
        assert_eq!(response.protocol_version, ProtocolVersion::V1);
        assert!(response.agent_capabilities.prompt_capabilities.image);
        assert_eq!(response.auth_methods.len(), 1);
        assert_eq!(
            response.agent_info.map(|info| info.name),
            Some("fake-agent".to_string())
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn times_out_when_agent_never_answers_initialize() {
        let fake_agent = Agent.builder().on_receive_dispatch(
            async move |_message: Dispatch, _connection: ConnectionTo<Client>| {
                std::future::pending::<agent_client_protocol::Result<()>>().await
            },
            agent_client_protocol::on_receive_dispatch!(),
        );

        let error = negotiate_with_timeout(fake_agent, Duration::from_millis(20))
            .await
            .expect_err("silent agent should time out");
        assert_eq!(error, "Agent initialization timed out.");
    }

    #[test]
    fn bounds_and_redacts_process_diagnostics() {
        let secret = "private-token".to_string();
        let short_secret = "abc".to_string();
        let mut bytes = vec![b'x'; MAX_DIAGNOSTIC_BYTES + 32];
        bytes.extend_from_slice(b"\0private-token abc\nfailed");
        let diagnostics = sanitize_diagnostics(&bytes, &[secret, short_secret]);

        assert!(diagnostics.len() <= MAX_DIAGNOSTIC_BYTES);
        assert!(!diagnostics.contains("private-token"));
        assert!(!diagnostics.contains("abc"));
        assert!(diagnostics.ends_with("[REDACTED] [REDACTED]\nfailed"));
        assert!(!diagnostics.contains('\0'));
    }

    #[test]
    fn caps_and_serializes_terminal_connection_failures() {
        let message = connection_message(&format!("failed\0{}", "x".repeat(4096)));
        assert_eq!(message.chars().count(), MAX_CONNECTION_MESSAGE_CHARS);
        assert!(!message.contains('\0'));

        let event = AgentConnectionEvent {
            connection_id: "connection-1".to_string(),
            profile_id: "profile-1".to_string(),
            status: AgentConnectionStatus::Failed,
            message: Some(message),
        };
        let value = serde_json::to_value(event).expect("event should serialize");
        assert_eq!(value["status"], "failed");
        assert_eq!(value["connectionId"], "connection-1");
        assert_eq!(value["profileId"], "profile-1");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn disconnecting_a_profile_aborts_all_of_its_workers() {
        let state = AgentHostState::default();
        let first = tokio::spawn(std::future::pending::<()>());
        let second = tokio::spawn(std::future::pending::<()>());
        state.workers.lock().expect("workers").insert(
            "one".to_string(),
            AgentWorker {
                profile_id: "profile-a".to_string(),
                abort: first.abort_handle(),
            },
        );
        state.workers.lock().expect("workers").insert(
            "two".to_string(),
            AgentWorker {
                profile_id: "profile-a".to_string(),
                abort: second.abort_handle(),
            },
        );

        assert_eq!(
            disconnect_profile_workers(&state, "profile-a", |_, _| {}).expect("disconnect"),
            2
        );
        assert!(first.await.expect_err("first should abort").is_cancelled());
        assert!(second
            .await
            .expect_err("second should abort")
            .is_cancelled());
    }
}
