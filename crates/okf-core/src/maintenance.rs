//! Deterministic plans for reviewed knowledge maintenance.
//!
//! Plans are pure: callers provide the parsed bundle and bounded Markdown
//! sources, then decide whether to stage the returned complete-file writes.

use crate::frontmatter;
use crate::links;
use crate::Bundle;
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::ops::Range;

const MAX_MOVE_FILES: usize = 4_096;
const MAX_PATH_CHARS: usize = 1_024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConceptMovePlan {
    pub schema_version: u8,
    pub source_id: String,
    pub destination_id: String,
    pub stable_id: Option<String>,
    pub affected_links: usize,
    pub affected_indexes: usize,
    pub warnings: Vec<String>,
    pub changes: Vec<ConceptMoveChange>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConceptMoveChange {
    pub path: String,
    pub kind: &'static str,
    pub reason: &'static str,
    #[serde(skip_serializing)]
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RetirementAction {
    Deprecate,
    Redirect,
    Tombstone,
    Delete,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConceptRetirementPlan {
    pub schema_version: u8,
    pub source_id: String,
    pub action: RetirementAction,
    pub replacement_id: Option<String>,
    pub affected_links: usize,
    pub affected_indexes: usize,
    pub retrieval_consequence: String,
    pub warnings: Vec<String>,
    pub changes: Vec<ConceptMoveChange>,
}

/// Plan one explicit retirement decision plus its rationale-trail log entry.
///
/// Delete is allowed only when every inbound Markdown link can be redirected,
/// or when there are no inbound links. The plan remains pure; callers stage
/// complete files and a deletion marker through the reviewed transaction.
pub fn plan_concept_retirement(
    bundle: &Bundle,
    markdown: &BTreeMap<String, String>,
    source_id: &str,
    action: RetirementAction,
    replacement_id: Option<&str>,
    reason: &str,
    decision_date: &str,
) -> Result<ConceptRetirementPlan, String> {
    if markdown.len() > MAX_MOVE_FILES {
        return Err(format!(
            "Retirement planning is limited to {MAX_MOVE_FILES} Markdown files."
        ));
    }
    let source = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == source_id)
        .ok_or_else(|| "The concept is no longer available.".to_string())?;
    let source_path = format!("{source_id}.md");
    let source_raw = markdown
        .get(&source_path)
        .ok_or_else(|| "The concept file is no longer available.".to_string())?;
    let reason = reason.trim();
    if reason.is_empty() || reason.chars().count() > 1_024 || reason.chars().any(char::is_control) {
        return Err("Name a bounded plain-text retirement reason.".to_string());
    }
    if !is_iso_day(decision_date) {
        return Err("The retirement decision date must use YYYY-MM-DD.".to_string());
    }
    let replacement = replacement_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value == source_id {
                return Err("A concept cannot replace itself.".to_string());
            }
            bundle
                .concepts
                .iter()
                .find(|concept| concept.id == value)
                .map(|_| value.to_string())
                .ok_or_else(|| "The replacement concept is not available.".to_string())
        })
        .transpose()?;
    if matches!(action, RetirementAction::Redirect) && replacement.is_none() {
        return Err("Redirect requires a replacement concept.".to_string());
    }

    let mut writes = BTreeMap::<String, (&'static str, &'static str, String)>::new();
    let mut affected_links = 0usize;
    let mut affected_indexes = BTreeSet::new();
    if matches!(
        action,
        RetirementAction::Redirect | RetirementAction::Delete
    ) {
        for (path, raw) in markdown {
            if path == &source_path || path == "log.md" {
                continue;
            }
            let context_id = path
                .strip_suffix(".md")
                .ok_or_else(|| "Retirement planning received a non-Markdown file.".to_string())?;
            let (rewritten, replacements) =
                rewrite_raw_links(raw, context_id, |target, fragment| {
                    (target == source_id)
                        .then_some(replacement.as_deref())
                        .flatten()
                        .map(|target| relative_href(context_id, target, fragment))
                })?;
            if replacements > 0 {
                affected_links += replacements;
                if path.ends_with("index.md") {
                    affected_indexes.insert(path.clone());
                }
                writes.insert(
                    path.clone(),
                    (
                        "modify",
                        if path.ends_with("index.md") {
                            "Update navigation"
                        } else {
                            "Update inbound links"
                        },
                        rewritten,
                    ),
                );
            }
        }
    } else {
        affected_links = source.cited_by.len();
    }
    if matches!(action, RetirementAction::Delete)
        && replacement.is_none()
        && !source.cited_by.is_empty()
    {
        return Err(
            "Delete requires a replacement while inbound Markdown links still exist.".to_string(),
        );
    }
    if matches!(action, RetirementAction::Delete) && replacement.is_none() {
        affected_links = source.cited_by.len();
    }

    let replacement_field = replacement
        .as_deref()
        .map(|value| format!("\nsuperseded_by: [{}]", yaml_string(value)))
        .unwrap_or_default();
    let retrieval_consequence = match action {
        RetirementAction::Deprecate => {
            let fields = [
                ("lifecycle", "deprecated".to_string()),
                ("deprecated_on", yaml_string(decision_date)),
                ("retirement_reason", yaml_string(reason)),
            ];
            let mut content = set_frontmatter_fields(source_raw, &fields)?;
            if let Some(replacement) = replacement.as_deref() {
                content = set_frontmatter_fields(
                    &content,
                    &[("superseded_by", format!("[{}]", yaml_string(replacement)))],
                )?;
            }
            writes.insert(source_path.clone(), ("modify", "Mark deprecated", content));
            "The concept remains searchable and retrieval adds a lifecycle caveat.".to_string()
        }
        RetirementAction::Redirect => {
            let replacement = replacement.as_deref().expect("redirect replacement");
            let href = relative_href(source_id, replacement, "");
            let content = format!(
                "---\ntype: Redirect\ntitle: {}\nredirect_to: {}\nretired_on: {}\nretirement_reason: {}\n---\n\nThis concept retired in favor of [{}]({href}).\n",
                yaml_string(&format!("{} retired", source.title)),
                yaml_string(replacement),
                yaml_string(decision_date),
                yaml_string(reason),
                source.title,
            );
            writes.insert(
                source_path.clone(),
                ("modify", "Keep portable redirect", content),
            );
            "Retrieval follows rewritten links to the replacement; the old identity remains an explicit redirect.".to_string()
        }
        RetirementAction::Tombstone => {
            let content = format!(
                "---\ntype: Tombstone\ntitle: {}\nlifecycle: retired\nretired_on: {}\nretirement_reason: {}{}\n---\n\nThe former concept is intentionally unavailable. Its identity remains so inbound links explain the retirement.\n",
                yaml_string(&format!("{} retired", source.title)),
                yaml_string(decision_date),
                yaml_string(reason),
                replacement_field,
            );
            writes.insert(
                source_path.clone(),
                ("modify", "Keep retirement tombstone", content),
            );
            "Retrieval sees only the retirement explanation, not the former claims.".to_string()
        }
        RetirementAction::Delete => {
            writes.insert(
                source_path.clone(),
                ("delete", "Delete concept file", String::new()),
            );
            "The concept leaves the active bundle; rewritten links use the replacement when one was selected.".to_string()
        }
    };

    let action_label = match action {
        RetirementAction::Deprecate => "Deprecated",
        RetirementAction::Redirect => "Redirected",
        RetirementAction::Tombstone => "Tombstoned",
        RetirementAction::Delete => "Deleted",
    };
    let log = append_retirement_log(
        markdown.get("log.md").map(String::as_str),
        decision_date,
        action_label,
        source_id,
        replacement.as_deref(),
        reason,
    );
    writes.insert(
        "log.md".to_string(),
        (
            if markdown.contains_key("log.md") {
                "modify"
            } else {
                "create"
            },
            "Record retirement decision",
            log,
        ),
    );

    let mut warnings = Vec::new();
    if source.extra.contains_key("relationships") {
        warnings.push(
            "Typed relationship annotations may still name this concept; inspect profile findings after Apply."
                .to_string(),
        );
    }
    let changes = writes
        .into_iter()
        .map(|(path, (kind, reason, content))| ConceptMoveChange {
            path,
            kind,
            reason,
            content,
        })
        .collect();
    Ok(ConceptRetirementPlan {
        schema_version: 1,
        source_id: source_id.to_string(),
        action,
        replacement_id: replacement,
        affected_links,
        affected_indexes: affected_indexes.len(),
        retrieval_consequence,
        warnings,
        changes,
    })
}

