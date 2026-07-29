//! Print how a bundle divides into delegated runs.
//!
//! The orchestration surface does not exist yet, so this is how the slice
//! service can be pointed at a real bundle and read:
//!
//!     cargo run -p okf-core --example plan-slices -- <bundle-path> [folder|type|tag|link]
//!
//! Read-only. It parses the bundle and prints a plan; nothing runs, nothing is
//! sent anywhere, and no agent is contacted.

use okf_core::slice::{plan_slices, SliceBy, SliceExclusion, SliceLimits, SliceRequest};
use std::path::Path;

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(root) = args.next() else {
        eprintln!("usage: plan-slices <bundle-path> [folder|type|tag|link]");
        std::process::exit(2);
    };
    let by = match args.next().as_deref().unwrap_or("type") {
        "folder" => SliceBy::Folder,
        "tag" => SliceBy::Tag,
        "link" => SliceBy::LinkNeighbourhood,
        _ => SliceBy::Type,
    };

    let bundle = okf_core::read_bundle(Path::new(&root));
    let plan = plan_slices(
        &bundle,
        &SliceRequest {
            by,
            limits: SliceLimits::default(),
        },
    );

    println!("{} — {} concepts", bundle.name, bundle.concepts.len());
    println!("fingerprint {}", plan.fingerprint);
    println!(
        "\n{:?} divides this bundle into {} run(s):\n",
        by,
        plan.slices.len()
    );
    for slice in &plan.slices {
        println!(
            "  {:<28} {:>3} concepts",
            slice.title,
            slice.concept_ids.len()
        );
        for id in slice.concept_ids.iter().take(3) {
            println!("      {id}");
        }
        if slice.concept_ids.len() > 3 {
            println!("      … {} more", slice.concept_ids.len() - 3);
        }
    }

    if plan.exclusions.is_empty() {
        println!("\nNothing was excluded.");
        return;
    }
    println!("\nExcluded:");
    for exclusion in &plan.exclusions {
        match exclusion {
            SliceExclusion::SlicesOverWidth {
                dropped_keys,
                limit,
            } => println!(
                "  width cap {limit}: dropped {} slice(s), starting at {}",
                dropped_keys.len(),
                dropped_keys.first().map(String::as_str).unwrap_or("-")
            ),
            SliceExclusion::ConceptsOverSliceCap {
                slice_key,
                dropped,
                limit,
            } => println!("  {slice_key}: {dropped} concept(s) over the per-slice cap of {limit}"),
            SliceExclusion::Unslicable {
                concept_ids,
                reason,
            } => println!("  {} concept(s) skipped: {reason}", concept_ids.len()),
        }
    }
}
