# Adapters

Adapters pull merchant evidence from wherever it lives (production database, Stripe API, internal REST endpoints) and return a strictly-typed `CustomerEvidenceBundle`.

## Interface

```ts
export interface EvidenceAdapter {
  readonly name: string;
  readonly version: string;
  getCustomerEvidence(input: AdapterInput): Promise<CustomerEvidenceBundle>;
}
```

See `lib/evidence/adapter.ts` for the full interface and `lib/evidence/schemas.ts` for the bundle shape.

## Built-in adapters

### `stripeOnlyAdapter`

Pulls everything available from Stripe API: charge, customer, payment intent, refunds, prior charges. Cannot provide IP, device, or product usage data because Stripe doesn't store those — the PDF generator includes "data not available" warnings.

**Use when:** you don't have a custom application database (e.g. you're a Stripe-only operator running off Stripe Customer Portal).

**Limits:** very few CE 3.0 candidates will qualify, because qualification typically requires IP and device fingerprint matching, which Stripe doesn't track.

## Writing a custom adapter

```ts
import type { EvidenceAdapter, AdapterInput } from '@/lib/evidence/adapter';
import { customerEvidenceBundleSchema } from '@/lib/evidence/schemas';

export const myAdapter: EvidenceAdapter = {
  name: 'my-app',
  version: '1.0.0',
  async getCustomerEvidence(input: AdapterInput) {
    // 1. Look up the customer in YOUR database
    const customer = await myDb.customers.findOne({ stripeCustomerId: input.customerId });
    
    // 2. Build the bundle
    const bundle = {
      adapterName: 'my-app',
      adapterVersion: '1.0.0',
      customer: {
        stripeCustomerId: input.customerId,
        customerAccountId: customer.id,
        customerEmailAddress: customer.email,
        customerPurchaseIp: customer.lastIp,
        customerDeviceFingerprint: customer.deviceFingerprint, // >= 20 chars or omit
        signupTimestamp: customer.createdAt,
      },
      disputedTransaction: { /* ... */ },
      priorUndisputedTransactions: [ /* ... */ ],
      loginEvents: [ /* ... */ ],
      productUsageEvents: [ /* ... */ ],
      refundEvents: [],
      communicationEvents: [],
    };
    
    // 3. ALWAYS validate before returning
    return customerEvidenceBundleSchema.parse(bundle);
  },
};
```

## Hard rules

1. **Don't fabricate fields.** If you don't have a customer's IP at the time of disputed purchase, return undefined — DO NOT default to `0.0.0.0` or invent a value. The `evaluateVisaCe3Eligibility` function will downgrade qualification, which is the correct behavior.
2. **Validate the output with zod.** `customerEvidenceBundleSchema.parse(...)` enforces minimum lengths, IP format, email format, etc.
3. **Prior transaction queries must be relative to the disputed transaction date**, not `NOW()`. CE 3.0 uses a 120–364 day window from the disputed transaction.
4. **Set `wasDisputed` and `hadFraudReport` correctly.** If a prior was disputed (even one resolved in the merchant's favor) or had a TC40 fraud report against it, it CANNOT be used as a CE 3.0 prior. Set `wasDisputed: true` / `hadFraudReport: true` and the eligibility check will skip it.
5. **Communication events are metadata-only.** No message bodies. Use the `artifactSha256` field to reference stored attachments.

## Adapter selection

For v0.2 the adapter is selected at code-level in the job processor (`lib/jobs/processor.ts`). A future version will allow per-tenant adapter configuration via `.env`.
