//! A tolerant YAML-frontmatter subset, matching the flat key use OKF concepts
//! rely on. It deliberately handles only what the spec needs — top-level
//! `key: value` scalars, quoted strings, inline `[a, b]` lists, and `- item`
//! block lists — and never panics on anything it does not understand.
//!
//! Known keys are surfaced typed; every other top-level key is preserved into
//! [`ParsedFrontmatter::extra`] as a `serde_json::Value`, honoring the OKF
//! extension contract.

use serde_json::Value;
use std::collections::BTreeMap;

/// Keys the data model promotes to typed fields; everything else goes to `extra`.
pub const KNOWN_KEYS: [&str; 6] = ["type", "title", "description", "resource", "tags", "timestamp"];

/// The parsed result: known keys are kept as raw value strings/lists keyed by
/// name, and unknown keys land in `extra` as JSON values.
#[derive(Debug, Default, Clone)]
pub struct ParsedFrontmatter {
    /// Known scalar/list keys, stored as their raw parsed value.
    fields: BTreeMap<String, Value>,
    /// Preserved unknown top-level keys (the extension contract).
    pub extra: BTreeMap<String, Value>,
}

impl ParsedFrontmatter {
    /// A scalar key as a string slice, if it parsed to a string scalar. Looks
    /// up both promoted known keys and preserved `extra` keys (so callers can
    /// read e.g. `okf_version`, which is not a concept field).
    pub fn scalar(&self, key: &str) -> Option<&str> {
        match self.fields.get(key).or_else(|| self.extra.get(key)) {
            Some(Value::String(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// A known list key as a `Vec<String>` (empty if absent or not a list).
    pub fn list(&self, key: &str) -> Vec<String> {
        match self.fields.get(key) {
            Some(Value::Array(items)) => items
                .iter()
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect(),
            // A scalar where a list was expected is tolerated as a one-element list.
            Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
            _ => Vec::new(),
        }
    }
}

/// Split a leading `---\n…\n---` frontmatter block from the body. Returns
/// `(Some(frontmatter_src), body)` if a fenced block opens the file, else
/// `(None, whole_text)`. Tolerates a leading BOM and CRLF line endings.
pub fn split(text: &str) -> (Option<&str>, &str) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);

    // The block must open on the very first line.
    let after_open = if let Some(rest) = text.strip_prefix("---\n") {
        rest
    } else if let Some(rest) = text.strip_prefix("---\r\n") {
        rest
    } else {
        return (None, text);
    };

    // Find the closing fence: a line that is exactly `---`.
    let mut search_from = 0;
    while let Some(rel) = after_open[search_from..].find("---") {
        let pos = search_from + rel;
        let at_line_start = pos == 0 || after_open.as_bytes()[pos - 1] == b'\n';
        let after = &after_open[pos + 3..];
        let closes_line = after.is_empty()
            || after.starts_with('\n')
            || after.starts_with("\r\n")
            || after.starts_with('\r');
        if at_line_start && closes_line {
            let fm = &after_open[..pos];
            // Trim a trailing CR left before the fence newline handling.
            let fm = fm.strip_suffix('\n').unwrap_or(fm);
            let fm = fm.strip_suffix('\r').unwrap_or(fm);
            let body = after
                .strip_prefix("\r\n")
                .or_else(|| after.strip_prefix('\n'))
                .or_else(|| after.strip_prefix('\r'))
                .unwrap_or(after);
            return (Some(fm), body);
        }
        search_from = pos + 3;
    }

    // No closing fence: treat the whole thing as having no frontmatter.
    (None, text)
}

/// Parse the tolerant subset of a frontmatter source block.
pub fn parse(src: &str) -> ParsedFrontmatter {
    let mut out = ParsedFrontmatter::default();
    let lines: Vec<&str> = src.split('\n').map(|l| l.trim_end_matches('\r')).collect();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        // Only top-level (non-indented) keys are considered; skip blanks,
        // comments, and any indented continuation we are not consuming.
        if line.trim().is_empty() || line.starts_with(char::is_whitespace) || line.starts_with('#')
        {
            i += 1;
            continue;
        }

        let Some(colon) = line.find(':') else {
            i += 1;
            continue;
        };
        let key = line[..colon].trim().to_string();
        if key.is_empty() {
            i += 1;
            continue;
        }
        let rest = line[colon + 1..].trim();

        let value = if rest.is_empty() {
            // A block list may follow on subsequent `- item` lines.
            let (items, consumed) = parse_block_list(&lines[i + 1..]);
            i += consumed;
            if items.is_empty() {
                Value::String(String::new())
            } else {
                Value::Array(items.into_iter().map(Value::String).collect())
            }
        } else if rest.starts_with('[') {
            Value::Array(parse_inline_list(rest).into_iter().map(Value::String).collect())
        } else {
            Value::String(unquote(rest))
        };

        insert(&mut out, key, value);
        i += 1;
    }

    out
}

/// Route a parsed key/value into typed fields or the extension `extra` map.
fn insert(out: &mut ParsedFrontmatter, key: String, value: Value) {
    if KNOWN_KEYS.contains(&key.as_str()) {
        out.fields.insert(key, value);
    } else {
        out.extra.insert(key, value);
    }
}

/// Consume a run of `- item` block-list lines, returning the items and how many
/// lines were consumed.
fn parse_block_list(lines: &[&str]) -> (Vec<String>, usize) {
    let mut items = Vec::new();
    let mut consumed = 0;
    for line in lines {
        if line.trim().is_empty() {
            // A blank line ends a simple block list.
            break;
        }
        let trimmed = line.trim_start();
        if let Some(item) = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix('-')) {
            items.push(unquote(item.trim()));
            consumed += 1;
        } else {
            break;
        }
    }
    (items, consumed)
}

