use serde_json::Value;
use sha2::{Digest, Sha256};

const NODES_PER_SECTION: usize = 100;
const MAX_JSON_NODES: usize = 16_384;

#[derive(Debug)]
pub(crate) struct JsonNormalization {
    pub content: String,
    pub source_digest: String,
}

pub(crate) fn normalize(
    bytes: &[u8],
    title: &str,
    max_content_chars: usize,
) -> Result<JsonNormalization, String> {
    let root: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("{title} contains invalid JSON: {error}"))?;
    let mut content = String::from(
        "## JSON structure\n\nPaths use JSON Pointer. `(root)` identifies the complete document.\n",
    );
    let mut content_chars = content.chars().count();
    let mut pending = vec![(String::new(), &root)];
    let mut node_count = 0_usize;
    let mut last_section_heading = None;

    while let Some((pointer, value)) = pending.pop() {
        if node_count >= MAX_JSON_NODES {
            return Err(format!("{title} exceeds the 16,384 node JSON limit."));
        }
        if node_count.is_multiple_of(NODES_PER_SECTION) {
            let first = node_count + 1;
            let last = first + NODES_PER_SECTION - 1;
            let heading_label = format!("## Nodes {first}-{last}");
            let heading_start = content.len() + 2;
            let heading_end = heading_start + heading_label.len();
            let heading = format!(
                "\n\n{heading_label}\n\n| Node | JSON Pointer | Type | Value |\n| ---: | --- | --- | --- |\n"
            );
            push_bounded(
                &mut content,
                &mut content_chars,
                &heading,
                max_content_chars,
                title,
            )?;
            last_section_heading = Some((heading_start..heading_end, first));
        }

        node_count += 1;
        let display_pointer = if pointer.is_empty() {
            "(root)"
        } else {
            &pointer
        };
        let row = format!(
            "| {node_count} | {} | {} | {} |\n",
            escape_cell(display_pointer),
            json_type(value),
            escape_cell(&value_summary(value)?)
        );
        push_bounded(
            &mut content,
            &mut content_chars,
            &row,
            max_content_chars,
            title,
        )?;

        match value {
            Value::Object(object) => {
                let mut entries = object.iter().collect::<Vec<_>>();
                entries.sort_by(|(left, _), (right, _)| left.cmp(right));
                for (key, child) in entries.into_iter().rev() {
                    pending.push((format!("{pointer}/{}", escape_pointer_token(key)), child));
                }
            }
            Value::Array(array) => {
                for (index, child) in array.iter().enumerate().rev() {
                    pending.push((format!("{pointer}/{index}"), child));
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
        }
    }

    if !node_count.is_multiple_of(NODES_PER_SECTION) {
        let Some((heading_range, section_start)) = last_section_heading else {
            return Err(format!(
                "Could not normalize structural provenance for {title}."
            ));
        };
        content.replace_range(
            heading_range,
            &format!("## Nodes {section_start}-{node_count}"),
        );
    }

    Ok(JsonNormalization {
        content,
        source_digest: format!("{:x}", Sha256::digest(bytes)),
    })
}

fn json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn value_summary(value: &Value) -> Result<String, String> {
    match value {
        Value::Object(object) => Ok(format!("{} properties", object.len())),
        Value::Array(array) => Ok(format!("{} items", array.len())),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            serde_json::to_string(value)
                .map_err(|error| format!("Could not serialize a JSON value: {error}"))
        }
    }
}

fn escape_pointer_token(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn push_bounded(
    output: &mut String,
    output_chars: &mut usize,
    value: &str,
    max_content_chars: usize,
    title: &str,
) -> Result<(), String> {
    let value_chars = value.chars().count();
    if output_chars.saturating_add(value_chars) > max_content_chars {
        return Err(format!(
            "Normalized JSON from {title} exceeds the {max_content_chars} character source limit."
        ));
    }
    output.push_str(value);
    *output_chars += value_chars;
    Ok(())
}

fn escape_cell(value: &str) -> String {
    value.replace('\\', "\\\\").replace('|', "\\|")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_nested_values_in_stable_pointer_order() {
        let input = br#"{"z":1,"a":{"slash/key":[true,null],"til~de":"line\ntext"}}"#;

        let normalized =
            normalize(input, "settings.json", 16 * 1024).expect("normalize valid JSON");

        let expected = [
            "| 1 | (root) | object | 2 properties |",
            "| 2 | /a | object | 2 properties |",
            "| 3 | /a/slash~1key | array | 2 items |",
            "| 4 | /a/slash~1key/0 | boolean | true |",
            "| 5 | /a/slash~1key/1 | null | null |",
            "| 6 | /a/til~0de | string | \"line\\\\ntext\" |",
            "| 7 | /z | number | 1 |",
        ];
        let mut previous = 0;
        for row in expected {
            let position = normalized.content.find(row).expect("find normalized row");
            assert!(position >= previous);
            previous = position;
        }
        assert!(normalized.content.contains("## Nodes 1-7"));
        assert_eq!(normalized.source_digest.len(), 64);
    }

    #[test]
    fn rejects_malformed_and_oversized_normalized_json() {
        assert!(normalize(br#"{"missing":}"#, "broken.json", 1024)
            .expect_err("reject malformed JSON")
            .contains("invalid JSON"));

        let input = serde_json::to_vec(&vec!["value"; 100]).expect("serialize fixture");
        assert!(normalize(&input, "large.json", 256)
            .expect_err("reject oversized normalization")
            .contains("character source limit"));
    }

    #[test]
    fn handles_scalar_and_empty_container_roots() {
        let scalar = normalize(b"42", "scalar.json", 1024).expect("normalize scalar root");
        assert!(scalar.content.contains("| 1 | (root) | number | 42 |"));

        let empty = normalize(b"{}", "empty.json", 1024).expect("normalize empty object");
        assert!(empty
            .content
            .contains("| 1 | (root) | object | 0 properties |"));
    }

    #[test]
    fn labels_exact_node_ranges_and_enforces_the_node_limit() {
        let ranged = serde_json::to_vec(&vec![0; 100]).expect("serialize ranged fixture");
        let normalized =
            normalize(&ranged, "ranged.json", 64 * 1024).expect("normalize ranged fixture");
        assert!(normalized.content.contains("## Nodes 1-100"));
        assert!(normalized.content.contains("## Nodes 101-101"));

        let oversized =
            serde_json::to_vec(&vec![0; MAX_JSON_NODES]).expect("serialize oversized fixture");
        let error = normalize(&oversized, "nodes.json", 4 * 1024 * 1024)
            .expect_err("reject excessive node count");
        assert!(error.contains("16,384 node JSON limit"), "{error}");
    }
}
