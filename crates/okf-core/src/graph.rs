//! Graph: derive backlinks (`cited_by`) and `degree` from each concept's links.
//!
//! `links` is already resolved to existing-target Concept IDs by the parse
//! stage, so inversion is a straight scatter: every `links` edge `a -> b`
//! contributes `a` to `b`'s `cited_by`. Degree is then the sum of out- and
//! in-links, used for node sizing in the graph view.

use crate::model::Concept;
use std::collections::HashMap;

/// Build `cited_by` (inverse of `links`) and `degree` in place.
pub fn link_graph(concepts: &mut [Concept]) {
    // Map id -> index for the scatter.
    let index: HashMap<String, usize> = concepts
        .iter()
        .enumerate()
        .map(|(i, c)| (c.id.clone(), i))
        .collect();

    // Collect backlinks first to avoid overlapping mutable borrows.
    let mut backlinks: Vec<Vec<String>> = vec![Vec::new(); concepts.len()];
    for concept in concepts.iter() {
        for target in &concept.links {
            if let Some(&ti) = index.get(target) {
                backlinks[ti].push(concept.id.clone());
            }
        }
    }

    for (i, concept) in concepts.iter_mut().enumerate() {
        let mut cited = std::mem::take(&mut backlinks[i]);
        cited.sort();
        cited.dedup();
        concept.cited_by = cited;
        concept.degree = (concept.links.len() + concept.cited_by.len()) as u32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Concept;

    fn concept(id: &str, links: &[&str]) -> Concept {
        Concept {
            id: id.into(),
            concept_type: "T".into(),
            title: id.into(),
            description: String::new(),
            tags: vec![],
            timestamp: None,
            resource: None,
            extra: Default::default(),
            body: String::new(),
            links: links.iter().map(|s| s.to_string()).collect(),
            external_links: vec![],
            broken_links: vec![],
            cited_by: vec![],
            degree: 0,
        }
    }

    #[test]
    fn inverts_edges_and_counts_degree() {
        let mut concepts = vec![concept("a", &["b"]), concept("b", &[]), concept("c", &["b"])];
        link_graph(&mut concepts);

        let b = concepts.iter().find(|c| c.id == "b").unwrap();
        assert_eq!(b.cited_by, vec!["a", "c"]);
        assert_eq!(b.degree, 2); // 0 out + 2 in

        let a = concepts.iter().find(|c| c.id == "a").unwrap();
        assert_eq!(a.degree, 1); // 1 out + 0 in
    }
}
