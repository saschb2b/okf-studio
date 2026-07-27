//! OKF parsing — turn a bundle root into the data model.
//!
//! Implements the pipeline from `docs/architecture/okf-parsing.md`: enumerate
//! non-reserved `.md` files as concepts, split a tolerant frontmatter subset
//! from the body, extract and resolve links, then assemble a [`Bundle`] via the
//! graph, index-tree, log, and validation modules. Never panics on bad input.

use crate::frontmatter::{self, ParsedFrontmatter};
use crate::links;
use crate::model::{
    Bundle, ComputationAttester, ComputationContract, ComputationExecutor, ComputationParameter,
    Concept, ConceptStatus, Confidence, Source, UsageWindow, ATTESTED_COMPUTATION_TYPE,
};
use crate::{graph, index_tree, logfile, validate};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;
use walkdir::WalkDir;

/// Reserved filenames that are not concepts (handled by index/log modules).
pub const RESERVED: [&str; 2] = ["index.md", "log.md"];

/// Named directories the walk skips wherever they appear (build artifacts, VCS).
pub const IGNORED_DIRS: [&str; 6] = [".git", "node_modules", "target", "dist", "build", ".venv"];

/// A directory the walk should not descend into: a named ignore, or any hidden
/// directory (leading `.`), except the scanned root itself.
pub fn is_ignored_dir(path: &Path, root: &Path) -> bool {
    if path == root {
        return false;
    }
    let Some(name) = path.file_name().map(|n| n.to_string_lossy()) else {
        return false;
    };
    IGNORED_DIRS.contains(&name.as_ref()) || (name.starts_with('.') && name.len() > 1)
}

/// Parse a detected bundle root into a full [`Bundle`].
pub fn read_bundle(root: &Path) -> Bundle {
    let mut concepts = read_concepts(root);

    // Resolve links now that the full concept-id set is known.
    let ids: HashSet<String> = concepts.iter().map(|c| c.id.clone()).collect();
    for concept in &mut concepts {
        let classified = links::classify(&concept.body, &concept.id, &ids);
        concept.links = classified.links;
        concept.external_links = classified.external_links;
        concept.broken_links = classified.broken_links;
    }

    graph::link_graph(&mut concepts);

    let indexes = index_tree::build(root, &concepts);
    let log = logfile::parse_log(root);
    let issues = validate::validate(root, &concepts);

    let root_fm = read_root_index_frontmatter(root);
    let okf_version = root_fm
        .as_ref()
        .and_then(|fm| fm.scalar("okf_version"))
        .map(str::to_owned);
    // ODSF bundles additionally declare odsf_version in the root index (§10);
    // it is the data's property, surfaced but never required.
    let odsf_version = root_fm
        .as_ref()
        .and_then(|fm| fm.scalar("odsf_version"))
        .map(str::to_owned);
    let mut extra = root_fm
        .as_ref()
        .map(ParsedFrontmatter::all_values)
        .unwrap_or_default();
    extra.remove("okf_version");
    extra.remove("odsf_version");
    let name = read_bundle_name(root);
    let confidence = if okf_version.is_some() {
        Confidence::Confident
    } else {
        Confidence::Candidate
    };

    Bundle {
        root: root.display().to_string(),
        name,
        okf_version,
        odsf_version,
        extra,
        concepts,
        indexes,
        log,
        issues,
        confidence,
    }
}

/// Enumerate every non-reserved `.md` file under `root` as a (link-unresolved)
/// [`Concept`]. Results are sorted by id for stable output.
pub fn read_concepts(root: &Path) -> Vec<Concept> {
    let ignore = crate::ignore::IgnoreMatcher::load(root);
    let mut concepts: Vec<Concept> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_ignored_dir(e.path(), root))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| !ignore.is_ignored(e.path(), false))
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_ascii_lowercase();
            !RESERVED.contains(&name.as_str())
        })
        .filter_map(|e| concept_from_file(root, e.path()))
        .collect();

    concepts.sort_by(|a, b| a.id.cmp(&b.id));
    concepts
}

