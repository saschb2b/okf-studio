//! index.md parsing and synthesis for progressive-disclosure navigation.
//! TODO(okf-core agent): parse each index.md into sections/entries; synthesize
//! one for any directory lacking an index.md.

use crate::model::IndexNode;
use std::path::Path;

pub fn build(_root: &Path) -> Vec<IndexNode> {
    Vec::new()
}
