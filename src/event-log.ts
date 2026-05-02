/**
 * Subpath export: @merchantguard/agentguard-cb/event-log
 *
 * Re-exports the buyer-readable event log primitives. Use this subpath
 * if you only need the event-log layer (typed events, plain-English
 * renderer, hash-chained store) and do not want to pull in the
 * CE 3.0 evaluator or PDF generator.
 *
 * The event log is the human-readable surface that finance, legal, and
 * regulatory readers consume; the cryptographic chain underneath is what
 * machine auditors verify. Same data, two audiences.
 */

export * from '../lib/event-log';
