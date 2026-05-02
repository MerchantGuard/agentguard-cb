/**
 * Subpath export: @merchantguard/agentguard-cb/adapters
 *
 * Re-exports the EvidenceAdapter interface and the stripe-only reference
 * adapter. Implement EvidenceAdapter to integrate dispute-defender with
 * your own merchant data sources beyond Stripe.
 */

export * from '../lib/evidence/adapter';
