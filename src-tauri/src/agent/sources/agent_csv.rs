use sha2::{Digest, Sha256};

const ROWS_PER_SECTION: usize = 100;

#[derive(Debug)]
pub(crate) struct CsvNormalization {
    pub content: String,
    pub source_digest: String,
}

pub(crate) fn normalize(
    bytes: &[u8],
    title: &str,
    max_content_chars: usize,
) -> Result<CsvNormalization, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(bytes);
    let headers = reader
        .headers()
        .map_err(|error| format!("{title} has an invalid CSV header: {error}"))?
        .clone();
    if headers.is_empty() {
        return Err(format!("{title} has no CSV columns."));
    }

    let column_labels = headers
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let value = value.trim();
            if value.is_empty() {
                format!("Column {}", index + 1)
            } else {
                format!("Column {}: {}", index + 1, escape_cell(value))
            }
        })
        .collect::<Vec<_>>();
    let mut content = String::from("## CSV columns\n\n");
    let mut content_chars = content.chars().count();
    for label in &column_labels {
        push_bounded(
            &mut content,
            &mut content_chars,
            &format!("- {label}\n"),
            max_content_chars,
            title,
        )?;
    }

    let mut row_count = 0_usize;
    let mut last_section_heading = None;
    for record in reader.records() {
        let record = record.map_err(|error| format!("{title} has invalid CSV data: {error}"))?;
        if row_count.is_multiple_of(ROWS_PER_SECTION) {
            let first = row_count + 1;
            let last = first + ROWS_PER_SECTION - 1;
            let heading_label = format!("## Rows {first}-{last}");
            let heading_start = content.len() + 1;
            let heading_end = heading_start + heading_label.len();
            let mut heading = format!("\n{heading_label}\n\n| Row |");
            for label in &column_labels {
                heading.push(' ');
                heading.push_str(label);
                heading.push_str(" |");
            }
            heading.push_str("\n| ---: |");
            for _ in &column_labels {
                heading.push_str(" --- |");
            }
            heading.push('\n');
            push_bounded(
                &mut content,
                &mut content_chars,
                &heading,
                max_content_chars,
                title,
            )?;
            last_section_heading = Some((heading_start..heading_end, first));
        }

        row_count += 1;
        let mut row = format!("| {row_count} |");
        for value in &record {
            row.push(' ');
            row.push_str(&escape_cell(value));
            row.push_str(" |");
        }
        row.push('\n');
        push_bounded(
            &mut content,
            &mut content_chars,
            &row,
            max_content_chars,
            title,
        )?;
    }

    if row_count == 0 {
        push_bounded(
            &mut content,
            &mut content_chars,
            "\nThe CSV contains no data rows.\n",
            max_content_chars,
            title,
        )?;
    } else if !row_count.is_multiple_of(ROWS_PER_SECTION) {
        let Some((heading_range, section_start)) = last_section_heading else {
            return Err(format!("Could not normalize row provenance for {title}."));
        };
        content.replace_range(
            heading_range,
            &format!("## Rows {section_start}-{row_count}"),
        );
    }

    Ok(CsvNormalization {
        content,
        source_digest: format!("{:x}", Sha256::digest(bytes)),
    })
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
            "Normalized CSV from {title} exceeds the {max_content_chars} character source limit."
        ));
    }
    output.push_str(value);
    *output_chars += value_chars;
    Ok(())
}

fn escape_cell(value: &str) -> String {
    let mut escaped = String::new();
    let mut characters = value.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '|' => escaped.push_str("\\|"),
            '\r' => {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                }
                escaped.push_str("<br>");
            }
            '\n' => escaped.push_str("<br>"),
            value if value.is_control() => escaped.push(' '),
            value => escaped.push(value),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_quoted_cells_and_labels_exact_row_ranges() {
        let mut input = String::from("name,notes\n");
        input.push_str("alpha,\"## Rows 101-200, pipe | and \"\"quote\"\"\nnewline\"\n");
        for index in 2..=101 {
            input.push_str(&format!("item-{index},ok\n"));
        }

        let normalized =
            normalize(input.as_bytes(), "research.csv", 64 * 1024).expect("normalize valid CSV");

        assert!(normalized.content.contains("- Column 1: name"));
        assert!(normalized.content.contains("## Rows 1-100"));
        assert!(normalized.content.contains("## Rows 101-101"));
        assert!(normalized
            .content
            .contains("| 1 | alpha | ## Rows 101-200, pipe \\| and \"quote\"<br>newline |"));
        assert_eq!(normalized.source_digest.len(), 64);
    }

    #[test]
    fn rejects_unequal_records_and_oversized_normalized_output() {
        let malformed = b"name,value\nalpha,1,extra\n";
        assert!(normalize(malformed, "broken.csv", 1024)
            .expect_err("reject unequal record")
            .contains("invalid CSV data"));

        let large = format!("name,value\n{}", "alpha,beta\n".repeat(100));
        assert!(normalize(large.as_bytes(), "large.csv", 256)
            .expect_err("reject oversized normalization")
            .contains("character source limit"));
    }

    #[test]
    fn preserves_header_only_csvs() {
        let normalized =
            normalize(b"name,value\n", "empty.csv", 1024).expect("normalize header-only CSV");

        assert!(normalized
            .content
            .contains("The CSV contains no data rows."));
    }
}
