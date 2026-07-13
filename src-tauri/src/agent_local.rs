use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use url::Url;

const FILE_NAME: &str = "local-models.json";
const MAX_PROFILES: usize = 32;
const MAX_SETTINGS_BYTES: u64 = 128 * 1024;
const MAX_NAME_CHARS: usize = 80;
const MAX_URL_CHARS: usize = 2_048;
const MAX_RESPONSE_BYTES: u64 = 256 * 1024;
const MAX_CHAT_RESPONSE_BYTES: u64 = 1024 * 1024;
const MAX_MODELS: usize = 256;
const MAX_MODEL_ID_CHARS: usize = 256;
const MAX_TOOL_CALLS: usize = 8;
const MAX_TOOL_CALLS_PER_STEP: usize = 4;
const MAX_TOOL_ROUNDS: usize = 6;
const MAX_TOOL_NAME_CHARS: usize = 64;
const MAX_TOOL_ID_CHARS: usize = 128;
const MAX_TOOL_ARGUMENT_BYTES: usize = 8 * 1024;
const MAX_TOOL_RESULT_CHARS: usize = 96 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum LocalModelProvider {
    Ollama,
    LmStudio,
    LlamaCpp,
    OpenAiCompatible,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelProfileInput {
    name: String,
    provider: LocalModelProvider,
    base_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelProfile {
    id: String,
    name: String,
    provider: LocalModelProvider,
    base_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelProbe {
    provider: LocalModelProvider,
    base_url: String,
    models: Vec<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct LocalModelRuntime {
    pub profile_id: String,
    pub profile_name: String,
    pub provider: LocalModelProvider,
    pub base_url: Url,
    pub model: String,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct LocalChatMessage {
    pub role: &'static str,
    pub content: String,
}

#[derive(Clone, Debug)]
pub(crate) struct LocalToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: serde_json::Value,
}

#[derive(Clone, Debug)]
pub(crate) struct LocalToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug)]
struct LocalChatStep {
    content: Option<String>,
    tool_calls: Vec<LocalToolCall>,
}

pub fn list(app: &AppHandle) -> Result<Vec<LocalModelProfile>, String> {
    read_profiles(&profile_file(app)?)
}

pub fn save(app: &AppHandle, input: LocalModelProfileInput) -> Result<LocalModelProfile, String> {
    save_in(&profile_file(app)?, input)
}

pub fn remove(app: &AppHandle, profile_id: &str) -> Result<bool, String> {
    remove_in(&profile_file(app)?, profile_id)
}

pub fn probe(input: LocalModelProfileInput) -> Result<LocalModelProbe, String> {
    let (_, base_url) = validate_input(&input)?;
    let endpoint = model_endpoint(input.provider, &base_url)?;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .try_proxy_from_env(false)
        .timeout_connect(Duration::from_secs(5))
        .timeout_read(Duration::from_secs(10))
        .timeout_write(Duration::from_secs(5))
        .user_agent(concat!("okf-studio/", env!("CARGO_PKG_VERSION")))
        .build();
    let response = agent.get(endpoint.as_str()).call().map_err(probe_error)?;
    if response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err("The endpoint model list exceeds the 256 KiB limit.".to_string());
    }
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Studio could not read the endpoint model list.".to_string())?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("The endpoint model list exceeds the 256 KiB limit.".to_string());
    }
    let models = parse_models(input.provider, &bytes)?;
    Ok(LocalModelProbe {
        provider: input.provider,
        base_url: base_url.to_string(),
        models,
    })
}

pub(crate) fn prepare_runtime(
    app: &AppHandle,
    profile_id: &str,
    model: &str,
) -> Result<LocalModelRuntime, String> {
    validate_id(profile_id)?;
    let model = bounded_model_id(model)
        .ok_or_else(|| "Choose a valid model from the endpoint model list.".to_string())?;
    let profile = read_profiles(&profile_file(app)?)?
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "The local-model profile was not found.".to_string())?;
    let probe = probe(LocalModelProfileInput {
        name: profile.name.clone(),
        provider: profile.provider,
        base_url: profile.base_url.clone(),
    })?;
    if !probe.models.iter().any(|available| available == &model) {
        return Err("That model is no longer advertised by the endpoint.".to_string());
    }
    let (_, base_url) = validate_input(&LocalModelProfileInput {
        name: profile.name.clone(),
        provider: profile.provider,
        base_url: profile.base_url,
    })?;
    Ok(LocalModelRuntime {
        profile_id: profile.id,
        profile_name: profile.name,
        provider: profile.provider,
        base_url,
        model,
    })
}

