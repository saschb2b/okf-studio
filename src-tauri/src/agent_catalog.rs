use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalog {
    version: u32,
    entries: Vec<AgentCatalogEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentCatalogEntry {
    id: String,
    name: String,
    summary: String,
    runtime: String,
    auth_methods: Vec<String>,
    source: String,
    availability: String,
    distribution: Option<AgentDistribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct AgentDistribution {
    kind: String,
    package: String,
    version: String,
}

pub fn load() -> Result<AgentCatalog, String> {
    serde_json::from_str(include_str!("../../src/agent/catalog.json"))
        .map_err(|error| format!("Bundled agent catalog is invalid: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_is_valid_and_has_unique_ids() {
        let catalog = load().expect("catalog should parse");
        assert_eq!(catalog.version, 1);
        assert_eq!(catalog.entries.len(), 4);
        let mut ids = catalog
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), catalog.entries.len());
    }
}
