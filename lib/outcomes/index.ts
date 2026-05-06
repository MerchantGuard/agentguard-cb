/**
 * Outcome capture — barrel exports.
 *
 * Usage:
 *   import { InMemoryOutcomeRecorder } from '@merchantguard/agentguard-cb/outcomes'
 *
 * Or for self-hosted Postgres deployment:
 *   import { PostgresOutcomeRecorder } from '@merchantguard/agentguard-cb/outcomes'
 *
 * See docs/migrations/agentguard_cb_dispute_outcomes.sql for the table schema.
 */

export type {
  DisputeFinalOutcome,
  DisputeOutcomeRecord,
  OutcomeFilter,
  OutcomeRecorder,
} from './types';

export {
  InMemoryOutcomeRecorder,
  PostgresOutcomeRecorder,
  type PostgresLike,
} from './recorder';