pub(crate) fn chat(
    runtime: &LocalModelRuntime,
    messages: &[LocalChatMessage],
) -> Result<String, String> {
    let messages = messages
        .iter()
        .map(|message| {
            serde_json::json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    let response = chat_step(runtime, &messages, &[])?;
    if !response.tool_calls.is_empty() {
        return Err("The model requested a tool during a text-only turn.".to_string());
    }
    response
        .content
        .ok_or_else(|| "The model returned an empty response.".to_string())
}

pub(crate) fn chat_with_tools(
    runtime: &LocalModelRuntime,
    messages: &[LocalChatMessage],
    tools: &[LocalToolDefinition],
    mut execute: impl FnMut(&LocalToolCall) -> Result<String, String>,
) -> Result<String, String> {
    if tools.is_empty() {
        return chat(runtime, messages);
    }
    let mut request_messages = messages
        .iter()
        .map(|message| {
            serde_json::json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    let mut total_calls = 0;
    for round in 0..MAX_TOOL_ROUNDS {
        let mut response = chat_step(runtime, &request_messages, tools)?;
        if response.tool_calls.is_empty() {
            return response
                .content
                .ok_or_else(|| "The model returned an empty response.".to_string());
        }
        if response.tool_calls.len() > MAX_TOOL_CALLS_PER_STEP
            || total_calls + response.tool_calls.len() > MAX_TOOL_CALLS
        {
            return Err("The model requested too many tools in one turn.".to_string());
        }
        for (index, call) in response.tool_calls.iter_mut().enumerate() {
            call.id = format!("local-tool-{round}-{index}");
        }
        request_messages.push(assistant_tool_message(runtime.provider, &response));
        for call in &response.tool_calls {
            let result = execute(call)?;
            if result.chars().count() > MAX_TOOL_RESULT_CHARS {
                return Err("The Studio tool result exceeds the turn limit.".to_string());
            }
            request_messages.push(tool_result_message(runtime.provider, call, result));
        }
        total_calls += response.tool_calls.len();
    }
    Err("The model exceeded Studio's tool-round limit.".to_string())
}

fn chat_step(
    runtime: &LocalModelRuntime,
    messages: &[serde_json::Value],
    tools: &[LocalToolDefinition],
) -> Result<LocalChatStep, String> {
    let endpoint = chat_endpoint(runtime.provider, &runtime.base_url);
    let mut body = serde_json::json!({
        "model": &runtime.model,
        "messages": messages,
        "stream": false,
    });
    if !tools.is_empty() {
        body["tools"] = serde_json::Value::Array(
            tools
                .iter()
                .map(|tool| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.parameters,
                        },
                    })
                })
                .collect(),
        );
    }
    let body = serde_json::to_vec(&body)
        .map_err(|_| "Studio could not encode the local-model request.".to_string())?;
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .try_proxy_from_env(false)
        .timeout_connect(Duration::from_secs(5))
        .timeout_read(Duration::from_secs(120))
        .timeout_write(Duration::from_secs(10))
        .user_agent(concat!("okf-studio/", env!("CARGO_PKG_VERSION")))
        .build();
    let response = agent
        .post(endpoint.as_str())
        .set("content-type", "application/json")
        .send_bytes(&body)
        .map_err(chat_error)?;
    let bytes = read_bounded_response(response, MAX_CHAT_RESPONSE_BYTES, "model response")?;
    parse_chat_step(runtime.provider, &bytes)
}

fn profile_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("agents").join(FILE_NAME))
        .map_err(|error| format!("Studio could not locate its local-model settings: {error}"))
}

fn save_in(file: &Path, input: LocalModelProfileInput) -> Result<LocalModelProfile, String> {
    let (name, base_url) = validate_input(&input)?;
    let mut profiles = read_profiles(file)?;
    if profiles.len() >= MAX_PROFILES {
        return Err("Studio supports up to 32 local-model profiles.".to_string());
    }
    if profiles
        .iter()
        .any(|profile| profile.provider == input.provider && profile.base_url == base_url.as_str())
    {
        return Err("That provider endpoint is already configured.".to_string());
    }
    let profile = LocalModelProfile {
        id: profile_id(&input, base_url.as_str()),
        name,
        provider: input.provider,
        base_url: base_url.to_string(),
    };
    profiles.push(profile.clone());
    write_profiles(file, &profiles)?;
    Ok(profile)
}

