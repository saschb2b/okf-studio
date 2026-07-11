use agent_client_protocol::schema::v1::{
    AgentCapabilities, CancelNotification, ContentBlock, ContentChunk, Implementation,
    InitializeRequest, InitializeResponse, NewSessionRequest, PermissionOptionKind, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, StopReason, TextContent,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{Agent, ByteStreams, Client, ConnectTo, ConnectionTo};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
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
const SESSION_CREATE_TIMEOUT: Duration = Duration::from_secs(30);
const COMMAND_ACCEPT_TIMEOUT: Duration = Duration::from_secs(10);
const PERMISSION_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MAX_DIAGNOSTIC_BYTES: usize = 64 * 1024;
const MAX_CONNECTION_MESSAGE_CHARS: usize = 2048;
const MAX_PROMPT_CHARS: usize = 128 * 1024;
const MAX_TURN_CHUNK_CHARS: usize = 64 * 1024;
const MAX_PERMISSION_OPTIONS: usize = 16;
const MAX_PERMISSION_FIELD_CHARS: usize = 512;
const CONNECTION_EVENT: &str = "agent-connection-state";
const TURN_EVENT: &str = "agent-turn-update";
const PERMISSION_EVENT: &str = "agent-permission-update";
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
#[serde(rename_all = "camelCase")]
pub struct AgentSessionInfo {
    connection_id: String,
    session_id: String,
    bundle_root: PathBuf,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnInfo {
    connection_id: String,
    session_id: String,
    turn_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentTurnEvent {
    connection_id: String,
    session_id: String,
    turn_id: String,
    update: AgentTurnUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum AgentTurnUpdate {
    Text {
        text: String,
        message_id: Option<String>,
    },
    Completed {
        stop_reason: String,
    },
    Failed {
        message: String,
    },
}

type TurnEventSink = Arc<dyn Fn(AgentTurnEvent) + Send + Sync>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentPermissionEvent {
    request_id: String,
    connection_id: String,
    session_id: String,
    update: AgentPermissionUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum AgentPermissionUpdate {
    Requested {
        tool_call_id: String,
        title: Option<String>,
        options: Vec<AgentPermissionOptionInfo>,
    },
    Resolved {
        option_id: Option<String>,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentPermissionOptionInfo {
    option_id: String,
    name: String,
    kind: &'static str,
}

type PermissionEventSink = Arc<dyn Fn(AgentPermissionEvent) + Send + Sync>;

struct ConnectionRuntime {
    turn_events: TurnEventSink,
    permissions: Arc<Mutex<HashMap<String, PendingPermission>>>,
    permission_events: PermissionEventSink,
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
    permissions: Arc<Mutex<HashMap<String, PendingPermission>>>,
}

struct PendingPermission {
    connection_id: String,
    session_id: String,
    option_ids: HashSet<String>,
    response: tokio::sync::oneshot::Sender<Option<String>>,
}

struct AgentWorker {
    profile_id: String,
    abort: tokio::task::AbortHandle,
    commands: tokio::sync::mpsc::Sender<AgentHostCommand>,
}

enum AgentHostCommand {
    NewSession {
        bundle_root: PathBuf,
        response: tokio::sync::oneshot::Sender<Result<AgentSessionInfo, String>>,
    },
    Prompt {
        session_id: String,
        turn_id: String,
        text: String,
        response: tokio::sync::oneshot::Sender<Result<AgentTurnInfo, String>>,
    },
    CancelTurn {
        session_id: String,
        turn_id: String,
        response: tokio::sync::oneshot::Sender<Result<bool, String>>,
    },
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
        cancel_matching_permissions(&self.permissions, |_, _| true);
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
    let (command_tx, command_rx) = tokio::sync::mpsc::channel(8);
    let handshake_tx = Arc::new(Mutex::new(Some(handshake_tx)));
    let worker_id = connection_id.clone();
    let worker_profile_id = profile_id.to_string();
    let workers = Arc::clone(&state.workers);
    let worker_handshake = Arc::clone(&handshake_tx);
    let worker_app = app.clone();
    let turn_app = app.clone();
    let turn_events: TurnEventSink = Arc::new(move |event| {
        let _ = turn_app.emit(TURN_EVENT, event);
    });
    let permission_app = app.clone();
    let permission_events: PermissionEventSink = Arc::new(move |event| {
        let _ = permission_app.emit(PERMISSION_EVENT, event);
    });
    let permissions = Arc::clone(&state.permissions);
    let worker_permissions = Arc::clone(&permissions);
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
            command_rx,
            ConnectionRuntime {
                turn_events,
                permissions: Arc::clone(&worker_permissions),
                permission_events,
            },
        )
        .await;
        cancel_matching_permissions(&worker_permissions, |permission, _| {
            permission.connection_id == worker_id
        });
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
                commands: command_tx,
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

pub async fn new_session(
    state: &AgentHostState,
    connection_id: &str,
    bundle_root: String,
) -> Result<AgentSessionInfo, String> {
    let bundle_root = tokio::task::spawn_blocking(move || canonical_bundle_root(&bundle_root))
        .await
        .map_err(|_| "Bundle root validation task failed.".to_string())??;
    let commands = state
        .workers
        .lock()
        .map_err(|_| "Agent host state is unavailable.".to_string())?
        .get(connection_id)
        .map(|worker| worker.commands.clone())
        .ok_or_else(|| "Agent connection was not found.".to_string())?;
    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    commands
        .send(AgentHostCommand::NewSession {
            bundle_root,
            response: response_tx,
        })
        .await
        .map_err(|_| "Agent connection ended before session creation.".to_string())?;
    tokio::time::timeout(SESSION_CREATE_TIMEOUT, response_rx)
        .await
        .map_err(|_| "Agent session creation timed out.".to_string())?
        .map_err(|_| "Agent connection ended before session creation.".to_string())?
}

pub async fn prompt(
    state: &AgentHostState,
    connection_id: &str,
    session_id: String,
    text: String,
) -> Result<AgentTurnInfo, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Prompt text cannot be empty.".to_string());
    }
    if text.chars().count() > MAX_PROMPT_CHARS {
        return Err(format!(
            "Prompt text cannot exceed {MAX_PROMPT_CHARS} characters."
        ));
    }
    let turn_id = format!("turn-{}", uuid::Uuid::new_v4());
    let commands = connection_commands(state, connection_id)?;
    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    commands
        .send(AgentHostCommand::Prompt {
            session_id,
            turn_id,
            text,
            response: response_tx,
        })
        .await
        .map_err(|_| "Agent connection ended before accepting the prompt.".to_string())?;
    command_response(response_rx, "prompt").await
}

pub async fn cancel_turn(
    state: &AgentHostState,
    connection_id: &str,
    session_id: String,
    turn_id: String,
) -> Result<bool, String> {
    cancel_matching_permissions(&state.permissions, |permission, _| {
        permission.connection_id == connection_id && permission.session_id == session_id
    });
    let commands = connection_commands(state, connection_id)?;
    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    commands
        .send(AgentHostCommand::CancelTurn {
            session_id,
            turn_id,
            response: response_tx,
        })
        .await
        .map_err(|_| "Agent connection ended before accepting cancellation.".to_string())?;
    command_response(response_rx, "cancellation").await
}

pub fn respond_permission(
    state: &AgentHostState,
    request_id: &str,
    option_id: Option<String>,
) -> Result<bool, String> {
    let pending = {
        let mut permissions = state
            .permissions
            .lock()
            .map_err(|_| "Agent permission state is unavailable.".to_string())?;
        let Some(permission) = permissions.get(request_id) else {
            return Ok(false);
        };
        if option_id
            .as_ref()
            .is_some_and(|option_id| !permission.option_ids.contains(option_id))
        {
            return Err("Permission option was not offered by the agent.".to_string());
        }
        permissions.remove(request_id)
    };
    let Some(pending) = pending else {
        return Ok(false);
    };
    Ok(pending.response.send(option_id).is_ok())
}

fn connection_commands(
    state: &AgentHostState,
    connection_id: &str,
) -> Result<tokio::sync::mpsc::Sender<AgentHostCommand>, String> {
    state
        .workers
        .lock()
        .map_err(|_| "Agent host state is unavailable.".to_string())?
        .get(connection_id)
        .map(|worker| worker.commands.clone())
        .ok_or_else(|| "Agent connection was not found.".to_string())
}

async fn command_response<T>(
    response: tokio::sync::oneshot::Receiver<Result<T, String>>,
    action: &str,
) -> Result<T, String> {
    tokio::time::timeout(COMMAND_ACCEPT_TIMEOUT, response)
        .await
        .map_err(|_| format!("Agent {action} acceptance timed out."))?
        .map_err(|_| format!("Agent connection ended before accepting {action}."))?
}

fn canonical_bundle_root(bundle_root: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(bundle_root);
    if !requested.is_absolute() {
        return Err("Bundle root must be an absolute path.".to_string());
    }
    let canonical = requested
        .canonicalize()
        .map_err(|error| format!("Bundle root is unavailable: {error}"))?;
    if !canonical.is_dir() {
        return Err("Bundle root must be a directory.".to_string());
    }
    Ok(canonical)
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
        cancel_matching_permissions(&state.permissions, |permission, _| {
            permission.connection_id == connection_id
        });
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
        cancel_matching_permissions(&state.permissions, |permission, _| {
            permission.connection_id == connection_id
        });
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
    mut commands: tokio::sync::mpsc::Receiver<AgentHostCommand>,
    runtime: ConnectionRuntime,
) -> Result<(), String> {
    let ConnectionRuntime {
        turn_events,
        permissions,
        permission_events,
    } = runtime;
    let active_turns = Arc::new(Mutex::new(HashMap::<String, String>::new()));
    let notification_turns = Arc::clone(&active_turns);
    let notification_events = Arc::clone(&turn_events);
    let notification_connection_id = connection_id.clone();
    let request_turns = Arc::clone(&active_turns);
    let request_permissions = Arc::clone(&permissions);
    let request_events = Arc::clone(&permission_events);
    let request_connection_id = connection_id.clone();
    Client
        .builder()
        .name("okf-studio")
        .on_receive_notification(
            async move |notification: SessionNotification, _connection| {
                if let Some(event) = text_turn_event(
                    &notification_connection_id,
                    &notification_turns,
                    notification,
                ) {
                    notification_events(event);
                }
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _connection| {
                let session_id = request.session_id.to_string();
                let has_active_turn = request_turns
                    .lock()
                    .ok()
                    .is_some_and(|turns| turns.contains_key(&session_id));
                let options = permission_options(request.options);
                if !has_active_turn || options.is_empty() {
                    return responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Cancelled,
                    ));
                }
                let request_id = format!("permission-{}", uuid::Uuid::new_v4());
                let option_ids = options
                    .iter()
                    .map(|option| option.option_id.clone())
                    .collect();
                let (response_tx, response_rx) = tokio::sync::oneshot::channel();
                if let Ok(mut pending) = request_permissions.lock() {
                    pending.insert(
                        request_id.clone(),
                        PendingPermission {
                            connection_id: request_connection_id.clone(),
                            session_id: session_id.clone(),
                            option_ids,
                            response: response_tx,
                        },
                    );
                } else {
                    return responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Cancelled,
                    ));
                }
                request_events(AgentPermissionEvent {
                    request_id: request_id.clone(),
                    connection_id: request_connection_id.clone(),
                    session_id: session_id.clone(),
                    update: AgentPermissionUpdate::Requested {
                        tool_call_id: bounded_permission_field(&request.tool_call.tool_call_id.to_string()),
                        title: request
                            .tool_call
                            .fields
                            .title
                            .as_deref()
                            .and_then(bounded_permission_title),
                        options,
                    },
                });
                let selected = tokio::time::timeout(PERMISSION_TIMEOUT, response_rx)
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .flatten();
                if let Ok(mut pending) = request_permissions.lock() {
                    pending.remove(&request_id);
                }
                request_events(AgentPermissionEvent {
                    request_id,
                    connection_id: request_connection_id.clone(),
                    session_id,
                    update: AgentPermissionUpdate::Resolved {
                        option_id: selected.clone(),
                    },
                });
                let outcome = selected.map_or(RequestPermissionOutcome::Cancelled, |option_id| {
                    RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
                });
                responder.respond(RequestPermissionResponse::new(outcome))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async move |connection: ConnectionTo<Agent>| {
            let response = initialize_connection(&connection).await?;
            if let Some(sender) = take_sender(&handshake) {
                sender
                    .send(Ok(connection_info(
                        connection_id.clone(),
                        profile_id,
                        response,
                    )))
                    .map_err(|_| {
                        agent_client_protocol::util::internal_error(
                            "ACP initialization result receiver closed",
                        )
                    })?;
            }
            let mut sessions = HashMap::<String, PathBuf>::new();
            let mut turn_tasks = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    command = commands.recv() => {
                        let Some(command) = command else { break };
                        match command {
                            AgentHostCommand::NewSession { bundle_root, response } => {
                                let result = create_session(&connection, &connection_id, bundle_root).await;
                                if let Ok(info) = &result {
                                    sessions.insert(info.session_id.clone(), info.bundle_root.clone());
                                }
                                let _ = response.send(result);
                            }
                            AgentHostCommand::Prompt { session_id, turn_id, text, response } => {
                                if !sessions.contains_key(&session_id) {
                                    let _ = response.send(Err("Agent session was not found on this connection.".to_string()));
                                    continue;
                                }
                                let accepted = {
                                    let mut turns = active_turns.lock().map_err(|_| {
                                        agent_client_protocol::util::internal_error("Agent turn state is unavailable")
                                    })?;
                                    if turns.contains_key(&session_id) {
                                        false
                                    } else {
                                        turns.insert(session_id.clone(), turn_id.clone());
                                        true
                                    }
                                };
                                if !accepted {
                                    let _ = response.send(Err("This session already has an active turn.".to_string()));
                                    continue;
                                }
                                let info = AgentTurnInfo {
                                    connection_id: connection_id.clone(),
                                    session_id: session_id.clone(),
                                    turn_id: turn_id.clone(),
                                };
                                if response.send(Ok(info)).is_err() {
                                    remove_active_turn(&active_turns, &session_id, &turn_id);
                                    continue;
                                }
                                let prompt_connection = connection.clone();
                                let prompt_connection_id = connection_id.clone();
                                let prompt_turns = Arc::clone(&active_turns);
                                let prompt_events = Arc::clone(&turn_events);
                                turn_tasks.spawn(async move {
                                    let result = send_prompt(&prompt_connection, &session_id, text).await;
                                    remove_active_turn(&prompt_turns, &session_id, &turn_id);
                                    let update = match result {
                                        Ok(stop_reason) => AgentTurnUpdate::Completed {
                                            stop_reason: stop_reason_name(stop_reason).to_string(),
                                        },
                                        Err(message) => AgentTurnUpdate::Failed {
                                            message: connection_message(&message),
                                        },
                                    };
                                    prompt_events(AgentTurnEvent {
                                        connection_id: prompt_connection_id,
                                        session_id,
                                        turn_id,
                                        update,
                                    });
                                });
                            }
                            AgentHostCommand::CancelTurn { session_id, turn_id, response } => {
                                let is_active = active_turns
                                    .lock()
                                    .map_err(|_| agent_client_protocol::util::internal_error("Agent turn state is unavailable"))?
                                    .get(&session_id)
                                    .is_some_and(|active_turn| active_turn == &turn_id);
                                let result = if is_active {
                                    connection
                                        .send_notification(CancelNotification::new(session_id))
                                        .map(|()| true)
                                        .map_err(|error| format!("Agent cancellation failed: {error}"))
                                } else {
                                    Ok(false)
                                };
                                let _ = response.send(result);
                            }
                        }
                    }
                    _ = turn_tasks.join_next(), if !turn_tasks.is_empty() => {}
                }
            }
            turn_tasks.abort_all();
            Ok(())
        })
        .await
        .map_err(|error| format!("Agent connection failed: {error}"))
}

fn permission_options(
    options: Vec<agent_client_protocol::schema::v1::PermissionOption>,
) -> Vec<AgentPermissionOptionInfo> {
    options
        .into_iter()
        .take(MAX_PERMISSION_OPTIONS)
        .filter_map(|option| {
            let option_id = option.option_id.to_string();
            if option_id.is_empty() || option_id.chars().count() > MAX_PERMISSION_FIELD_CHARS {
                return None;
            }
            let kind = permission_kind_name(option.kind);
            let name = bounded_permission_field(&option.name);
            Some(AgentPermissionOptionInfo {
                option_id,
                name: if name.trim().is_empty() {
                    permission_kind_label(kind).to_string()
                } else {
                    name
                },
                kind,
            })
        })
        .collect()
}

fn permission_kind_label(kind: &str) -> &'static str {
    match kind {
        "allow-once" => "Allow once",
        "allow-always" => "Always allow",
        "reject-once" => "Reject",
        "reject-always" => "Always reject",
        _ => "Choose",
    }
}