fn is_iso_day(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| matches!(index, 4 | 7) || character.is_ascii_digit())
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn set_frontmatter_fields(raw: &str, fields: &[(&str, String)]) -> Result<String, String> {
    if !raw.starts_with("---\n") {
        return Err("The concept has no editable YAML frontmatter.".to_string());
    }
    let end = raw[4..]
        .find("\n---")
        .map(|offset| offset + 4)
        .ok_or_else(|| "The concept frontmatter is not closed.".to_string())?;
    let frontmatter = &raw[4..end];
    let keys = fields.iter().map(|(key, _)| *key).collect::<HashSet<_>>();
    let mut next = frontmatter
        .lines()
        .filter(|line| {
            let Some((key, _)) = line.split_once(':') else {
                return true;
            };
            let top_level = line
                .chars()
                .next()
                .is_some_and(|character| !character.is_whitespace());
            !top_level || !keys.contains(key.trim())
        })
        .collect::<Vec<_>>()
        .join("\n");
    if !next.is_empty() {
        next.push('\n');
    }
    for (key, value) in fields {
        next.push_str(&format!("{key}: {value}\n"));
    }
    Ok(format!("---\n{next}{}", &raw[end..]))
}

fn append_retirement_log(
    current: Option<&str>,
    date: &str,
    action: &str,
    source_id: &str,
    replacement: Option<&str>,
    reason: &str,
) -> String {
    let replacement = replacement
        .map(|value| format!(" Replacement: `{value}`."))
        .unwrap_or_default();
    let entry = format!("* **Retirement**: {action} `{source_id}`. Reason: {reason}.{replacement}");
    let current = current.unwrap_or("# Update Log\n");
    if let Some(position) = current.find(&format!("## {date}")) {
        let insert = current[position..]
            .find('\n')
            .map(|offset| position + offset + 1)
            .unwrap_or(current.len());
        return format!("{}\n{entry}\n{}", &current[..insert], &current[insert..]);
    }
    let heading_end = current
        .find('\n')
        .map_or(current.len(), |position| position + 1);
    format!(
        "{}\n## {date}\n\n{entry}\n{}",
        &current[..heading_end],
        &current[heading_end..]
    )
}