/// Build a single concept from a markdown file. Returns `None` only if the file
/// is unreadable; malformed or missing frontmatter still yields a concept (with
/// an empty type), per the tolerant-consumer contract.
fn concept_from_file(root: &Path, path: &Path) -> Option<Concept> {
    let text = std::fs::read_to_string(path).ok()?;
    let id = concept_id(root, path);

    let (fm_src, body) = frontmatter::split(&text);
    let fm = fm_src.map(frontmatter::parse).unwrap_or_default();

    let title = fm
        .scalar("title")
        .map(str::to_owned)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| humanize(&id));

    Some(Concept {
        id,
        concept_type: fm.scalar("type").unwrap_or_default().to_owned(),
        title,
        description: fm.scalar("description").unwrap_or_default().to_owned(),
        tags: fm.list("tags"),
        timestamp: fm.scalar("timestamp").map(str::to_owned),
        resource: fm.scalar("resource").map(str::to_owned),
        sources: concept_sources(&fm, body),
        usage_window: fm.value("usage_window").and_then(usage_window),
        generated: fm
            .value("generated")
            .and_then(frontmatter::ParsedFrontmatter::attribution),
        verified: fm
            .entries("verified")
            .into_iter()
            .filter_map(frontmatter::ParsedFrontmatter::attribution)
            .collect(),
        status: fm
            .scalar("status")
            .map(ConceptStatus::parse)
            .unwrap_or_default(),
        stale_after: fm.scalar("stale_after").map(str::to_owned),
        computation: computation_contract(&fm),
        extra: fm.extra,
        body: body.to_owned(),
        links: Vec::new(),
        external_links: Vec::new(),
        broken_links: Vec::new(),
        cited_by: Vec::new(),
        degree: 0,
    })
}

/// The concept's provenance, preferring `sources` and falling back to a legacy
/// `# Citations` body section.
///
/// v0.2 moved provenance out of the body and into frontmatter, and says a
/// consumer SHOULD read `sources` and MAY still parse the legacy list. Reading
/// both here means the rest of Studio works off one field and never has to know
/// which spec version a bundle was written against.
fn concept_sources(fm: &frontmatter::ParsedFrontmatter, body: &str) -> Vec<Source> {
    let declared = fm
        .entries("sources")
        .into_iter()
        .filter_map(source_entry)
        .collect::<Vec<_>>();
    if !declared.is_empty() {
        return declared;
    }
    legacy_citations(body)
}

