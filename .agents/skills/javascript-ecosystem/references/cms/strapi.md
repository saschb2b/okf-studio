---
type: Library Notes
title: "Strapi"
description: "Strapi 5 replaces the Entity Service API with the Document Service API: content is modeled as documents identified by a string `documentId`, and Draft & Publish treats draft and published as..."
tags: [javascript, cms]
timestamp: 2026-06-04T00:00:00Z
---
# Strapi

**Verified 2026-06-04.** Check the installed `@strapi/strapi` version first; re-verify if newer than below.

**Current stable**: 5.x (5.47); 5.0 shipped Sep 2024. **LLM default bias**: Strapi v4. The Entity Service API (`strapi.entityService.*`), the nested `data.attributes` REST wrapper, numeric `id` as the only identifier, and draft/publish as a boolean.

## The shift
Strapi 5 replaces the Entity Service API with the Document Service API: content is modeled as documents identified by a string `documentId`, and Draft & Publish treats draft and published as distinct document versions. The REST and GraphQL response shape is flattened so attributes are no longer wrapped in `data.attributes`. Strapi 5 is TypeScript-first with an automated upgrade tool.

## Stop / Start
| Stop (Strapi v4) | Start (Strapi 5) |
| --- | --- |
| `strapi.entityService.findMany('api::x.x', ...)` | `strapi.documents('api::x.x').findMany(...)` |
| Keying records by numeric `id` in API calls | The string `documentId` |
| `response.data.attributes.title` | `response.data.title` (flattened, no `attributes` wrapper) |
| Draft/publish as a boolean flag | The version-based Draft & Publish model (the `status` param) |
| Core-service overrides written against Entity Service | Core services that delegate to the Document Service |
| The old GraphQL schema shape | The updated v5 GraphQL API (flattened, documentId-aware) |

## Gotchas
- Run the official upgrade tool (`npx @strapi/upgrade major`), which applies codemods; v4 to v5 is a real migration.
- Use the `Strapi-Response-Format: v4` request header as a temporary shim to migrate REST consumers endpoint-by-endpoint.
- REST still exposes a legacy `id` alongside `documentId`, but standardize new code on `documentId`.
- Strapi v4 support ended around April 2026.

## Sources
- https://docs.strapi.io/cms/migration/v4-to-v5/introduction-and-faq
- https://docs.strapi.io/cms/api/document-service
