//! Validation — the OKF conformance check, ported from `scripts/okf-validate.mjs`.
//!
//! Mirrors the CLI's rules exactly so the app's validation panel and the
//! canonical checker agree:
//!
//! Errors (the one hard rule):
//!   - a non-reserved `.md` with no frontmatter block → "missing frontmatter"
//!   - frontmatter with no `type` field, or an empty `type`
//!
//! Warnings (never fatal, tolerant-consumer contract):
//!   - a broken intra-bundle cross-link (per file)
//!   - a non-ISO `## ` date heading in `log.md`
//!   - an `index.md` carrying frontmatter, except the bundle-root `index.md`
//!   - a reserved filename used as a concept (handled implicitly: only
//!     `index.md`/`log.md` are reserved, and we report stray frontmatter)
//!
//! Each [`Issue`] carries the offending concept id (or `None`) plus level and
//! message. Never panics — unreadable files are skipped.

use crate::frontmatter;
use crate::model::{Concept, Issue, IssueLevel};
use std::path::Path;
use walkdir::WalkDir;

/// Run the full conformance check over a bundle root, using the already-parsed
/// `concepts` for broken-link reporting and re-reading reserved files directly.
pub fn validate(root: &Path, concepts: &[Concept]) -> Vec<Issue> {
    let mut issues = Vec::new();

    // 1. Per-concept hard rules: every concept file must have frontmatter and a
    //    non-empty type. We re-read the raw file to distinguish "no frontmatter
    //    block" from "frontmatter without a type"; the parsed concept alone
    //    cannot tell those apart (both leave concept_type empty).
    for concept in concepts {
        let path = root.join(format!("{}.md", concept.id));
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let (fm_src, _) = frontmatter::split(&text);
        match fm_src {
            None => issues.push(error(
                &concept.id,
                format!("{}.md: missing YAML frontmatter block", concept.id),
            )),
            Some(src) => {
                let fm = frontmatter::parse(src);
                match fm.scalar("type") {
                    None => issues.push(error(
                        &concept.id,
                        format!("{}.md: frontmatter has no 'type' field", concept.id),
                    )),
                    Some("") => issues.push(error(
                        &concept.id,
                        format!("{}.md: 'type' field is empty", concept.id),
                    )),
                    Some(_) => {}
                }
            }
        }

        // 2. Broken cross-links → one warning each (per file).
        for href in &concept.broken_links {
            issues.push(warning(
                Some(&concept.id),
                format!("{}.md: link target not found -> {}", concept.id, href),
            ));
        }
    }

    // 3. Reserved-file rules, walking the tree like the CLI does.
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !crate::parse::is_ignored_dir(e.path(), root))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
    {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let rel = rel_path(root, entry.path());

        if name == "index.md" {
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            let (fm_src, _) = frontmatter::split(&text);
            let is_root_index = rel == "index.md";
            if fm_src.is_some() && !is_root_index {
                issues.push(warning(
                    None,
                    format!(
                        "{rel}: index.md should carry no frontmatter (only the bundle-root index.md may)"
                    ),
                ));
            }
            if let (true, Some(src)) = (is_root_index, fm_src) {
                if frontmatter::parse(src).scalar("okf_version").is_none() {
                    issues.push(warning(
                        None,
                        format!(
                            "{rel}: root index.md has frontmatter but does not declare okf_version"
                        ),
                    ));
                }
            }
        } else if name == "log.md" {
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            for line in text.lines() {
                if let Some(date) = line.trim_start().strip_prefix("## ") {
                    let date = date.trim();
                    if !is_iso_date(date) {
                        issues.push(warning(
                            None,
                            format!("{rel}: log heading \"{date}\" is not ISO 8601 YYYY-MM-DD"),
                        ));
                    }
                }
            }
        }
    }

    issues
}

fn error(concept_id: &str, message: String) -> Issue {
    Issue {
        concept_id: Some(concept_id.to_string()),
        level: IssueLevel::Error,
        message,
    }
}

fn warning(concept_id: Option<&str>, message: String) -> Issue {
    Issue {
        concept_id: concept_id.map(str::to_string),
        level: IssueLevel::Warning,
        message,
    }
}

/// Path relative to `root`, forward-slashed; "." would mean the root itself.
fn rel_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Strict ISO `YYYY-MM-DD` shape check (mirrors the CLI's regex).
fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..10].iter().all(u8::is_ascii_digit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_date_shape() {
        assert!(is_iso_date("2026-06-28"));
        assert!(!is_iso_date("Yesterday"));
        assert!(!is_iso_date("2026-6-28"));
        assert!(!is_iso_date("2026-06-28T00:00"));
    }
}
