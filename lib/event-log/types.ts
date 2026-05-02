/**
 * Event-log types for AgentGuard CB v1.1.
 *
 * The buyer-readable layer Max Harlow asked for: every step in a
 * dispute-handling workflow generates a typed Event. Events are
 * hash-chained and (optionally) Ed25519-signed so the same chain that
 * a developer / auditor inspects programmatically is the chain that
 * a finance / legal reviewer reads as plain English in the dashboard.
 *
 * Design rules:
 *   - Every Event carries enough structured payload to be RECONSTRUCTED
 *     from a database row alone, no extra context required.
 *   - The HUMAN-READABLE LABEL is computed from the event's typed payload
 *     by the renderer, not stored verbatim, so changing label phrasing
 *     does not require a schema migration or break old chains.
 *   - The CRYPTOGRAPHIC HASH is computed over the canonical JSON of the
 *     payload + the previous event's hash. Walking the chain verifies
 *     tamper-evidence end-to-end.
 *   - Actor strings are free-form to avoid coupling to a particular
 *     identity scheme; downstream consumers parse them as they wish
 *     (e.g. `system:dispute-defender`, `agent:cursor-claude-3.5`,
 *     `user:jp@merchantguard.ai`).
 */

import { z } from 'zod';

/** All event types AgentGuard CB knows how to chain. Add new types
 *  by appending here AND adding a renderer + a typed payload. Order
 *  matters for log readability, not for hashing. */
export const EVENT_TYPES = [
  'webhook_received',
  'bundle_assembled',
  'ce3_eligibility_evaluated',
  'pdf_generated',
  'manifest_signed',
  'submission_staged',
  'human_review_requested',
  'human_review_completed',
  'submitted_to_stripe',
  'stripe_outcome_received',
  'note',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ─── Per-event payload schemas ─────────────────────────────────────────────
// Each event type has a typed payload. The renderer reads the payload to
// compose a plain-English label; nothing else in the system depends on
// payload shape, so adding fields is backward-compatible.

export const webhookReceivedPayload = z.object({
  webhookEvent: z.string().describe('Stripe event type, e.g. charge.dispute.created'),
  stripeDisputeId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  stripeEventId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
});

export const bundleAssembledPayload = z.object({
  customerAccountId: z.string().optional(),
  customerEmailAddress: z.string().optional(),
  customerTenureMonths: z.number().optional(),
  disputedTransactionDate: z.string().optional(),
  disputedAmount: z.number().optional(),
  priorTransactionsFound: z.number(),
  matchingPriorsFound: z.number(),
  matchingFields: z.array(z.string()).describe('Which fields matched, e.g. ["IP", "shipping_address"]'),
});

export const ce3EligibilityEvaluatedPayload = z.object({
  qualified: z.boolean(),
  reasons: z.array(z.string()),
  selectedPriorChargeIds: z.array(z.string()),
  windowDaysMin: z.number(),
  windowDaysMax: z.number(),
});

export const pdfGeneratedPayload = z.object({
  pages: z.number(),
  bytes: z.number(),
  pdfSha256Hex: z.string(),
});

export const manifestSignedPayload = z.object({
  manifestSha256Hex: z.string(),
  signatureHex: z.string(),
  signingKeyId: z.string(),
});

export const submissionStagedPayload = z.object({
  submitFalse: z.literal(true).describe('Always true at this stage; submit:true requires explicit reviewer action'),
  awaitingReviewer: z.string().optional(),
  expectedReviewWindowHours: z.number().optional(),
});

export const humanReviewRequestedPayload = z.object({
  reviewer: z.string(),
  channel: z.enum(['email', 'slack', 'webhook', 'dashboard']),
});

export const humanReviewCompletedPayload = z.object({
  reviewer: z.string(),
  decision: z.enum(['approve', 'reject', 'request_changes']),
  notes: z.string().optional(),
});

export const submittedToStripePayload = z.object({
  stripeDisputeId: z.string(),
  stripeApiVersion: z.string().optional(),
  enhancedEvidenceIncluded: z.boolean(),
});

export const stripeOutcomeReceivedPayload = z.object({
  outcome: z.enum(['won', 'lost', 'requires_action', 'pending']),
  stripeReason: z.string().optional(),
  netRecoveredAmount: z.number().optional(),
});

export const notePayload = z.object({
  text: z.string(),
});

/** Discriminated union by `type`. Adding a new event type requires
 *  appending here, in EVENT_TYPES, and in the renderer. */
export type EventPayload =
  | { type: 'webhook_received'; data: z.infer<typeof webhookReceivedPayload> }
  | { type: 'bundle_assembled'; data: z.infer<typeof bundleAssembledPayload> }
  | { type: 'ce3_eligibility_evaluated'; data: z.infer<typeof ce3EligibilityEvaluatedPayload> }
  | { type: 'pdf_generated'; data: z.infer<typeof pdfGeneratedPayload> }
  | { type: 'manifest_signed'; data: z.infer<typeof manifestSignedPayload> }
  | { type: 'submission_staged'; data: z.infer<typeof submissionStagedPayload> }
  | { type: 'human_review_requested'; data: z.infer<typeof humanReviewRequestedPayload> }
  | { type: 'human_review_completed'; data: z.infer<typeof humanReviewCompletedPayload> }
  | { type: 'submitted_to_stripe'; data: z.infer<typeof submittedToStripePayload> }
  | { type: 'stripe_outcome_received'; data: z.infer<typeof stripeOutcomeReceivedPayload> }
  | { type: 'note'; data: z.infer<typeof notePayload> };

/** A single hash-chained event. */
export interface Event {
  /** UUID v4. */
  id: string;
  /** Type discriminator + typed payload. */
  payload: EventPayload;
  /** ISO 8601 UTC. */
  timestamp: string;
  /** Free-form actor string, e.g. "system:agentguard-cb",
   *  "agent:cursor-claude-3.5", "user:jp@merchantguard.ai". */
  actor: string;
  /** Foreign key to the dispute this event belongs to. */
  disputeId: string;
  /** Hex SHA-256 of the previous event in this dispute's chain.
   *  Empty string for the first event in a chain. */
  prevHash: string;
  /** Hex SHA-256 of canonicalJson(payload) || prevHash || timestamp || actor. */
  hash: string;
  /** Optional Ed25519 signature over `hash`, hex-encoded. Present iff
   *  the chain was bound to a signing key at append time. */
  signature?: string;
  /** Hex public key of the signer, if `signature` is present. */
  signerKeyId?: string;
}

/** Audience-targeted rendering of a single event. */
export interface RenderedEvent {
  id: string;
  type: EventType;
  timestamp: string;
  actor: string;
  /** Plain-English description, suitable for finance / legal / regulator
   *  reading. The boring version Max Harlow asked for. */
  label: string;
  /** Optional structured details surfaced inline (e.g. "$89 disputed,
   *  3 priors found"). Kept short; full payload available via drill-down. */
  details: string[];
  /** Drill-down handle: pass back to the system to inspect the raw
   *  signed payload. */
  drillDown: {
    hash: string;
    prevHash: string;
    signature?: string;
    signerKeyId?: string;
    rawPayload: EventPayload;
  };
}

/** A verified chain inspection result. */
export interface ChainVerificationResult {
  disputeId: string;
  eventsChecked: number;
  hashChainValid: boolean;
  signaturesChecked: number;
  signaturesValid: number;
  errors: string[];
}
