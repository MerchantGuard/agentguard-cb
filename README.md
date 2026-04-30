# dispute-defender

**Deterministic Stripe dispute evidence compiler** for merchants. Built and open-sourced by [MerchantGuard](https://merchantguard.ai).

Your AI agent ships features. Customers dispute charges. This tool compiles structured evidence from your own production data into Visa Compelling Evidence 3.0 (CE 3.0) compliant submissions, with a tamper-evident audit trail.

```
npm install
cp .env.example .env.local           # fill in Stripe keys, DB URL, signing key
npm run db:migrate
npm run dev
# Configure your Stripe webhook to POST to /api/webhooks/stripe
```

---

## What this tool DOES NOT do

- **Does NOT generate, fabricate, embellish, or modify evidence.** Static templates only. PR-blocked at the CI level.
- **Does NOT use LLMs to write dispute narratives.** No `openai`, `anthropic`, `langchain`, or `ai` runtime dependencies. Imports are CI-blocked.
- **Does NOT make legal claims on the merchant's behalf.** This is a data compiler, not a legal authority.
- **Does NOT guarantee dispute wins.** Outcomes are at the issuer's sole discretion.

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

For real CE 3.0 qualification you'll want an adapter that pulls from your own application database. See `docs/adapters.md`.

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

Stripe provides a CE 3.0 test fixture:

```
Card Number:    4000000404000038
PaymentMethod:  pm_card_createCe3EligibleDispute
Token:          tok_createCe3EligibleDispute
```

Stripe doesn't validate prior charge eligibility (Visa brand, 10.4 reason, day window) in test mode but DOES validate matching elements per CE 3.0 rules. To force a final outcome use `evidence.uncategorized_text: 'winning_evidence' | 'losing_evidence'` (we don't use uncategorized_text in production code; this is test-mode only).

See `docs/stripe-test-mode-ce3.md`.

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

## Legal disclaimer summary

- **AS IS, NO WARRANTY.** See LICENSE.
- **Merchant is solely responsible** for the accuracy of all evidence.
- **Submitting knowingly false evidence may expose you** to civil or criminal liability.
- **Not legal advice.** Consult licensed counsel.
- **No outcome guarantee.** Issuers retain sole discretion on dispute resolution.

Full text in `LEGAL.md`.

---

Powered by [MerchantGuard](https://merchantguard.ai/docs) — the compliance layer for the AI agent economy.
