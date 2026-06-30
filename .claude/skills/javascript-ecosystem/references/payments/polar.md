---
type: Library Notes
title: "Polar"
description: "Polar is a merchant-of-record (MoR) billing platform, not a PSP."
tags: [javascript, payments]
timestamp: 2026-06-04T00:00:00Z
---
# Polar

**Verified 2026-06-04.** Check the installed `@polar-sh/sdk` version first; re-verify if newer than below.

**Current stable**: `@polar-sh/sdk` v0.x (pre-1.0); framework adapters (`@polar-sh/nextjs`, etc.) are versioned separately. **LLM default bias**: little to no training coverage. Models tend to not know Polar or conflate it with Stripe, so the risk is an invented API surface.

## The shift
Polar is a merchant-of-record (MoR) billing platform, not a PSP. It is the legal seller, so it collects and remits sales tax, VAT, and GST worldwide on your behalf. The mental model is: create a Checkout, redirect or embed it, then react to webhooks that grant entitlements (license keys, GitHub/Discord access, downloads, meter credits), rather than orchestrating PaymentIntents yourself.

## Stop / Start
| Stop (LLM default) | Start (Polar) |
| --- | --- |
| Reaching for Stripe to also "handle my taxes" | An MoR (Polar) when you want tax and VAT compliance off your plate |
| A Stripe mental model for Polar | `new Polar({ accessToken, server: 'sandbox' \| 'production' })` |
| Building checkout from low-level intents | `polar.checkouts.create({ products, successUrl })` then redirect |
| snake_case fields from raw REST | The SDK's camelCase params |
| Polling for payment status | Webhook handlers (`order.paid`, subscription events) that grant access |
| Hand-coding entitlement delivery | Polar "benefits" (license keys, downloads, GitHub/Discord roles, meter credits) |

## Gotchas
- The SDK is pre-1.0; the surface moves between minor versions, so pin exact versions.
- As an MoR, Polar takes the buyer relationship and a higher headline fee than a raw PSP.
- Use `server: 'sandbox'` in development; production needs the flag switched plus a production token.
- SDK and framework adapters version independently; check compatibility.
- Context: Lemon Squeezy was acquired by Stripe; Stripe Managed Payments is Stripe's own MoR offering.

## Sources
- https://polar.sh/docs/integrate/sdk/typescript
- https://github.com/polarsource/polar-js