fn remove_in(file: &Path, profile_id: &str) -> Result<bool, String> {
    validate_id(profile_id)?;
    let mut profiles = read_profiles(file)?;
    let previous_len = profiles.len();
    profiles.retain(|profile| profile.id != profile_id);
    if profiles.len() == previous_len {
        return Ok(false);
    }
    write_profiles(file, &profiles)?;
    Ok(true)
}

fn read_profiles(file: &Path) -> Result<Vec<LocalModelProfile>, String> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    if fs::metadata(file)
        .map_err(|error| format!("Studio could not inspect local-model settings: {error}"))?
        .len()
        > MAX_SETTINGS_BYTES
    {
        return Err("Local-model settings exceed the 128 KB limit.".to_string());
    }
    let bytes = fs::read(file)
        .map_err(|error| format!("Studio could not read local-model settings: {error}"))?;
    let profiles: Vec<LocalModelProfile> = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Studio could not parse local-model settings: {error}"))?;
    if profiles.len() > MAX_PROFILES {
        return Err("Local-model settings contain too many profiles.".to_string());
    }
    let mut ids = HashSet::new();
    let mut endpoints = HashSet::new();
    for profile in &profiles {
        validate_id(&profile.id)?;
        if !ids.insert(profile.id.as_str()) {
            return Err("Local-model settings contain duplicate IDs.".to_string());
        }
        let input = LocalModelProfileInput {
            name: profile.name.clone(),
            provider: profile.provider,
            base_url: profile.base_url.clone(),
        };
        let (_, base_url) = validate_input(&input)?;
        if profile.base_url != base_url.as_str()
            || !endpoints.insert((profile.provider, profile.base_url.as_str()))
        {
            return Err("Local-model settings contain an invalid duplicate endpoint.".to_string());
        }
    }
    Ok(profiles)
}

fn write_profiles(file: &Path, profiles: &[LocalModelProfile]) -> Result<(), String> {
    let parent = file
        .parent()
        .ok_or_else(|| "Local-model settings have no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Studio could not create local-model settings: {error}"))?;
    let bytes = serde_json::to_vec_pretty(profiles)
        .map_err(|error| format!("Studio could not encode local-model settings: {error}"))?;
    fs::write(file, bytes)
        .map_err(|error| format!("Studio could not save local-model settings: {error}"))
}

fn validate_input(input: &LocalModelProfileInput) -> Result<(String, Url), String> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err("Name must contain 1 to 80 characters.".to_string());
    }
    let raw_url = input.base_url.trim();
    if raw_url.is_empty() || raw_url.chars().count() > MAX_URL_CHARS {
        return Err("Endpoint must contain 1 to 2,048 characters.".to_string());
    }
    let mut url = Url::parse(raw_url).map_err(|_| "Enter a valid endpoint URL.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Endpoint URLs must use HTTP or HTTPS.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Endpoint URLs cannot contain credentials.".to_string());
    }
    if url.host().is_none() {
        return Err("Endpoint URLs must include a host.".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Endpoint URLs cannot contain a query or fragment.".to_string());
    }
    let path = url.path().trim_end_matches('/').to_string();
    url.set_path(if path.is_empty() { "/" } else { &path });
    Ok((name.to_string(), url))
}

fn model_endpoint(provider: LocalModelProvider, base_url: &Url) -> Result<Url, String> {
    let suffix = match provider {
        LocalModelProvider::Ollama => "api/tags",
        LocalModelProvider::LmStudio
        | LocalModelProvider::LlamaCpp
        | LocalModelProvider::OpenAiCompatible => "models",
    };
    let mut endpoint = base_url.clone();
    let mut path = endpoint.path().trim_end_matches('/').to_string();
    if provider != LocalModelProvider::Ollama && !path.ends_with("/v1") {
        path.push_str("/v1");
    }
    path.push('/');
    path.push_str(suffix);
    endpoint.set_path(&path);
    Ok(endpoint)
}

fn chat_endpoint(provider: LocalModelProvider, base_url: &Url) -> Url {
    let mut endpoint = base_url.clone();
    let mut path = endpoint.path().trim_end_matches('/').to_string();
    match provider {
        LocalModelProvider::Ollama => path.push_str("/api/chat"),
        _ => {
            if !path.ends_with("/v1") {
                path.push_str("/v1");
            }
            path.push_str("/chat/completions");
        }
    }
    endpoint.set_path(&path);
    endpoint
}

