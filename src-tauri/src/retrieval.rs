//! Authorized persistence and command helpers for provider-neutral retrieval.

use okf_core::retrieval::{diff_receipts, ReceiptDiff, RetrievalManifest, RetrievalReceipt};
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const RETRIEVAL_CACHE_FOLDER: &str = "retrieval-v1";
const MAX_DIAGNOSTIC_BYTES: usize = 2 * 1024 * 1024;

pub fn diff(left: &RetrievalReceipt, right: &RetrievalReceipt) -> ReceiptDiff {
    diff_receipts(left, right)
}

pub fn persist_authorized_manifest(
    app: &AppHandle,
    manifest: &RetrievalManifest,
) -> Result<(), String> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Studio could not resolve its retrieval cache folder.".to_string())?
        .join(RETRIEVAL_CACHE_FOLDER)
        .join(safe_identity(&manifest.bundle_id))
        .join(safe_identity(&manifest.bundle_fingerprint));
    fs::create_dir_all(&cache_root)
        .map_err(|_| "Studio could not create the retrieval cache folder.".to_string())?;
    write_json_once(&cache_root.join("manifest.json"), manifest)?;
    write_jsonl_once(&cache_root.join("units.jsonl"), manifest)?;
    Ok(())
}

pub async fn export_diagnostics(
    app: &AppHandle,
    suggested_name: String,
    payload: String,
) -> Result<Option<String>, String> {
    validate_diagnostic_export(&suggested_name, &payload)?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });
    let Some(selected) = receiver
        .await
        .map_err(|_| "The diagnostic save dialog closed unexpectedly.".to_string())?
    else {
        return Ok(None);
    };
    let mut path = selected.into_path().map_err(|_| {
        "The selected diagnostic path is not available on this platform.".to_string()
    })?;
    ensure_json_extension(&mut path);
    let returned_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The selected diagnostic filename is not valid Unicode.".to_string())?
        .to_string();
    tauri::async_runtime::spawn_blocking(move || {
        fs::write(path, payload)
            .map_err(|_| "Studio could not save the retrieval diagnostic.".to_string())
    })
    .await
    .map_err(|error| format!("The diagnostic export task failed: {error}"))??;
    Ok(Some(returned_name))
}

fn validate_diagnostic_export(suggested_name: &str, payload: &str) -> Result<(), String> {
    if suggested_name.is_empty()
        || suggested_name.chars().count() > 128
        || !suggested_name.ends_with(".json")
        || !suggested_name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.')
        })
    {
        return Err("The suggested diagnostic filename must be a JSON basename.".to_string());
    }
    if payload.is_empty() || payload.len() > MAX_DIAGNOSTIC_BYTES || payload.contains('\0') {
        return Err("The retrieval diagnostic is empty or exceeds the 2 MiB limit.".to_string());
    }
    serde_json::from_str::<serde_json::Value>(payload)
        .map_err(|_| "The retrieval diagnostic must be valid JSON.".to_string())?;
    Ok(())
}

fn ensure_json_extension(path: &mut PathBuf) {
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        path.set_extension("json");
    }
}

fn write_json_once(path: &Path, manifest: &RetrievalManifest) -> Result<(), String> {
    let Some(mut file) = create_once(path)? else {
        return Ok(());
    };
    serde_json::to_writer(&mut file, manifest)
        .map_err(|_| "Studio could not serialize the retrieval manifest.".to_string())?;
    file.flush()
        .map_err(|_| "Studio could not publish the retrieval manifest.".to_string())
}

fn write_jsonl_once(path: &Path, manifest: &RetrievalManifest) -> Result<(), String> {
    let Some(file) = create_once(path)? else {
        return Ok(());
    };
    let mut writer = BufWriter::new(file);
    for unit in &manifest.units {
        serde_json::to_writer(&mut writer, unit)
            .map_err(|_| "Studio could not serialize a retrieval unit.".to_string())?;
        writer
            .write_all(b"\n")
            .map_err(|_| "Studio could not publish the retrieval units.".to_string())?;
    }
    writer
        .flush()
        .map_err(|_| "Studio could not publish the retrieval units.".to_string())
}

fn create_once(path: &Path) -> Result<Option<std::fs::File>, String> {
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(file) => Ok(Some(file)),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(None),
        Err(_) => Err("Studio could not create a retrieval cache file.".to_string()),
    }
}

fn safe_identity(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_identity_never_contains_a_path_separator() {
        assert_eq!(safe_identity("sha256-a/b\\c:d"), "sha256-abcd");
    }

    #[test]
    fn diagnostic_exports_reject_paths_invalid_json_and_oversized_payloads() {
        assert!(validate_diagnostic_export("../receipt.json", "{}").is_err());
        assert!(validate_diagnostic_export("receipt.md", "{}").is_err());
        assert!(validate_diagnostic_export("receipt.json", "not-json").is_err());
        assert!(validate_diagnostic_export(
            "receipt.json",
            &format!("\"{}\"", "x".repeat(MAX_DIAGNOSTIC_BYTES))
        )
        .is_err());
    }
}
