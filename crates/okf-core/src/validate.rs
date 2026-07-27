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
    let ignore = crate::ignore::IgnoreMatcher::load(root);

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
                // 1b. OKF v0.2 provenance, trust, lifecycle and computation
                //     contracts. Every one of these is a warning: v0.2 states
                //     that `type` is the only always-required key, so a bundle
                //     that declares none of this is still conformant. The value
                //     is in reporting a field that is *present and wrong*, which
                //     is the case a consumer silently mis-reads.
                issues.extend(v02_issues(concept, &fm));
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
        .filter(|e| !ignore.is_ignored(e.path(), false))
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

/// Every OKF v0.2 check for one concept.
///
/// Reads the raw frontmatter alongside the parsed concept because the model
/// cannot distinguish "absent" from "present but unreadable": a `generated:`
/// block missing its required `by` parses to `None`, which looks exactly like a
/// concept that declared no provenance at all. The difference is the whole point
/// of reporting it.
fn v02_issues(concept: &Concept, fm: &frontmatter::ParsedFrontmatter) -> Vec<Issue> {
    let mut issues = Vec::new();
    let id = &concept.id;
    let warn = |message: String| warning(Some(id), message);

    // `generated.by` is REQUIRED within `generated`.
    if fm.value("generated").is_some() && concept.generated.is_none() {
        issues.push(warn(format!(
            "{id}.md: 'generated' has no 'by' actor, so its provenance cannot be read"
        )));
    }
    // Same for each verification event.
    let declared_verifications = fm.entries("verified").len();
    if declared_verifications > concept.verified.len() {
        issues.push(warn(format!(
            "{id}.md: {} of {declared_verifications} 'verified' entries have no 'by' actor",
            declared_verifications - concept.verified.len()
        )));
    }

    // The actor convention is what trust classification keys off, so an actor
    // that matches none of the three forms silently lowers the tier.
    for (field, actor) in concept
        .generated
        .iter()
        .map(|generated| ("generated.by", generated.by.as_str()))
        .chain(
            concept
                .verified
                .iter()
                .map(|verified| ("verified.by", verified.by.as_str())),
        )
        .chain(
            concept
                .sources
                .iter()
                .filter_map(|source| source.author.as_deref().map(|author| ("sources.author", author))),
        )
    {
        if !is_actor(actor) {
            issues.push(warn(format!(
                "{id}.md: {field} \"{actor}\" is not an actor \
                 (<producer>/<version>, human:<id>, or process:<id>)"
            )));
        }
    }

    if let Some(status) = fm.scalar("status") {
        let status = status.trim();
        // `experimental` is ODSF's, kept as a profile extension when OKF v0.2
        // claimed the key. Warning about it would nag every design-system
        // component that legitimately uses it.
        if !matches!(status, "draft" | "stable" | "deprecated" | "experimental") {
            issues.push(warn(format!(
                "{id}.md: status \"{status}\" is not draft, stable, deprecated,                  or ODSF's experimental"
            )));
        }
    }

    // Staleness is a plain date comparison, so a non-date is not comparable and
    // the concept never goes stale — the field reads as a promise it cannot keep.
    if let Some(stale_after) = concept.stale_after.as_deref() {
        if !is_iso_date(stale_after.trim()) {
            issues.push(warn(format!(
                "{id}.md: stale_after \"{stale_after}\" is not an absolute YYYY-MM-DD date"
            )));
        }
    }

    // `resource` is REQUIRED within a source entry, and an entry without one is
    // dropped by the parser rather than invented, so it would vanish silently.
    let declared_sources = fm.entries("sources").len();
    if declared_sources > concept.sources.len() {
        issues.push(warn(format!(
            "{id}.md: {} of {declared_sources} 'sources' entries have no 'resource'",
            declared_sources - concept.sources.len()
        )));
    }

    // A usage count with nothing to frame it is a number without a period.
    if concept.usage_window.is_none()
        && concept
            .sources
            .iter()
            .any(|source| source.usage_count.is_some())
    {
        issues.push(warn(format!(
            "{id}.md: a source declares usage_count with no usage_window to frame it"
        )));
    }

    // A footnote label is a join key into `sources`, so one that matches no entry
    // leaves a claim reading as attributed when it is not.
    //
    // Only checked once the concept declares sources. A footnote is also just
    // markdown, and a document with no sources is using it that way — Studio's
    // own v0.1 docs cite `[^1]` and `[^report]` as ordinary footnotes, and
    // warning about those turned the validation panel into advice about a
    // mechanism the bundle had not adopted.
    if !concept.sources.is_empty() {
        for label in footnote_labels(&concept.body) {
            if concept.source_by_id(&label).is_none() {
                issues.push(warn(format!(
                    "{id}.md: footnote [^{label}] matches no source id, so the claim is unattributed"
                )));
            }
        }
    }

    if concept.is_attested_computation() {
        issues.extend(computation_issues(concept, fm));
    }
    issues
}

