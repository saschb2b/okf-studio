//! okf-core — the pure-Rust core for OKF Viewer.
//!
//! No Tauri or GUI dependencies, so it is unit-testable in isolation. It owns
//! bundle detection, OKF parsing, graph/backlink computation, and validation,
//! producing the [`model`] types the Tauri layer serializes to the frontend.

pub mod detect;
pub mod frontmatter;
pub mod graph;
pub mod index_tree;
pub mod links;
pub mod logfile;
pub mod model;
pub mod parse;
pub mod validate;

pub use model::*;

use std::path::Path;

/// The default max scan depth when a caller doesn't specify one.
pub const DEFAULT_MAX_DEPTH: usize = 8;

/// Scan a folder for OKF bundle roots — see `docs/architecture/bundle-detection.md`.
pub fn scan_bundles(folder: &Path) -> Vec<BundleRoot> {
    detect::scan(folder, DEFAULT_MAX_DEPTH)
}

/// Like [`scan_bundles`], but with a caller-provided max directory depth (the
/// user's "Scan max depth" setting).
pub fn scan_bundles_with_depth(folder: &Path, max_depth: usize) -> Vec<BundleRoot> {
    detect::scan(folder, max_depth)
}

/// Parse a detected bundle root into a full [`Bundle`] — see `docs/architecture/okf-parsing.md`.
pub fn read_bundle(root: &Path) -> Bundle {
    parse::read_bundle(root)
}
