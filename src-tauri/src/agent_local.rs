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
const MAX_MODELS: usize = 256;
const MAX_MODEL_ID_CHARS: usize = 256;

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
}
