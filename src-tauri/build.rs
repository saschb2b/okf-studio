use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const MAX_RESOURCE_BYTES: u64 = 256 * 1024;
const MAX_TOTAL_RESOURCE_BYTES: u64 = 768 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    resource_schema_version: u32,
    capabilities: Vec<Capability>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capability {
    id: String,
    version: String,
    description: String,
    risk_class: String,
    required_tools: Vec<String>,
    artifact_kinds: Vec<String>,
    resources: Vec<Resource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resource {
    id: String,
    label: String,
    path: String,
    media_type: String,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackManifest {
    schema_version: u32,
    id: String,
    version: String,
    name: String,
    description: String,
    publisher: String,
    provenance: String,
    compatibility: PackCompatibility,
    conflicts: Vec<String>,
    capability_manifest: PackResource,
    templates: Vec<PackResource>,
    artifact_schemas: Vec<PackResource>,
    required_studio_tools: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackCompatibility {
    minimum_studio_version: String,
    capability_schema_version: u32,
    artifact_schema_version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackResource {
    id: Option<String>,
    path: String,
    media_type: String,
    sha256: String,
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate_capabilities() {
    let root = PathBuf::from("../.agents/skills/okf");
    let manifest_path = root.join("capabilities.json");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let manifest_bytes = std::fs::read(&manifest_path)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", manifest_path.display()));
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .unwrap_or_else(|error| panic!("invalid {}: {error}", manifest_path.display()));
    assert_eq!(manifest.schema_version, 1, "unsupported capability schema");
    assert_eq!(
        manifest.resource_schema_version, 1,
        "unsupported capability resource schema"
    );
    assert!(
        !manifest.capabilities.is_empty(),
        "capability manifest must not be empty"
    );

    let canonical_root = root
        .canonicalize()
        .unwrap_or_else(|error| panic!("could not resolve {}: {error}", root.display()));
    let mut capability_ids = HashSet::new();
    let mut total_bytes = 0_u64;
    for capability in manifest.capabilities {
        assert!(
            capability_ids.insert(capability.id.clone()),
            "duplicate capability ID {}",
            capability.id
        );
        assert!(
            !capability.version.is_empty(),
            "capability version is empty"
        );
        assert!(
            !capability.description.is_empty(),
            "capability description is empty"
        );
        assert!(
            matches!(
                capability.risk_class.as_str(),
                "read" | "analyze" | "fetch" | "stage"
            ),
            "invalid risk class for {}",
            capability.id
        );
        assert!(
            !capability.required_tools.is_empty(),
            "{} has no required tools",
            capability.id
        );
        assert!(
            !capability.artifact_kinds.is_empty(),
            "{} has no artifact kinds",
            capability.id
        );
        assert!(
            !capability.resources.is_empty(),
            "{} has no resources",
            capability.id
        );

        let mut resource_ids = HashSet::new();
        for resource in capability.resources {
            assert!(
                resource_ids.insert(resource.id.clone()),
                "duplicate resource ID {} in {}",
                resource.id,
                capability.id
            );
            assert!(!resource.label.is_empty(), "resource label is empty");
            assert_eq!(resource.media_type, "text/markdown");
            let requested = root.join(Path::new(&resource.path));
            let canonical = requested.canonicalize().unwrap_or_else(|error| {
                panic!("could not resolve {}: {error}", requested.display())
            });
            assert!(
                canonical.starts_with(&canonical_root),
                "resource {} escapes the canonical skill directory",
                resource.path
            );
            println!("cargo:rerun-if-changed={}", canonical.display());
            let bytes = std::fs::read(&canonical)
                .unwrap_or_else(|error| panic!("could not read {}: {error}", canonical.display()));
            let byte_count = u64::try_from(bytes.len()).expect("resource length should fit u64");
            assert!(
                byte_count <= MAX_RESOURCE_BYTES,
                "resource {} exceeds the per-resource bound",
                resource.path
            );
            total_bytes = total_bytes
                .checked_add(byte_count)
                .expect("resource size total overflowed");
            assert_eq!(
                sha256(&bytes),
                resource.sha256,
                "resource digest changed for {}",
                resource.path
            );
        }
    }
    assert!(
        total_bytes <= MAX_TOTAL_RESOURCE_BYTES,
        "capability resources exceed the compiled size bound"
    );
    println!(
        "cargo:rustc-env=OKF_CAPABILITY_MANIFEST_SHA256={}",
        sha256(&manifest_bytes)
    );

    let pack_path = root.join("pack.json");
    println!("cargo:rerun-if-changed={}", pack_path.display());
    let pack_bytes = std::fs::read(&pack_path)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", pack_path.display()));
    let pack: PackManifest = serde_json::from_slice(&pack_bytes)
        .unwrap_or_else(|error| panic!("invalid {}: {error}", pack_path.display()));
    assert_eq!(pack.schema_version, 1, "unsupported capability pack schema");
    assert!(!pack.id.is_empty(), "capability pack ID is empty");
    assert!(!pack.version.is_empty(), "capability pack version is empty");
    assert!(!pack.name.is_empty(), "capability pack name is empty");
    assert!(
        !pack.description.is_empty(),
        "capability pack description is empty"
    );
    assert!(
        !pack.publisher.is_empty(),
        "capability pack publisher is empty"
    );
    assert_eq!(pack.provenance, "built-in", "unsupported pack provenance");
    assert_eq!(
        pack.compatibility.capability_schema_version, 1,
        "unsupported pack capability schema"
    );
    assert_eq!(
        pack.compatibility.artifact_schema_version, 1,
        "unsupported pack artifact schema"
    );
    assert!(
        !pack.compatibility.minimum_studio_version.is_empty(),
        "pack compatibility is empty"
    );
    assert!(
        !pack.conflicts.iter().any(|conflict| conflict == &pack.id),
        "capability pack conflicts with itself"
    );
    assert_eq!(
        pack.capability_manifest.path, "capabilities.json",
        "pack capability manifest path is not closed"
    );
    assert_eq!(
        pack.capability_manifest.media_type, "application/json",
        "pack capability manifest media type is invalid"
    );
    assert!(
        pack.capability_manifest.id.is_none(),
        "pack capability manifest must not use a resource ID"
    );
    assert_eq!(
        pack.capability_manifest.sha256,
        sha256(&manifest_bytes),
        "pack capability manifest digest changed"
    );
    assert!(!pack.templates.is_empty(), "pack templates are empty");
    assert!(
        !pack.artifact_schemas.is_empty(),
        "pack artifact schemas are empty"
    );
    assert!(
        !pack.required_studio_tools.is_empty(),
        "pack Studio tool set is empty"
    );
    let mut pack_resource_ids = HashSet::new();
    for resource in pack.templates.iter().chain(&pack.artifact_schemas) {
        let id = resource
            .id
            .as_ref()
            .expect("declarative pack resources require IDs");
        assert!(
            pack_resource_ids.insert(id),
            "duplicate pack resource ID {id}"
        );
        let path = root.join(&resource.path);
        println!("cargo:rerun-if-changed={}", path.display());
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|error| panic!("could not resolve {}: {error}", path.display()));
        assert!(
            canonical.starts_with(&canonical_root),
            "pack resource escapes its root: {}",
            resource.path
        );
        assert!(
            matches!(
                resource.media_type.as_str(),
                "text/markdown" | "application/schema+json"
            ),
            "pack resource has unsupported media type: {}",
            resource.path
        );
        let bytes = std::fs::read(&canonical)
            .unwrap_or_else(|error| panic!("could not read {}: {error}", canonical.display()));
        assert_eq!(
            resource.sha256,
            sha256(&bytes),
            "pack resource digest changed for {}",
            resource.path
        );
    }
    println!(
        "cargo:rustc-env=OKF_CAPABILITY_PACK_SHA256={}",
        sha256(&pack_bytes)
    );
}

fn main() {
    validate_capabilities();
    tauri_build::build()
}
