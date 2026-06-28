//! log.md parsing into dated entries (newest first).
//! TODO(okf-core agent): parse `## YYYY-MM-DD` headings and their bullet lines.

use crate::model::LogEntry;
use std::path::Path;

pub fn parse_log(_root: &Path) -> Vec<LogEntry> {
    Vec::new()
}