/// Plan a portable move that leaves an explicit redirect at the old path.
///
/// Every parser-confirmed Markdown link that resolves to the source is
/// rewritten to the destination. Relative outgoing links in the moved concept
/// are rebased from its new directory. Reference definitions are edited at
/// their definition, so every use keeps working without duplicated changes.
pub fn plan_concept_move(
    bundle: &Bundle,
    markdown: &BTreeMap<String, String>,
    source_id: &str,
    destination_path: &str,
) -> Result<ConceptMovePlan, String> {
    if markdown.len() > MAX_MOVE_FILES {
        return Err(format!(
            "Move planning is limited to {MAX_MOVE_FILES} Markdown files."
        ));
    }
    let source = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == source_id)
        .ok_or_else(|| "The source concept is no longer available.".to_string())?;
    let source_path = format!("{source_id}.md");
    let source_raw = markdown
        .get(&source_path)
        .ok_or_else(|| "The source concept file is no longer available.".to_string())?;
    let destination_path = portable_concept_path(destination_path)?;
    let destination_id = destination_path
        .strip_suffix(".md")
        .expect("portable concept paths end in .md")
        .to_string();
    if destination_path == source_path {
        return Err("Choose a different path for the moved concept.".to_string());
    }
    if destination_path.eq_ignore_ascii_case(&source_path) {
        return Err(
            "A case-only move cannot keep a portable redirect at the old path. Choose a path with a different spelling."
                .to_string(),
        );
    }
    if markdown
        .keys()
        .any(|path| path != &source_path && path.eq_ignore_ascii_case(&destination_path))
    {
        return Err("A bundle file already uses that destination path.".to_string());
    }
    if bundle
        .concepts
        .iter()
        .any(|concept| concept.id != source_id && concept.id.eq_ignore_ascii_case(&destination_id))
    {
        return Err("A concept already uses that destination identity.".to_string());
    }

    let known_ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<HashSet<_>>();
    let mut writes = BTreeMap::<String, (&'static str, &'static str, String)>::new();
    let mut affected_links = 0usize;
    let mut affected_indexes = BTreeSet::new();

    for (path, raw) in markdown {
        if path == &source_path {
            continue;
        }
        let context_id = path
            .strip_suffix(".md")
            .ok_or_else(|| "Move planning received a non-Markdown file.".to_string())?;
        let (rewritten, replacements) = rewrite_raw_links(raw, context_id, |target, fragment| {
            (target == source_id).then(|| relative_href(context_id, &destination_id, fragment))
        })?;
        if replacements > 0 {
            affected_links += replacements;
            if path.ends_with("index.md") {
                affected_indexes.insert(path.clone());
            }
            writes.insert(
                path.clone(),
                (
                    "modify",
                    if path.ends_with("index.md") {
                        "Update navigation"
                    } else {
                        "Update inbound links"
                    },
                    rewritten,
                ),
            );
        }
    }

    let (moved, rebased_links) = rewrite_raw_links(source_raw, source_id, |target, fragment| {
        let mapped = if target == source_id {
            destination_id.as_str()
        } else {
            target
        };
        known_ids
            .contains(target)
            .then(|| relative_href(&destination_id, mapped, fragment))
    })?;
    affected_links += rebased_links;
    writes.insert(
        destination_path.clone(),
        ("create", "Create destination", moved),
    );

    let redirect_target = relative_href(source_id, &destination_id, "");
    let title = serde_json::to_string(&format!("{} moved", source.title))
        .map_err(|_| "The redirect title could not be encoded.".to_string())?;
    let redirect_to = serde_json::to_string(&destination_id)
        .map_err(|_| "The redirect target could not be encoded.".to_string())?;
    let redirect = format!(
        "---\ntype: Redirect\ntitle: {title}\nredirect_to: {redirect_to}\n---\n\nThis concept moved to [{}]({redirect_target}).\n",
        source.title,
    );
    writes.insert(
        source_path.clone(),
        ("modify", "Keep portable redirect", redirect),
    );

    let stable_id = source
        .extra
        .get("stable_id")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty() && value.chars().count() <= 256)
        .map(str::to_string);
    let mut warnings = Vec::new();
    if stable_id.is_none() {
        warnings.push(
            "This concept has no bounded stable_id extension. Links can move safely, but external path-independent identity is unavailable."
                .to_string(),
        );
    } else if bundle.concepts.iter().any(|concept| {
        concept.id != source_id
            && concept
                .extra
                .get("stable_id")
                .and_then(serde_json::Value::as_str)
                == stable_id.as_deref()
    }) {
        warnings.push(
            "Another concept declares the same stable_id. Resolve that ambiguity before relying on path-independent identity."
                .to_string(),
        );
    }

    let changes = writes
        .into_iter()
        .map(|(path, (kind, reason, content))| ConceptMoveChange {
            path,
            kind,
            reason,
            content,
        })
        .collect();
    Ok(ConceptMovePlan {
        schema_version: 1,
        source_id: source_id.to_string(),
        destination_id,
        stable_id,
        affected_links,
        affected_indexes: affected_indexes.len(),
        warnings,
        changes,
    })
}

