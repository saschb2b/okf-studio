use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

pub(crate) const MAX_SOURCE_ATTACHMENTS: usize = 8;
pub(crate) const MAX_SOURCE_CONTENT_CHARS: usize = 256 * 1024;
pub(crate) const MAX_SOURCE_TOTAL_CHARS: usize = 512 * 1024;
pub(crate) const MAX_SOURCE_TITLE_CHARS: usize = 256;
const MAX_SOURCE_FILE_BYTES: u64 = MAX_SOURCE_CONTENT_CHARS as u64;
const MAX_SELECTED_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_FOLDER_DEPTH: usize = 8;
const MAX_FOLDER_ENTRIES: usize = 4_096;

struct SourcePath {
    path: PathBuf,
    title: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSourceInput {
    pub(crate) title: String,
    pub(crate) content: String,
    pub(crate) origin: Option<String>,
    pub(crate) media_type: Option<String>,
    pub(crate) source_digest: Option<String>,
    pub(crate) warning: Option<String>,
}

pub(crate) fn pick_text_sources(
    app: &AppHandle,
    requested_limit: usize,
) -> Result<Vec<AgentSourceInput>, String> {
    if requested_limit == 0 {
        return Err("The source tray is full.".to_string());
    }
    let limit = requested_limit.min(MAX_SOURCE_ATTACHMENTS);
    let selected = app
        .dialog()
        .file()
        .add_filter(
            "PDF, text, Markdown, HTML, CSV, and JSON",
            &["pdf", "txt", "md", "markdown", "html", "htm", "csv", "json"],
        )
        .blocking_pick_files()
        .unwrap_or_default();
    if selected.len() > limit {
        return Err(format!("Select at most {limit} more source files."));
    }
    let paths = selected
        .into_iter()
        .map(|path| {
            path.into_path().map_err(|_| {
                "A selected source path is not available on this platform.".to_string()
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    read_text_sources(&paths, limit)
}

pub(crate) fn pick_source_folder(
    app: &AppHandle,
    requested_limit: usize,
) -> Result<Vec<AgentSourceInput>, String> {
    if requested_limit == 0 {
        return Err("The source tray is full.".to_string());
    }
    let Some(selected) = app.dialog().file().blocking_pick_folder() else {
        return Ok(Vec::new());
    };
    let root = selected
        .into_path()
        .map_err(|_| "The selected source folder is not available on this platform.".to_string())?;
    read_folder_sources(&root, requested_limit.min(MAX_SOURCE_ATTACHMENTS))
}

fn read_text_sources(paths: &[PathBuf], limit: usize) -> Result<Vec<AgentSourceInput>, String> {
    let paths = paths
        .iter()
        .map(|path| {
            let title = path
                .file_name()
                .and_then(|name| name.to_str())
                .filter(|name| !name.is_empty())
                .ok_or_else(|| "A selected source has no usable filename.".to_string())?;
            Ok(SourcePath {
                path: path.clone(),
                title: title.to_string(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    read_sources(&paths, limit)
}

fn read_folder_sources(root: &Path, limit: usize) -> Result<Vec<AgentSourceInput>, String> {
    let metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Could not inspect the selected source folder: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("The selected source folder cannot be a symbolic link.".to_string());
    }
    if !metadata.is_dir() {
        return Err("The selected source folder is not a directory.".to_string());
    }

    let mut inspected_entries = 0_usize;
    let mut directories = vec![(root.to_path_buf(), 0_usize)];
    let mut paths = Vec::new();
    while let Some((directory, depth)) = directories.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Could not read the selected source folder: {error}"))?;
        for entry in entries {
            let entry = entry
                .map_err(|error| format!("Could not read the selected source folder: {error}"))?;
            inspected_entries += 1;
            if inspected_entries > MAX_FOLDER_ENTRIES {
                return Err(format!(
                    "The selected folder exceeds the {MAX_FOLDER_ENTRIES} entry traversal limit."
                ));
            }
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Could not inspect a source folder entry: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                if depth >= MAX_FOLDER_DEPTH {
                    return Err(format!(
                        "The selected folder exceeds the {MAX_FOLDER_DEPTH} level traversal limit."
                    ));
                }
                directories.push((path, depth + 1));
                continue;
            }
            if !file_type.is_file() || supported_media_type(&path).is_none() {
                continue;
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "A source folder entry escaped the selected folder.".to_string())?;
            let title = relative_path_label(relative)?;
            paths.push(SourcePath { path, title });
        }
    }
    paths.sort_by(|left, right| left.title.cmp(&right.title));
    if paths.is_empty() {
        return Err(
            "The selected folder contains no supported PDF, text, Markdown, HTML, CSV, or JSON files."
                .to_string(),
        );
    }
    if paths.len() > limit {
        return Err(format!(
            "The selected folder contains {} supported files. The source tray has room for {limit}.",
            paths.len()
        ));
    }
    read_sources(&paths, limit)
}

fn read_sources(paths: &[SourcePath], limit: usize) -> Result<Vec<AgentSourceInput>, String> {
    if limit == 0 {
        return Err("Select at most 0 more source files.".to_string());
    }
    if paths.len() > limit || paths.len() > MAX_SOURCE_ATTACHMENTS {
        return Err(format!("Select at most {limit} more source files."));
    }
    let mut total_file_bytes = 0_u64;
    let mut total_content_chars = 0_usize;
    let mut sources = Vec::with_capacity(paths.len());
    for source_path in paths {
        let path = &source_path.path;
        let media_type = media_type_for_path(path)?;
        let title = &source_path.title;
        if title.chars().count() > MAX_SOURCE_TITLE_CHARS || title.chars().any(char::is_control) {
            return Err("A selected source filename is too long or contains controls.".to_string());
        }
        let metadata = path
            .metadata()
            .map_err(|error| format!("Could not inspect {title}: {error}"))?;
        if !metadata.is_file() {
            return Err(format!("{title} is not a file."));
        }
        let file_limit = if media_type == "application/pdf" {
            crate::agent_pdf::MAX_PDF_BYTES
        } else {
            MAX_SOURCE_FILE_BYTES
        };
        if metadata.len() > file_limit {
            return Err(if media_type == "application/pdf" {
                format!("{title} exceeds the 16 MiB PDF limit.")
            } else {
                format!("{title} exceeds the 256 KiB source limit.")
            });
        }
        total_file_bytes = total_file_bytes.saturating_add(metadata.len());
        if total_file_bytes > MAX_SELECTED_FILE_BYTES {
            return Err("Selected source files exceed the 32 MiB combined limit.".to_string());
        }

        let (content, source_digest, warning) = if media_type == "application/pdf" {
            let extraction = crate::agent_pdf::extract_in_helper(path)?;
            (
                extraction.content,
                Some(extraction.source_digest),
                extraction.warning,
            )
        } else {
            let mut bytes = Vec::with_capacity(metadata.len() as usize);
            File::open(path)
                .and_then(|file| file.take(file_limit + 1).read_to_end(&mut bytes))
                .map_err(|error| format!("Could not read {title}: {error}"))?;
            if bytes.len() as u64 > file_limit {
                return Err(format!("{title} exceeds the 256 KiB source limit."));
            }
            let content = String::from_utf8(bytes)
                .map_err(|_| format!("{title} is not valid UTF-8 text."))?;
            (content, None, None)
        };
        if content.trim().is_empty() {
            return Err(format!("{title} is empty."));
        }
        total_content_chars = total_content_chars.saturating_add(content.chars().count());
        if total_content_chars > MAX_SOURCE_TOTAL_CHARS {
            return Err(
                "Extracted source text exceeds the 524,288 character combined limit.".to_string(),
            );
        }
        sources.push(AgentSourceInput {
            title: title.clone(),
            content,
            origin: Some(title.clone()),
            media_type: Some(media_type.to_string()),
            source_digest,
            warning,
        });
    }
    Ok(sources)
}

fn relative_path_label(path: &Path) -> Result<String, String> {
    let parts = path
        .components()
        .map(|component| match component {
            std::path::Component::Normal(value) => value
                .to_str()
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .ok_or_else(|| "A source folder entry has no usable UTF-8 name.".to_string()),
            _ => Err("A source folder entry has an invalid relative path.".to_string()),
        })
        .collect::<Result<Vec<_>, _>>()?;
    if parts.is_empty() {
        return Err("A source folder entry has no usable relative path.".to_string());
    }
    Ok(parts.join("/"))
}

fn media_type_for_path(path: &Path) -> Result<&'static str, String> {
    supported_media_type(path)
        .ok_or_else(|| "Sources must be PDF, text, Markdown, HTML, CSV, or JSON files.".to_string())
}

fn supported_media_type(path: &Path) -> Option<&'static str> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("txt") => Some("text/plain"),
        Some("md" | "markdown") => Some("text/markdown"),
        Some("html" | "htm") => Some("text/html"),
        Some("csv") => Some("text/csv"),
        Some("json") => Some("application/json"),
        Some("pdf") => Some("application/pdf"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("okf-agent-sources-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp directory");
        path
    }

    #[test]
    fn reads_supported_text_without_disclosing_its_path() {
        let root = temp_dir();
        let path = root.join("Research.md");
        fs::write(&path, "# Notes\n\nVerified.").expect("write source");

        let sources = read_text_sources(&[path], 1).expect("read source");

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].title, "Research.md");
        assert_eq!(sources[0].origin.as_deref(), Some("Research.md"));
        assert_eq!(sources[0].media_type.as_deref(), Some("text/markdown"));
        assert_eq!(sources[0].content, "# Notes\n\nVerified.");
        let serialized = serde_json::to_string(&sources).expect("serialize sources");
        assert!(!serialized.contains(root.to_string_lossy().as_ref()));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn labels_structured_text_with_its_media_type() {
        let root = temp_dir();
        let cases = [
            ("page.html", "<h1>Report</h1>", "text/html"),
            ("rows.csv", "name,value\nalpha,1", "text/csv"),
            ("record.json", r#"{"name":"alpha"}"#, "application/json"),
        ];
        for (name, content, expected_media_type) in cases {
            let path = root.join(name);
            fs::write(&path, content).expect("write structured source");
            let sources = read_text_sources(&[path], 1).expect("read structured source");
            assert_eq!(sources[0].media_type.as_deref(), Some(expected_media_type));
        }
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_unsupported_binary_and_oversized_sources() {
        let root = temp_dir();
        let unsupported = root.join("notes.xml");
        fs::write(&unsupported, "<notes />").expect("write unsupported source");
        assert!(read_text_sources(&[unsupported], 1)
            .expect_err("reject unsupported extension")
            .contains("text"));

        let binary = root.join("binary.txt");
        fs::write(&binary, [0xff, 0xfe]).expect("write binary source");
        assert!(read_text_sources(&[binary], 1)
            .expect_err("reject binary source")
            .contains("UTF-8"));

        let oversized = root.join("large.md");
        fs::write(&oversized, vec![b'a'; MAX_SOURCE_FILE_BYTES as usize + 1])
            .expect("write oversized source");
        assert!(read_text_sources(&[oversized], 1)
            .expect_err("reject oversized source")
            .contains("256 KiB"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn enforces_the_requested_selection_limit() {
        let root = temp_dir();
        let first = root.join("first.txt");
        let second = root.join("second.txt");
        fs::write(&first, "first").expect("write first source");
        fs::write(&second, "second").expect("write second source");

        assert!(read_text_sources(&[first, second], 1)
            .expect_err("reject excess selection")
            .contains("at most 1"));
        assert!(read_text_sources(&[], 0)
            .expect_err("reject a full tray")
            .contains("at most 0"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_a_selection_above_the_combined_byte_limit() {
        let root = temp_dir();
        let paths = ["first.txt", "second.md", "third.markdown"].map(|name| root.join(name));
        for path in &paths {
            fs::write(path, vec![b'a'; 180 * 1024]).expect("write source");
        }

        assert!(read_text_sources(&paths, 3)
            .expect_err("reject combined source size")
            .contains("524,288 character"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn reads_folder_sources_in_relative_path_order_and_ignores_unsupported_files() {
        let root = temp_dir();
        fs::create_dir_all(root.join("reports")).expect("create nested folder");
        fs::write(root.join("z-last.txt"), "last").expect("write root source");
        fs::write(root.join("reports").join("a-first.md"), "first").expect("write nested source");
        fs::write(root.join("reports").join("ignored.xml"), "<ignored />")
            .expect("write unsupported file");

        let sources = read_folder_sources(&root, 2).expect("read source folder");

        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0].title, "reports/a-first.md");
        assert_eq!(sources[0].origin.as_deref(), Some("reports/a-first.md"));
        assert_eq!(sources[1].title, "z-last.txt");
        let serialized = serde_json::to_string(&sources).expect("serialize sources");
        assert!(!serialized.contains(root.to_string_lossy().as_ref()));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_folder_sources_that_cannot_fit_in_the_tray() {
        let root = temp_dir();
        fs::write(root.join("first.txt"), "first").expect("write first source");
        fs::write(root.join("second.txt"), "second").expect("write second source");

        let error = read_folder_sources(&root, 1).expect_err("reject excess folder sources");

        assert!(error.contains("2 supported files"));
        assert!(error.contains("room for 1"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[test]
    fn rejects_a_folder_beyond_the_traversal_depth_limit() {
        let root = temp_dir();
        let mut directory = root.clone();
        for depth in 0..=MAX_FOLDER_DEPTH {
            directory = directory.join(format!("level-{depth}"));
            fs::create_dir(&directory).expect("create nested directory");
        }

        let error = read_folder_sources(&root, 1).expect_err("reject deep source folder");

        assert!(error.contains("8 level traversal limit"));
        fs::remove_dir_all(root).expect("remove temp directory");
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_folder_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let outside = temp_dir();
        fs::write(root.join("inside.txt"), "inside").expect("write inside source");
        fs::write(outside.join("outside.txt"), "outside").expect("write outside source");
        symlink(&outside, root.join("linked-folder")).expect("link outside folder");

        let sources = read_folder_sources(&root, 2).expect("read source folder");

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].title, "inside.txt");
        fs::remove_dir_all(root).expect("remove source folder");
        fs::remove_dir_all(outside).expect("remove outside folder");
    }
}
