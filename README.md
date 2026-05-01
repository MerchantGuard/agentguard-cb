# dispute-defender

A typed, deterministic helper library for assembling chargeback-evidence payloads in the schema expected by the current Stripe Disputes API and staging them with `submit:false` for merchant human review prior to submission. Open-sourced by [MerchantGuard](https://merchantguard.ai).

Your AI agent ships features. Customers dispute charges. This library compiles structured evidence from your own production data, surfaces the eligibility statuses Stripe reports (`qualified`, `requires_action`, `not_qualified`), and writes a hash-chained audit trail. **It does not file disputes with Visa, is not a Visa Third Party Agent, is not registered under the Visa TPA Registration Program, and has no contractual or technical relationship with Visa Inc., Stripe, Inc., or any acquirer.** References to those trademarks are nominative use under the Lanham Act and the doctrine articulated in *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), to identify the rules and APIs with which this library is designed to interoperate.

```
npm install
cp .env.example .env.local           # fill in Stripe keys, DB URL, signing key
npm run db:migrate
npm run dev
# Configure your Stripe webhook to POST to /api/webhooks/stripe
```

---

## What this tool DOES NOT do

- **Does NOT generate, fabricate, embellish, or modify evidence.** Static templates only. PR-blocked at the CI level (greps for `openai`, `anthropic`, `gemini`, `groq`, `mistral`, `llama`, `cohere`, `gpt-`, `claude-`, `prompt:`, `narrative`, `freeform_text`, `uncategorized_text`).
- **Does NOT use LLMs to write dispute narratives.** No `openai`, `anthropic`, `langchain`, `gemini`, or `ai` runtime dependencies. Imports are CI-blocked.
- **Does NOT make legal claims on the merchant's behalf.** This is a data compiler, not a legal authority.
- **Does NOT guarantee dispute wins, CE 3.0 qualification, or any specific issuer or acquirer outcome.** CE 3.0 qualification is determined by Visa Resolve Online (VROL) and the issuing bank under the Visa Core Rules; outcomes are not within this library's control. See Visa's [Compelling Evidence 3.0 Merchant Readiness](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf) document (March 2023) and the Visa Core Rules for the authoritative criteria.
- **Is NOT endorsed, certified, audited, or "approved" by Visa Inc., Mastercard Inc., Stripe Inc., or any acquirer.**
- **Is NOT a substitute for the merchant's own legal, compliance, and acquirer obligations.**

If you want LLM-assisted dispute narratives, this is the wrong tool. dispute-defender is the deliberate counter-trend: structured, deterministic, auditable.

---

## How it works

```
Stripe webhook (charge.dispute.created)
   ↓
Insert event ID with unique constraint  (idempotent — replays return 200)
   ↓
Upsert dispute row in tool DB
   ↓
Enqueue collect_evidence job
   ↓ (background processor)
Adapter pulls evidence from your production DB → zod-validated CustomerEvidenceBundle
   ↓
SHA-256 of canonical JSON bundle → audit_log
   ↓
PDF generated from static templates (no narrative)
   ↓
SHA-256 of PDF bytes → audit_log
   ↓
Ed25519-signed manifest embedded as manifest.signed.json attachment
   ↓
Stage in Stripe (submit: false) → record CE 3.0 eligibility status
   ↓ (HUMAN REVIEW GATE — admin approves in dashboard)
Final submit (submit: true)
```

---

## Stripe Visa CE 3.0 implementation

This tool implements Stripe's Visa Compelling Evidence 3.0 enhanced evidence path. **The canonical reference for our CE 3.0 implementation is `docs/verified-facts-stripe-visa-ce3.md`.** That file is a verified-facts appendix with primary sources (Stripe API ref + Visa Merchant Readiness PDF) and the discrepancies between them flagged inline.

Key facts encoded in code:

- **CE 3.0 lives at** `evidence.enhanced_evidence.visa_compelling_evidence_3` on the Dispute Update API.
- **Exactly 2 prior undisputed transactions** required. Each prior must include `charge`. Disputed transaction does NOT include `charge`.
- **Window**: Stripe documents `120-364 days` (the validator we follow); Visa published `120-365 days`. We use Stripe's stricter bound — the API rejects anything Stripe's validator rejects regardless of what Visa's PDF says.
- **Matching elements**: at least 2 of (IP, device fingerprint, device ID, email, account ID, shipping address) must match across all 3 transactions, and one must be IP or device. Device fingerprint + device ID alone is INVALID per Stripe.
- **Eligibility gate**: Visa brand + network reason code `10.4` + `enhanced_eligibility_types` includes `visa_compelling_evidence_3`. Anything else routes to standard evidence.
- **`submit: false` first**, always. Stripe defaults to immediate submission; staging lets us inspect `evidence_details.enhanced_eligibility.visa_compelling_evidence_3.status` before finalizing.
- **No Mastercard parallel.** As of April 2026, Stripe's API has no `enhanced_evidence.mastercard_first_party_trust` namespace. Mastercard friendly-fraud disputes use standard evidence fields.