fn read_bounded_response(
    response: ureq::Response,
    limit: u64,
    label: &str,
) -> Result<Vec<u8>, String> {
    if response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > limit)
    {
        return Err(format!("The endpoint {label} exceeds the size limit."));
    }
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| format!("Studio could not read the endpoint {label}."))?;
    if bytes.len() as u64 > limit {
        return Err(format!("The endpoint {label} exceeds the size limit."));
    }
    Ok(bytes)
}

#[cfg(test)]
fn parse_chat_response(provider: LocalModelProvider, bytes: &[u8]) -> Result<String, String> {
    let response = parse_chat_step(provider, bytes)?;
    if !response.tool_calls.is_empty() {
        return Err("The model requested a tool during a text-only turn.".to_string());
    }
    response
        .content
        .ok_or_else(|| "The model returned an empty response.".to_string())
}

fn parse_chat_step(provider: LocalModelProvider, bytes: &[u8]) -> Result<LocalChatStep, String> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| "The endpoint returned an invalid JSON model response.".to_string())?;
    let message = match provider {
        LocalModelProvider::Ollama => value.get("message"),
        _ => value
            .get("choices")
            .and_then(serde_json::Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message")),
    }
    .ok_or_else(|| "The endpoint returned an unsupported model-response shape.".to_string())?;
    let content = message
        .get("content")
        .and_then(serde_json::Value::as_str)
        .map(clean_chat_content)
        .filter(|content| !content.is_empty());
    let tool_calls = message
        .get("tool_calls")
        .and_then(serde_json::Value::as_array)
        .map(|calls| parse_tool_calls(provider, calls))
        .transpose()?
        .unwrap_or_default();
    if content.is_none() && tool_calls.is_empty() {
        return Err("The model returned an empty response.".to_string());
    }
    Ok(LocalChatStep {
        content,
        tool_calls,
    })
}

fn parse_tool_calls(
    provider: LocalModelProvider,
    calls: &[serde_json::Value],
) -> Result<Vec<LocalToolCall>, String> {
    if calls.len() > MAX_TOOL_CALLS_PER_STEP {
        return Err("The model requested too many tools in one step.".to_string());
    }
    calls
        .iter()
        .map(|call| {
            let function = call
                .get("function")
                .ok_or_else(|| "The model returned an invalid tool call.".to_string())?;
            let name = function
                .get("name")
                .and_then(serde_json::Value::as_str)
                .and_then(bounded_tool_name)
                .ok_or_else(|| "The model returned an invalid tool name.".to_string())?;
            let arguments = match provider {
                LocalModelProvider::Ollama => function.get("arguments").cloned(),
                _ => function
                    .get("arguments")
                    .and_then(serde_json::Value::as_str)
                    .and_then(|arguments| serde_json::from_str(arguments).ok()),
            }
            .filter(serde_json::Value::is_object)
            .ok_or_else(|| "The model returned invalid tool arguments.".to_string())?;
            if serde_json::to_vec(&arguments)
                .is_ok_and(|encoded| encoded.len() > MAX_TOOL_ARGUMENT_BYTES)
            {
                return Err("The model tool arguments exceed the size limit.".to_string());
            }
            let id = match provider {
                LocalModelProvider::Ollama => String::new(),
                _ => call
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .and_then(bounded_tool_id)
                    .ok_or_else(|| "The model returned an invalid tool-call ID.".to_string())?,
            };
            Ok(LocalToolCall {
                id,
                name,
                arguments,
            })
        })
        .collect()
}

fn assistant_tool_message(
    provider: LocalModelProvider,
    response: &LocalChatStep,
) -> serde_json::Value {
    let content = response.content.as_deref().unwrap_or("");
    let tool_calls = response
        .tool_calls
        .iter()
        .map(|call| match provider {
            LocalModelProvider::Ollama => serde_json::json!({
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": call.arguments,
                },
            }),
            _ => serde_json::json!({
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string()),
                },
            }),
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "role": "assistant",
        "content": content,
        "tool_calls": tool_calls,
    })
}

fn tool_result_message(
    provider: LocalModelProvider,
    call: &LocalToolCall,
    content: String,
) -> serde_json::Value {
    match provider {
        LocalModelProvider::Ollama => serde_json::json!({
            "role": "tool",
            "tool_name": call.name,
            "content": content,
        }),
        _ => serde_json::json!({
            "role": "tool",
            "tool_call_id": call.id,
            "content": content,
        }),
    }
}

