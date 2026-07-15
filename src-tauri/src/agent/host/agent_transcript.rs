use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_TRANSCRIPT_BYTES: usize = 2 * 1024 * 1024;
const MAX_SUGGESTED_NAME_CHARS: usize = 128;

pub(crate) async fn export(
    app: &AppHandle,
    suggested_name: String,
    markdown: String,
) -> Result<Option<String>, String> {
    validate_input(&suggested_name, &markdown)?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });

    let Some(selected) = receiver
        .await
        .map_err(|_| "The transcript save dialog closed unexpectedly.".to_string())?
    else {
        return Ok(None);
    };
    let mut path = selected.into_path().map_err(|_| {
        "The selected transcript path is not available on this platform.".to_string()
    })?;
    ensure_markdown_extension(&mut path);
    let returned_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The selected transcript filename is not valid Unicode.".to_string())?
        .to_string();

    tauri::async_runtime::spawn_blocking(move || write_transcript(&path, &markdown))
        .await
        .map_err(|error| format!("The transcript export task failed: {error}"))??;
    Ok(Some(returned_name))
}

fn validate_input(suggested_name: &str, markdown: &str) -> Result<(), String> {
    let name_chars = suggested_name.chars().count();
    if name_chars == 0 || name_chars > MAX_SUGGESTED_NAME_CHARS {
        return Err("The suggested transcript filename is invalid.".to_string());
    }
    if !suggested_name.ends_with(".md")
        || !suggested_name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.')
        })
    {
        return Err("The suggested transcript filename must be a Markdown basename.".to_string());
    }
    if markdown.is_empty() {
        return Err("There is no agent thread to export.".to_string());
    }
    if markdown.len() > MAX_TRANSCRIPT_BYTES {
        return Err("The agent thread is too large to export (2 MiB maximum).".to_string());
    }
    if markdown.contains('\0') {
        return Err("The agent thread contains an unsupported null character.".to_string());
    }
    Ok(())
}

fn ensure_markdown_extension(path: &mut PathBuf) {
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        path.set_extension("md");
    }
}

fn write_transcript(path: &Path, markdown: &str) -> Result<(), String> {
    fs::write(path, markdown)
        .map_err(|error| format!("Studio could not save the transcript: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_and_oversized_content() {
        assert!(validate_input("../thread.md", "hello").is_err());
        assert!(validate_input("thread.txt", "hello").is_err());
        assert!(validate_input("thread.md", "").is_err());
        assert!(validate_input("thread.md", &"x".repeat(MAX_TRANSCRIPT_BYTES + 1)).is_err());
    }

    #[test]
    fn writes_markdown_and_normalizes_the_extension() {
        let root =
            std::env::temp_dir().join(format!("okf-studio-transcript-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create transcript test directory");
        let mut path = root.join("thread.txt");
        ensure_markdown_extension(&mut path);
        write_transcript(&path, "# Agent thread\n").expect("write transcript");

        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("thread.md")
        );
        assert_eq!(
            fs::read_to_string(&path).expect("read transcript"),
            "# Agent thread\n"
        );
        fs::remove_dir_all(root).expect("remove transcript test directory");
    }
}
