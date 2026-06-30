//! The data model shared across the IPC boundary, serialized to camelCase JSON
//! for the React + TypeScript frontend. Mirrors `docs/architecture/data-model.md`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A detected bundle root, as listed by the Bundle Browser before a full parse.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleRoot {
    /// Absolute path of the bundle root.
    pub root: String,
    /// Display name (root index.md H1, else directory name).
    pub name: String,
    /// Path relative to the chosen folder (for display).
    pub rel_path: String,
    pub okf_version: Option<String>,
    pub confidence: Confidence,
    pub concept_count: u32,
    /// Distinct `type` values present, sorted.
    pub types: Vec<String>,
}

/// A fully parsed bundle: concepts, navigation, log, and validation results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub root: String,
    pub name: String,
    pub okf_version: Option<String>,
    pub concepts: Vec<Concept>,
    pub indexes: Vec<IndexNode>,
    pub log: Vec<LogEntry>,
    pub issues: Vec<Issue>,
    pub confidence: Confidence,
}

/// One unit of knowledge: a non-reserved `.md` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Concept {
    /// Path minus `.md`, relative to root, e.g. `tables/orders`.
    pub id: String,
    /// Required by OKF; empty only on a non-conformant concept.
    #[serde(rename = "type")]
    pub concept_type: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub timestamp: Option<String>,
    pub resource: Option<String>,
    /// Any other frontmatter keys, preserved (the OKF extension contract).
    pub extra: BTreeMap<String, serde_json::Value>,
    /// Raw markdown body (rendered in the frontend).
    pub body: String,
    /// Resolved intra-bundle target Concept IDs.
    pub links: Vec<String>,
    /// http(s)/mailto targets.
    pub external_links: Vec<String>,
    /// Intra-bundle hrefs that resolve to no concept.
    pub broken_links: Vec<String>,
    /// Reverse of links (backlinks).
    pub cited_by: Vec<String>,
    /// links.len() + cited_by.len(), for node sizing.
    pub degree: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Confident,
    Candidate,
}

/// Parsed (or synthesized) index.md, one per directory, mirroring the tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexNode {
    /// Directory path relative to root ("" = bundle root).
    pub dir: String,
    pub title: String,
    /// True if no index.md existed and the core built one.
    pub synthesized: bool,
    pub sections: Vec<IndexSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexSection {
    pub heading: String,
    pub entries: Vec<IndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    pub title: String,
    /// Concept ID, or a subdirectory path for a directory entry.
    pub target: String,
    pub description: String,
    pub kind: EntryKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Concept,
    Directory,
}

/// One date-grouped block of a parsed log.md, in file order (newest first).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    /// The "## " heading verbatim, even if not ISO YYYY-MM-DD.
    pub date: String,
    /// The bullet lines under that date, as raw markdown.
    pub entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub concept_id: Option<String>,
    pub level: IssueLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueLevel {
    Error,
    Warning,
}