fn bounded_permission_title(value: &str) -> Option<String> {
    let title = bounded_permission_field(value);
    (!title.trim().is_empty()).then_some(title)
}

fn permission_kind_name(kind: PermissionOptionKind) -> &'static str {
    match kind {
        PermissionOptionKind::AllowOnce => "allow-once",
        PermissionOptionKind::AllowAlways => "allow-always",
        PermissionOptionKind::RejectOnce => "reject-once",
        PermissionOptionKind::RejectAlways => "reject-always",
        _ => "unknown",
    }
}

fn bounded_permission_field(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_PERMISSION_FIELD_CHARS)
        .collect()
}

fn cancel_matching_permissions(
    permissions: &Mutex<HashMap<String, PendingPermission>>,
    predicate: impl Fn(&PendingPermission, &str) -> bool,
) {
    let pending = if let Ok(mut permissions) = permissions.lock() {
        let request_ids = permissions
            .iter()
            .filter(|(request_id, permission)| predicate(permission, request_id))
            .map(|(request_id, _)| request_id.clone())
            .collect::<Vec<_>>();
        request_ids
            .into_iter()
            .filter_map(|request_id| permissions.remove(&request_id))
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    for permission in pending {
        let _ = permission.response.send(None);
    }
}

async fn send_prompt(
    connection: &ConnectionTo<Agent>,
    session_id: &str,
    text: String,
) -> Result<StopReason, String> {
    connection
        .send_request(PromptRequest::new(
            session_id.to_string(),
            vec![ContentBlock::Text(TextContent::new(text))],
        ))
        .block_task()
        .await
        .map(|response| response.stop_reason)
        .map_err(|error| format!("Agent prompt failed: {error}"))
}

fn remove_active_turn(
    active_turns: &Mutex<HashMap<String, String>>,
    session_id: &str,
    turn_id: &str,
) {
    if let Ok(mut turns) = active_turns.lock() {
        if turns
            .get(session_id)
            .is_some_and(|active_turn| active_turn == turn_id)
        {
            turns.remove(session_id);
        }
    }
}

fn text_turn_event(
    connection_id: &str,
    active_turns: &Mutex<HashMap<String, String>>,
    notification: SessionNotification,
) -> Option<AgentTurnEvent> {
    let session_id = notification.session_id.to_string();
    let turn_id = active_turns.lock().ok()?.get(&session_id)?.clone();
    let SessionUpdate::AgentMessageChunk(ContentChunk {
        content: ContentBlock::Text(text),
        message_id,
        ..
    }) = notification.update
    else {
        return None;
    };
    Some(AgentTurnEvent {
        connection_id: connection_id.to_string(),
        session_id,
        turn_id,
        update: AgentTurnUpdate::Text {
            text: bounded_turn_text(&text.text),
            message_id: message_id.map(|id| id.to_string()),
        },
    })
}

fn bounded_turn_text(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(MAX_TURN_CHUNK_CHARS)
        .collect()
}

fn stop_reason_name(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end-turn",
        StopReason::MaxTokens => "max-tokens",
        StopReason::MaxTurnRequests => "max-turn-requests",
        StopReason::Refusal => "refusal",
        StopReason::Cancelled => "cancelled",
        _ => "unknown",
    }
}

