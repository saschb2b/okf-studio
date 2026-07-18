//! Rust-owned filesystem grants for bundle operations.
//!
//! Paths arriving from the webview are requests, never authority. A directory
//! becomes a grant only after Rust receives it from the native folder picker or
//! creates it as a remote-bundle cache. Grants are persisted outside the
//! frontend store so recent-entry data cannot manufacture filesystem access.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const GRANT_FILE: &str = "bundle-grants.json";
const MAX_GRANTS: usize = 128;
const MAX_GRANT_FILE_BYTES: u64 = 512 * 1024;
const ACCESS_DENIED: &str =
    "Bundle access is not granted. Open the folder again through OKF Studio.";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BundleGrantKind {
    LocalFolder,
    RemoteCache,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleGrant {
    root: String,
    kind: BundleGrantKind,
}

#[derive(Default)]
struct GrantRegistry {
    grants: Vec<BundleGrant>,
    bundle_roots: Vec<PathBuf>,
}

/// Managed state shared by every application window.
pub struct BundleGrantState {
    file: PathBuf,
    registry: Mutex<GrantRegistry>,
}

impl BundleGrantState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let file = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Studio could not locate its bundle grants: {error}"))?
            .join(GRANT_FILE);
        Ok(Self::load_from(file))
    }

    pub(crate) fn load_from(file: PathBuf) -> Self {
        let grants = read_grants(&file).unwrap_or_else(|error| {
            eprintln!("[bundle-grants] {error}; starting with no grants");
            Vec::new()
        });
        Self {
            file,
            registry: Mutex::new(GrantRegistry {
                grants,
                bundle_roots: Vec::new(),
            }),
        }
    }

    /// Add a directory that Rust obtained from an approved source and return
    /// its canonical UTF-8 path for use by the frontend.
    pub fn grant(&self, root: &Path, kind: BundleGrantKind) -> Result<String, String> {
        let canonical = canonical_directory(root)?;
        let root = canonical
            .to_str()
            .ok_or_else(|| "The selected folder path is not valid UTF-8.".to_string())?
            .to_string();
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(existing) = registry.grants.iter_mut().find(|grant| grant.root == root) {
            existing.kind = kind;
        } else {
            if registry.grants.len() >= MAX_GRANTS {
                return Err(format!(
                    "Studio supports at most {MAX_GRANTS} remembered bundle folders."
                ));
            }
            registry.grants.push(BundleGrant {
                root: root.clone(),
                kind,
            });
        }
        write_grants(&self.file, &registry.grants)?;
        Ok(root)
    }

    /// Authorize the exact folder that Rust previously granted for scanning.
    pub fn authorize_folder(&self, requested: &Path) -> Result<PathBuf, String> {
        let canonical = dunce::canonicalize(requested).map_err(|_| ACCESS_DENIED.to_string())?;
        let registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if registry
            .grants
            .iter()
            .map(|grant| Path::new(&grant.root))
            .any(|root| canonical == root)
        {
            Ok(canonical)
        } else {
            Err(ACCESS_DENIED.to_string())
        }
    }

    /// Report whether one exact persisted scope still exists in the registry
    /// without touching the filesystem. The bundle library uses this to
    /// distinguish a revoked grant from a remembered folder that went missing.
    pub fn remembers_folder(&self, requested: &Path) -> bool {
        let requested = dunce::simplified(requested);
        let registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        registry
            .grants
            .iter()
            .any(|grant| Path::new(&grant.root) == requested)
    }

    pub fn grant_kind(&self, requested: &Path) -> Option<BundleGrantKind> {
        let requested = dunce::simplified(requested);
        let registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        registry
            .grants
            .iter()
            .find(|grant| Path::new(&grant.root) == requested)
            .map(|grant| grant.kind)
    }

    /// Replace the detected bundle roots below one granted scan folder. Only
    /// these exact runtime roots can be parsed, watched, or given to an agent.
    pub fn register_bundle_roots(
        &self,
        folder: &Path,
        roots: impl IntoIterator<Item = PathBuf>,
    ) -> Result<(), String> {
        let folder = self.authorize_folder(folder)?;
        let mut canonical_roots = Vec::new();
        for root in roots {
            let canonical = dunce::canonicalize(&root)
                .map_err(|_| "A detected bundle root is no longer available.".to_string())?;
            if !canonical.is_dir() || !canonical.starts_with(&folder) {
                return Err("A detected bundle root escaped its granted folder.".to_string());
            }
            if !canonical_roots.contains(&canonical) {
                canonical_roots.push(canonical);
            }
        }
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        registry
            .bundle_roots
            .retain(|root| !root.starts_with(&folder));
        registry.bundle_roots.extend(canonical_roots);
        Ok(())
    }

    pub fn authorize_bundle(&self, requested: &Path) -> Result<PathBuf, String> {
        let canonical = dunce::canonicalize(requested).map_err(|_| ACCESS_DENIED.to_string())?;
        let registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if registry.bundle_roots.contains(&canonical) {
            Ok(canonical)
        } else {
            Err(ACCESS_DENIED.to_string())
        }
    }

    /// Revoke one exact remembered scope. Descendant request paths cannot
    /// revoke their parent grant.
    pub fn revoke(&self, root: &str) -> Result<bool, String> {
        let requested_root = dunce::simplified(Path::new(root));
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let before = registry.grants.len();
        registry
            .grants
            .retain(|grant| Path::new(&grant.root) != requested_root);
        if registry.grants.len() == before {
            return Ok(false);
        }
        let remaining_scopes = registry
            .grants
            .iter()
            .map(|grant| PathBuf::from(&grant.root))
            .collect::<Vec<_>>();
        registry.bundle_roots.retain(|bundle_root| {
            remaining_scopes
                .iter()
                .any(|scope| bundle_root.starts_with(scope))
        });
        write_grants(&self.file, &registry.grants)?;
        Ok(true)
    }
}

