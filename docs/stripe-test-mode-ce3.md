# Testing CE 3.0 in Stripe Test Mode

Per `docs/verified-facts-stripe-visa-ce3.md` § 8.

## Test fixture

| Token type | Value |
|---|---|
| Card Number | `4000000404000038` |
| PaymentMethod | `pm_card_createCe3EligibleDispute` |
| Token | `tok_createCe3EligibleDispute` |

Behavior in test mode:

- Creates a dispute Stripe flags as CE 3.0 eligible.
- Stripe **DOES** validate primary/secondary matching elements per CE 3.0 rules.
- Stripe **DOES NOT** validate prior charges' payment method or transaction date — you can pass any two test-mode charges.
- After submission, status will be `qualified` or `not_qualified`.
- Note: "The Visa CE 3.0 status doesn't impact the dispute status." (per Stripe docs)

## End-to-end test workflow

1. **Create a payment with the test card:**
   ```bash
   stripe payment_intents create \
     --amount=1000 --currency=usd \
     --payment-method=pm_card_createCe3EligibleDispute \
     --confirm
   ```

2. **Wait for `charge.dispute.created` webhook** (or use `stripe trigger charge.dispute.created` — but note the trigger does NOT use the CE 3.0 fixture, so qualification will fail).

3. **Stage evidence with `submit: false`:**
   The dispute-defender webhook will enqueue a `collect_evidence` job. After the job processor runs through `collect → generate_pdf → stage_evidence`, the staged evidence is visible on the dispute via Stripe Dashboard or API.

4. **Inspect eligibility status:**
   ```bash
   stripe disputes retrieve du_xxx | jq '.evidence_details.enhanced_eligibility.visa_compelling_evidence_3'
   ```
   Look for `status: "qualified" | "requires_action" | "not_qualified"` and `required_actions: [...]`.

5. **Force a final outcome (test mode only):**
   Stripe accepts `evidence.uncategorized_text: 'winning_evidence' | 'losing_evidence'` to force the dispute outcome in test mode. **dispute-defender does NOT use uncategorized_text in production code paths.** This trick is for manual testing only via raw API.

## What is NOT validated in test mode

- Visa brand check (any brand passes)
- 10.4 reason code check
- 120-364 day window
- Prior payment method matching the disputed
- `enhanced_eligibility_types` array on the dispute object

In live mode, all of the above are enforced. So a green test in test mode is necessary but NOT sufficient for live qualification.

## Stripe CLI: no CE 3.0-specific trigger

`stripe trigger` has no `*.ce3.*` event. To exercise CE 3.0 you must use the test fixture above and create the dispute via charge → dispute lifecycle, not via CLI trigger.

## Local webhook forwarding

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Capture the displayed `whsec_...` and put it in `.env.local` as `STRIPE_WEBHOOK_SECRET`.
