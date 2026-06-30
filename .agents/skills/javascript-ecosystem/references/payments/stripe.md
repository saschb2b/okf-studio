---
type: Library Notes
title: "Stripe"
description: "The stack moved off the Charges/Sources/Tokens model to PaymentIntents plus Payment Methods, and off the single Card Element to the unified Payment Element."
tags: [javascript, payments]
timestamp: 2026-06-04T00:00:00Z
---
# Stripe

**Verified 2026-06-04.** Check the installed `stripe`, `@stripe/stripe-js`, and `@stripe/react-stripe-js` versions first; re-verify if newer than below.

**Current stable**: `stripe` (Node) v22; `@stripe/react-stripe-js` v6; pinned API version `2026-05-27.dahlia`. **LLM default bias**: `stripe` v8 to v12 with old API versions, the Charges API (`stripe.charges.create`), `react-stripe-js` v1 with `CardElement`, and the raw token flow (`stripe.createToken`).

## The shift
The stack moved off the Charges/Sources/Tokens model to PaymentIntents plus Payment Methods, and off the single Card Element to the unified Payment Element. Stripe now recommends the Checkout Sessions API driving the Payment Element for most integrations, with raw PaymentIntents only when you need full control.

## Stop / Start
| Stop (legacy Stripe) | Start (current Stripe) |
| --- | --- |
| `stripe.charges.create(...)` | `stripe.paymentIntents.create(...)` or Checkout Sessions (SetupIntents to save cards) |
| `stripe.createToken` / `createSource` | The Payment Methods API attached to PaymentIntents |
| `<CardElement>` | `<PaymentElement>` (all methods in one mount) |
| Hand-rolling tax, shipping, discounts on bare PaymentIntents | Checkout Sessions (hosted or embedded Payment Element) |
| `apiVersion: '2022-11-15'` | The SDK's current pinned default (or `2026-05-27.dahlia`) |
| Token flows with `useStripe`/`useElements` + `CardElement` | `<Elements options={{ clientSecret }}>` + `<PaymentElement>` + `stripe.confirmPayment({ elements })` |
| Trusting raw webhook bodies | `stripe.webhooks.constructEvent(rawBody, sig, endpointSecret)` |

## Gotchas
- Each major SDK bump advances the pinned API version; pin `apiVersion` deliberately and read the changelog.
- Webhook verification needs the raw, unparsed body; a JSON body parser before `constructEvent` breaks signatures (use `express.raw`).
- The Charges API is legacy but not deleted for cards; all new payment-method and SCA features ship only on PaymentIntents.
- `@stripe/react-stripe-js` v6 deprecated `useCheckout()` in favor of `useCheckoutElements()`/`useCheckoutForm()`.

## Sources
- https://docs.stripe.com/payments/payment-element
- https://github.com/stripe/stripe-node/releases
