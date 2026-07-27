//! A tolerant YAML-frontmatter subset, matching the key use OKF/ODSF concepts
//! rely on. It handles top-level `key: value` scalars, quoted strings, inline
//! `[a, b]` lists, `- item` block lists, and **indentation-nested maps and
//! lists** (ODSF's `tokens:` tree, e.g. `tokens.colors.primary`). It never
//! panics on anything it does not understand.
//!
//! Known top-level keys are surfaced typed; every other top-level key is
//! preserved into [`ParsedFrontmatter::extra`] as a `serde_json::Value`
//! (scalars as strings, nested blocks as objects/arrays), honoring the OKF
//! extension contract. Map order is preserved (serde_json `preserve_order`), so
//! a downstream consumer sees tokens in the order the author wrote them.

use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// Keys the data model promotes to typed fields; everything else goes to `extra`.
///
/// The v0.2 additions are promoted rather than left in `extra` because the model
/// reads them structurally — a trust tier is computed over `verified`, staleness
/// compares `stale_after` — and that cannot be done through an untyped value.
pub const KNOWN_KEYS: [&str; 17] = [
    "type",
    "title",
    "description",
    "resource",
    "tags",
    "timestamp",
    // OKF v0.2 provenance, trust and lifecycle
    "sources",
    "usage_window",
    "generated",
    "verified",
    "status",
    "stale_after",
    // OKF v0.2 Attested Computation. Promoted as a set: leaving some of the
    // contract in `extra` would show spec fields alongside producer extensions
    // in the metadata inspector, which is exactly the distinction it draws.
    "runtime",
    "parameters",
    "computation",
    "executor",
    "attester",
];

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

    /// A key's raw parsed value, promoted or preserved.
    ///
    /// The v0.2 field families are nested maps and lists, so they cannot be read
    /// through `scalar` or `list`; callers walk the value instead.
    pub fn value(&self, key: &str) -> Option<&Value> {
        self.fields.get(key).or_else(|| self.extra.get(key))
    }

    /// A `{ by, at }` mapping, as `generated` and each `verified` entry are.
    pub fn attribution(value: &Value) -> Option<crate::model::Attribution> {
        let map = value.as_object()?;
        let by = map.get("by").and_then(Value::as_str)?.trim();
        if by.is_empty() {
            return None;
        }
        Some(crate::model::Attribution {
            by: by.to_string(),
            at: map
                .get("at")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|at| !at.is_empty())
                .map(str::to_owned),
        })
    }

    /// Every entry of a list-valued key, tolerating a bare mapping as a
    /// one-element list.
    ///
    /// The spec requires this for `verified`: a single verifier MAY be written
    /// without the list dash and consumers MUST treat it as one element. The
    /// same tolerance costs nothing on `sources` and `parameters`.
    pub fn entries(&self, key: &str) -> Vec<&Value> {
        match self.value(key) {
            Some(Value::Array(items)) => items.iter().collect(),
            Some(value @ Value::Object(_)) => vec![value],
            _ => Vec::new(),
        }
    }

    /// Return every parsed top-level value, regardless of whether it is a
    /// recognized concept key. Bundle-root metadata has a different promoted
    /// key set, so callers must be able to preserve concept-shaped keys there
    /// instead of losing them inside this parser's private fields map.
    pub fn all_values(&self) -> BTreeMap<String, Value> {
        self.fields
            .iter()
            .chain(self.extra.iter())
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect()
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
    let lines: Vec<&str> = src.split('\n').map(|l| l.trim_end_matches('\r')).collect();
    let mut i = 0;
    // Top-level keys live at indent 0; their children are more deeply indented.
    let top = parse_map(&lines, &mut i, 0);

    let mut out = ParsedFrontmatter::default();
    for (key, value) in top {
        if KNOWN_KEYS.contains(&key.as_str()) {
            out.fields.insert(key, value);
        } else {
            out.extra.insert(key, value);
        }
    }
    out
}

/// Leading-space count (the indentation level). Tabs count as one space each;
/// the spec uses spaces, so this is a tolerant approximation, not strict YAML.
fn indent_of(line: &str) -> usize {
    line.len() - line.trim_start().len()
}

/// A line that carries no key/value: blank or a `#` comment. Note a `#` *inside*
/// a value (a hex color) is never seen here — we only test trimmed line starts.
fn is_skippable(line: &str) -> bool {
    let t = line.trim();
    t.is_empty() || t.starts_with('#')
}

