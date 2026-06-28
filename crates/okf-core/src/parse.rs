//! OKF parsing — turn a bundle root into the data model.
//! TODO(okf-core agent): implement per docs/architecture/okf-parsing.md.

use crate::model::{Bundle, Confidence};
use std::path::Path;

pub fn read_bundle(root: &Path) -> Bundle {
    Bundle {
        root: root.display().to_string(),
        name: root
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        okf_version: None,
        concepts: Vec::new(),
        indexes: Vec::new(),
        log: Vec::new(),
        issues: Vec::new(),
        confidence: Confidence::Candidate,
    }
}
