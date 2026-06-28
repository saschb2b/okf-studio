//! Bundle detection — walk a folder and decide which directories are bundle roots.
//! TODO(okf-core agent): implement per docs/architecture/bundle-detection.md.

use crate::model::BundleRoot;
use std::path::Path;

pub fn scan(_folder: &Path) -> Vec<BundleRoot> {
    Vec::new()
}
