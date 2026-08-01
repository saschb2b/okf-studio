//! Reaching a folder on Android, where there is no folder picker to reach it with.
//!
//! Studio's whole core is path-based: it scans a directory, reads Markdown from
//! it, stages writes against it. Android's own answer to "let the user choose a
//! folder" is the Storage Access Framework, which hands back a `content://` URI
//! that `std::fs` cannot open. Adopting it would mean rewriting every read and
//! write in the app against a URI abstraction, and would still leave `git` and
//! the OKF core unable to see the files.
//!
//! So the app asks for `MANAGE_EXTERNAL_STORAGE` instead. With it, shared
//! storage is an ordinary readable and writable path tree and everything
//! downstream works unchanged. The cost is honest and worth stating: it is a
//! broad permission, the user grants it by hand on a system screen, and Google
//! Play would require a declared justification for it. This build is sideloaded.
//!
//! What is here: which platform needs the in-app folder browser, where that
//! browser starts, and the directory listing it walks. Whether the permission
//! has been granted, and the screen that grants it, both need the activity, so
//! they live in `MainActivity.kt` and reach the webview as `OkfStorageAccess`.

use std::path::{Path, PathBuf};

/// One directory as the folder browser sees it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    /// Whether the row can be entered. An unreadable directory still lists, so
    /// the browser can show it as refused rather than silently omitting it.
    pub readable: bool,
}

/// A directory and its children, for one screen of the folder browser.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    pub path: String,
    /// `None` at the top of the tree, so the browser can hide "up".
    pub parent: Option<String>,
    pub entries: Vec<FolderEntry>,
}

/// Whether the platform needs the in-app browser, and whether it may read yet.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageAccess {
    /// True only on Android. Desktop keeps its native folder dialog.
    ///
    /// Whether the grant *exists* is a separate question, answered by the
    /// `OkfStorageAccess` bridge in MainActivity.kt: it needs the activity, and
    /// Tauri hands the Rust side none.
    pub needs_grant: bool,
    /// Where the browser opens: shared storage on Android, the home directory
    /// elsewhere.
    pub start_path: String,
}

/// The root of shared storage on every Android device since KitKat. The
/// `/sdcard` symlink points here and `Environment.getExternalStorageDirectory()`
/// resolves to it, so hard-coding it avoids a JNI call for a constant.
#[cfg(target_os = "android")]
const SHARED_STORAGE: &str = "/storage/emulated/0";

#[cfg(target_os = "android")]
pub fn access_state() -> StorageAccess {
    StorageAccess {
        needs_grant: true,
        start_path: SHARED_STORAGE.to_string(),
    }
}

#[cfg(not(target_os = "android"))]
pub fn access_state() -> StorageAccess {
    StorageAccess {
        needs_grant: false,
        start_path: std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| "/".to_string()),
    }
}

/// List the directories inside `path`, for one screen of the folder browser.
///
/// Directories only: the browser exists to choose a folder, and a bundle's
/// files are not what the user is picking between. Hidden directories are kept,
/// because a bundle can live under one and leaving it out looks like the folder
/// is missing.
pub fn list_folders(path: &Path) -> Result<FolderListing, String> {
    let canonical =
        dunce::canonicalize(path).map_err(|_| "That folder is no longer available.".to_string())?;
    let entries = std::fs::read_dir(&canonical).map_err(|error| match error.kind() {
        std::io::ErrorKind::PermissionDenied => "Studio has no access to this folder.".to_string(),
        _ => "That folder could not be read.".to_string(),
    })?;

    let mut folders: Vec<FolderEntry> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let path = entry.path();
            Some(FolderEntry {
                name: entry.file_name().to_str()?.to_string(),
                readable: std::fs::read_dir(&path).is_ok(),
                path: path.to_str()?.to_string(),
            })
        })
        .collect();
    // Case-insensitive, so a folder tree does not read as two alphabets.
    folders.sort_by_key(|entry| entry.name.to_lowercase());

    Ok(FolderListing {
        parent: parent_of(&canonical),
        path: canonical
            .to_str()
            .ok_or_else(|| "That folder's path is not valid UTF-8.".to_string())?
            .to_string(),
        entries: folders,
    })
}

/// The folder above this one, or `None` at the top of what the app may browse.
///
/// On Android the top is shared storage rather than the filesystem root: above
/// it lies an unreadable tree of system mounts, and walking into it only offers
/// the user rows that refuse.
fn parent_of(path: &Path) -> Option<String> {
    #[cfg(target_os = "android")]
    if path == Path::new(SHARED_STORAGE) {
        return None;
    }
    let parent: PathBuf = path.parent()?.to_path_buf();
    Some(parent.to_str()?.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_directories_and_skips_files() {
        let temp = std::env::temp_dir().join("okf-folder-listing");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(temp.join("beta")).unwrap();
        std::fs::create_dir_all(temp.join("Alpha")).unwrap();
        std::fs::write(temp.join("notes.md"), "x").unwrap();

        let listing = list_folders(&temp).unwrap();
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(
            names,
            vec!["Alpha", "beta"],
            "sorted, case-insensitive, no files"
        );
        assert!(listing.parent.is_some());
        std::fs::remove_dir_all(&temp).unwrap();
    }

    #[test]
    fn refuses_a_path_that_is_gone() {
        let missing = std::env::temp_dir().join("okf-folder-listing-missing");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(list_folders(&missing).is_err());
    }
}
