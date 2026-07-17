use pdf_extract::content::{Content, Operation};
use pdf_extract::{dictionary, Document, Object, Stream};
use serde::Deserialize;
use std::process::{Command, Stdio};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PdfExtraction {
    content: String,
    page_count: usize,
    source_digest: String,
}

#[test]
fn pdf_helper_reads_its_path_from_stdin_and_returns_bounded_json() {
    let root = std::env::temp_dir().join(format!("okf-pdf-helper-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).expect("create helper fixture directory");
    let path = root.join("helper fixture.pdf");
    std::fs::write(&path, one_page_pdf("Helper process text")).expect("write PDF fixture");

    let mut child = Command::new(env!("CARGO_BIN_EXE_okf-viewer"))
        .arg("--extract-pdf")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start PDF helper");
    serde_json::to_writer(child.stdin.as_mut().expect("helper stdin"), &path)
        .expect("write helper path");
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("wait for PDF helper");

    assert!(
        output.status.success(),
        "helper failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let extraction: PdfExtraction =
        serde_json::from_slice(&output.stdout).expect("parse helper output");
    assert_eq!(extraction.page_count, 1);
    assert!(extraction
        .content
        .contains("## Page 1\n\nHelper process text"));
    assert_eq!(extraction.source_digest.len(), 64);
    std::fs::remove_dir_all(root).expect("remove helper fixture directory");
}

fn one_page_pdf(text: &str) -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Courier",
    });
    let resources_id = document.add_object(dictionary! {
        "Font" => dictionary! { "F1" => font_id },
    });
    let content = Content {
        operations: vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["F1".into(), 12.into()]),
            Operation::new("Td", vec![72.into(), 720.into()]),
            Operation::new("Tj", vec![Object::string_literal(text)]),
            Operation::new("ET", vec![]),
        ],
    }
    .encode()
    .expect("encode PDF page");
    let content_id = document.add_object(Stream::new(dictionary! {}, content));
    let page_id = document.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "Contents" => content_id,
    });
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).expect("serialize PDF");
    bytes
}
