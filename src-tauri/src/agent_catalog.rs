use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalog {
    version: u32,
    pub(crate) entries: Vec<AgentCatalogEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentCatalogEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) summary: String,
    pub(crate) runtime: String,
    pub(crate) auth_methods: Vec<String>,
    pub(crate) source: String,
    pub(crate) availability: String,
    pub(crate) distribution: Option<AgentDistribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentDistribution {
    pub(crate) kind: String,
    pub(crate) package: String,
    pub(crate) version: String,
    pub(crate) tarball: String,
    pub(crate) integrity: String,
    pub(crate) download_size: u64,
    pub(crate) unpacked_size: u64,
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
