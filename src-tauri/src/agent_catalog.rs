use std::collections::BTreeMap;

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
    #[serde(default)]
    pub(crate) repository: Option<String>,
    #[serde(default)]
    pub(crate) website: Option<String>,
    pub(crate) distribution: Option<AgentDistribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub(crate) enum AgentDistribution {
    #[serde(rename = "npm")]
    Npm(NpmAgentDistribution),
    #[serde(rename = "binary")]
    Binary(BinaryAgentDistribution),
}

impl AgentDistribution {
    pub(crate) fn version(&self) -> &str {
        match self {
            AgentDistribution::Npm(distribution) => &distribution.version,
            AgentDistribution::Binary(distribution) => &distribution.version,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NpmAgentDistribution {
    pub(crate) package: String,
    pub(crate) version: String,
    pub(crate) tarball: String,
    pub(crate) integrity: String,
    pub(crate) download_size: u64,
    pub(crate) unpacked_size: u64,
    pub(crate) entrypoint: String,
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<String>,
    /// Pinned launch environment values (for example, switches that keep an
    /// agent from self-updating past its verified version). These override any
    /// same-named host variable when the agent starts.
    #[serde(default)]
    pub(crate) environment_defaults: BTreeMap<String, String>,
}

/// A registry agent published as per-platform archives. Studio measures and
/// pins each archive's SHA-256 itself when it takes the catalog snapshot, so
/// the verified-digest rule holds even when the upstream registry entry
/// publishes none.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BinaryAgentDistribution {
    pub(crate) version: String,
    pub(crate) targets: BTreeMap<String, AgentBinaryTarget>,
    pub(crate) environment: Vec<String>,
    #[serde(default)]
    pub(crate) environment_defaults: BTreeMap<String, String>,
}

impl BinaryAgentDistribution {
    pub(crate) fn target_for(&self, os: &str, arch: &str) -> Option<&AgentBinaryTarget> {
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
        self.targets.get(&format!("{os}-{arch}"))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentBinaryTarget {
    pub(crate) archive: String,
    pub(crate) url: String,
    pub(crate) sha256: String,
    pub(crate) download_size: u64,
    pub(crate) unpacked_size: u64,
    /// The single top-level directory every archive entry must live under.
    pub(crate) root: String,
    /// Archive-relative executable, spawned directly — never through a shell
    /// or the publisher's launcher script.
    pub(crate) executable: String,
    /// Archive-relative files appended to argv as absolute Win32-form paths.
    pub(crate) path_arguments: Vec<String>,
    /// Literal argv tail after the path arguments.
    pub(crate) arguments: Vec<String>,
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
        assert_eq!(catalog.entries.len(), 13);
        assert_eq!(catalog.node_runtime.version, "v24.11.0");
        assert_eq!(catalog.node_runtime.distributions.len(), 5);
        let mut ids = catalog
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>();
        ids.sort_unstable();
        assert_eq!(
            ids,
            [
                "auggie",
                "claude-agent",
                "cline",
                "codex",
                "cursor",
                "factory-droid",
                "gemini",
                "github-copilot-cli",
                "goose",
                "kimi",
                "opencode",
                "qwen-code",
                "studio-api",
            ]
        );
        ids.dedup();
        assert_eq!(ids.len(), catalog.entries.len());
        for entry in &catalog.entries {
            match entry.availability.as_str() {
                "installable" => {
                    let distribution = entry
                        .distribution
                        .as_ref()
                        .expect("installable entries carry a pinned distribution");
                    match distribution {
                        AgentDistribution::Npm(_) => assert_ne!(entry.id, "cursor"),
                        AgentDistribution::Binary(binary) => {
                            assert_eq!(entry.id, "cursor");
                            assert_eq!(binary.targets.len(), 6);
                            assert!(binary.target_for("windows", "x86_64").is_some());
                            assert!(binary.target_for("linux", "aarch64").is_some());
                            assert!(binary.target_for("macos", "aarch64").is_some());
                        }
                    }
                }
                "configurable" | "planned" => assert!(entry.distribution.is_none()),
                other => panic!("unknown availability {other}"),
            }
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
