# Visa / Mastercard reason codes — handler matrix

Authoritative source for CE 3.0 details: [`verified-facts-stripe-visa-ce3.md`](./verified-facts-stripe-visa-ce3.md).

| Visa code | Description | CE 3.0 eligible? | dispute-defender support | Notes |
|-----------|-------------|------------------|--------------------------|-------|
| **10.4** | Other Fraud — Card-Absent Environment | ✅ YES (the main CE 3.0 code) | Full template, CE 3.0 enhanced evidence path | The only Visa reason code where Stripe surfaces the CE 3.0 enhanced evidence option. |
| **13.1** | Services Not Provided / Merchandise Not Received | ❌ No | Standard evidence template | Use delivery proof + tracking + customer comm metadata. |
| **13.2** | Cancelled Recurring Transaction | ❌ No | Standard evidence template | Use cancellation policy URL + last-login timestamps + usage events post-cancellation. |
| **13.3** | Not as Described / Defective Merchandise | ❌ No | Standard evidence template | Use product description + customer comm metadata. |
| **13.5** | Misrepresentation | ❌ No | Standard evidence template | Use terms acceptance hash + product description. |
| **13.6** | Credit Not Processed | ❌ No | **MANUAL REVIEW** (not auto-handled in v0.2) | Refund refusal disputes are highly fact-specific; route to human. |
| **12.x** | Processing Errors (12.1–12.7) | ❌ No | **MANUAL REVIEW** (not auto-handled in v0.2) | Most 12.x disputes resolve via reversal/representment, not evidence submission. |

## Mastercard

As of April 2026, Stripe does **NOT** publicly support a Mastercard First-Party Trust enhanced-evidence object in the Dispute API. dispute-defender treats all Mastercard friendly-fraud disputes (typically network reason code `4837`) via standard `evidence.*` fields. Watch <https://docs.stripe.com/changelog> for additions.

## What "manual review" means

If a dispute lands with an unsupported reason code, the tool:
1. Records it in `disputes` table.
2. Does **NOT** auto-collect evidence.
3. Does **NOT** auto-generate a PDF.
4. Surfaces it on the dashboard with a `manual_review_required` audit log entry.

Operator must respond via the standard Stripe Dashboard or write a custom adapter handler.

## Why we don't auto-handle every reason code

Stripe's `reason` enum has limited resolution. The authoritative gating field for CE 3.0 is `payment_method_details.card.network_reason_code === "10.4"`. A dispute Stripe categorizes as `unrecognized` (Stripe's own bucket) may surface under any number of network reason codes depending on issuer behavior — we don't reverse-engineer that. We use Stripe's pre-flagged `enhanced_eligibility_types` array as the source of truth.

## When in doubt

Read [`verified-facts-stripe-visa-ce3.md`](./verified-facts-stripe-visa-ce3.md) — it contains the verbatim Stripe and Visa quotes, the discrepancies between them, and the implementation rules we encoded. Update that file FIRST when the underlying facts change.
