//! Provider-neutral retrieval over parsed OKF bundles.
//!
//! The domain keeps bundle identity attached from structural sectioning through
//! ranking, context compilation, diagnostics, and repair suggestions. It has no
//! filesystem or model dependency, so the Tauri layer can persist its derived
//! output without making retrieval state part of the bundle.

mod diagnostics;
mod engine;
mod manifest;
mod model;

pub use diagnostics::{diagnose, diff_receipts, propose_repairs};
pub use engine::{retrieve, retrieve_manifest, RetrievalRequest};
pub use manifest::{build_manifest, canonical_snapshot};
pub use model::*;