/// One `sources` entry. `resource` is required, so an entry without one is
/// dropped rather than invented; the validator reports it separately.
fn source_entry(value: &Value) -> Option<Source> {
    let map = value.as_object()?;
    let text = |key: &str| {
        map.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    let resource = text("resource")?;
    Some(Source {
        resource,
        id: text("id"),
        title: text("title"),
        author: text("author"),
        // Tolerated as a number or a numeric string, because a YAML subset that
        // quotes scalars is normal and dropping the signal over quoting is not.
        usage_count: map.get("usage_count").and_then(|count| {
            count
                .as_u64()
                .or_else(|| count.as_str().and_then(|text| text.trim().parse().ok()))
        }),
        last_modified: text("last_modified"),
    })
}

fn usage_window(value: &Value) -> Option<UsageWindow> {
    let map = value.as_object()?;
    let text = |key: &str| {
        map.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    let window = UsageWindow {
        from: text("from"),
        to: text("to"),
    };
    (window.from.is_some() || window.to.is_some()).then_some(window)
}

/// A v0.1 `# Citations` section, read as sources.
///
/// The section is a bulleted list, so each item becomes a source whose
/// `resource` is the link target when the item is a markdown link and the item
/// text otherwise — a v0.1 citation carries no credibility signals, and
/// inventing them would be worse than leaving them absent.
fn legacy_citations(body: &str) -> Vec<Source> {
    let mut sources = Vec::new();
    let mut inside = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix('#') {
            let heading = heading.trim_start_matches('#').trim();
            // Any following heading closes the section, including a deeper one:
            // a citation list does not have subsections.
            inside = heading.eq_ignore_ascii_case("citations");
            continue;
        }
        if !inside {
            continue;
        }
        let Some(item) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
        else {
            continue;
        };
        let item = item.trim();
        if item.is_empty() {
            continue;
        }
        let (title, resource) = match markdown_link(item) {
            Some((text, href)) => (Some(text.to_string()), href.to_string()),
            None => (None, item.to_string()),
        };
        sources.push(Source {
            resource,
            title,
            ..Source::default()
        });
    }
    sources
}

/// `[text](href)` split, when a list item is a single markdown link.
fn markdown_link(item: &str) -> Option<(&str, &str)> {
    let rest = item.strip_prefix('[')?;
    let (text, rest) = rest.split_once("](")?;
    let href = rest.strip_suffix(')')?;
    (!href.trim().is_empty()).then_some((text.trim(), href.trim()))
}

/// The contract on a `type: Attested Computation` concept.
///
/// Built only for that type: `runtime` and `parameters` are ordinary producer
/// keys on any other concept, and promoting them into a contract there would
/// invent a computation that the bundle never declared.
fn computation_contract(fm: &frontmatter::ParsedFrontmatter) -> Option<ComputationContract> {
    if fm.scalar("type").map(str::trim) != Some(ATTESTED_COMPUTATION_TYPE) {
        return None;
    }
    Some(ComputationContract {
        runtime: fm.scalar("runtime").unwrap_or_default().trim().to_owned(),
        parameters: fm
            .entries("parameters")
            .into_iter()
            .filter_map(computation_parameter)
            .collect(),
        computation: fm.scalar("computation").map(str::to_owned),
        executor: fm.value("executor").and_then(|value| {
            let map = value.as_object()?;
            Some(ComputationExecutor {
                resource: map
                    .get("resource")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                receipt: match map.get("receipt") {
                    Some(Value::Array(items)) => items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect(),
                    Some(Value::String(single)) => vec![single.clone()],
                    _ => Vec::new(),
                },
            })
        }),
        attester: fm.value("attester").and_then(|value| {
            let resource = value
                .as_object()?
                .get("resource")
                .and_then(Value::as_str)
                .map(str::to_owned);
            Some(ComputationAttester { resource })
        }),
    })
}

fn computation_parameter(value: &Value) -> Option<ComputationParameter> {
    let map = value.as_object()?;
    let name = map
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    Some(ComputationParameter {
        name: name.to_owned(),
        parameter_type: map.get("type").and_then(Value::as_str).map(str::to_owned),
        // Absent means optional, which is the safer default: a consumer that
        // treats an unmarked parameter as required refuses runs the contract
        // actually permits. Accepted as a bool or as the string the tolerant
        // scalar reader produces, since it keeps every scalar as text.
        required: map
            .get("required")
            .map(|value| match value {
                Value::Bool(flag) => *flag,
                Value::String(text) => text.trim().eq_ignore_ascii_case("true"),
                _ => false,
            })
            .unwrap_or(false),
    })
}

/// Concept ID = path minus `.md`, relative to root, forward slashes.
pub fn concept_id(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    let s = rel.to_string_lossy().replace('\\', "/");
    if s.len() >= 3 && s[s.len() - 3..].eq_ignore_ascii_case(".md") {
        s[..s.len() - 3].to_string()
    } else {
        s
    }
}

/// Humanize an id or filename into a fallback title: take the last path
/// segment, replace `-`/`_` with spaces, and title-case each word.
fn humanize(id: &str) -> String {
    let last = id.rsplit('/').next().unwrap_or(id);
    let cleaned = last.replace(['-', '_'], " ");
    cleaned
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Read the root `index.md` frontmatter (may carry `okf_version`).
fn read_root_index_frontmatter(root: &Path) -> Option<ParsedFrontmatter> {
    let text = std::fs::read_to_string(root.join("index.md")).ok()?;
    let (fm_src, _) = frontmatter::split(&text);
    fm_src.map(frontmatter::parse)
}

/// Bundle name: root `index.md` H1, else the directory name.
pub fn read_bundle_name(root: &Path) -> String {
    if let Ok(text) = std::fs::read_to_string(root.join("index.md")) {
        if let Some(h1) = first_h1(&text) {
            return h1;
        }
    }
    root.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// First markdown `# H1` heading text in `text`, if any. Skips a frontmatter
/// block so a `#` inside it is not mistaken for a heading.
pub fn first_h1(text: &str) -> Option<String> {
    let (_, body) = frontmatter::split(text);
    for line in body.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn concept_id_strips_md_and_root() {
        let root = PathBuf::from("/bundle");
        let id = concept_id(&root, &PathBuf::from("/bundle/tables/orders.md"));
        assert_eq!(id, "tables/orders");
    }

    #[test]
    fn humanizes_fallback_title() {
        assert_eq!(humanize("features/graph-view"), "Graph View");
        assert_eq!(humanize("okf_spec_summary"), "Okf Spec Summary");
    }

    #[test]
    fn first_h1_skips_frontmatter() {
        assert_eq!(
            first_h1("---\nokf_version: \"0.1\"\n---\n# Title Here\n"),
            Some("Title Here".to_string())
        );
    }

    #[test]
    fn bundle_read_applies_okfignore_without_hiding_a_negated_concept() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("okf-parse-ignore-{nonce}"));
        fs::create_dir_all(root.join("private")).expect("private directory");
        fs::write(
            root.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Fixture\n",
        )
        .expect("index");
        fs::write(root.join(".okfignore"), "private/**\n!private/public.md\n").expect("ignore");
        fs::write(
            root.join("private/secret.md"),
            "---\ntype: Note\n---\n# Secret\n",
        )
        .expect("secret");
        fs::write(
            root.join("private/public.md"),
            "---\ntype: Note\n---\n# Public\n",
        )
        .expect("public");

        let bundle = read_bundle(&root);
        assert_eq!(
            bundle
                .concepts
                .iter()
                .map(|concept| concept.id.as_str())
                .collect::<Vec<_>>(),
            ["private/public"]
        );
        assert!(bundle.issues.is_empty());
        assert!(bundle.indexes.iter().any(|index| index.dir == "private"));
        fs::remove_dir_all(root).expect("cleanup");
    }
}
