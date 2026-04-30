# Verified-Facts Appendix: Stripe Visa CE 3.0 (April 2026)

A ground-truth reference document for `dispute-defender` (TypeScript/Next.js). All claims are sourced to Stripe or Visa primary docs unless otherwise noted. Where docs are ambiguous or where Stripe's behavior diverges from Visa's published rules, this is flagged inline.

## TL;DR

- Stripe's CE 3.0 implementation lives at `evidence.enhanced_evidence.visa_compelling_evidence_3` on the Dispute Update API; it requires exactly two prior undisputed charge IDs plus matching primary/secondary evidence elements, and Stripe documents the eligibility window as **"within 120-364 days"** (an off-by-one against Visa's own "120 to 365 days" published in the March 2023 Merchant Readiness PDF, see Question 2).
- The current default Stripe API version as of April 2026 is **`2026-04-22.dahlia`**; CE 3.0 was added in **`2024-10-28.acacia`** and first appeared in **stripe-node v17.3.0**. The latest stable `stripe` npm package is **v22.1.0** (pinned to `2026-03-25.dahlia`), and it ships full TypeScript types for CE 3.0 enhanced evidence.
- There is no Stripe Mastercard First-Party Trust object in the public API as of April 2026 (the only sibling under `enhanced_evidence` is `visa_compliance`); webhook signature verification still requires the unmodified raw body, which means Next.js webhook routes should run on the Node runtime and use `constructEvent` (or `constructEventAsync` + `Stripe.createSubtleCryptoProvider()` if Edge is required).

---

## Key Findings (organized by the 12 questions)

### 1. Stripe CE 3.0 API exact payload shape

Source: `https://docs.stripe.com/api/disputes/update` (full reference fetched) and `https://docs.stripe.com/disputes/api/visa-ce3`.

Top-level path: `evidence.enhanced_evidence.visa_compelling_evidence_3` (object, optional).

**`disputed_transaction` (object, optional) fields, all snake_case:**

| Field | Type | Notes (verbatim from Stripe API ref) |
|---|---|---|
| `customer_account_id` | string, optional | "User Account ID used to log into business platform. Must be recognizable by the user." |
| `customer_device_fingerprint` | string, optional | "Unique identifier of the cardholder's device derived from a combination of at least two hardware and software attributes. **Must be at least 20 characters.**" |
| `customer_device_id` | string, optional | "Unique identifier of the cardholder's device such as a device serial number (e.g., IMEI). **Must be at least 15 characters.**" |
| `customer_email_address` | string, optional | "The email address of the customer." |
| `customer_purchase_ip` | string, optional | "The IP address that the customer used when making the purchase." |
| `merchandise_or_services` | enum, optional | Values: `merchandise` or `services`. |
| `product_description` | string, optional | "A description of the product or service that was sold." |
| `shipping_address` | object, optional | "All fields are required for Visa Compelling Evidence 3.0 evidence submission." Sub-fields below. |
| `shipping_address.city` | string, optional | "City, district, suburb, town, or village." |
| `shipping_address.country` | string, optional | "Two-letter country code (ISO 3166-1 alpha-2)." |
| `shipping_address.line1` | string, optional | "Address line 1, such as the street, PO Box, or company name." |
| `shipping_address.line2` | string, optional | "Address line 2, such as the apartment, suite, unit, or building." |
| `shipping_address.postal_code` | string, optional | "ZIP or postal code." |
| `shipping_address.state` | string, optional | "State, county, province, or region (ISO 3166-2)." |

**`prior_undisputed_transactions` (array of objects, optional):** Stripe describes this verbatim as "List of exactly two prior undisputed transaction objects for Visa Compelling Evidence 3.0 evidence submission." Each element has these fields:

