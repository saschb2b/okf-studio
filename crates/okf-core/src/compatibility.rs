//! Deterministic compatibility diagnostics for tolerant OKF bundles.
//!
//! The report keeps core conformance separate from portability advice and
//! extension-preservation information. It never rejects a bundle or edits a
//! file. Callers may present the bounded findings or stage a declared repair
//! through the native reviewed-write boundary.

use crate::links;
use crate::model::{Bundle, Issue, IssueLevel};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MAX_FINDINGS: usize = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityCategory {
    Parser,
    Link,
    Index,
    Extension,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityLevel {
    Error,
    Warning,
    Advice,
    Information,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityBasis {
    OkfConformance,
    Portability,
    Preservation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityRepair {
    pub kind: String,
    pub authored: String,
    pub replacement: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityFinding {
    pub rule_id: String,
    pub category: CompatibilityCategory,
    pub level: CompatibilityLevel,
    pub basis: CompatibilityBasis,
    pub file: String,
    pub concept_id: Option<String>,
    pub message: String,
    pub repair: Option<CompatibilityRepair>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub schema_version: u32,
    pub findings: Vec<CompatibilityFinding>,
    pub truncated: bool,
}

impl CompatibilityReport {
    pub fn count(&self, category: CompatibilityCategory) -> usize {
        self.findings
            .iter()
            .filter(|finding| finding.category == category)
            .count()
    }
}

pub fn analyze(bundle: &Bundle) -> CompatibilityReport {
    let mut findings = bundle
        .issues
        .iter()
        .map(finding_from_issue)
        .collect::<Vec<_>>();
    let ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.clone())
        .collect::<HashSet<_>>();

    for index in bundle.indexes.iter().filter(|index| index.synthesized) {
        let file = if index.dir.is_empty() {
            "index.md".to_string()
        } else {
            format!("{}/index.md", index.dir)
        };
        findings.push(CompatibilityFinding {
            rule_id: "okf.portability.index-missing".to_string(),
            category: CompatibilityCategory::Index,
            level: CompatibilityLevel::Advice,
            basis: CompatibilityBasis::Portability,
            file,
            concept_id: None,
            message: "Studio synthesized this navigation index; other consumers may not present the same structure.".to_string(),
            repair: None,
        });
    }

    for concept in &bundle.concepts {
        let file = format!("{}.md", concept.id);
        let mut seen_portable_links = HashSet::new();
        for href in links::targets(&concept.body) {
            if !href.starts_with('/') || !seen_portable_links.insert(href.clone()) {
                continue;
            }
            let without_anchor = href.split('#').next().unwrap_or(&href);
            let Some(target) = links::resolve(without_anchor, &concept.id) else {
                continue;
            };
            if !ids.contains(&target) {
                continue;
            }
            let replacement = relative_target(&concept.id, &href);
            findings.push(CompatibilityFinding {
                rule_id: "okf.portability.relative-link".to_string(),
                category: CompatibilityCategory::Link,
                level: CompatibilityLevel::Advice,
                basis: CompatibilityBasis::Portability,
                file: file.clone(),
                concept_id: Some(concept.id.clone()),
                message: format!(
                    "Bundle-absolute link {href} resolves in Studio but a relative target travels more reliably between OKF consumers."
                ),
                repair: Some(CompatibilityRepair {
                    kind: "replace-markdown-target".to_string(),
                    authored: href,
                    replacement,
                }),
            });
        }

        if !concept.extra.is_empty() {
            let keys = concept.extra.keys().cloned().collect::<Vec<_>>().join(", ");
            findings.push(CompatibilityFinding {
                rule_id: "okf.extensions.preserved".to_string(),
                category: CompatibilityCategory::Extension,
                level: CompatibilityLevel::Information,
                basis: CompatibilityBasis::Preservation,
                file: file.clone(),
                concept_id: Some(concept.id.clone()),
                message: format!("Studio preserved producer-defined frontmatter: {keys}."),
                repair: None,
            });
        }
    }

    findings.sort_by(|left, right| {
        category_rank(left.category)
            .cmp(&category_rank(right.category))
            .then_with(|| level_rank(left.level).cmp(&level_rank(right.level)))
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.rule_id.cmp(&right.rule_id))
            .then_with(|| left.message.cmp(&right.message))
    });
    let truncated = findings.len() > MAX_FINDINGS;
    findings.truncate(MAX_FINDINGS);

    CompatibilityReport {
        schema_version: 1,
        findings,
        truncated,
    }
}

fn finding_from_issue(issue: &Issue) -> CompatibilityFinding {
    let message = issue.message.clone();
    let file = message
        .split_once(':')
        .map(|(file, _)| file.to_string())
        .or_else(|| issue.concept_id.as_ref().map(|id| format!("{id}.md")))
        .unwrap_or_else(|| "bundle".to_string());
    let (rule_id, category) = if message.contains("link target not found") {
        ("okf.conformance.link-target", CompatibilityCategory::Link)
    } else if message.contains("index.md") {
        (
            "okf.conformance.index-frontmatter",
            CompatibilityCategory::Index,
        )
    } else if message.contains("log heading") {
        ("okf.conformance.log-date", CompatibilityCategory::Parser)
    } else if message.contains("frontmatter") || message.contains("'type'") {
        (
            "okf.conformance.concept-frontmatter",
            CompatibilityCategory::Parser,
        )
    } else {
        ("okf.conformance.parser", CompatibilityCategory::Parser)
    };

    CompatibilityFinding {
        rule_id: rule_id.to_string(),
        category,
        level: match issue.level {
            IssueLevel::Error => CompatibilityLevel::Error,
            IssueLevel::Warning => CompatibilityLevel::Warning,
        },
        basis: CompatibilityBasis::OkfConformance,
        file,
        concept_id: issue.concept_id.clone(),
        message,
        repair: None,
    }
}

fn relative_target(concept_id: &str, authored: &str) -> String {
    let (path, fragment) = authored
        .split_once('#')
        .map_or((authored, ""), |(path, fragment)| (path, fragment));
    let target = path.trim_start_matches('/');
    let depth = concept_id.matches('/').count();
    let prefix = "../".repeat(depth);
    if fragment.is_empty() {
        format!("{prefix}{target}")
    } else {
        format!("{prefix}{target}#{fragment}")
    }
}

fn category_rank(category: CompatibilityCategory) -> u8 {
    match category {
        CompatibilityCategory::Parser => 0,
        CompatibilityCategory::Link => 1,
        CompatibilityCategory::Index => 2,
        CompatibilityCategory::Extension => 3,
    }
}

fn level_rank(level: CompatibilityLevel) -> u8 {
    match level {
        CompatibilityLevel::Error => 0,
        CompatibilityLevel::Warning => 1,
        CompatibilityLevel::Advice => 2,
        CompatibilityLevel::Information => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::read_bundle;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("okf-compatibility-{nonce}"));
            fs::create_dir_all(path.join("nested")).expect("fixture directories");
            Self(path)
        }

        fn write(&self, path: &str, contents: &str) {
            fs::write(self.0.join(path), contents).expect("fixture file");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn groups_conformance_portability_and_preserved_extensions() {
        let fixture = Fixture::new();
        fixture.write("index.md", "# Fixture\n");
        fixture.write(
            "target.md",
            "---\ntype: Reference\ntitle: Target\n---\n\nTarget.\n",
        );
        fixture.write(
            "nested/source.md",
            "---\ntitle: Source\nproducer:\n  reviewed: true\n---\n\n[Target](/target.md#detail) [Missing](missing.md)\n",
        );

        let report = analyze(&read_bundle(&fixture.0));
        assert_eq!(report.schema_version, 1);
        assert!(!report.truncated);
        assert_eq!(report.count(CompatibilityCategory::Parser), 1);
        assert_eq!(report.count(CompatibilityCategory::Link), 2);
        assert_eq!(report.count(CompatibilityCategory::Index), 1);
        assert_eq!(report.count(CompatibilityCategory::Extension), 1);

        let portable = report
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.portability.relative-link")
            .expect("portable link finding");
        assert_eq!(portable.file, "nested/source.md");
        assert_eq!(portable.basis, CompatibilityBasis::Portability);
        assert_eq!(
            portable.repair.as_ref().expect("safe repair").replacement,
            "../target.md#detail"
        );

        let extension = report
            .findings
            .iter()
            .find(|finding| finding.category == CompatibilityCategory::Extension)
            .expect("extension finding");
        assert_eq!(extension.file, "nested/source.md");
        assert!(extension.message.contains("producer"));
    }
}