fn canonical_directory(root: &Path) -> Result<PathBuf, String> {
    let canonical = dunce::canonicalize(root)
        .map_err(|_| "The selected bundle folder is no longer available.".to_string())?;
    if !canonical.is_dir() {
        return Err("The selected bundle location is not a folder.".to_string());
    }
    Ok(canonical)
}

fn read_grants(file: &Path) -> Result<Vec<BundleGrant>, String> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    let size = fs::metadata(file)
        .map_err(|error| format!("could not inspect the grant file: {error}"))?
        .len();
    if size > MAX_GRANT_FILE_BYTES {
        return Err("the grant file exceeds the 512 KB limit".to_string());
    }
    let bytes =
        fs::read(file).map_err(|error| format!("could not read the grant file: {error}"))?;
    let grants: Vec<BundleGrant> = serde_json::from_slice(&bytes)
        .map_err(|error| format!("could not parse the grant file: {error}"))?;
    if grants.len() > MAX_GRANTS {
        return Err("the grant file contains too many entries".to_string());
    }
    let mut accepted = Vec::with_capacity(grants.len());
    for grant in grants {
        let root = dunce::simplified(Path::new(&grant.root));
        let normalized_root = root
            .to_str()
            .ok_or_else(|| "the grant file contains an invalid path".to_string())?
            .to_string();
        if !root.is_absolute()
            || grant.root.len() > 32 * 1024
            || accepted
                .iter()
                .any(|existing: &BundleGrant| existing.root == normalized_root)
        {
            return Err("the grant file contains an invalid entry".to_string());
        }
        accepted.push(BundleGrant {
            root: normalized_root,
            kind: grant.kind,
        });
    }
    Ok(accepted)
}

