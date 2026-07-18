//! One-shot launch grants for the bundled, read-only OKF MCP server.
//!
//! An MCP descriptor receives an opaque grant file and nonce, never a bundle
//! path. The helper atomically consumes that record before it opens the bundle,
//! so replayed or hand-written `--okf-mcp` shell arguments carry no authority.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const GRANT_VERSION: u8 = 1;
const GRANT_LIFETIME_MS: u64 = 60_000;
const MAX_GRANT_BYTES: u64 = 16 * 1024;
const GRANT_DIRECTORY: &str = "okf-studio-mcp-grants";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GrantRecord {
    version: u8,
    token: String,
    bundle_root: String,
    expires_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpLaunchGrant {
    pub command: String,
    pub args: Vec<String>,
    pub expires_at: u64,
}

pub fn create(bundle_root: &Path) -> Result<McpLaunchGrant, String> {
    let canonical = dunce::canonicalize(bundle_root)
        .map_err(|_| "OKF Studio MCP requires an available bundle root.".to_string())?;
    if !canonical.is_dir() {
        return Err("OKF Studio MCP requires a bundle directory.".to_string());
    }
    let root = canonical
        .to_str()
        .ok_or_else(|| "OKF Studio MCP requires a Unicode bundle path.".to_string())?;
    let directory = grant_directory();
    create_private_directory(&directory)?;
    remove_expired_records(&directory);

    let token = uuid::Uuid::new_v4().simple().to_string();
    let expires_at = current_time_ms().saturating_add(GRANT_LIFETIME_MS);
    let file = directory.join(format!("grant-{token}.json"));
    let record = GrantRecord {
        version: GRANT_VERSION,
        token: token.clone(),
        bundle_root: root.to_string(),
        expires_at,
    };
    let body = serde_json::to_vec(&record)
        .map_err(|error| format!("Could not encode the OKF MCP grant: {error}"))?;
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut output = options
        .open(&file)
        .map_err(|error| format!("Could not create the OKF MCP grant: {error}"))?;
    output
        .write_all(&body)
        .and_then(|_| output.sync_all())
        .map_err(|error| format!("Could not save the OKF MCP grant: {error}"))?;

    let executable = std::env::current_exe()
        .map_err(|_| "OKF Studio could not locate its MCP executable.".to_string())?;
    Ok(McpLaunchGrant {
        command: executable.to_string_lossy().into_owned(),
        args: vec![
            "--okf-mcp-grant".to_string(),
            file.to_string_lossy().into_owned(),
            token,
        ],
        expires_at,
    })
}

pub fn consume(file: &Path, token: &str) -> Result<PathBuf, String> {
    if token.len() != 32 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("The OKF MCP grant is invalid.".to_string());
    }
    let expected_directory = grant_directory();
    create_private_directory(&expected_directory)?;
    let expected_directory = dunce::canonicalize(&expected_directory)
        .map_err(|_| "The OKF MCP grant directory is unavailable.".to_string())?;
    let parent = file
        .parent()
        .and_then(|parent| dunce::canonicalize(parent).ok())
        .ok_or_else(|| "The OKF MCP grant path is invalid.".to_string())?;
    let expected_name = format!("grant-{token}.json");
    if parent != expected_directory
        || file.file_name().and_then(|name| name.to_str()) != Some(&expected_name)
    {
        return Err("The OKF MCP grant path is outside Studio's grant directory.".to_string());
    }

    let consuming = expected_directory.join(format!("grant-{token}.consuming"));
    fs::rename(file, &consuming)
        .map_err(|_| "The OKF MCP grant is missing, expired, or already used.".to_string())?;
    let result = read_consumed_record(&consuming, token);
    let _ = fs::remove_file(&consuming);
    result
}

fn read_consumed_record(file: &Path, token: &str) -> Result<PathBuf, String> {
    let metadata =
        fs::metadata(file).map_err(|_| "The OKF MCP grant is unavailable.".to_string())?;
    if metadata.len() > MAX_GRANT_BYTES {
        return Err("The OKF MCP grant is too large.".to_string());
    }
    let body = fs::read(file).map_err(|_| "The OKF MCP grant could not be read.".to_string())?;
    let record: GrantRecord =
        serde_json::from_slice(&body).map_err(|_| "The OKF MCP grant is malformed.".to_string())?;
    if record.version != GRANT_VERSION || record.token != token {
        return Err("The OKF MCP grant does not match this launch.".to_string());
    }
    if record.expires_at < current_time_ms() {
        return Err("The OKF MCP grant has expired.".to_string());
    }
    let root = PathBuf::from(record.bundle_root);
    if !root.is_absolute() {
        return Err("The OKF MCP grant has an invalid bundle root.".to_string());
    }
    let canonical = dunce::canonicalize(root)
        .map_err(|_| "The granted OKF bundle is unavailable.".to_string())?;
    if !canonical.is_dir() {
        return Err("The granted OKF bundle is not a directory.".to_string());
    }
    Ok(canonical)
}

fn grant_directory() -> PathBuf {
    std::env::temp_dir().join(GRANT_DIRECTORY)
}

fn create_private_directory(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not prepare OKF MCP grants: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not protect OKF MCP grants: {error}"))?;
    }
    Ok(())
}

fn remove_expired_records(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten().take(256) {
        let path = entry.path();
        let old = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|age| age.as_millis() > u128::from(GRANT_LIFETIME_MS));
        if old || path.extension().and_then(|value| value.to_str()) == Some("consuming") {
            let _ = fs::remove_file(path);
        }
    }
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{consume, create, GrantRecord};

    #[test]
    fn grant_is_exact_and_one_shot() {
        let root =
            std::env::temp_dir().join(format!("okf-mcp-grant-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create fixture");
        let grant = create(&root).expect("create grant");
        let file = std::path::PathBuf::from(&grant.args[1]);
        let token = &grant.args[2];
        assert_eq!(
            consume(&file, token).expect("consume"),
            dunce::canonicalize(&root).expect("canonical")
        );
        assert!(consume(&file, token).is_err(), "a grant must not replay");
        std::fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn hostile_paths_and_tokens_are_rejected() {
        let outside = std::env::temp_dir().join("forged-okf-mcp-grant.json");
        assert!(consume(&outside, "not-a-token").is_err());
        assert!(consume(&outside, &"a".repeat(32)).is_err());
    }

    #[test]
    fn expired_grant_is_consumed_without_opening_the_bundle() {
        let root =
            std::env::temp_dir().join(format!("okf-mcp-expired-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create fixture");
        let grant = create(&root).expect("create grant");
        let file = std::path::PathBuf::from(&grant.args[1]);
        let token = &grant.args[2];
        let mut record: GrantRecord =
            serde_json::from_slice(&std::fs::read(&file).expect("read grant"))
                .expect("decode grant");
        record.expires_at = 0;
        std::fs::write(&file, serde_json::to_vec(&record).expect("encode grant"))
            .expect("expire grant");
        assert!(consume(&file, token).is_err());
        assert!(
            !file.exists(),
            "an expired record must not remain replayable"
        );
        std::fs::remove_dir_all(root).expect("remove fixture");
    }
}