/// Parse an inline `[a, b, c]` list. Tolerates a missing closing bracket.
fn parse_inline_list(s: &str) -> Vec<String> {
    let inner = s.trim_start_matches('[').trim_end_matches(']');
    inner
        .split(',')
        .map(|part| unquote(part.trim()))
        .filter(|p| !p.is_empty())
        .collect()
}

/// Strip a single pair of matching surrounding quotes, if present.
fn unquote(s: &str) -> String {
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return s[1..s.len() - 1].to_string();
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_frontmatter_and_body() {
        let (fm, body) = split("---\ntype: Foo\n---\n# Body\n");
        assert_eq!(fm, Some("type: Foo"));
        assert_eq!(body, "# Body\n");
    }

    #[test]
    fn no_frontmatter_returns_whole_body() {
        let (fm, body) = split("# Just a body\n");
        assert!(fm.is_none());
        assert_eq!(body, "# Just a body\n");
    }

    #[test]
    fn tolerates_bom() {
        let (fm, _) = split("\u{feff}---\ntype: Foo\n---\nx");
        assert_eq!(fm, Some("type: Foo"));
    }

    #[test]
    fn parses_scalars_quotes_and_lists() {
        let fm = parse("type: Reference\ntitle: \"Hello\"\ntags: [a, b]\nokf_version: \"0.1\"");
        assert_eq!(fm.scalar("type"), Some("Reference"));
        assert_eq!(fm.scalar("title"), Some("Hello"));
        assert_eq!(fm.list("tags"), vec!["a", "b"]);
        // Unknown key preserved in extra.
        assert_eq!(
            fm.extra.get("okf_version"),
            Some(&Value::String("0.1".into()))
        );
    }

    #[test]
    fn parses_block_lists() {
        let fm = parse("tags:\n  - one\n  - two\ntype: Foo");
        assert_eq!(fm.list("tags"), vec!["one", "two"]);
        assert_eq!(fm.scalar("type"), Some("Foo"));
    }

    #[test]
    fn unclosed_block_does_not_panic() {
        let _ = parse("type:\n  -");
        let _ = split("---\ntype: x\n");
    }
}