fn clean_chat_content(content: &str) -> String {
    content
        .trim()
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect()
}

fn bounded_tool_name(value: &str) -> Option<String> {
    (!value.is_empty()
        && value.len() <= MAX_TOOL_NAME_CHARS
        && value.bytes().all(|character| {
            character.is_ascii_alphanumeric() || character == b'_' || character == b'-'
        }))
    .then(|| value.to_string())
}

fn bounded_tool_id(value: &str) -> Option<String> {
    (!value.is_empty()
        && value.chars().count() <= MAX_TOOL_ID_CHARS
        && !value.chars().any(char::is_control))
    .then(|| value.to_string())
}

fn parse_models(provider: LocalModelProvider, bytes: &[u8]) -> Result<Vec<String>, String> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| "The endpoint returned an invalid JSON model list.".to_string())?;
    let entries = match provider {
        LocalModelProvider::Ollama => value.get("models"),
        _ => value.get("data"),
    }
    .and_then(serde_json::Value::as_array)
    .ok_or_else(|| "The endpoint returned an unsupported model-list shape.".to_string())?;
    let key = if provider == LocalModelProvider::Ollama {
        "name"
    } else {
        "id"
    };
    let mut seen = HashSet::new();
    let models = entries
        .iter()
        .filter_map(|entry| entry.get(key).and_then(serde_json::Value::as_str))
        .filter_map(bounded_model_id)
        .filter(|model| seen.insert(model.clone()))
        .take(MAX_MODELS)
        .collect::<Vec<_>>();
    Ok(models)
}

fn bounded_model_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_MODEL_ID_CHARS
        || value.chars().any(char::is_control)
    {
        None
    } else {
        Some(value.to_string())
    }
}

fn probe_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(status, _) => {
            format!("The endpoint returned HTTP status {status}.")
        }
        ureq::Error::Transport(_) => {
            "Studio could not reach the endpoint. Check that its server is running.".to_string()
        }
    }
}

fn chat_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(status, response) => {
            let detail = read_bounded_response(response, 8 * 1024, "error response")
                .ok()
                .and_then(|body| serde_json::from_slice::<serde_json::Value>(&body).ok())
                .and_then(|value| {
                    value
                        .get("error")
                        .and_then(|error| {
                            error
                                .get("message")
                                .and_then(serde_json::Value::as_str)
                                .or_else(|| error.as_str())
                        })
                        .map(bounded_error_detail)
                })
                .flatten();
            detail.map_or_else(
                || format!("The model endpoint returned HTTP status {status}."),
                |detail| format!("The model endpoint returned HTTP status {status}: {detail}"),
            )
        }
        ureq::Error::Transport(_) => {
            "Studio could not reach the model endpoint. Check that its server is running."
                .to_string()
        }
    }
}

fn bounded_error_detail(value: &str) -> Option<String> {
    let clean = value
        .chars()
        .filter(|character| !character.is_control())
        .take(512)
        .collect::<String>();
    (!clean.is_empty()).then_some(clean)
}

fn profile_id(input: &LocalModelProfileInput, base_url: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut digest = Sha256::new();
    digest.update(input.name.as_bytes());
    digest.update(base_url.as_bytes());
    digest.update(timestamp.to_le_bytes());
    let encoded = format!("{:x}", digest.finalize());
    format!("local-{}", &encoded[..16])
}

