//! Static "new bundle" generation — no agent involved. A form's inputs become
//! a small, conformant OKF v0.1 bundle on disk: a root `index.md` declaring
//! `okf_version`, a dated `log.md`, the user's first concept, and (optionally)
//! a starter guide concept cross-linked with it so the graph starts connected.
//! The tree is written atomically (temp dir + rename, never over an existing
//! folder) and self-checked with `okf-core` before it is handed back. See
//! docs/features/create-bundle.md.

use serde::Deserialize;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::agent_stage::validate_bundle_directory_name;

const MAX_TITLE_CHARS: usize = 120;
const MAX_DESCRIPTION_CHARS: usize = 400;
const MAX_TYPE_CHARS: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBundleInput {
    pub folder_name: String,
    pub title: String,
    pub description: String,
    pub first_concept_title: String,
    pub first_concept_type: String,
    pub include_guide: bool,
}

/// One generated file: bundle-relative path plus its full content.
struct GeneratedFile {
    path: String,
    content: String,
}

/// Create the bundle folder under `parent` and return its path.
pub fn create_bundle(parent: &Path, input: &CreateBundleInput) -> Result<PathBuf, String> {
    let folder_name = validate_bundle_directory_name(&input.folder_name)?;
    let parent = parent
        .canonicalize()
        .map_err(|_| "The selected destination folder could not be resolved.".to_string())?;
    if !parent.is_dir() {
        return Err("Choose an existing destination folder.".to_string());
    }
    let destination = parent.join(&folder_name);
    if destination.symlink_metadata().is_ok() {
        return Err(format!(
            "A folder named {folder_name} already exists there. Choose another name or parent folder."
        ));
    }

    let files = generate_files(input)?;

    // Write into a temp sibling, then rename into place: the destination
    // either appears complete or not at all.
    let temporary = parent.join(format!(
        ".{folder_name}.okf-studio-{}.tmp",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir(&temporary)
        .map_err(|_| "Studio could not prepare the new bundle directory.".to_string())?;
    let written = (|| -> Result<(), String> {
        for file in &files {
            let target = temporary.join(&file.path);
            if let Some(dir) = target.parent() {
                std::fs::create_dir_all(dir)
                    .map_err(|_| "Studio could not prepare a bundle subdirectory.".to_string())?;
            }
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|_| "Studio could not create a bundle file.".to_string())?;
            output
                .write_all(file.content.as_bytes())
                .and_then(|()| output.sync_all())
                .map_err(|_| "Studio could not write a bundle file.".to_string())?;
        }
        Ok(())
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(error);
    }

    // Self-check with the same core the app reads bundles with: the generator
    // must never hand over a non-conformant tree.
    let bundle = okf_core::read_bundle(&temporary);
    let errors = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == okf_core::IssueLevel::Error)
        .count();
    if bundle.concepts.is_empty() || errors > 0 {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err("The generated bundle failed its conformance self-check.".to_string());
    }

    if let Err(error) = std::fs::rename(&temporary, &destination) {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(format!("Studio could not move the new bundle into place: {error}"));
    }
    Ok(destination)
}

fn generate_files(input: &CreateBundleInput) -> Result<Vec<GeneratedFile>, String> {
    let title = bounded_line(&input.title, MAX_TITLE_CHARS);
    if title.is_empty() {
        return Err("Give the bundle a title.".to_string());
    }
    let description = bounded_line(&input.description, MAX_DESCRIPTION_CHARS);
    let concept_title = {
        let bounded = bounded_line(&input.first_concept_title, MAX_TITLE_CHARS);
        if bounded.is_empty() { "Welcome".to_string() } else { bounded }
    };
    let concept_type = {
        let bounded = bounded_line(&input.first_concept_type, MAX_TYPE_CHARS);
        if bounded.is_empty() { "Note".to_string() } else { bounded }
    };
    let slug = slugify(&concept_title);
    let concept_rel = format!("concepts/{slug}.md");
    let now = iso_timestamp()?;
    let today = &now[..10];

    let mut index = format!(
        "---\nokf_version: \"0.1\"\n---\n\n# {title}\n\n{body}\n\n# Concepts\n* [{concept_title}](concepts/{slug}.md) - The starting point of this bundle.\n",
        body = if description.is_empty() {
            "A new OKF bundle, created with OKF Studio.".to_string()
        } else {
            description.clone()
        },
    );
    if input.include_guide {
        index.push_str(
            "\n# Guide\n* [Working in this bundle](guide/working-in-this-bundle.md) - How to grow this bundle and keep it conformant.\n",
        );
    }

    let mut concept = format!(
        "---\ntype: {concept_type}\ntitle: {concept_title_yaml}\ndescription: \"The starting point of this bundle.\"\ntimestamp: {now}\n---\n\n# Notes\n\nStart writing here: replace this section with the knowledge this concept holds.\nGive each fact its sharpest form - a table for field-by-field facts, a list for\nan enumeration, plain prose for meaning and reasoning.\n",
        concept_title_yaml = yaml_string(&concept_title),
    );
    if input.include_guide {
        concept.push_str(
            "\nNew to OKF? [Working in this bundle](/guide/working-in-this-bundle.md) explains\nhow to add concepts and keep the bundle conformant.\n",
        );
    }

    let mut files = vec![
        GeneratedFile { path: "index.md".to_string(), content: index },
        GeneratedFile {
            path: "log.md".to_string(),
            content: format!(
                "# Log\n\n## {today}\n* **Creation**: Created \"{title}\" with OKF Studio's new-bundle starter: this log, a root index, and [{concept_title}](concepts/{slug}.md){guide_note}.\n",
                guide_note = if input.include_guide {
                    " plus the working guide"
                } else {
                    ""
                },
            ),
        },
    ];

    if input.include_guide {
        files.push(GeneratedFile {
            path: "guide/working-in-this-bundle.md".to_string(),
            content: format!(
                "---\ntype: Guide\ntitle: \"Working in this bundle\"\ndescription: \"How to add concepts, link them, and keep this bundle conformant.\"\ntimestamp: {now}\n---\n\nThis bundle follows the Open Knowledge Format (OKF v0.1): a folder of markdown\nfiles where every concept carries YAML frontmatter with a non-empty `type`.\nThat is the one hard rule - everything else is convention that keeps the\nbundle pleasant to read and traverse.\n\n# Growing the bundle\n\n- **Add a concept**: create a `.md` file (its path is its identity), start it\n  with frontmatter (`type` required; `title`, `description`, and a `timestamp`\n  recommended), and write structural markdown below.\n- **Link concepts**: a markdown link to another concept file, like\n  [{concept_title}](/{concept_rel}), is a graph edge. Name the relationship in\n  the surrounding prose.\n- **Keep the index current**: list new concepts in `index.md` so a reader (or\n  an agent) can navigate by descending from the root.\n- **Log meaningful changes**: append a dated entry to `log.md`, newest first.\n- **One fact, one place**: link to a concept instead of restating it.\n\n# Reserved files\n\n`index.md` and `log.md` are navigation and history, never concepts - only the\nroot `index.md` carries frontmatter (its `okf_version`).\n",
            ),
        });
    }

    files.push(GeneratedFile { path: concept_rel, content: concept });
    Ok(files)
}

/// One display line: control characters stripped, whitespace collapsed,
/// trimmed, bounded to `max_chars`.
fn bounded_line(value: &str, max_chars: usize) -> String {
    let mut line = String::new();
    let mut separated = true;
    for character in value.chars() {
        if character.is_control() || character.is_whitespace() {
            if !separated {
                line.push(' ');
                separated = true;
            }
            continue;
        }
        line.push(character);
        separated = false;
    }
    line.chars().take(max_chars).collect::<String>().trim_end().to_string()
}

/// Quote a scalar so it round-trips identically under real YAML parsers AND
/// okf-core's tolerant frontmatter reader (which strips outer quotes without
/// unescaping): pick the quote the value doesn't contain, and never emit
/// escape sequences. A value holding both quote kinds trades its double
/// quotes for singles — a rare, visible mutation over a silent misparse.
fn yaml_string(value: &str) -> String {
    if !value.contains('"') {
        return format!("\"{value}\"");
    }
    if !value.contains('\'') {
        return format!("'{value}'");
    }
    format!("\"{}\"", value.replace('"', "'"))
}

/// Lowercase alphanumeric slug with single dashes; falls back to "concept".
fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut dashed = true;
    for character in title.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            dashed = false;
        } else if !dashed {
            slug.push('-');
            dashed = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() { "concept".to_string() } else { slug }
}