---

## Stripe SDK version

We do **not** hardcode an `apiVersion` in the Stripe client. Run:

```bash
npm run stripe:version
```

This prints the installed `stripe` package version + `Stripe.API_VERSION` (the SDK's pinned default). CE 3.0 requires `>= 2024-10-28.acacia`. The script exits with code 1 if the installed SDK is older.

---

## Adapters

Adapters pull merchant evidence from wherever the merchant stores it. The interface is in `lib/evidence/adapter.ts`. We ship a reference Stripe-only adapter (`lib/evidence/adapter.ts` → `stripeOnlyAdapter`) that uses only Stripe API data. It cannot provide customer IPs, device fingerprints, or product usage events because Stripe doesn't store those — the PDF generator includes "data not available" warnings instead.

For merchants that independently determine a dispute may be eligible for Visa CE 3.0, you may need an adapter that can populate the fields Stripe's API requires from your own systems. See `docs/adapters.md`.

---

## Webhook setup

```
Stripe Dashboard → Developers → Webhooks → Add endpoint
  URL: https://your-domain.com/api/webhooks/stripe
  Events:
    charge.dispute.created
    charge.dispute.updated
    charge.dispute.closed
```

Webhook handler runs on Node runtime (NOT Edge) per Stripe's raw-body signature requirement. See `app/api/webhooks/stripe/route.ts`.

---

## Test mode

Stripe provides CE 3.0 test fixtures for sandbox environments. Stripe's test mode validates the matching-element requirements per CE 3.0 rules but does not validate prior-charge eligibility (Visa brand, reason code, day window).

Internal test-mode mechanics, including Stripe's outcome-simulation strings, are documented at `docs/stripe-test-mode-ce3.md` (developer reference only — not for production use).

---

## Deployment

Reference: Vercel + Supabase. See `docs/vercel-supabase-deployment.md`.

Job processor: configure Vercel Cron to POST `/api/jobs/process` every 30 seconds with `Authorization: Bearer ${JOB_PROCESSOR_SECRET}`.

---

## Tests

```bash
npm test
```

Coverage:
- CE 3.0 eligibility (window, matching elements, day boundaries 119/120/364/365)
- Stripe payload exact shape
- `submit: false` staging required
- Webhook idempotency
- Audit log hash chain
- PDF manifest signing

CI runs `typecheck`, `lint`, `test`, `build`, and grep guards for forbidden patterns (`uncategorized_text`, `openai|anthropic|langchain`, narrative/freeform fields).

---

## Visa Dispute Rules

Visa Core Rules and Visa Product and Service Rules govern dispute evidence requirements. Submitting falsified or knowingly inaccurate evidence violates these rules and may also violate state UDAP statutes (CA Bus. & Prof. Code § 17200, NY Gen. Bus. Law § 349, FL Stat. § 501.204) or 18 U.S.C. § 1343 (wire fraud) where statutory elements are met.

Merchant guide: <https://usa.visa.com/support/small-business/regulations-fees.html>

CE 3.0 Merchant Readiness PDF (March 2023): <https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf>

---

## Stripe Services Agreement

Section 8 (Disputes) governs how merchants respond. <https://stripe.com/legal/ssa>

---

## Legal summary

- **AS IS, NO WARRANTY.** See `LICENSE` (clean MIT).
- **Merchant is solely responsible** for the accuracy of all evidence and for compliance with applicable law.
- **No outcome guarantee.** CE 3.0 qualification is determined by Stripe, the issuing bank, and Visa Resolve Online — not by this Software.
- **Submitting knowingly false evidence** may give rise to civil or criminal liability. Consult counsel.
- **Not legal advice.**

Detail in `LEGAL.md`. Non-binding use guidelines in `DISCLAIMER.md`. Patent notice in `PATENTS.md`. Export-control posture in `EXPORT.md`. Contributor sign-off in `DCO.md`. Privacy and data-handling for support channels in `LEGAL.md` § "Privacy and data protection."

---

Powered by [MerchantGuard](https://merchantguard.ai/docs) — the compliance layer for the AI agent economy.