fn portable_concept_path(value: &str) -> Result<String, String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.ends_with('/')
        || normalized.chars().count() > MAX_PATH_CHARS
        || normalized.chars().any(char::is_control)
    {
        return Err("The destination must be a bounded bundle-relative Markdown path.".to_string());
    }
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || matches!(part, "." | "..") {
            return Err(
                "The destination may not contain empty, current, or parent segments.".to_string(),
            );
        }
        parts.push(part);
    }
    let path = parts.join("/");
    if !path.to_ascii_lowercase().ends_with(".md")
        || path
            .rsplit('/')
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case("index.md"))
    {
        return Err("The destination must name a concept .md file, not index.md.".to_string());
    }
    Ok(path)
}

fn rewrite_raw_links<F>(
    raw: &str,
    context_id: &str,
    mut replacement: F,
) -> Result<(String, usize), String>
where
    F: FnMut(&str, &str) -> Option<String>,
{
    let (_, body) = frontmatter::split(raw);
    let prefix_len = raw.len().saturating_sub(body.len());
    let mut ranges = Vec::<(Range<usize>, String)>::new();
    let parser = Parser::new_ext(body, Options::ENABLE_FOOTNOTES);

    for (_, definition) in parser.reference_definitions().iter() {
        let href = definition.dest.as_ref();
        if let Some((target, fragment)) = resolved_target(href, context_id) {
            if let Some(next) = replacement(&target, fragment) {
                let range = destination_span(body, &definition.span, href).ok_or_else(|| {
                    "A Markdown reference definition could not be rewritten safely.".to_string()
                })?;
                ranges.push((range, next));
            }
        }
    }

    for (event, source_range) in parser.into_offset_iter() {
        let Event::Start(Tag::Link {
            link_type,
            dest_url,
            ..
        }) = event
        else {
            continue;
        };
        if !matches!(link_type, LinkType::Inline | LinkType::Autolink) {
            continue;
        }
        let href = dest_url.as_ref();
        let Some((target, fragment)) = resolved_target(href, context_id) else {
            continue;
        };
        let Some(next) = replacement(&target, fragment) else {
            continue;
        };
        let range = destination_span(body, &source_range, href)
            .ok_or_else(|| "An inline Markdown link could not be rewritten safely.".to_string())?;
        ranges.push((range, next));
    }

    ranges.sort_by_key(|item| std::cmp::Reverse(item.0.start));
    ranges.dedup_by(|left, right| left.0 == right.0);
    let count = ranges.len();
    let mut rewritten = body.to_string();
    for (range, value) in ranges {
        rewritten.replace_range(range, &value);
    }
    Ok((format!("{}{}", &raw[..prefix_len], rewritten), count))
}

