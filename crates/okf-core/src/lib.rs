//! okf-core — the pure-Rust core for OKF Studio.
//!
//! No Tauri or GUI dependencies, so it is unit-testable in isolation. It owns
//! bundle detection, OKF parsing, graph/backlink computation, and validation,
//! producing the [`model`] types the Tauri layer serializes to the frontend.

pub mod access;
pub mod asset;
pub mod compatibility;
pub mod detect;
mod evidence;
pub mod frontmatter;
pub mod graph;
pub mod health;
pub mod ignore;
pub mod index_tree;
pub mod links;
pub mod logfile;
pub mod maintenance;
pub mod model;
pub mod parse;
pub mod profile;
pub mod query;
pub mod retrieval;
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

/// Read one companion asset's text from a bundle (an ODSF example HTML or the
/// stylesheet it links), or `None` if it is absent, the wrong type, or escapes
/// the bundle root. See [`asset::read_asset`].
pub fn read_asset(root: &Path, rel: &str) -> Option<String> {
    asset::read_asset(root, rel)
}

/// Read a *local* bundle image as a `data:` URL (offline-safe inlining), or
/// `None` if it is absent, not an image, or escapes the root. See
/// [`asset::read_asset_data_url`].
pub fn read_asset_data_url(root: &Path, rel: &str) -> Option<String> {
    asset::read_asset_data_url(root, rel)
}