fn iso_timestamp() -> Result<String, String> {
    let format = time::format_description::parse(
        "[year]-[month]-[day]T[hour]:[minute]:[second]Z",
    )
    .map_err(|_| "Studio could not prepare the creation timestamp.".to_string())?;
    time::OffsetDateTime::now_utc()
        .format(&format)
        .map_err(|_| "Studio could not format the creation timestamp.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> CreateBundleInput {
        CreateBundleInput {
            folder_name: "team-knowledge".to_string(),
            title: "Team Knowledge".to_string(),
            description: "What the team knows, as connected concepts.".to_string(),
            first_concept_title: "Welcome".to_string(),
            first_concept_type: "Note".to_string(),
            include_guide: true,
        }
    }

    fn temp_parent() -> PathBuf {
        let parent = std::env::temp_dir().join(format!("okf-create-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&parent).expect("create temp parent");
        parent
    }

    #[test]
    fn creates_a_conformant_connected_bundle() {
        let parent = temp_parent();
        let created = create_bundle(&parent, &input()).expect("bundle created");

        let bundle = okf_core::read_bundle(&created);
        assert_eq!(bundle.concepts.len(), 2);
        assert!(bundle
            .issues
            .iter()
            .all(|issue| issue.level != okf_core::IssueLevel::Error));
        // The guide links the first concept and the concept links back, so
        // the starter graph is connected (no orphan warning on day one).
        let guide = bundle
            .concepts
            .iter()
            .find(|concept| concept.id == "guide/working-in-this-bundle")
            .expect("guide concept");
        assert!(guide.links.iter().any(|link| link == "concepts/welcome"));
        let welcome = bundle
            .concepts
            .iter()
            .find(|concept| concept.id == "concepts/welcome")
            .expect("welcome concept");
        assert!(welcome.links.iter().any(|link| link == "guide/working-in-this-bundle"));
        assert_eq!(welcome.concept_type, "Note");

        let log = std::fs::read_to_string(created.join("log.md")).expect("log");
        assert!(log.starts_with("# Log\n\n## 2"));
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn skips_the_guide_when_not_requested() {
        let parent = temp_parent();
        let created = create_bundle(
            &parent,
            &CreateBundleInput { include_guide: false, ..input() },
        )
        .expect("bundle created");
        let bundle = okf_core::read_bundle(&created);
        assert_eq!(bundle.concepts.len(), 1);
        assert!(!created.join("guide").exists());
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn refuses_an_existing_destination_and_leaves_no_residue() {
        let parent = temp_parent();
        std::fs::create_dir(parent.join("team-knowledge")).expect("collide");
        let error = create_bundle(&parent, &input()).expect_err("collision refused");
        assert!(error.contains("already exists"));
        let leftovers = std::fs::read_dir(&parent)
            .expect("read parent")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn sanitizes_titles_and_slugs() {
        let parent = temp_parent();
        let created = create_bundle(
            &parent,
            &CreateBundleInput {
                first_concept_title: "  Ship it: \"Q3\" plan!  ".to_string(),
                first_concept_type: String::new(),
                ..input()
            },
        )
        .expect("bundle created");
        let bundle = okf_core::read_bundle(&created);
        let concept = bundle
            .concepts
            .iter()
            .find(|concept| concept.id == "concepts/ship-it-q3-plan")
            .expect("slugged concept");
        assert_eq!(concept.title, "Ship it: \"Q3\" plan!");
        assert_eq!(concept.concept_type, "Note");
        let _ = std::fs::remove_dir_all(&parent);
    }
}