fn resolved_target<'a>(href: &'a str, context_id: &str) -> Option<(String, &'a str)> {
    if links::is_external(href) {
        return None;
    }
    let (path, fragment) = href.split_once('#').map_or((href, ""), |parts| parts);
    if !path.to_ascii_lowercase().ends_with(".md") {
        return None;
    }
    links::resolve(path, context_id).map(|target| (target, fragment))
}

fn destination_span(body: &str, source_range: &Range<usize>, href: &str) -> Option<Range<usize>> {
    let source = body.get(source_range.clone())?;
    let offset = source.find(href)?;
    let start = source_range.start.checked_add(offset)?;
    Some(start..start.checked_add(href.len())?)
}

fn relative_href(from_id: &str, target_id: &str, fragment: &str) -> String {
    let from_dir = from_id
        .rsplit_once('/')
        .map_or("", |(directory, _)| directory);
    let from = from_dir
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let target = target_id.split('/').collect::<Vec<_>>();
    let common = from
        .iter()
        .zip(&target)
        .take_while(|(left, right)| left == right)
        .count();
    let mut parts = vec![".."; from.len().saturating_sub(common)];
    parts.extend(target[common..].iter().copied());
    let path = if parts.is_empty() {
        target
            .last()
            .map_or_else(|| "concept".to_string(), |value| (*value).to_string())
    } else {
        parts.join("/")
    };
    let encoded = path
        .split('/')
        .map(encode_path_segment)
        .collect::<Vec<_>>()
        .join("/");
    if fragment.is_empty() {
        format!("{encoded}.md")
    } else {
        format!("{encoded}.md#{fragment}")
    }
}

fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(*byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::read_bundle;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_path(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("okf-maintenance-{label}-{nonce}"))
    }

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let root = fixture_path("move");
            fs::create_dir_all(root.join("guides")).expect("fixture directories");
            fs::write(
                root.join("index.md"),
                "# Fixture\n\n- [Start](guides/My%20Guide.md)\n",
            )
            .expect("root index");
            fs::write(
                root.join("guides/index.md"),
                "# Guides\n\n- [Start][start]\n\n[start]: <My%20Guide.md>\n",
            )
            .expect("nested index");
            fs::write(
                root.join("guides/My Guide.md"),
                "---\ntype: Guide\nstable_id: guide-start\n---\n# Start\n\n[Related](../related.md#detail)\n",
            )
            .expect("source");
            fs::write(
                root.join("related.md"),
                "---\ntype: Note\n---\n# Related\n\n[Start](guides/My%20Guide.md)\n",
            )
            .expect("related");
            Self(root)
        }

        fn markdown(&self) -> BTreeMap<String, String> {
            [
                "index.md",
                "guides/index.md",
                "guides/My Guide.md",
                "related.md",
            ]
            .into_iter()
            .map(|path| {
                (
                    path.to_string(),
                    fs::read_to_string(self.0.join(path)).expect("fixture source"),
                )
            })
            .collect()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn plans_utf8_move_with_inbound_outbound_reference_and_index_repairs() {
        let fixture = Fixture::new();
        let bundle = read_bundle(&fixture.0);
        let plan = plan_concept_move(
            &bundle,
            &fixture.markdown(),
            "guides/My Guide",
            "manuals/Démarrage.md",
        )
        .expect("move plan");

        assert_eq!(plan.destination_id, "manuals/Démarrage");
        assert_eq!(plan.stable_id.as_deref(), Some("guide-start"));
        assert_eq!(plan.affected_links, 4);
        assert_eq!(plan.affected_indexes, 2);
        assert!(plan.warnings.is_empty());
        let destination = plan
            .changes
            .iter()
            .find(|change| change.path == "manuals/Démarrage.md")
            .expect("destination");
        assert!(destination.content.contains("../related.md#detail"));
        let root_index = plan
            .changes
            .iter()
            .find(|change| change.path == "index.md")
            .expect("root index");
        assert!(root_index.content.contains("manuals/D%C3%A9marrage.md"));
        let nested_index = plan
            .changes
            .iter()
            .find(|change| change.path == "guides/index.md")
            .expect("nested index");
        assert!(nested_index
            .content
            .contains("[start]: <../manuals/D%C3%A9marrage.md>"));
        let redirect = plan
            .changes
            .iter()
            .find(|change| change.path == "guides/My Guide.md")
            .expect("redirect");
        assert!(redirect.content.contains("type: Redirect"));
        assert!(redirect.content.contains("../manuals/D%C3%A9marrage.md"));
    }

    #[test]
    fn handles_collisions_case_changes_traversal_and_missing_identity() {
        let fixture = Fixture::new();
        let bundle = read_bundle(&fixture.0);
        let markdown = fixture.markdown();
        for (destination, expected) in [
            ("related.md", "already uses"),
            ("guides/my guide.md", "case-only"),
            ("../escape.md", "parent"),
            ("index.md", "not index"),
        ] {
            let error = plan_concept_move(&bundle, &markdown, "guides/My Guide", destination)
                .expect_err("unsafe destination");
            assert!(error.contains(expected), "{destination}: {error}");
        }

        let mut without_id = markdown;
        without_id.insert(
            "guides/My Guide.md".to_string(),
            "---\ntype: Guide\n---\n# Start\n".to_string(),
        );
        let changed_bundle = {
            let root = fixture_path("no-id");
            fs::create_dir_all(root.join("guides")).expect("directory");
            for (path, content) in &without_id {
                let target = root.join(path);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).expect("parent");
                }
                fs::write(target, content).expect("source");
            }
            let bundle = read_bundle(&root);
            let _ = fs::remove_dir_all(root);
            bundle
        };
        let plan = plan_concept_move(
            &changed_bundle,
            &without_id,
            "guides/My Guide",
            "manual/start.md",
        )
        .expect("move without identity");
        assert!(plan.stable_id.is_none());
        assert_eq!(plan.warnings.len(), 1);
    }

    #[test]
    fn plans_each_retirement_choice_with_impact_and_log() {
        let fixture = Fixture::new();
        let bundle = read_bundle(&fixture.0);
        let markdown = fixture.markdown();

        let deprecated = plan_concept_retirement(
            &bundle,
            &markdown,
            "guides/My Guide",
            RetirementAction::Deprecate,
            Some("related"),
            "The related note replaces this guide",
            "2026-07-23",
        )
        .expect("deprecation plan");
        let source = deprecated
            .changes
            .iter()
            .find(|change| change.path == "guides/My Guide.md")
            .expect("deprecated source");
        assert!(source.content.contains("lifecycle: deprecated"));
        assert!(source.content.contains("superseded_by: [\"related\"]"));
        assert!(deprecated
            .changes
            .iter()
            .any(|change| change.path == "log.md"));

        let redirected = plan_concept_retirement(
            &bundle,
            &markdown,
            "guides/My Guide",
            RetirementAction::Redirect,
            Some("related"),
            "The guide was consolidated",
            "2026-07-23",
        )
        .expect("redirect plan");
        assert!(redirected.affected_links >= 3);
        assert!(redirected
            .changes
            .iter()
            .find(|change| change.path == "guides/My Guide.md")
            .is_some_and(|change| change.content.contains("type: Redirect")));

        let tombstone = plan_concept_retirement(
            &bundle,
            &markdown,
            "guides/My Guide",
            RetirementAction::Tombstone,
            None,
            "The guidance is no longer safe",
            "2026-07-23",
        )
        .expect("tombstone plan");
        assert!(tombstone
            .changes
            .iter()
            .any(|change| change.reason == "Keep retirement tombstone"));

        let deleted = plan_concept_retirement(
            &bundle,
            &markdown,
            "guides/My Guide",
            RetirementAction::Delete,
            Some("related"),
            "The replacement is authoritative",
            "2026-07-23",
        )
        .expect("delete plan");
        assert!(deleted.changes.iter().any(|change| change.kind == "delete"));
        assert!(plan_concept_retirement(
            &bundle,
            &markdown,
            "guides/My Guide",
            RetirementAction::Delete,
            None,
            "No replacement exists",
            "2026-07-23",
        )
        .is_err());
    }
}