/// Parse a mapping whose keys sit at exactly `indent`. Consumes lines until one
/// dedents below `indent` (or a list item appears at this level, which a map
/// cannot contain). `*i` is left on the first unconsumed line.
fn parse_map(lines: &[&str], i: &mut usize, indent: usize) -> Map<String, Value> {
    let mut map = Map::new();
    while *i < lines.len() {
        let line = lines[*i];
        if is_skippable(line) {
            *i += 1;
            continue;
        }
        let ind = indent_of(line);
        if ind < indent {
            break; // dedent: this block is done
        }
        if ind > indent {
            *i += 1; // stray over-indent with no parent key: skip defensively
            continue;
        }
        let trimmed = line.trim_start();
        if trimmed.starts_with("- ") || trimmed == "-" {
            break; // a list at a map's level — not ours to consume
        }
        let Some(colon) = trimmed.find(':') else {
            *i += 1;
            continue;
        };
        let key = trimmed[..colon].trim().to_string();
        if key.is_empty() {
            *i += 1;
            continue;
        }
        let rest = trimmed[colon + 1..].trim();
        *i += 1;
        let value = if rest.is_empty() {
            // An empty value may be followed by a nested block (map or list).
            parse_nested(lines, i, indent)
        } else {
            scalar_or_inline_list(rest)
        };
        map.insert(key, value);
    }
    map
}

/// After an empty-valued key, look ahead: if the next content line is more
/// indented it is this key's nested block — a list when it starts with `- `,
/// otherwise a map. If it is not more indented, the value is the empty string.
fn parse_nested(lines: &[&str], i: &mut usize, parent_indent: usize) -> Value {
    let mut j = *i;
    while j < lines.len() && is_skippable(lines[j]) {
        j += 1;
    }
    if j >= lines.len() {
        return Value::String(String::new());
    }
    let child_indent = indent_of(lines[j]);
    if child_indent <= parent_indent {
        return Value::String(String::new());
    }
    *i = j;
    let trimmed = lines[j].trim_start();
    if trimmed.starts_with("- ") || trimmed == "-" {
        Value::Array(parse_list(lines, i, child_indent))
    } else {
        Value::Object(parse_map(lines, i, child_indent))
    }
}

/// Parse a block list whose `- item` lines sit at exactly `indent`.
///
/// Items are scalars (ODSF's paths, platform names, tags), inline flow maps, or
/// **maps spread over the item's own lines**, which is how OKF v0.2 writes
/// `sources`, `verified` and `parameters`:
///
/// ```yaml
/// sources:
///   - id: ga4-schema
///     resource: https://example.com/ga4
/// ```
///
/// Before this handled item maps, that list parsed to `["id: ga4-schema"]` — the
/// first pair kept as a raw string and the rest of the entry silently dropped.
fn parse_list(lines: &[&str], i: &mut usize, indent: usize) -> Vec<Value> {
    let mut items = Vec::new();
    while *i < lines.len() {
        let line = lines[*i];
        if is_skippable(line) {
            *i += 1;
            continue;
        }
        if indent_of(line) != indent {
            break;
        }
        let trimmed = line.trim_start();
        let item = if let Some(rest) = trimmed.strip_prefix("- ") {
            rest.trim()
        } else if trimmed == "-" {
            ""
        } else {
            break;
        };
        // `- key: value` opens a mapping whose remaining keys are indented to
        // where this one starts, past the dash.
        if let Some(entry) = list_item_map(lines, i, indent, item) {
            items.push(entry);
            continue;
        }
        items.push(Value::String(unquote(item)));
        *i += 1;
    }
    items
}

/// A list entry that is a mapping, either inline or spread over the entry's own
/// lines. Returns `None` when the entry is an ordinary scalar, and only then
/// advances nothing, so the caller can fall through.
fn list_item_map(lines: &[&str], i: &mut usize, indent: usize, item: &str) -> Option<Value> {
    if let Some(flow) = parse_flow_map(item) {
        *i += 1;
        return Some(Value::Object(flow));
    }
    // A block entry: the dash line carries the first pair, and any further pairs
    // are indented to the column where that first key started.
    let colon = item.find(':')?;
    let key = item[..colon].trim();
    if key.is_empty() || key.contains(' ') {
        // `- some prose: with a colon` is a scalar, not a mapping. Requiring a
        // space-free key keeps a citation line like
        // "internal interview, 2026-01-10: see notes" from becoming a map.
        return None;
    }
    let mut map = Map::new();
    let rest = item[colon + 1..].trim();
    // "- " is two characters, so the entry's keys align there.
    let child_indent = indent + 2;
    *i += 1;
    map.insert(
        key.to_string(),
        if rest.is_empty() {
            parse_nested(lines, i, child_indent)
        } else {
            scalar_or_inline_list(rest)
        },
    );
    for (key, value) in parse_map(lines, i, child_indent) {
        map.insert(key, value);
    }
    Some(Value::Object(map))
}

/// An inline `{ k: v, k2: v2 }` flow mapping.
///
/// OKF v0.2 writes `generated`, `verified` entries, `usage_window` and
/// `parameters` this way, and the spec's own examples use it throughout, so a
/// consumer that keeps it as a raw string reads none of those fields.
fn parse_flow_map(rest: &str) -> Option<Map<String, Value>> {
    let inner = rest.strip_prefix('{')?.strip_suffix('}')?;
    let mut map = Map::new();
    for pair in split_flow_entries(inner) {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        let Some(colon) = pair.find(':') else {
            continue;
        };
        let key = pair[..colon].trim();
        if key.is_empty() {
            continue;
        }
        map.insert(
            key.to_string(),
            scalar_or_inline_list(pair[colon + 1..].trim()),
        );
    }
    // Braces alone do not make a mapping. An ODSF token reference is a braced
    // scalar — `{colors.bgColor-success-emphasis}` — and must survive verbatim
    // for the consumer to resolve, so a brace pair yielding no `key: value` pair
    // is not a flow map.
    (!map.is_empty()).then_some(map)
}

