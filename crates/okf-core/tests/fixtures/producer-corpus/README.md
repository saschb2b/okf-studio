# Producer compatibility corpus

This directory is a deterministic, network-free parser corpus for bundles made outside OKF Studio.

The `google-*` directories contain reduced, modified excerpts from the GoogleCloudPlatform/knowledge-catalog sample bundles at commit `d44368c15e38e7c92481c5992e4f9b5b421a801d` (2026-06-21). Sections that do not affect the declared compatibility contract were omitted. Each modified source file carries a notice. The excerpts remain under Apache-2.0; see `LICENSE-Apache-2.0.txt`.

`adversarial-extensions` was authored for OKF Studio and is covered by the repository's MIT license. It proves that nested producer fields and an encoded Markdown target survive parsing.

`manifest.json` is the test oracle. Refreshing a Google excerpt is a deliberate source update: pin a new commit, review the diff, update the declared expectations, and run `cargo test -p okf-core --test producer_compatibility` without network access.
