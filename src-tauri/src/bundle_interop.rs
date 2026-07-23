use okf_core::interop::SemanticImportPreview;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_SEMANTIC_BYTES: u64 = 2 * 1024 * 1024;

pub async fn export_semantic_web(app: &AppHandle, root: PathBuf) -> Result<Option<String>, String> {
    let bundle = okf_core::read_bundle(&root);
    let payload = okf_core::interop::semantic_web_export(&root, &bundle)?;
    let suggested_name = format!("{}-relationships.jsonld", safe_name(&bundle.name));
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON-LD", &["jsonld", "json"])
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });
    let Some(selected) = receiver
        .await
        .map_err(|_| "The JSON-LD save dialog closed unexpectedly.".to_string())?
    else {
        return Ok(None);
    };
    let mut destination = selected
        .into_path()
        .map_err(|_| "The selected JSON-LD path is not available.".to_string())?;
    if destination.extension().is_none() {
        destination.set_extension("jsonld");
    }
    refuse_bundle_destination(&root, &destination)?;
    let name = returned_name(&destination)?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::write(destination, payload)
            .map_err(|_| "Studio could not save the JSON-LD exchange.".to_string())
    })
    .await
    .map_err(|_| "The JSON-LD export task stopped unexpectedly.".to_string())??;
    Ok(Some(name))
}

pub async fn import_semantic_web(app: &AppHandle) -> Result<Option<SemanticImportPreview>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON-LD", &["jsonld", "json"])
        .pick_file(move |selected| {
            let _ = sender.send(selected);
        });
    let Some(selected) = receiver
        .await
        .map_err(|_| "The JSON-LD picker closed unexpectedly.".to_string())?
    else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "The selected JSON-LD file is not available.".to_string())?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let metadata = path
            .metadata()
            .map_err(|_| "Studio could not inspect the JSON-LD file.".to_string())?;
        if !metadata.is_file() || metadata.len() > MAX_SEMANTIC_BYTES {
            return Err("Choose a JSON-LD file no larger than 2 MiB.".to_string());
        }
        fs::read(path).map_err(|_| "Studio could not read the JSON-LD file.".to_string())
    })
    .await
    .map_err(|_| "The JSON-LD import task stopped unexpectedly.".to_string())??;
    okf_core::interop::semantic_web_import(&bytes).map(Some)
}

pub async fn export_sidecar(
    app: &AppHandle,
    root: PathBuf,
    concept_id: String,
    relative_path: String,
) -> Result<Option<String>, String> {
    let bundle = okf_core::read_bundle(&root);
    let source = okf_core::interop::declared_sidecar(&root, &bundle, &concept_id, &relative_path)?;
    let suggested_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The sidecar filename is not valid Unicode.".to_string())?
        .to_string();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });
    let Some(selected) = receiver
        .await
        .map_err(|_| "The sidecar save dialog closed unexpectedly.".to_string())?
    else {
        return Ok(None);
    };
    let destination = selected
        .into_path()
        .map_err(|_| "The selected sidecar destination is not available.".to_string())?;
    refuse_bundle_destination(&root, &destination)?;
    let name = returned_name(&destination)?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::copy(source, destination)
            .map(|_| ())
            .map_err(|_| "Studio could not export the sidecar.".to_string())
    })
    .await
    .map_err(|_| "The sidecar export task stopped unexpectedly.".to_string())??;
    Ok(Some(name))
}

fn refuse_bundle_destination(root: &Path, destination: &Path) -> Result<(), String> {
    let root = dunce::canonicalize(root)
        .map_err(|_| "The active bundle is no longer available.".to_string())?;
    let parent = destination
        .parent()
        .ok_or_else(|| "The selected destination has no parent.".to_string())?;
    let parent = dunce::canonicalize(parent)
        .map_err(|_| "The selected destination parent is not available.".to_string())?;
    if parent.starts_with(root) {
        return Err("Choose an export destination outside the open bundle.".to_string());
    }
    Ok(())
}

fn returned_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| "The selected filename is not valid Unicode.".to_string())
}

fn safe_name(value: &str) -> String {
    let name = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let name = name
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if name.is_empty() {
        "okf-bundle".to_string()
    } else {
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRoot(PathBuf);

    impl TempRoot {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("okf-interop-destination-{nonce}"));
            fs::create_dir_all(path.join("bundle/exports")).expect("fixture");
            fs::create_dir_all(path.join("outside")).expect("fixture");
            Self(path)
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn exports_refuse_destinations_inside_the_open_bundle() {
        let fixture = TempRoot::new();
        let root = fixture.0.join("bundle");

        assert!(
            refuse_bundle_destination(&root, &root.join("exports/relationships.jsonld")).is_err()
        );
        assert!(
            refuse_bundle_destination(&root, &fixture.0.join("outside/relationships.jsonld"))
                .is_ok()
        );
    }

    #[test]
    fn suggested_names_are_portable_and_never_empty() {
        assert_eq!(safe_name("My OKF / Bundle"), "my-okf-bundle");
        assert_eq!(safe_name("///"), "okf-bundle");
    }
}
