# AgentGuard CB

A typed, deterministic helper library for assembling chargeback-evidence payloads in the schema expected by the current Stripe Disputes API and staging them with `submit:false` for merchant human review prior to submission. Open-sourced by [MerchantGuard](https://merchantguard.ai). Part of the AgentGuard family.

Your AI agent ships features. Customers dispute charges. This library compiles structured evidence from your own production data, surfaces the eligibility statuses Stripe reports (`qualified`, `requires_action`, `not_qualified`), and writes a hash-chained audit trail. **It does not file disputes with Visa, is not a Visa Third Party Agent, is not registered under the Visa TPA Registration Program, and has no contractual or technical relationship with Visa Inc., Stripe, Inc., or any acquirer.** References to those trademarks are nominative use under the Lanham Act and the doctrine articulated in *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), to identify the rules and APIs with which this library is designed to interoperate.

```
npm install
cp .env.example .env.local           # fill in Stripe keys, DB URL, signing key
npm run db:migrate
npm run dev
# Configure your Stripe webhook to POST to /api/webhooks/stripe
```

---

## Use as a library (npm)

```bash
npm install @merchantguard/agentguard-cb
```

```ts
import {
  evaluateVisaCe3Eligibility,
  buildStripeVisaCe3EnhancedEvidence,
  customerEvidenceBundleSchema,
} from '@merchantguard/agentguard-cb';

const bundle = customerEvidenceBundleSchema.parse(yourBundle);
const eligibility = evaluateVisaCe3Eligibility(bundle);
if (eligibility.qualified) {
  const payload = buildStripeVisaCe3EnhancedEvidence(bundle, eligibility.selectedPriors);
  // pass payload to your own Stripe SDK call to dispute.update with submit:false
}
```

Subpath imports are also available for tree-shake-friendly use:

- `@merchantguard/agentguard-cb/evidence` — schemas + CE 3.0 eligibility + payload assembly
- `@merchantguard/agentguard-cb/audit` — Ed25519 hash-chained audit primitives
- `@merchantguard/agentguard-cb/pdf` — PDF generation + signed manifest verification
- `@merchantguard/agentguard-cb/adapters` — `EvidenceAdapter` interface + reference adapter
- `@merchantguard/agentguard-cb/event-log` — buyer-readable event log (v1.1)

---

## Buyer-readable event log (v1.1)

Finance and legal reviewers do not read cryptographic chains. They read bank statements. v1.1 adds a buyer-readable event log layer: every step in a dispute workflow generates a typed `Event`, the chain is SHA-256 hash-linked and optionally Ed25519-signed, and the same chain renders as plain English, CSV, or JSON depending on who is looking.

```ts
import {
  InMemoryEventLogStore,
  renderEventLogText,
  verifyChain,
} from '@merchantguard/agentguard-cb/event-log';

const store = new InMemoryEventLogStore();
await store.append({
  payload: { type: 'webhook_received', data: { webhookEvent: 'charge.dispute.created' } },
  actor: 'system:agentguard-cb',
  disputeId: 'dp_001',
});
await store.append({
  payload: {
    type: 'ce3_eligibility_evaluated',
    data: {
      qualified: true,
      reasons: ['2 priors matched on IP and shipping_address'],
      selectedPriorChargeIds: ['ch_a', 'ch_b'],
      windowDaysMin: 120,
      windowDaysMax: 365,
    },
  },
  actor: 'system:agentguard-cb',
  disputeId: 'dp_001',
});

const events = await store.list('dp_001');
console.log(renderEventLogText(events));
// [2026-05-02T18:00:00Z] system:agentguard-cb  Stripe webhook received: charge.dispute.created
// [2026-05-02T18:00:01Z] system:agentguard-cb  Visa CE 3.0 eligibility evaluated: QUALIFIED
//                              Priors selected: ch_a + ch_b (window 120-365 days)

const verification = await verifyChain('dp_001', events);
// { eventsChecked: 2, hashChainValid: true, signaturesChecked: 0, signaturesValid: 0, errors: [] }
```

Same data, two audiences. The boring version earns trust before the cryptographic one.

---

## Use from an AI agent (MCP server)

AgentGuard CB ships a stdio Model Context Protocol server so AI agents (Claude Desktop, Cursor, Cline, Continue, etc.) can call its primitives during coding and ops workflows. The MCP server is **read-only and pure-functional**: it never calls the Stripe API, never writes to a database, and never submits a dispute. Submission and persistence remain the merchant's responsibility, which matches the [LEGAL.md](./LEGAL.md) posture.

**Tools exposed:**

- `evaluate_ce3_eligibility` — score a `CustomerEvidenceBundle` for Visa Compelling Evidence 3.0
- `build_ce3_evidence` — assemble the Stripe-shape `enhanced_evidence` payload (returns the typed object only; you submit it yourself)
- `canonical_json_hash` — canonical JSON serialization + SHA-256 hex digest (audit chain primitive)
- `verify_manifest_signature` — verify an Ed25519 signature over a previously-generated `ManifestPayload`
- `append_event` (v1.1) — append a typed event to the buyer-readable event log
- `render_event_log` (v1.1) — render the chain in `text` (plain English), `csv`, or `json`
- `verify_chain` (v1.1) — walk the chain and report tamper-evidence
- `describe_agentguard_cb` — high-level capabilities, safety posture, and patent / license status

**Claude Desktop install:** add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentguard-cb": {
      "command": "npx",
      "args": ["-y", "@merchantguard/agentguard-cb", "mcp"]
    }
  }
}
```

**Cursor install:** add to `~/.cursor/mcp.json` with the same shape. The same config also works for Cline, Continue, Windsurf, and any other client that speaks stdio MCP.

**One-shot test from a terminal:**

```bash
npx -y @merchantguard/agentguard-cb mcp
```

It will start a stdio server. Send `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}` on stdin to see the tool catalog.

---

## What this tool DOES NOT do

- **Does NOT generate, fabricate, embellish, or modify evidence.** Static templates only. PR-blocked at the CI level (greps for `openai`, `anthropic`, `gemini`, `groq`, `mistral`, `llama`, `cohere`, `gpt-`, `claude-`, `prompt:`, `narrative`, `freeform_text`, `uncategorized_text`).
- **Does NOT use LLMs to write dispute narratives.** No `openai`, `anthropic`, `langchain`, `gemini`, or `ai` runtime dependencies. Imports are CI-blocked.
- **Does NOT make legal claims on the merchant's behalf.** This is a data compiler, not a legal authority.
- **Does NOT guarantee dispute wins, CE 3.0 qualification, or any specific issuer or acquirer outcome.** CE 3.0 qualification is determined by Visa Resolve Online (VROL) and the issuing bank under the Visa Core Rules; outcomes are not within this library's control. See Visa's [Compelling Evidence 3.0 Merchant Readiness](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/compelling-evidence-3.0-merchant-readiness-mar2023.pdf) document (March 2023) and the Visa Core Rules for the authoritative criteria.
- **Is NOT endorsed, certified, audited, or "approved" by Visa Inc., Mastercard Inc., Stripe Inc., or any acquirer.**
- **Is NOT a substitute for the merchant's own legal, compliance, and acquirer obligations.**

If you want LLM-assisted dispute narratives, this is the wrong tool. AgentGuard CB is the deliberate counter-trend: structured, deterministic, auditable.

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
