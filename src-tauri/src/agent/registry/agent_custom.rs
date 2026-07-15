use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "custom-agents.json";
const MAX_ARGUMENTS: usize = 128;
const MAX_ENVIRONMENT_NAMES: usize = 64;
const MAX_PROFILES: usize = 64;
const MAX_SETTINGS_BYTES: u64 = 512 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgentInput {
    name: String,
    executable: String,
    #[serde(default)]
    arguments: Vec<String>,
    #[serde(default)]
    environment: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgentProfile {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) executable: String,
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<String>,
}

pub fn list(app: &AppHandle) -> Result<Vec<CustomAgentProfile>, String> {
    read_profiles(&profile_file(app)?)
}

pub fn save(app: &AppHandle, input: CustomAgentInput) -> Result<CustomAgentProfile, String> {
    save_in(&profile_file(app)?, input)
}

pub fn remove(app: &AppHandle, profile_id: &str) -> Result<bool, String> {
    remove_in(&profile_file(app)?, profile_id)
}

pub fn find(app: &AppHandle, profile_id: &str) -> Result<CustomAgentProfile, String> {
    validate_id(profile_id)?;
    list(app)?
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Custom agent profile was not found.".to_string())
}

fn profile_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("agents").join(FILE_NAME))
        .map_err(|error| format!("Studio could not locate its agent settings: {error}"))
}

fn save_in(file: &Path, input: CustomAgentInput) -> Result<CustomAgentProfile, String> {
    validate(&input)?;
    let mut profiles = read_profiles(file)?;
    if profiles.len() >= MAX_PROFILES {
        return Err("Studio supports up to 64 custom agent profiles.".to_string());
    }
    let profile = CustomAgentProfile {
        id: profile_id(&input),
        name: input.name.trim().to_string(),
        executable: input.executable,
        arguments: input.arguments,
        environment: deduplicate(input.environment),
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

fn read_profiles(file: &Path) -> Result<Vec<CustomAgentProfile>, String> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    let size = fs::metadata(file)
        .map_err(|error| format!("Studio could not inspect custom agents: {error}"))?
        .len();
    if size > MAX_SETTINGS_BYTES {
        return Err("Custom agent settings exceed the 512 KB limit.".to_string());
    }
    let bytes =
        fs::read(file).map_err(|error| format!("Studio could not read custom agents: {error}"))?;
    let profiles: Vec<CustomAgentProfile> = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Studio could not parse custom agents: {error}"))?;
    if profiles.len() > MAX_PROFILES {
        return Err("Custom agent settings contain too many profiles.".to_string());
    }
    let mut ids = HashSet::new();
    for profile in &profiles {
        validate_id(&profile.id)?;
        if !ids.insert(profile.id.as_str()) {
            return Err("Custom agent settings contain duplicate IDs.".to_string());
        }
        validate(&CustomAgentInput {
            name: profile.name.clone(),
            executable: profile.executable.clone(),
            arguments: profile.arguments.clone(),
            environment: profile.environment.clone(),
        })?;
    }
    Ok(profiles)
}

fn write_profiles(file: &Path, profiles: &[CustomAgentProfile]) -> Result<(), String> {
    let parent = file
        .parent()
        .ok_or_else(|| "Custom agent settings have no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Studio could not create agent settings: {error}"))?;
    let bytes = serde_json::to_vec_pretty(profiles)
        .map_err(|error| format!("Studio could not encode custom agents: {error}"))?;
    fs::write(file, bytes).map_err(|error| format!("Studio could not save custom agents: {error}"))
}

fn validate(input: &CustomAgentInput) -> Result<(), String> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err("Name must contain 1 to 80 characters.".to_string());
    }
    if input.executable.is_empty() || input.executable.len() > 4096 {
        return Err("Executable must contain 1 to 4096 characters.".to_string());
    }
    if !Path::new(&input.executable).is_absolute() {
        return Err("Executable must be an absolute path.".to_string());
    }
    if input.arguments.len() > MAX_ARGUMENTS
        || input.arguments.iter().any(|argument| argument.len() > 4096)
    {
        return Err("Arguments exceed the supported count or length.".to_string());
    }
    if input.environment.len() > MAX_ENVIRONMENT_NAMES
        || input
            .environment
            .iter()
            .any(|name| !valid_environment_name(name))
    {
        return Err("Environment entries must be variable names without values.".to_string());
    }
    Ok(())
}

fn valid_environment_name(name: &str) -> bool {
    let mut characters = name.chars();
    matches!(characters.next(), Some('_' | 'A'..='Z' | 'a'..='z'))
        && characters.all(|character| matches!(character, '_' | 'A'..='Z' | 'a'..='z' | '0'..='9'))
}

fn deduplicate(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn profile_id(input: &CustomAgentInput) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut digest = Sha256::new();
    digest.update(input.name.as_bytes());
    digest.update(input.executable.as_bytes());
    digest.update(timestamp.to_le_bytes());
    let encoded = format!("{:x}", digest.finalize());
    format!("custom-{}", &encoded[..16])
}

fn validate_id(profile_id: &str) -> Result<(), String> {
    if profile_id.starts_with("custom-")
        && profile_id.len() == 23
        && profile_id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
    {
        Ok(())
    } else {
        Err("Custom agent ID is invalid.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(label: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!(
                "okf-studio-custom-agent-{label}-{}",
                std::process::id()
            ))
            .join(FILE_NAME)
    }

    fn valid_input() -> CustomAgentInput {
        CustomAgentInput {
            name: "Local ACP".to_string(),
            executable: if cfg!(windows) {
                r"C:\tools\agent.exe".to_string()
            } else {
                "/opt/tools/agent".to_string()
            },
            arguments: vec!["--stdio".to_string()],
            environment: vec!["MODEL_PATH".to_string(), "MODEL_PATH".to_string()],
        }
    }

    #[test]
    fn saves_lists_and_removes_profiles_without_environment_values() {
        let file = temp_file("roundtrip");
        let _ = fs::remove_dir_all(file.parent().expect("parent"));
        let saved = save_in(&file, valid_input()).expect("profile should save");
        assert_eq!(saved.environment, vec!["MODEL_PATH"]);
        assert_eq!(read_profiles(&file).expect("profiles should load").len(), 1);
        assert!(remove_in(&file, &saved.id).expect("profile should remove"));
        assert!(read_profiles(&file)
            .expect("profiles should load")
            .is_empty());
        let _ = fs::remove_dir_all(file.parent().expect("parent"));
    }

    #[test]
    fn rejects_shell_strings_relative_paths_and_environment_values() {
        let mut input = valid_input();
        input.executable = "agent --stdio".to_string();
        assert!(validate(&input).is_err());

        let mut input = valid_input();
        input.environment = vec!["TOKEN=secret".to_string()];
        assert!(validate(&input).is_err());
    }

    #[test]
    fn revalidates_profiles_read_from_app_data() {
        let file = temp_file("tampered");
        let parent = file.parent().expect("parent");
        let _ = fs::remove_dir_all(parent);
        fs::create_dir_all(parent).expect("directory should exist");
        fs::write(
            &file,
            r#"[{"id":"custom-0123456789abcdef","name":"Unsafe","executable":"agent --stdio","arguments":[],"environment":["TOKEN=secret"]}]"#,
        )
        .expect("fixture should write");
        assert!(read_profiles(&file).is_err());
        let _ = fs::remove_dir_all(parent);
    }
}