fn write_grants(file: &Path, grants: &[BundleGrant]) -> Result<(), String> {
    let parent = file
        .parent()
        .ok_or_else(|| "Studio's bundle grant file has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Studio could not create its bundle grant directory: {error}"))?;
    let bytes = serde_json::to_vec_pretty(grants)
        .map_err(|error| format!("Studio could not encode its bundle grants: {error}"))?;
    fs::write(file, bytes)
        .map_err(|error| format!("Studio could not save its bundle grants: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{BundleGrantKind, BundleGrantState};
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> (PathBuf, BundleGrantState) {
        let base =
            std::env::temp_dir().join(format!("okf-studio-grants-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&base).expect("create fixture");
        let state = BundleGrantState::load_from(base.join("state").join("grants.json"));
        (base, state)
    }

    #[test]
    fn rejects_forged_paths_outside_a_granted_folder() {
        let (base, state) = fixture("forged");
        let granted = base.join("granted");
        let nested = granted.join("bundle");
        let outside = base.join("outside");
        fs::create_dir_all(&nested).expect("create granted bundle");
        fs::create_dir_all(&outside).expect("create outside folder");

        state
            .grant(&granted, BundleGrantKind::LocalFolder)
            .expect("grant folder");
        assert!(state.authorize_folder(&nested).is_err());
        assert!(state
            .register_bundle_roots(&granted, [outside.clone()])
            .is_err());
        state
            .register_bundle_roots(&granted, [nested.clone()])
            .expect("register detected root");
        assert_eq!(
            state.authorize_bundle(&nested).expect("authorize bundle"),
            dunce::canonicalize(&nested).expect("canonical nested")
        );
        assert_eq!(
            state
                .authorize_bundle(&outside)
                .expect_err("deny forged path"),
            "Bundle access is not granted. Open the folder again through OKF Studio."
        );

        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[test]
    fn persists_remote_grants_for_recent_reopen() {
        let (base, state) = fixture("persist");
        let remote = base.join("remote-cache");
        fs::create_dir_all(&remote).expect("create remote cache");
        state
            .grant(&remote, BundleGrantKind::RemoteCache)
            .expect("grant remote cache");

        let restored = BundleGrantState::load_from(base.join("state").join("grants.json"));
        assert_eq!(
            restored.authorize_folder(&remote).expect("restore grant"),
            dunce::canonicalize(&remote).expect("canonical remote")
        );

        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[test]
    fn shares_one_live_registry_across_window_callers() {
        let (base, state) = fixture("windows");
        let root = base.join("bundle");
        fs::create_dir_all(&root).expect("create bundle");
        let shared = std::sync::Arc::new(state);
        let main_window = shared.clone();
        let popout_window = shared.clone();

        main_window
            .grant(&root, BundleGrantKind::LocalFolder)
            .expect("grant from main window");
        popout_window
            .register_bundle_roots(&root, [root.clone()])
            .expect("register root from pop-out scan");
        assert!(popout_window.authorize_bundle(&root).is_ok());

        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[cfg(windows)]
    #[test]
    fn keeps_granted_bundle_roots_in_protocol_safe_windows_form() {
        let (base, state) = fixture("protocol-path");
        let root = base.join("bundle");
        fs::create_dir_all(&root).expect("create bundle");

        let granted = state
            .grant(&root, BundleGrantKind::LocalFolder)
            .expect("grant folder");
        state
            .register_bundle_roots(&root, [root.clone()])
            .expect("register bundle root");
        let authorized = state.authorize_bundle(&root).expect("authorize bundle");

        assert!(!granted.starts_with(r"\\?\"));
        assert!(!authorized.to_string_lossy().starts_with(r"\\?\"));
        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[cfg(windows)]
    #[test]
    fn accepts_a_persisted_windows_grant_with_a_legacy_verbatim_prefix() {
        let (base, _) = fixture("legacy-protocol-path");
        let root = base.join("bundle");
        let grant_file = base.join("state").join("grants.json");
        fs::create_dir_all(&root).expect("create bundle");
        fs::create_dir_all(grant_file.parent().expect("grant file parent"))
            .expect("create grant state directory");
        let legacy_root = root
            .canonicalize()
            .expect("legacy canonical root")
            .to_string_lossy()
            .into_owned();
        let grants = vec![super::BundleGrant {
            root: legacy_root.clone(),
            kind: BundleGrantKind::LocalFolder,
        }];
        fs::write(
            &grant_file,
            serde_json::to_vec(&grants).expect("encode legacy grant"),
        )
        .expect("write legacy grant");

        let restored = BundleGrantState::load_from(grant_file);

        assert_eq!(
            restored
                .authorize_folder(&root)
                .expect("authorize legacy grant"),
            dunce::canonicalize(&root).expect("canonical root")
        );
        assert!(restored.revoke(&legacy_root).expect("revoke legacy grant"));
        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[test]
    fn stale_or_revoked_grants_fail_closed() {
        let (base, state) = fixture("revoke");
        let root = base.join("bundle");
        fs::create_dir_all(&root).expect("create bundle");
        let granted = state
            .grant(&root, BundleGrantKind::LocalFolder)
            .expect("grant folder");
        fs::remove_dir_all(&root).expect("evict folder");
        assert!(state.authorize_folder(&root).is_err());

        fs::create_dir_all(&root).expect("restore folder");
        assert!(state.revoke(&granted).expect("revoke grant"));
        assert!(state.authorize_folder(&root).is_err());
        assert!(!state.revoke(&granted).expect("repeat revoke"));

        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_that_moves_outside_the_granted_folder() {
        use std::os::unix::fs::symlink;

        let (base, state) = fixture("symlink");
        let granted = base.join("granted");
        let outside = base.join("outside");
        fs::create_dir_all(&granted).expect("create granted folder");
        fs::create_dir_all(&outside).expect("create outside folder");
        symlink(&outside, granted.join("escape")).expect("create symlink");
        state
            .grant(&granted, BundleGrantKind::LocalFolder)
            .expect("grant folder");

        assert!(state.authorize_folder(&granted.join("escape")).is_err());

        fs::remove_dir_all(base).expect("remove fixture");
    }

    #[cfg(windows)]
    #[test]
    fn rejects_a_directory_link_that_moves_outside_the_granted_folder() {
        use std::os::windows::fs::symlink_dir;

        let (base, state) = fixture("symlink");
        let granted = base.join("granted");
        let outside = base.join("outside");
        fs::create_dir_all(&granted).expect("create granted folder");
        fs::create_dir_all(&outside).expect("create outside folder");
        if symlink_dir(&outside, granted.join("escape")).is_err() {
            fs::remove_dir_all(base).expect("remove fixture");
            return;
        }
        state
            .grant(&granted, BundleGrantKind::LocalFolder)
            .expect("grant folder");

        assert!(state.authorize_folder(&granted.join("escape")).is_err());

        fs::remove_dir_all(base).expect("remove fixture");
    }
}