fn validate_id(profile_id: &str) -> Result<(), String> {
    if profile_id.starts_with("local-")
        && profile_id.len() == 22
        && profile_id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
    {
        Ok(())
    } else {
        Err("Local-model profile ID is invalid.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;

    fn temp_file(label: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!(
                "okf-studio-local-model-{label}-{}",
                std::process::id()
            ))
            .join(FILE_NAME)
    }

    fn input(provider: LocalModelProvider, base_url: &str) -> LocalModelProfileInput {
        LocalModelProfileInput {
            name: "Private model".to_string(),
            provider,
            base_url: base_url.to_string(),
        }
    }

    fn read_http_request(stream: &mut std::net::TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set read timeout");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        loop {
            let read = stream.read(&mut buffer).expect("read request");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.strip_prefix("Content-Length: ")
                        .or_else(|| line.strip_prefix("content-length: "))
                })
                .and_then(|value| value.parse::<usize>().ok())
                .expect("content length");
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }
        String::from_utf8(request).expect("UTF-8 request")
    }

    fn write_json_response(stream: &mut std::net::TcpStream, body: &str) {
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .expect("write response");
    }

    fn request_json(request: &str) -> serde_json::Value {
        let (_, body) = request.split_once("\r\n\r\n").expect("request body");
        serde_json::from_str(body).expect("JSON request")
    }

    #[test]
    fn saves_lists_and_removes_metadata_without_credentials() {
        let file = temp_file("roundtrip");
        let _ = fs::remove_dir_all(file.parent().expect("parent"));
        let profile = save_in(
            &file,
            input(LocalModelProvider::Ollama, "http://127.0.0.1:11434/"),
        )
        .expect("save profile");
        assert_eq!(profile.base_url, "http://127.0.0.1:11434/");
        assert_eq!(read_profiles(&file).expect("read profiles").len(), 1);
        assert!(remove_in(&file, &profile.id).expect("remove profile"));
        let _ = fs::remove_dir_all(file.parent().expect("parent"));
    }

    #[test]
    fn validates_urls_and_constructs_provider_model_endpoints() {
        let (_, ollama) =
            validate_input(&input(LocalModelProvider::Ollama, "http://localhost:11434"))
                .expect("valid Ollama URL");
        assert_eq!(
            model_endpoint(LocalModelProvider::Ollama, &ollama)
                .expect("Ollama endpoint")
                .as_str(),
            "http://localhost:11434/api/tags"
        );
        let (_, compatible) = validate_input(&input(
            LocalModelProvider::OpenAiCompatible,
            "http://localhost:1234/v1/",
        ))
        .expect("valid compatible URL");
        assert_eq!(
            model_endpoint(LocalModelProvider::OpenAiCompatible, &compatible)
                .expect("compatible endpoint")
                .as_str(),
            "http://localhost:1234/v1/models"
        );
        assert!(validate_input(&input(
            LocalModelProvider::Ollama,
            "http://user:secret@localhost:11434"
        ))
        .is_err());
        assert!(validate_input(&input(LocalModelProvider::Ollama, "file:///tmp/model")).is_err());
    }

    #[test]
    fn parses_bounded_ollama_and_openai_compatible_model_lists() {
        let ollama = parse_models(
            LocalModelProvider::Ollama,
            br#"{"models":[{"name":"qwen3:8b"},{"name":"qwen3:8b"},{"model":"ignored"}]}"#,
        )
        .expect("parse Ollama");
        assert_eq!(ollama, ["qwen3:8b"]);
        let compatible = parse_models(
            LocalModelProvider::LlamaCpp,
            br#"{"object":"list","data":[{"id":"local-model"},{"id":"\n"}]}"#,
        )
        .expect("parse compatible");
        assert_eq!(compatible, ["local-model"]);
    }

    #[test]
    fn constructs_and_parses_provider_chat_contracts() {
        let (_, ollama) =
            validate_input(&input(LocalModelProvider::Ollama, "http://localhost:11434"))
                .expect("valid Ollama URL");
        assert_eq!(
            chat_endpoint(LocalModelProvider::Ollama, &ollama).as_str(),
            "http://localhost:11434/api/chat"
        );
        assert_eq!(
            parse_chat_response(
                LocalModelProvider::Ollama,
                br#"{"message":{"role":"assistant","content":" Local answer "}}"#,
            )
            .expect("parse Ollama response"),
            "Local answer"
        );

        let (_, compatible) = validate_input(&input(
            LocalModelProvider::OpenAiCompatible,
            "http://localhost:1234/v1",
        ))
        .expect("valid compatible URL");
        assert_eq!(
            chat_endpoint(LocalModelProvider::OpenAiCompatible, &compatible).as_str(),
            "http://localhost:1234/v1/chat/completions"
        );
        assert_eq!(
            parse_chat_response(
                LocalModelProvider::OpenAiCompatible,
                br#"{"choices":[{"message":{"role":"assistant","content":"Compatible answer"}}]}"#,
            )
            .expect("parse compatible response"),
            "Compatible answer"
        );

        let ollama_tool = parse_chat_step(
            LocalModelProvider::Ollama,
            br#"{"message":{"role":"assistant","content":"","tool_calls":[{"type":"function","function":{"name":"load_okf_skill_resource","arguments":{"resource":"instructions"}}}]}}"#,
        )
        .expect("parse Ollama tool call");
        assert_eq!(ollama_tool.tool_calls[0].name, "load_okf_skill_resource");
        assert_eq!(
            ollama_tool.tool_calls[0].arguments["resource"],
            "instructions"
        );

        let compatible_tool = parse_chat_step(
            LocalModelProvider::OpenAiCompatible,
            br#"{"choices":[{"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function","function":{"name":"load_okf_skill_resource","arguments":"{\"resource\":\"commands\"}"}}]}}]}"#,
        )
        .expect("parse compatible tool call");
        assert_eq!(compatible_tool.tool_calls[0].id, "call-1");
        let tool_result = tool_result_message(
            LocalModelProvider::OpenAiCompatible,
            &compatible_tool.tool_calls[0],
            "commands body".to_string(),
        );
        assert_eq!(tool_result["role"], "tool");
        assert_eq!(tool_result["tool_call_id"], "call-1");
    }

    #[test]
    fn runs_a_bounded_ollama_tool_loop() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("server address");
        let server = std::thread::spawn(move || {
            let (mut first, _) = listener.accept().expect("accept first request");
            let first_request = read_http_request(&mut first);
            let first_body = request_json(&first_request);
            assert_eq!(
                first_body["tools"][0]["function"]["name"],
                "load_okf_skill_resource"
            );
            write_json_response(
                &mut first,
                r#"{"message":{"role":"assistant","content":"","tool_calls":[{"type":"function","function":{"name":"load_okf_skill_resource","arguments":{"resource":"instructions"}}}]}}"#,
            );

            let (mut second, _) = listener.accept().expect("accept second request");
            let second_request = read_http_request(&mut second);
            let second_body = request_json(&second_request);
            let tool_result = second_body["messages"]
                .as_array()
                .and_then(|messages| messages.iter().find(|message| message["role"] == "tool"))
                .expect("tool result message");
            assert_eq!(tool_result["tool_name"], "load_okf_skill_resource");
            assert_eq!(tool_result["content"], "canonical resource body");
            write_json_response(
                &mut second,
                r#"{"message":{"role":"assistant","content":"I loaded the requested guidance."}}"#,
            );
        });
        let runtime = LocalModelRuntime {
            profile_id: "local-0123456789abcdef".to_string(),
            profile_name: "Test endpoint".to_string(),
            provider: LocalModelProvider::Ollama,
            base_url: Url::parse(&format!("http://{address}")).expect("base URL"),
            model: "qwen-test".to_string(),
        };
        let tools = [LocalToolDefinition {
            name: "load_okf_skill_resource",
            description: "Load one resource.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {"resource": {"type": "string"}},
                "required": ["resource"],
                "additionalProperties": false
            }),
        }];
        let mut calls = 0;
        let answer = chat_with_tools(
            &runtime,
            &[LocalChatMessage {
                role: "user",
                content: "Load the instructions".to_string(),
            }],
            &tools,
            |call| {
                calls += 1;
                assert_eq!(call.name, "load_okf_skill_resource");
                assert_eq!(call.arguments["resource"], "instructions");
                Ok("canonical resource body".to_string())
            },
        )
        .expect("tool-loop response");
        assert_eq!(answer, "I loaded the requested guidance.");
        assert_eq!(calls, 1);
        server.join().expect("join test server");
    }

    #[test]
    fn sends_a_bounded_ollama_chat_request() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("server address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let request = read_http_request(&mut stream);
            assert!(request.starts_with("POST /api/chat HTTP/1.1"));
            assert!(request.contains(r#""model":"qwen-test""#));
            assert!(request.contains(r#""content":"Hello locally""#));
            let body = r#"{"message":{"role":"assistant","content":"Private response"}}"#;
            write_json_response(&mut stream, body);
        });
        let runtime = LocalModelRuntime {
            profile_id: "local-0123456789abcdef".to_string(),
            profile_name: "Test endpoint".to_string(),
            provider: LocalModelProvider::Ollama,
            base_url: Url::parse(&format!("http://{address}")).expect("base URL"),
            model: "qwen-test".to_string(),
        };
        let answer = chat(
            &runtime,
            &[LocalChatMessage {
                role: "user",
                content: "Hello locally".to_string(),
            }],
        )
        .expect("chat response");
        assert_eq!(answer, "Private response");
        server.join().expect("join test server");
    }
}
