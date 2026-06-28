//! Validation — the OKF conformance check, ported from scripts/okf-validate.mjs.
//! TODO(okf-core agent): implement errors (missing frontmatter / type) and
//! warnings (broken links, non-ISO log dates, stray index.md frontmatter).

use crate::model::{Concept, Issue};
use std::path::Path;

pub fn validate(_root: &Path, _concepts: &[Concept]) -> Vec<Issue> {
    Vec::new()
}