/// Contract checks for a `type: Attested Computation` concept.
fn computation_issues(concept: &Concept, fm: &frontmatter::ParsedFrontmatter) -> Vec<Issue> {
    let mut issues = Vec::new();
    let id = &concept.id;
    let warn = |message: String| warning(Some(id), message);
    let Some(contract) = concept.computation.as_ref() else {
        return issues;
    };

    if contract.runtime.is_empty() {
        issues.push(warn(format!(
            "{id}.md: an Attested Computation must declare 'runtime', \
             which decides how the computation, parameters and receipt are read"
        )));
    }

    let has_inline = has_computation_fence(&concept.body);
    match (contract.computation.is_some(), has_inline) {
        (true, true) => issues.push(warn(format!(
            "{id}.md: the computation is supplied both inline and by path; \
             which one a run used would be a guess"
        ))),
        (false, false) => issues.push(warn(format!(
            "{id}.md: an Attested Computation supplies its computation \
             inline under '# Computation' or by a 'computation' path, and has neither"
        ))),
        _ => {}
    }

    // Without a receipt shape an attester has nothing to inspect, and without an
    // attester nothing turns a receipt into a verdict — either way the contract
    // cannot gate anything, which is its only purpose.
    if contract
        .executor
        .as_ref()
        .is_none_or(|executor| executor.receipt.is_empty())
    {
        issues.push(warn(format!(
            "{id}.md: no executor receipt fields are declared, so a run returns no evidence to attest"
        )));
    }
    if contract
        .attester
        .as_ref()
        .and_then(|attester| attester.resource.as_deref())
        .is_none()
    {
        issues.push(warn(format!(
            "{id}.md: no attester resource is declared, so nothing turns a receipt into a verdict"
        )));
    }

    for parameter in &contract.parameters {
        if parameter.parameter_type.is_none() {
            issues.push(warn(format!(
                "{id}.md: parameter \"{}\" declares no type",
                parameter.name
            )));
        }
    }
    // A parameter list that lost its entries to a missing name would otherwise
    // look like a computation with no holes at all.
    let declared_parameters = fm.entries("parameters").len();
    if declared_parameters > contract.parameters.len() {
        issues.push(warn(format!(
            "{id}.md: {} of {declared_parameters} parameters have no 'name'",
            declared_parameters - contract.parameters.len()
        )));
    }
    issues
}

/// Whether a string matches one of the three actor forms (spec 7).
fn is_actor(actor: &str) -> bool {
    let actor = actor.trim();
    if actor.is_empty() {
        return false;
    }
    if let Some(id) = actor
        .strip_prefix("human:")
        .or_else(|| actor.strip_prefix("process:"))
    {
        return !id.trim().is_empty();
    }
    // `<producer>/<version>`: both halves must be there. A bare name carries no
    // version, which is what makes an agent attribution auditable.
    match actor.split_once('/') {
        Some((producer, version)) => !producer.trim().is_empty() && !version.trim().is_empty(),
        None => false,
    }
}

/// Footnote reference labels used in the body, excluding definition lines.
fn footnote_labels(body: &str) -> Vec<String> {
    let mut labels = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim_start();
        // `[^id]: text` defines a footnote rather than citing one.
        if trimmed.starts_with("[^") && trimmed.contains("]:") {
            continue;
        }
        let mut rest = line;
        while let Some(open) = rest.find("[^") {
            rest = &rest[open + 2..];
            let Some(close) = rest.find(']') else { break };
            let label = rest[..close].trim();
            if !label.is_empty() && !labels.iter().any(|seen| seen == label) {
                labels.push(label.to_string());
            }
            rest = &rest[close + 1..];
        }
    }
    labels
}

/// Whether the body has a fenced block under a `# Computation` heading.
fn has_computation_fence(body: &str) -> bool {
    let mut inside = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix('#') {
            inside = heading.trim_start_matches('#').trim().eq_ignore_ascii_case("computation");
            continue;
        }
        if inside && trimmed.starts_with("```") {
            return true;
        }
    }
    false
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
