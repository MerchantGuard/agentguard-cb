/**
 * Typed evidence schemas — strict zod validation, no narrative/freeform fields.
 *
 * Per the Verified-Facts Appendix:
 * - device fingerprint must be >= 20 chars when present
 * - device ID must be >= 15 chars when present
 * - shipping address: Stripe accepts city/country/line1/postal_code/state as
 *   the matching-element set. line2 is optional in our internal model;
 *   if Stripe runtime requires every sub-field, omit shipping as a matching
 *   element when incomplete (validated at submission time).
 *
 * THIS FILE INTENTIONALLY DOES NOT EXPOSE narrative / freeform / aiSummary /
 * generatedText fields. PRs that add such fields are auto-rejected by CI
 * (see .github/workflows/ci.yml).
 */
import { z } from 'zod';

// ---------- Shipping address (CE 3.0 secondary element) ----------
export const shippingAddressSchema = z.object({
  city: z.string().min(1),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  line1: z.string().min(1),
  line2: z.string().optional(),
  postal_code: z.string().min(1),
  state: z.string().min(1),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

// ---------- Customer evidence (signup, identity, contact) ----------
export const customerEvidenceSchema = z.object({
  stripeCustomerId: z.string().optional(),
  customerAccountId: z.string().optional(), // merchant's internal user ID
  customerEmailAddress: z.string().email().optional(),
  customerPurchaseIp: z.string().ip().optional(),
  customerDeviceFingerprint: z.string().min(20).optional(),
  customerDeviceId: z.string().min(15).optional(),
  signupTimestamp: z.date().optional(),
});
export type CustomerEvidence = z.infer<typeof customerEvidenceSchema>;

// ---------- Disputed transaction (the charge being disputed) ----------
export const disputedTransactionSchema = z.object({
  stripeChargeId: z.string(),
  stripePaymentIntentId: z.string().optional(),
  transactionTimestamp: z.date(),
  merchandiseOrServices: z.enum(['merchandise', 'services']),
  productDescription: z.string().min(1),
  customerPurchaseIp: z.string().ip().optional(),
  customerEmailAddress: z.string().email().optional(),
  customerAccountId: z.string().optional(),
  customerDeviceFingerprint: z.string().min(20).optional(),
  customerDeviceId: z.string().min(15).optional(),
  shippingAddress: shippingAddressSchema.optional(),
});
export type DisputedTransaction = z.infer<typeof disputedTransactionSchema>;

// ---------- Prior undisputed transaction (CE 3.0 requires exactly 2) ----------
// Note: Stripe schema does NOT allow merchandise_or_services on prior transactions.
// Internal `wasDisputed` and `hadFraudReport` are gates we apply BEFORE constructing
// the Stripe payload — they don't get serialized into the API request.
export const priorUndisputedTransactionSchema = z.object({
  stripeChargeId: z.string(),
  transactionTimestamp: z.date(),
  productDescription: z.string().min(1),
  // Internal gating fields — NOT sent to Stripe
  wasDisputed: z.boolean().default(false),
  hadFraudReport: z.boolean().default(false),
  samePaymentCredential: z.boolean().optional(),
  // Matching elements
  customerPurchaseIp: z.string().ip().optional(),
  customerEmailAddress: z.string().email().optional(),
  customerAccountId: z.string().optional(),
  customerDeviceFingerprint: z.string().min(20).optional(),
  customerDeviceId: z.string().min(15).optional(),
  shippingAddress: shippingAddressSchema.optional(),
});
export type PriorUndisputedTransaction = z.infer<typeof priorUndisputedTransactionSchema>;

// ---------- Auxiliary evidence (login events, usage, refunds, comms) ----------
// Communication logs are METADATA ONLY — no message bodies. If a body is
// needed, store it as a file hash and attach the file via Stripe Files API.

export const loginEventSchema = z.object({
  timestamp: z.date(),
  ip: z.string().ip().optional(),
  userAgent: z.string().optional(),
  deviceFingerprint: z.string().min(20).optional(),
  successful: z.boolean(),
});

export const productUsageEventSchema = z.object({
  timestamp: z.date(),
  eventType: z.string(),       // e.g. "image_generated", "api_call", "feature_used"
  resourceId: z.string().optional(),
  attributesJson: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const refundEventSchema = z.object({
  timestamp: z.date(),
  stripeRefundId: z.string().optional(),
  amountCents: z.number().int(),
  currency: z.string().length(3),
  reason: z.string().optional(),
});

export const communicationEventSchema = z.object({
  timestamp: z.date(),
  channel: z.enum(['email', 'sms', 'in_app', 'phone', 'chat']),
  direction: z.enum(['merchant_to_customer', 'customer_to_merchant']),
  templateId: z.string().optional(),
  artifactSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(), // hash of stored artifact, no body
});

export const deliveryProofSchema = z.object({
  timestamp: z.date(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  status: z.enum(['shipped', 'in_transit', 'delivered', 'returned']),
  signedFor: z.boolean().optional(),
  artifactSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});

export const termsAcceptanceSchema = z.object({
  timestamp: z.date(),
  termsVersionHash: z.string().regex(/^[0-9a-f]{64}$/i),
  termsUrl: z.string().url(),
  ip: z.string().ip().optional(),
});

export const refundPolicySchema = z.object({
  url: z.string().url(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  lastUpdatedAt: z.date().optional(),
});

// ---------- The full evidence bundle returned by adapters ----------
export const customerEvidenceBundleSchema = z.object({
  customer: customerEvidenceSchema,
  disputedTransaction: disputedTransactionSchema,
  priorUndisputedTransactions: z.array(priorUndisputedTransactionSchema),
  loginEvents: z.array(loginEventSchema).default([]),
  productUsageEvents: z.array(productUsageEventSchema).default([]),
  refundEvents: z.array(refundEventSchema).default([]),
  communicationEvents: z.array(communicationEventSchema).default([]),
  deliveryProof: deliveryProofSchema.optional(),
  termsAcceptance: termsAcceptanceSchema.optional(),
  refundPolicy: refundPolicySchema.optional(),
  // Adapter metadata (for audit log)
  adapterName: z.string(),
  adapterVersion: z.string(),
});
export type CustomerEvidenceBundle = z.infer<typeof customerEvidenceBundleSchema>;