| Field | Type | Notes |
|---|---|---|
| `charge` | **string, REQUIRED** | "Stripe charge ID for the Visa Compelling Evidence 3.0 eligible prior charge." (This is the only required field on the array element.) |
| `customer_account_id` | string, optional | Same definition as on `disputed_transaction`. |
| `customer_device_fingerprint` | string, optional | Same definition; greater than or equal to 20 chars. |
| `customer_device_id` | string, optional | Same definition; greater than or equal to 15 chars. |
| `customer_email_address` | string, optional | Same definition. |
| `customer_purchase_ip` | string, optional | Same definition. |
| `product_description` | string, optional | Same definition. |
| `shipping_address` | object, optional | Same sub-fields as on `disputed_transaction`. |

**Note:** The `disputed_transaction` object does **not** have a `charge` field. The disputed charge is implicit from the dispute being updated. Only the prior transactions reference a `charge` ID. There is no `merchandise_or_services` field on prior transactions; that is a property of the disputed transaction only.

**Sibling under `enhanced_evidence`:** `visa_compliance` with one boolean field `fee_acknowledged` (used to acknowledge Stripe's USD 500 network fee for compliance disputes, unrelated to CE 3.0 but lives in the same parent).

---

### 2. Eligibility window (Stripe vs Visa)

**Stripe (verbatim from `https://docs.stripe.com/disputes/api/visa-ce3`):**
> "The previous non-disputed transactions must be **within 120-364 days** of the disputed transaction."

**Visa (from the March 2023 Merchant Readiness PDF, `usa.visa.com/.../compelling-evidence-3.0-merchant-readiness-mar2023.pdf`, surfaced via search excerpts and Visa's own FAQ PDF "Evolution of Compelling Evidence: Client FAQs", October 2022):**
> "The transactions must be at least **120 days old but no older than 365 days** (calculated from the dispute…)" / FAQ Q13: "What is the maximum age of transactions that can be used? **365 days**. So, transactions that fall **120 - 365 days** after the dispute date can be utilized to meet the [criteria]."

**Discrepancy flag, confirmed and material:** Stripe's docs say `120-364`, Visa says `120-365`. This is a real one-day off-by-one in Stripe's documentation. Practical guidance for `dispute-defender`:
- The Stripe API will return `requires_action` / `not_qualified` based on Stripe's own validator. Using Stripe's tighter bound (less than or equal to 364 days) is the safe operating window.
- For prior charges that are exactly 365 days old at the moment of submission, do not assume Stripe will accept them, even though Visa would.
- The 120-day floor does not apply to original credit transactions / Account Funding Transactions (AFT) per Visa's PDF, but Stripe's docs do not document this carve-out, so don't rely on it via Stripe's API.

Both are inclusive ranges in the source text ("within 120-364 days" / "120 - 365 days"), measured from the disputed transaction date.

---

### 3. Matching element rules

Source (verbatim from `https://docs.stripe.com/disputes/api/visa-ce3`):

> "The disputed transaction and both past undisputed transactions must match either:
> - Two main evidence elements (for example, Customer Purchase IP and Customer Device Fingerprint).
> - One main evidence element and one secondary evidence element (for example, Customer Device ID and Customer Account ID).
>
> | Main evidence elements | Secondary evidence elements |
> | --- | --- |
> | Customer purchase IP | Shipping address |
> | Customer device fingerprint or customer device ID | Customer email address |
> |  | Customer Account ID |
>
> Customer Device Fingerprint **and** Customer Device ID isn't a valid evidence combination."

**Decoding the Stripe table:**
- "Main" elements: (a) `customer_purchase_ip`, (b) `customer_device_fingerprint` OR `customer_device_id` (these two count as ONE category, not two).
- "Secondary" elements: `shipping_address`, `customer_email_address`, `customer_account_id`.

**Valid combinations for liability shift (Stripe-encoded):**
- `customer_purchase_ip` + (`customer_device_fingerprint` OR `customer_device_id`), the "two main" path.
- `customer_purchase_ip` + any one secondary.
- (`customer_device_fingerprint` OR `customer_device_id`) + any one secondary.

**Explicitly invalid:** `customer_device_fingerprint` + `customer_device_id` alone. Stripe's docs call this out as not a valid combination. So "device fingerprint + device ID alone" does **not** qualify; you need either an IP or a non-device secondary element.

**Visa's published rule** (per Merchant Readiness PDF and the Visa FAQ): At least two of four data elements must match across all three transactions, and **one of the two must be either the IP address or the device ID/fingerprint**. Stripe's table effectively encodes that: every valid Stripe combination contains at least one of `customer_purchase_ip` or `customer_device_fingerprint`/`customer_device_id`.

The Stripe API validator surfaces the result via `evidence_details.enhanced_eligibility.visa_compelling_evidence_3.status` (`qualified` | `requires_action` | `not_qualified`) and a `required_actions` array (e.g. `missing_merchandise_or_services`, `missing_disputed_transaction_description`).

---

### 4. Number of prior transactions

Stripe's Update Dispute API reference describes `prior_undisputed_transactions` as:

> "List of **exactly two** prior undisputed transaction objects for Visa Compelling Evidence 3.0 evidence submission."

So the contract is **exactly 2**, not "at least 2" and not "up to 2". Submitting 1 or 3 will fail validation: the dispute will not transition to `qualified` (it will sit in `requires_action`). The CE 3.0 docs ("There must be at least two previous transactions…") refer to the existence requirement on the merchant's history, not the array shape; the API parameter is fixed at 2.

This matches Visa's own program rule (the merchant must supply **two** prior undisputed transactions). Visa's pre-dispute Order Insight flow can pre-select 2 to 5 candidates, but for the post-dispute CE 3.0 evidence submission, exactly two are submitted.

---

### 5. Stripe Node SDK current typing

- **Latest stable:** `stripe@22.1.0` on npm, published roughly 6 days before the search snapshot (i.e. mid-late April 2026), pinned to API version `2026-03-25.dahlia`.
- v22.0.0 was a typing-overhaul major: types are now inline with implementation in TypeScript files, the top-level "stripe" ambient module was removed (you can import-alias the package), `Stripe.StripeContext` is no longer exported as a type (use `Stripe.StripeContextType`), and `new Stripe()` is now required (the function-call form `Stripe(...)` no longer works).
- v21 introduced the `Decimal` vendored type and pinned `2026-03-25.dahlia`.
- CE 3.0 typing was added in **stripe-node v17.3.0** alongside API version `2024-10-28.acacia` (per the Stripe changelog page).

**Type path:** Stripe-node uses nested namespaces that mirror the API parameter hierarchy. The path for the request-side type is:

```ts
Stripe.DisputeUpdateParams.Evidence.EnhancedEvidence.VisaCompellingEvidence3
```

with sub-namespaces:

```ts
Stripe.DisputeUpdateParams.Evidence.EnhancedEvidence.VisaCompellingEvidence3.DisputedTransaction
Stripe.DisputeUpdateParams.Evidence.EnhancedEvidence.VisaCompellingEvidence3.PriorUndisputedTransaction
```

(corroborated by the Go SDK type names `DisputeUpdateEvidenceEnhancedEvidenceVisaCompellingEvidence3Params` and the PHP/Java/.NET parallels: stripe-node uses the same generator). The response-side (read) type lives at `Stripe.Dispute.Evidence.EnhancedEvidence.VisaCompellingEvidence3` and the eligibility status at `Stripe.Dispute.EvidenceDetails.EnhancedEligibility.VisaCompellingEvidence3` with `Status = 'qualified' | 'requires_action' | 'not_qualified'`.

**Caveat:** The exact `Stripe.DisputeUpdateParams.Evidence.EnhancedEvidence.VisaCompellingEvidence3` token is the SDK convention; if you want belt-and-suspenders, run `tsc --noEmit` against a sample object literal before committing. If for any reason your API version pin is older than `2024-10-28.acacia` and the type isn't present, the workaround is:

```ts
const evidence = {
  enhanced_evidence: {
    visa_compelling_evidence_3: { /* ... */ },
  },
} as unknown as Stripe.DisputeUpdateParams['evidence'];
```

…or use `// @ts-ignore stripe-version-<your-version>` per Stripe's documented advice.

**Type-boundary caution from Stripe (verbatim):** "you might see new type errors from TypeScript as you upgrade minor versions of stripe-node, that you can resolve by adding additional type guards." So don't pin TS strictness assumptions to a specific stripe-node minor.

---

### 6. Stripe API version

- **Current default API version (April 2026):** `2026-04-22.dahlia` (per `https://docs.stripe.com/api/versioning`, verbatim: "The current version is 2026-04-22.dahlia.").
- **CE 3.0 was added in:** `2024-10-28.acacia` (per `https://docs.stripe.com/changelog/acacia/2024-10-28/visa-compelling-evidence-3-0`). The corresponding Node SDK version is **17.3.0**.
- **Release-train sequence of major (breaking) versions:** `2024-09-30.acacia` (first acacia) to `2025-03-31.basil` to `2025-09-30.clover` to `2026-03-25.dahlia` (current major). Monthly minor releases sit under the current major name (e.g. `2026-04-22.dahlia`, `2025-10-29.clover`, `2026-02-25.clover`, `2026-01-28.clover`).
- **`apiVersion: "2024-11-20.acacia"` in the constructor:** Note that there is no published `2024-11-20.acacia` minor: the relevant acacia release for CE 3.0 is `2024-10-28.acacia`. If you're seeing `2024-11-20.acacia` in older example code, it's likely a typo or an earlier internal pin; verify against `docs.stripe.com/changelog`. **Any acacia release greater than or equal to 2024-10-28.acacia supports CE 3.0**, and basil/clover/dahlia all carry it forward (with a typing change in basil/clover where `Dispute.enhanced_eligibility_types` was widened from a single-value literal to an enum that adds `visa_compliance`).
- **Practical recommendation for `dispute-defender`:** pin to the same API version as your stripe-node package's pinned version (`2026-03-25.dahlia` for v21/v22). Don't downgrade to acacia just for CE 3.0: newer versions are supersets.

---

### 7. Webhook runtime constraints

Source: `https://docs.stripe.com/webhooks` and `https://docs.stripe.com/webhooks/signature`, verbatim: "Stripe requires the **raw body of the request** to perform signature verification. If you're using a framework, make sure it doesn't manipulate the raw body. **Any manipulation to the raw body of the request causes the verification to fail.**"

This is still accurate as of April 2026. There is no Stripe-supported "edge-friendly" verification that bypasses the raw-body requirement.

**Edge runtime is not strictly forbidden, but is risky:**
- Node's classic `crypto` module is unavailable on Edge / Workers / Deno.
- Stripe-node provides `Stripe.createSubtleCryptoProvider()` and an async verifier `stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider())`. This works on Cloudflare Workers, Deno, and Next.js Edge runtime *when* you read the raw body via `await request.text()` (NOT `request.json()`).
- Cloudflare's official Stripe Workers template uses this pattern (per the Cloudflare blog post on native Stripe SDK support).
- In Next.js App Router (`app/api/.../route.ts`), `await req.text()` returns the raw body for POST requests; this works on both `runtime = "nodejs"` and `runtime = "edge"`. With the older Pages Router, you must export `config = { api: { bodyParser: false } }` and read with `micro`'s `buffer()` or equivalent.

**Recommendation for `dispute-defender`:** keep the webhook route on `runtime = "nodejs"` (the default) and use `stripe.webhooks.constructEvent(rawBody, sig, secret)`. Switch to `constructEventAsync` + Subtle Crypto only if you have a hard reason to run on Edge. The risk on Edge is not Stripe's verification logic: it's the surrounding framework silently parsing the body before you read it.

---

### 8. Test mode for CE 3.0

Source: `https://docs.stripe.com/disputes/api/visa-ce3` (Testing section, verbatim).

Stripe provides a dedicated test fixture:

| Token type | Value |
|---|---|
| Card Number | `4000000404000038` |
| PaymentMethod | `pm_card_createCe3EligibleDispute` |
| Token | `tok_createCe3EligibleDispute` |

Behavior:
- This card creates a dispute that Stripe flags as CE 3.0 eligible.
- "When providing evidence for this dispute, you can submit any two test environment transactions in the `prior_undisputed_transactions.charge` field."
- "Stripe doesn't validate the prior transactions' payment method or transaction date while testing. We'll validate primary and secondary evidence elements according to Visa CE 3.0 rules.": i.e. element-matching IS validated in test mode; charge eligibility (Visa brand, 10.4 reason, 120 to 364 day window) is **not**.
- After submission: status will be `qualified` or `not_qualified`. Note: "The Visa CE 3.0 status doesn't impact the dispute status."
- To force a final won/lost outcome on the test dispute, set `evidence.uncategorized_text` to `winning_evidence` or `losing_evidence` (per `https://docs.stripe.com/testing` evidence section).

**Stripe CLI `stripe trigger`:** there is **no** CE 3.0-specific trigger event. The CLI's documented trigger list (per `github.com/stripe/stripe-cli/wiki/trigger-command`) includes `charge.dispute.created` but no `*.ce3.*` event. To exercise CE 3.0 in test mode you must:
1. Create a payment with `pm_card_createCe3EligibleDispute`.
2. Wait for or trigger `charge.dispute.created`.
3. PATCH the dispute with the evidence object (with `submit: false` first to inspect the eligibility status, then `submit: true`).

---

### 9. What `submit: false` means

Source: `https://docs.stripe.com/api/disputes/update` (Parameter table, verbatim):

> "`submit` (boolean, optional): Whether to immediately submit evidence to the bank. If `false`, evidence is staged on the dispute. Staged evidence is visible in the API and Dashboard, and can be submitted to the bank by making another request with this attribute set to `true` (the default)."

Resolved semantics:
- **Omitting `submit`** to defaults to `true` to evidence is submitted to the issuer immediately. **One-shot, irreversible.**
- **`submit: true`** to same as omitting it.
- **`submit: false`** to staged: evidence is saved on the dispute object and visible in Dashboard/API, but NOT sent to the issuer yet. Subsequent updates can refine fields. To finalize, call `disputes.update` again with `submit: true` (you can pass an empty body or repeat the fields).
- "Staged" is functionally the closest thing Stripe has to a "draft", though Stripe never uses that word in the official text.
- Per the CE 3.0 doc: "To update evidence without submitting it, make sure the `submit` parameter is set to `false`.": so `submit: false` is the recommended idiom for inspecting the resulting `enhanced_eligibility.visa_compelling_evidence_3.status` before finalizing.

After submission, evidence cannot be edited or resubmitted: "A dispute can only be submitted once. After submission, no additional edits or supplemental evidence are allowed to be added." (`https://docs.stripe.com/issuing/purchases/disputes`, applicable principle to acquiring disputes too per `https://docs.stripe.com/disputes/responding`).

---

### 10. Reason code mapping

Stripe's dispute object exposes both:
- `reason`: Stripe's own categorical string (e.g. `fraudulent`, `unrecognized`, `duplicate`, `general`, `subscription_canceled`, `product_not_received`, `product_unacceptable`, `credit_not_processed`, etc.).
- `payment_method_details.card.network_reason_code`: the **actual** card-network reason code (e.g. `"10.4"`, `"13.1"`, `"4837"` for Mastercard) as a string.

Source: Stripe's CE 3.0 doc shows it explicitly in the example response:
```json
"payment_method_details": { "card": { "brand": "visa", "network_reason_code": "10.4" } },
"reason": "fraudulent"
```

**For CE 3.0 eligibility, the gating field is `network_reason_code === "10.4"`, not `reason`.** Stripe's `reason` enum doesn't have enough resolution to determine CE 3.0 eligibility on its own:
- `reason: "fraudulent"`: typically maps to Visa 10.4 (Other Fraud, Card-Absent Environment) for CNP transactions, and is the category Visa CE 3.0 covers.
- `reason: "unrecognized"`: Stripe's "Unrecognized" category is its own bucket. Per Stripe's reason code categories doc, `unrecognized` is distinct from `fraudulent`. CE 3.0 applies **only** to disputes where the network reason code is `10.4`. An "unrecognized" Stripe-categorized dispute may or may not surface as `network_reason_code: "10.4"` depending on how the issuer filed it; the authoritative gate is the network reason code, not Stripe's category.

**Practical rule for `dispute-defender`:**
```ts
const isCe3Eligible =
  dispute.payment_method_details?.card?.brand === "visa" &&
  dispute.payment_method_details?.card?.network_reason_code === "10.4" &&
  dispute.enhanced_eligibility_types?.includes("visa_compelling_evidence_3");
```

The presence of `"visa_compelling_evidence_3"` in `enhanced_eligibility_types` is Stripe's own pre-flagged eligibility indicator: use that as the source of truth rather than reverse-engineering from `reason`.

---

### 11. Mastercard parallel

**As of April 2026, Stripe does NOT publicly support a Mastercard First-Party Trust enhanced-evidence object in the Dispute API.**

- The Stripe Update Dispute API reference shows two and only two siblings under `enhanced_evidence`: `visa_compelling_evidence_3` and `visa_compliance` (the latter is a Visa compliance dispute fee acknowledgement, unrelated to first-party fraud).
- The `enhanced_eligibility_types` enum on the Dispute object is `enum('visa_compelling_evidence_3' | 'visa_compliance')` (per stripe-node and stripe-php changelogs for v25/2025-06-30.basil): no `mastercard_first_party_trust` value.
- Mastercard's First-Party Trust program itself launched in the U.S. in October 2024 and expanded globally in 2025 (per Mastercard's June 2025 press release at `mastercard.com/global/en/news-and-trends/press/2025/june/`). It uses Identity Check Insights and Ethoca Consumer Clarity Merchant Transactions API as its sharing pathways: not a per-dispute evidence object via acquirers. This is structurally different from CE 3.0.
- Stripe has discussed Mastercard First-Party Trust in marketing/sessions content (`stripe.com/sessions/2025/mastercard-strategies-for-reducing-chargebacks`) and ships Ethoca Alerts integrations, but as of April 2026 there is no documented `enhanced_evidence.mastercard_first_party_trust` API surface. There is no public Stripe changelog entry announcing one.

**Implication for `dispute-defender`:** treat Mastercard friendly-fraud disputes via standard `evidence.*` fields (3DS results, AVS, CVV match, prior-transaction documentation under `customer_communication`/`receipt`/`shipping_documentation`). Do not write code paths assuming an `enhanced_evidence.mastercard_first_party_trust` namespace; that's roadmap-speculative.

---

### 12. 2025-2026 changes

**Stripe-side changes (per docs.stripe.com/changelog and the stripe-node CHANGELOG):**
- **2024-10-28.acacia**: Initial CE 3.0 support added (`enhanced_evidence.visa_compelling_evidence_3`, `evidence_details.enhanced_eligibility`).
- **2025-06-30.basil**: `Dispute.enhanced_eligibility_types` widened from a single-value literal `'visa_compelling_evidence_3'` to enum `'visa_compelling_evidence_3' | 'visa_compliance'`; Visa compliance disputes added (`enhanced_evidence.visa_compliance.fee_acknowledged`). New `case_type: "compliance"` on `payment_method_details.card`.
- **2025-09-30.clover**: Smart Disputes recommended-evidence restructured (groups related fields together); does not directly modify CE 3.0 shape but affects the evidence object validators.
- **No CE 3.0 schema changes appear in clover or dahlia** (2025-10 through 2026-04). The `evidence.enhanced_evidence.visa_compelling_evidence_3` shape documented above has been stable since 2024-10-28.acacia.

**Visa-side changes (post-March 2023 Merchant Readiness PDF):**
- **April 15, 2023**: Original CE 3.0 effective date.
- **Visa Business News, July 24, 2025**: Announced CE 3.0 automatic qualification through Visa Secure / Visa Data Only.
- **October 17, 2025**: Visa began automatically qualifying transactions for CE 3.0 via Visa Secure (and Visa Data Only) across all major regions (AP, CEMEA, Europe, LAC, Canada, U.S.). Pre-dispute deflection is now automatic for participating merchants in Visa Secure when CE 3.0 criteria are met. (Sources: Visa Merchant Business News Digest at `corporate.visa.com/en/resources/visa-merchant-business-news-digest.html`; Austreme summary; Checkout.com; Corepay guide.)
- **VAMP (Visa Acquirer Monitoring Program)**: consolidated former VFMP/VDMP, effective October 1, 2025; **April 1, 2026** brought a 1.5% VAMP threshold and $8/transaction fines (per cside.com and merchantcostconsulting.com). TC40 fraud reports resolved through CE 3.0 are excluded from VAMP calculations.

**No "CE 3.1" or successor program** has been announced as of April 2026. The 2025 evolution was scope expansion (auto-qualification through Visa Secure), not a versioned spec successor. Visa's program is still officially "Compelling Evidence 3.0".

**Caveat on third-party sources:** the October 2025 expansion details are corroborated by the Visa Business News digest (primary) and multiple secondary sources (Checkout.com, Corepay, Tidal Commerce, cside, Merchant Cost Consulting). The exact wording in the Merchant Readiness PDF dates to March 2023 and has not been re-issued; any merchant relying on it should also consult the more recent Visa Business News updates.

---

## Details: consolidated reference snippets

### Canonical CE 3.0 payload (from Stripe's example, verbatim)

```json
{
  "id": "du_TFCU9xJ2Gsj7BAiAoQok8Icp",
  "charge": "ch_vEUUPELhHVkPbMN1md3B0vG7",
  "enhanced_eligibility_types": ["visa_compelling_evidence_3"],
  "evidence": {
    "enhanced_evidence": {
      "visa_compelling_evidence_3": {
        "disputed_transaction": {
          "customer_email_address": "test@example.com",
          "customer_purchase_ip": "123.123.123.123",
          "merchandise_or_services": "merchandise",
          "product_description": "Widget ABC, color: green"
        },
        "prior_undisputed_transactions": [
          {
            "charge": "ch_nE8T8mUOoy9zkkOQLHuLsr3Z",
            "customer_email_address": "test@example.com",
            "customer_purchase_ip": "123.123.123.123",
            "product_description": "Widget DEF, color: blue"
          },
          {
            "charge": "ch_PcE97JB902XNTc1JpyBFmMTF",
            "customer_email_address": "test@example.com",
            "customer_purchase_ip": "123.123.123.123",
            "product_description": "Widget XYZ, color: yellow"
          }
        ]
      }
    }
  }
}
```

### Eligibility status object (verbatim from Stripe)

```json
{
  "enhanced_eligibility_types": ["visa_compelling_evidence_3"],
  "evidence_details": {
    "due_by": 1708387199,
    "enhanced_eligibility": {
      "visa_compelling_evidence_3": {
        "partner_rejected_details": null,
        "required_actions": [
          "missing_merchandise_or_services",
          "missing_disputed_transaction_description"
        ],
        "status": "requires_action"
      }
    },
    "has_evidence": false,
    "past_due": false,
    "submission_count": 0
  },
  "payment_method_details": {
    "card": { "brand": "visa", "network_reason_code": "10.4" },
    "type": "card"
  },
  "reason": "fraudulent",
  "status": "needs_response"
}
```

Status values: `qualified`, `requires_action`, `not_qualified` (post-submission).

### Evidence character-count limit

Combined limit on text-based evidence fields: **150,000 characters** (per `docs.stripe.com/api/disputes/update` and `/disputes/api`). Combined evidence file size limit: **4.5 MB** (per `docs.stripe.com/disputes/responding`); Mastercard-specific evidence file length limit is 19 pages combined.

---

## Caveats

1. **Stripe `120-364` vs Visa `120-365`:** Confirmed real discrepancy in Stripe's documentation. Operate against Stripe's stated bound, since Stripe's validator is what gates qualification in the API path. If you need maximum coverage and have a transaction at exactly 365 days, consider falling back to standard representment evidence rather than relying on CE 3.0 qualification.
2. **`prior_undisputed_transactions` is exactly two:** Don't write defensive code that supports 1 or 3+; the API will reject it. Stripe's docs say "exactly two" verbatim.
3. **Device fingerprint length and device ID length are validated:** greater than or equal to 20 chars for fingerprint, greater than or equal to 15 chars for device ID. Strings shorter than these will be rejected by Stripe regardless of whether they would match Visa's rules.
4. **`shipping_address` "all fields are required":** Stripe's API doc says "All fields are required for Visa Compelling Evidence 3.0 evidence submission" while marking each individual sub-field as `optional` in the schema. The runtime validator enforces full-address requirement; TypeScript types do not. Don't rely on TS to catch missing sub-fields.
5. **Type-path nomenclature for stripe-node:** `Stripe.DisputeUpdateParams.Evidence.EnhancedEvidence.VisaCompellingEvidence3` follows the SDK's standard generator naming, but the canonical confirmation is in your installed `node_modules/stripe/types/disputes.d.ts` (or inline TS files in v22+). Run `tsc --noEmit` to verify. If the identifier resolves, you're correctly typed; if not, use the `as unknown as` workaround pending an SDK upgrade.
6. **Edge runtime for webhooks:** technically possible with `constructEventAsync` + `Stripe.createSubtleCryptoProvider()`, but most production teams keep webhook handlers on the Node runtime to avoid raw-body subtleties. Explicitly set `export const runtime = "nodejs"` on the webhook route in Next.js App Router for predictability.
7. **No Mastercard parallel in the Stripe API:** any code in `dispute-defender` that abstracts an "enhanced evidence" union type should currently encode only `visa_compelling_evidence_3` and `visa_compliance` as members. Watch `docs.stripe.com/changelog` and the stripe-node CHANGELOG for additions.
8. **CE 3.0 status is independent of dispute status:** Per Stripe: "The Visa CE 3.0 status doesn't impact the dispute status." A dispute can be won via CE 3.0 path or via standard evidence. **Always populate the standard `evidence.*` fields too**, because if `not_qualified` is returned post-submission, "Evidence is still submitted, but not using Visa CE 3.0": falling through to the standard issuer-discretion flow.
9. **API-version drift:** if you pin `apiVersion: "2024-10-28.acacia"` in your `new Stripe(...)` config and your installed stripe-node is v22 (pinned to dahlia), runtime requests will use the older API behavior but the TypeScript types describe dahlia. This is a known type-vs-runtime mismatch. Best practice: either match `apiVersion` to your stripe-node version's pinned API, or omit `apiVersion` and let stripe-node use its pinned default.
10. **`stripe trigger` has no CE 3.0 event:** integration tests must orchestrate the flow manually (create payment with the test card to wait for `charge.dispute.created` to PATCH dispute). There is no single CLI command to materialize a CE 3.0-ready dispute object.