async fn create_session(
    connection: &ConnectionTo<Agent>,
    connection_id: &str,
    bundle_root: PathBuf,
) -> Result<AgentSessionInfo, String> {
    let response = connection
        .send_request(NewSessionRequest::new(&bundle_root))
        .block_task()
        .await
        .map_err(|error| format!("Agent session creation failed: {error}"))?;
    Ok(AgentSessionInfo {
        connection_id: connection_id.to_string(),
        session_id: response.session_id.to_string(),
        bundle_root,
    })
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
        AgentCapabilities, AuthMethod, AuthMethodAgent, NewSessionResponse, PermissionOption,
        PromptCapabilities, PromptResponse, ToolCallUpdate, ToolCallUpdateFields,
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

    #[tokio::test(flavor = "current_thread")]
    async fn creates_a_session_at_the_exact_bundle_root() {
        let bundle_root =
            std::env::temp_dir().join(format!("okf-studio-session-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&bundle_root).expect("create bundle root");
        let canonical_root = bundle_root.canonicalize().expect("canonical bundle root");
        let expected_root = canonical_root.clone();
        let fake_agent = Agent
            .builder()
            .on_receive_request(
                async move |_request: InitializeRequest,
                            responder: Responder<InitializeResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(InitializeResponse::new(ProtocolVersion::V1))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |request: NewSessionRequest,
                            responder: Responder<NewSessionResponse>,
                            _connection: ConnectionTo<Client>| {
                    assert_eq!(request.cwd, expected_root);
                    assert!(request.additional_directories.is_empty());
                    responder.respond(NewSessionResponse::new("session-1"))
                },
                agent_client_protocol::on_receive_request!(),
            );
        let (result_tx, result_rx) = tokio::sync::oneshot::channel();

        Client
            .builder()
            .name("okf-studio")
            .connect_with(fake_agent, async move |connection: ConnectionTo<Agent>| {
                initialize_connection(&connection).await?;
                let result = create_session(&connection, "connection-1", canonical_root).await;
                let _ = result_tx.send(result);
                Ok(())
            })
            .await
            .expect("client should finish");

        let info = result_rx
            .await
            .expect("session result")
            .expect("session should start");
        assert_eq!(info.connection_id, "connection-1");
        assert_eq!(info.session_id, "session-1");
        assert_eq!(
            info.bundle_root,
            bundle_root.canonicalize().expect("canonical")
        );
        std::fs::remove_dir_all(bundle_root).expect("remove bundle root");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn streams_a_text_prompt_and_reports_its_stop_reason() {
        let fake_agent = Agent
            .builder()
            .on_receive_request(
                async move |_request: InitializeRequest,
                            responder: Responder<InitializeResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(InitializeResponse::new(ProtocolVersion::V1))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |_request: NewSessionRequest,
                            responder: Responder<NewSessionResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(NewSessionResponse::new("session-1"))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |request: PromptRequest,
                            responder: Responder<PromptResponse>,
                            connection: ConnectionTo<Client>| {
                    assert_eq!(request.session_id.to_string(), "session-1");
                    assert!(matches!(
                        request.prompt.as_slice(),
                        [ContentBlock::Text(text)] if text.text == "Research this bundle"
                    ));
                    connection.send_notification(SessionNotification::new(
                        request.session_id,
                        SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                            TextContent::new("A grounded answer."),
                        ))),
                    ))?;
                    responder.respond(PromptResponse::new(StopReason::EndTurn))
                },
                agent_client_protocol::on_receive_request!(),
            );
        let (handshake_tx, handshake_rx) = tokio::sync::oneshot::channel();
        let handshake = Arc::new(Mutex::new(Some(handshake_tx)));
        let (commands_tx, commands_rx) = tokio::sync::mpsc::channel(8);
        let (events_tx, mut events_rx) = tokio::sync::mpsc::unbounded_channel();
        let event_sink: TurnEventSink = Arc::new(move |event| {
            let _ = events_tx.send(event);
        });
        let permissions = Arc::new(Mutex::new(HashMap::new()));
        let permission_sink: PermissionEventSink = Arc::new(|_| {});
        let worker = tokio::spawn(run_connection(
            fake_agent,
            "connection-1".to_string(),
            "profile-1".to_string(),
            handshake,
            commands_rx,
            ConnectionRuntime {
                turn_events: event_sink,
                permissions,
                permission_events: permission_sink,
            },
        ));
        handshake_rx
            .await
            .expect("handshake response")
            .expect("handshake should pass");

        let (session_tx, session_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::NewSession {
                bundle_root: std::env::temp_dir(),
                response: session_tx,
            })
            .await
            .expect("send session command");
        session_rx
            .await
            .expect("session response")
            .expect("session should start");

        let (prompt_tx, prompt_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::Prompt {
                session_id: "session-1".to_string(),
                turn_id: "turn-1".to_string(),
                text: "Research this bundle".to_string(),
                response: prompt_tx,
            })
            .await
            .expect("send prompt command");
        prompt_rx
            .await
            .expect("prompt acceptance")
            .expect("prompt should be accepted");

        let text_event = events_rx.recv().await.expect("text event");
        assert_eq!(text_event.turn_id, "turn-1");
        assert!(matches!(
            text_event.update,
            AgentTurnUpdate::Text { text, .. } if text == "A grounded answer."
        ));
        let completion = events_rx.recv().await.expect("completion event");
        assert!(matches!(
            completion.update,
            AgentTurnUpdate::Completed { stop_reason } if stop_reason == "end-turn"
        ));

        worker.abort();
        assert!(worker
            .await
            .expect_err("worker should abort")
            .is_cancelled());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn forwards_an_advertised_permission_choice_to_the_agent() {
        let (outcome_tx, mut outcome_rx) = tokio::sync::mpsc::unbounded_channel();
        let fake_agent = Agent
            .builder()
            .on_receive_request(
                async move |_request: InitializeRequest,
                            responder: Responder<InitializeResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(InitializeResponse::new(ProtocolVersion::V1))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |_request: NewSessionRequest,
                            responder: Responder<NewSessionResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(NewSessionResponse::new("session-permission"))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |request: PromptRequest,
                            responder: Responder<PromptResponse>,
                            connection: ConnectionTo<Client>| {
                    let outcome_tx = outcome_tx.clone();
                    tokio::spawn(async move {
                        let permission = connection
                            .send_request(RequestPermissionRequest::new(
                                request.session_id,
                                ToolCallUpdate::new(
                                    "tool-call-1",
                                    ToolCallUpdateFields::new().title("Write the bundle index"),
                                ),
                                vec![
                                    PermissionOption::new(
                                        "allow-once",
                                        "Allow once",
                                        PermissionOptionKind::AllowOnce,
                                    ),
                                    PermissionOption::new(
                                        "reject-once",
                                        "Reject",
                                        PermissionOptionKind::RejectOnce,
                                    ),
                                ],
                            ))
                            .block_task()
                            .await;
                        if let Ok(permission) = permission {
                            let _ = outcome_tx.send(permission.outcome);
                            let _ = responder.respond(PromptResponse::new(StopReason::EndTurn));
                        }
                    });
                    Ok(())
                },
                agent_client_protocol::on_receive_request!(),
            );
        let (handshake_tx, handshake_rx) = tokio::sync::oneshot::channel();
        let (commands_tx, commands_rx) = tokio::sync::mpsc::channel(8);
        let permissions = Arc::new(Mutex::new(HashMap::new()));
        let state = AgentHostState {
            workers: Arc::new(Mutex::new(HashMap::new())),
            permissions: Arc::clone(&permissions),
        };
        let (permission_tx, mut permission_rx) = tokio::sync::mpsc::unbounded_channel();
        let permission_sink: PermissionEventSink = Arc::new(move |event| {
            let _ = permission_tx.send(event);
        });
        let worker = tokio::spawn(run_connection(
            fake_agent,
            "connection-permission".to_string(),
            "profile-permission".to_string(),
            Arc::new(Mutex::new(Some(handshake_tx))),
            commands_rx,
            ConnectionRuntime {
                turn_events: Arc::new(|_| {}),
                permissions,
                permission_events: permission_sink,
            },
        ));
        handshake_rx
            .await
            .expect("handshake response")
            .expect("handshake should pass");
        let (session_tx, session_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::NewSession {
                bundle_root: std::env::temp_dir(),
                response: session_tx,
            })
            .await
            .expect("send session");
        session_rx
            .await
            .expect("session response")
            .expect("session should start");
        let (prompt_tx, prompt_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::Prompt {
                session_id: "session-permission".to_string(),
                turn_id: "turn-permission".to_string(),
                text: "Update the index".to_string(),
                response: prompt_tx,
            })
            .await
            .expect("send prompt");
        prompt_rx
            .await
            .expect("prompt response")
            .expect("prompt should start");

        let requested = permission_rx.recv().await.expect("permission request");
        assert_eq!(requested.session_id, "session-permission");
        assert!(matches!(
            &requested.update,
            AgentPermissionUpdate::Requested { title, options, .. }
                if title.as_deref() == Some("Write the bundle index") && options.len() == 2
        ));
        assert!(respond_permission(
            &state,
            &requested.request_id,
            Some("allow-once".to_string())
        )
        .expect("respond to permission"));
        let outcome = outcome_rx.recv().await.expect("permission outcome");
        assert!(matches!(
            outcome,
            RequestPermissionOutcome::Selected(selected)
                if selected.option_id.to_string() == "allow-once"
        ));
        assert!(matches!(
            permission_rx.recv().await.expect("resolved event").update,
            AgentPermissionUpdate::Resolved { option_id }
                if option_id.as_deref() == Some("allow-once")
        ));

        worker.abort();
        assert!(worker
            .await
            .expect_err("worker should abort")
            .is_cancelled());
    }

    #[test]
    fn rejects_a_permission_option_the_agent_did_not_offer() {
        let (response, _receiver) = tokio::sync::oneshot::channel();
        let state = AgentHostState::default();
        state.permissions.lock().expect("permission state").insert(
            "permission-1".to_string(),
            PendingPermission {
                connection_id: "connection-1".to_string(),
                session_id: "session-1".to_string(),
                option_ids: HashSet::from(["reject-once".to_string()]),
                response,
            },
        );

        let error = respond_permission(&state, "permission-1", Some("allow-once".to_string()))
            .expect_err("unadvertised option should fail");
        assert_eq!(error, "Permission option was not offered by the agent.");
        assert!(state
            .permissions
            .lock()
            .expect("permission state")
            .contains_key("permission-1"));
    }

    #[test]
    fn gives_an_empty_permission_choice_an_accessible_label() {
        let options = permission_options(vec![PermissionOption::new(
            "allow-once",
            "   ",
            PermissionOptionKind::AllowOnce,
        )]);

        assert_eq!(options.len(), 1);
        assert_eq!(options[0].name, "Allow once");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn sends_session_cancellation_for_the_active_turn() {
        let cancelled = Arc::new(tokio::sync::Notify::new());
        let prompt_cancelled = Arc::clone(&cancelled);
        let notification_cancelled = Arc::clone(&cancelled);
        let fake_agent = Agent
            .builder()
            .on_receive_request(
                async move |_request: InitializeRequest,
                            responder: Responder<InitializeResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(InitializeResponse::new(ProtocolVersion::V1))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |_request: NewSessionRequest,
                            responder: Responder<NewSessionResponse>,
                            _connection: ConnectionTo<Client>| {
                    responder.respond(NewSessionResponse::new("session-cancel"))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |_request: PromptRequest,
                            responder: Responder<PromptResponse>,
                            _connection: ConnectionTo<Client>| {
                    let prompt_cancelled = Arc::clone(&prompt_cancelled);
                    tokio::spawn(async move {
                        prompt_cancelled.notified().await;
                        let _ = responder.respond(PromptResponse::new(StopReason::Cancelled));
                    });
                    Ok(())
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_notification(
                async move |notification: CancelNotification, _connection: ConnectionTo<Client>| {
                    assert_eq!(notification.session_id.to_string(), "session-cancel");
                    notification_cancelled.notify_one();
                    Ok(())
                },
                agent_client_protocol::on_receive_notification!(),
            );
        let (handshake_tx, handshake_rx) = tokio::sync::oneshot::channel();
        let (commands_tx, commands_rx) = tokio::sync::mpsc::channel(8);
        let (events_tx, mut events_rx) = tokio::sync::mpsc::unbounded_channel();
        let event_sink: TurnEventSink = Arc::new(move |event| {
            let _ = events_tx.send(event);
        });
        let permissions = Arc::new(Mutex::new(HashMap::new()));
        let permission_sink: PermissionEventSink = Arc::new(|_| {});
        let worker = tokio::spawn(run_connection(
            fake_agent,
            "connection-cancel".to_string(),
            "profile-cancel".to_string(),
            Arc::new(Mutex::new(Some(handshake_tx))),
            commands_rx,
            ConnectionRuntime {
                turn_events: event_sink,
                permissions,
                permission_events: permission_sink,
            },
        ));
        handshake_rx
            .await
            .expect("handshake response")
            .expect("handshake should pass");
        let (session_tx, session_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::NewSession {
                bundle_root: std::env::temp_dir(),
                response: session_tx,
            })
            .await
            .expect("send session");
        session_rx
            .await
            .expect("session response")
            .expect("session should start");
        let (prompt_tx, prompt_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::Prompt {
                session_id: "session-cancel".to_string(),
                turn_id: "turn-cancel".to_string(),
                text: "Long task".to_string(),
                response: prompt_tx,
            })
            .await
            .expect("send prompt");
        prompt_rx
            .await
            .expect("prompt response")
            .expect("prompt accepted");
        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        commands_tx
            .send(AgentHostCommand::CancelTurn {
                session_id: "session-cancel".to_string(),
                turn_id: "turn-cancel".to_string(),
                response: cancel_tx,
            })
            .await
            .expect("send cancellation");
        assert!(cancel_rx
            .await
            .expect("cancellation response")
            .expect("cancellation should send"));
        let completion = tokio::time::timeout(Duration::from_secs(1), events_rx.recv())
            .await
            .expect("cancelled turn should complete")
            .expect("completion event");
        assert!(matches!(
            completion.update,
            AgentTurnUpdate::Completed { stop_reason } if stop_reason == "cancelled"
        ));
        worker.abort();
        let _ = worker.await;
    }

    #[test]
    fn rejects_a_relative_session_root() {
        assert_eq!(
            canonical_bundle_root("relative/bundle").expect_err("relative root should fail"),
            "Bundle root must be an absolute path."
        );
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
        let (first_commands, _) = tokio::sync::mpsc::channel(1);
        let (second_commands, _) = tokio::sync::mpsc::channel(1);
        state.workers.lock().expect("workers").insert(
            "one".to_string(),
            AgentWorker {
                profile_id: "profile-a".to_string(),
                abort: first.abort_handle(),
                commands: first_commands,
            },
        );
        state.workers.lock().expect("workers").insert(
            "two".to_string(),
            AgentWorker {
                profile_id: "profile-a".to_string(),
                abort: second.abort_handle(),
                commands: second_commands,
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