/// Split a flow mapping's body on commas that are not inside a nested `{}`,
/// `[]`, or a quoted string. An actor like `reference_agent/gemini-2.5-pro` has
/// no comma, but a title legitimately does.
fn split_flow_entries(inner: &str) -> Vec<String> {
    let mut entries = Vec::new();
    let mut current = String::new();
    let mut depth = 0_usize;
    let mut quote: Option<char> = None;
    for character in inner.chars() {
        match (quote, character) {
            (Some(open), c) if c == open => {
                quote = None;
                current.push(c);
            }
            (Some(_), c) => current.push(c),
            (None, c @ ('"' | '\'')) => {
                quote = Some(c);
                current.push(c);
            }
            (None, c @ ('{' | '[')) => {
                depth += 1;
                current.push(c);
            }
            (None, c @ ('}' | ']')) => {
                depth = depth.saturating_sub(1);
                current.push(c);
            }
            (None, ',') if depth == 0 => {
                entries.push(std::mem::take(&mut current));
            }
            (None, c) => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        entries.push(current);
    }
    entries
}

/// An inline `[a, b]` list, or a scalar string (quotes stripped).
fn scalar_or_inline_list(rest: &str) -> Value {
    if rest.starts_with('[') {
        Value::Array(
            parse_inline_list(rest)
                .into_iter()
                .map(Value::String)
                .collect(),
        )
    } else if let Some(flow) = parse_flow_map(rest) {
        // `generated: { by: …, at: … }` and `usage_window: { from: …, to: … }`.
        Value::Object(flow)
    } else {
        Value::String(unquote(rest))
    }
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

    #[test]
    fn parses_nested_token_map() {
        // ODSF's `tokens:` is a nested map; it must survive into `extra` as a
        // JSON object, in author order, with hex values intact (no `#` stripping).
        let fm = parse(
            "type: Color\ntokens:\n  colors:\n    primary: \"#1f2328\"\n    accent: \"#0969da\"\n",
        );
        assert_eq!(fm.scalar("type"), Some("Color"));
        let tokens = fm.extra.get("tokens").expect("tokens preserved");
        let colors = tokens.get("colors").expect("colors group");
        assert_eq!(
            colors.get("primary"),
            Some(&Value::String("#1f2328".into()))
        );
        assert_eq!(colors.get("accent"), Some(&Value::String("#0969da".into())));
        // Author order preserved (preserve_order): primary before accent.
        let order: Vec<&str> = colors
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(order, vec!["primary", "accent"]);
    }

    #[test]
    fn parses_composite_typography_tokens() {
        // A three-level nest: tokens.typography.body.fontSize.
        let fm = parse(
            "tokens:\n  typography:\n    body:\n      fontFamily: \"Inter, sans-serif\"\n      fontSize: \"16px\"\n      lineHeight: \"1.5\"\ntype: Typography\n",
        );
        let body = fm.extra["tokens"]["typography"]["body"].clone();
        assert_eq!(body["fontSize"], Value::String("16px".into()));
        assert_eq!(body["lineHeight"], Value::String("1.5".into()));
        // A key after the nested block returns to the top level.
        assert_eq!(fm.scalar("type"), Some("Typography"));
    }

    #[test]
    fn parses_component_token_refs_and_examples() {
        let fm = parse(
            "type: Component\nexamples:\n  - /components/button.example.html\ntokens:\n  button-primary:\n    background: \"{colors.bgColor-success-emphasis}\"\n    color: \"{colors.fgColor-onEmphasis}\"\n",
        );
        // The example list lands in extra as a string array.
        assert_eq!(
            fm.extra["examples"],
            Value::Array(vec![Value::String(
                "/components/button.example.html".into()
            )]),
        );
        // Token reference syntax is preserved verbatim for the consumer to resolve.
        assert_eq!(
            fm.extra["tokens"]["button-primary"]["background"],
            Value::String("{colors.bgColor-success-emphasis}".into()),
        );
    }

    #[test]
    fn parses_status_and_applies_to() {
        let fm = parse("type: Component\nstatus: stable\napplies_to: [web, ios]\n");
        // `status` is a promoted OKF v0.2 lifecycle field, and ODSF is a profile
        // of OKF, so a component's status reads as the spec field rather than as
        // a producer extension. `applies_to` stays an ODSF extension.
        assert_eq!(fm.scalar("status"), Some("stable"));
        assert!(!fm.extra.contains_key("status"));
        assert_eq!(
            fm.extra["applies_to"],
            Value::Array(vec![
                Value::String("web".into()),
                Value::String("ios".into())
            ]),
        );
    }
}
