use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalog {
    version: u32,
    pub(crate) node_runtime: AgentNodeRuntime,
    pub(crate) entries: Vec<AgentCatalogEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentNodeRuntime {
    pub(crate) version: String,
    pub(crate) distributions: Vec<AgentNodeDistribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentNodeDistribution {
    pub(crate) target: String,
    pub(crate) archive: String,
    pub(crate) url: String,
    pub(crate) sha256: String,
    pub(crate) download_size: u64,
    pub(crate) root: String,
}

impl AgentNodeRuntime {
    pub(crate) fn distribution_for(&self, os: &str, arch: &str) -> Option<&AgentNodeDistribution> {
        let os = match os {
            "windows" => "windows",
            "linux" => "linux",
            "macos" => "macos",
            _ => return None,
        };
        let arch = match arch {
            "x86_64" => "x86_64",
            "aarch64" => "aarch64",
            _ => return None,
        };
        let target = format!("{os}-{arch}");
        self.distributions
            .iter()
            .find(|distribution| distribution.target == target)
    }
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
    pub(crate) entrypoint: String,
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<String>,
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
        assert_eq!(catalog.node_runtime.version, "v24.11.0");
        assert_eq!(catalog.node_runtime.distributions.len(), 5);
        let mut ids = catalog
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), catalog.entries.len());
        for entry in catalog
            .entries
            .iter()
            .filter(|entry| entry.distribution.is_some())
        {
            let distribution = entry.distribution.as_ref().expect("distribution exists");
            assert_eq!(distribution.entrypoint, "dist/index.js");
            assert!(distribution.arguments.is_empty());
        }
    }

    #[test]
    fn managed_node_targets_are_explicit() {
        let catalog = load().expect("catalog should parse");
        assert!(catalog
            .node_runtime
            .distribution_for("windows", "x86_64")
            .is_some());
        assert!(catalog
            .node_runtime
            .distribution_for("linux", "aarch64")
            .is_some());
        assert!(catalog
            .node_runtime
            .distribution_for("macos", "aarch64")
            .is_some());
        assert!(catalog
            .node_runtime
            .distribution_for("windows", "aarch64")
            .is_none());
    }
}
