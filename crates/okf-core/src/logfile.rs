//! `log.md` parsing into dated entries, in file order (newest first as written).
//!
//! Splits the root `log.md` on `## ` headings — the date is taken verbatim,
//! even when not ISO `YYYY-MM-DD` (validation warns separately). Each heading's
//! following non-empty lines are collected as raw-markdown entries.

use crate::model::LogEntry;
use std::path::Path;

/// Parse the root `log.md` if present, else an empty list.
pub fn parse_log(root: &Path) -> Vec<LogEntry> {
    let Ok(text) = std::fs::read_to_string(root.join("log.md")) else {
        return Vec::new();
    };
    parse_log_text(&text)
}

/// Parse log markdown text into dated [`LogEntry`] blocks, file order preserved.
pub fn parse_log_text(text: &str) -> Vec<LogEntry> {
    let mut entries: Vec<LogEntry> = Vec::new();
    let mut current: Option<LogEntry> = None;

    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if let Some(date) = line.trim_start().strip_prefix("## ") {
            // Start a new dated block, flushing the previous one.
            if let Some(prev) = current.take() {
                entries.push(prev);
            }
            current = Some(LogEntry {
                date: date.trim().to_string(),
                entries: Vec::new(),
            });
        } else if let Some(block) = current.as_mut() {
            // Collect non-empty lines under the active date as raw markdown.
            if !line.trim().is_empty() {
                block.entries.push(line.to_string());
            }
        }
        // Lines before the first `## ` heading (e.g. the `# Update Log` title)
        // are ignored.
    }

    if let Some(last) = current.take() {
        entries.push(last);
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_date_headings_in_file_order() {
        let text = "# Update Log\n\n## 2026-06-28\n* newest\n* also new\n\n## 2026-06-01\n* older\n";
        let log = parse_log_text(text);
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].date, "2026-06-28");
        assert_eq!(log[0].entries, vec!["* newest", "* also new"]);
        assert_eq!(log[1].date, "2026-06-01");
        assert_eq!(log[1].entries, vec!["* older"]);
    }

    #[test]
    fn keeps_non_iso_date_verbatim() {
        let log = parse_log_text("## Yesterday\n- did a thing\n");
        assert_eq!(log[0].date, "Yesterday");
        assert_eq!(log[0].entries, vec!["- did a thing"]);
    }

    #[test]
    fn empty_when_no_headings() {
        assert!(parse_log_text("just some prose\n").is_empty());
    }
}
