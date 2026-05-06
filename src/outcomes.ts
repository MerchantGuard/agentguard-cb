/**
 * Subpath export: @merchantguard/agentguard-cb/outcomes
 *
 * Re-exports the OutcomeRecorder interface plus the in-memory and Postgres
 * reference implementations. Use this subpath to wire up outcome capture
 * for your data flywheel without pulling in the full library surface.
 *
 * Outcome capture is OPT-IN. The publisher does not collect outcomes;
 * recorded outcomes stay on merchant infrastructure.
 *
 * Migration: docs/migrations/agentguard_cb_dispute_outcomes.sql
 */

export * from '../lib/outcomes';
