/**
 * @merchantguard/agentguard-cb
 *
 * Public library API for dispute-defender. This file is the single
 * entry point published to npm; consumers should `import { ... } from
 * "@merchantguard/agentguard-cb"`. Subpath exports are available via
 * `@merchantguard/agentguard-cb/evidence`, `/audit`, `/pdf`, and
 * `/adapters` for tree-shake-friendly use.
 *
 * Library scope (what we publish): evidence schemas, CE 3.0 eligibility
 * evaluation and payload assembly, PDF + signed manifest generation,
 * Ed25519 hash-chained audit log, and the EvidenceAdapter interface.
 *
 * Library scope (what we deliberately do NOT publish): the Drizzle ORM
 * schema and queries (`lib/db/*`), the background job processor
 * (`lib/jobs/*`), and the internal Stripe client wrapper
 * (`lib/stripe/client.ts`). Consumers bring their own database and
 * Stripe client instance.
 */

// ─── Evidence schemas (zod) ───────────────────────────────────────────────
export {
  shippingAddressSchema,
  customerEvidenceSchema,
  disputedTransactionSchema,
  priorUndisputedTransactionSchema,
  loginEventSchema,
  productUsageEventSchema,
  refundEventSchema,
  communicationEventSchema,
  deliveryProofSchema,
  termsAcceptanceSchema,
  refundPolicySchema,
  customerEvidenceBundleSchema,
  type ShippingAddress,
  type CustomerEvidence,
  type DisputedTransaction,
  type PriorUndisputedTransaction,
  type CustomerEvidenceBundle,
} from '../lib/evidence/schemas';

// ─── CE 3.0 eligibility + payload ─────────────────────────────────────────
export {
  STRIPE_CE3_MIN_DAYS,
  STRIPE_CE3_MAX_DAYS,
  isStripeVisaCe3Candidate,
  isWithinStripeCe3Window,
  hasValidMatchingCombination,
  evaluateVisaCe3Eligibility,
  buildStripeVisaCe3EnhancedEvidence,
  type Ce3EligibilityResult,
  type StripeCe3DisputedTransaction,
  type StripeCe3PriorUndisputedTransaction,
  type StripeCe3Payload,
} from '../lib/evidence/ce3';

// ─── PDF + signed manifest ────────────────────────────────────────────────
export {
  generateDisputePdf,
  verifyManifestSignature,
  sha256Hex,
  type GeneratePdfInput,
  type GeneratePdfResult,
  type ManifestPayload,
} from '../lib/pdf/generate';

// ─── Audit log ────────────────────────────────────────────────────────────
export { auditLog, canonicalJson, type AuditLogInput } from '../lib/audit/log';

// ─── Evidence adapter interface ───────────────────────────────────────────
export {
  stripeOnlyAdapter,
  type EvidenceAdapter,
  type AdapterInput,
} from '../lib/evidence/adapter';
