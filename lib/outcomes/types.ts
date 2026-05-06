/**
 * Outcome capture types — the data flywheel hook.
 *
 * After a dispute reaches a final state (won / lost / withdrawn), the
 * merchant can record the outcome through this interface. Recorded outcomes
 * feed back into pattern-quality analysis without ever leaving merchant
 * infrastructure (the recorder writes to whatever backend the merchant
 * configures: Postgres, Supabase, fs, or in-memory for tests).
 *
 * Per the AgentGuard CB legal posture: outcome capture is OPTIONAL and
 * OPT-IN. The publisher does not collect outcomes from merchants. This
 * interface is provided so merchants can build their own learning loops
 * inside their own infrastructure.
 */

export type DisputeFinalOutcome =
  | 'won'           // Issuer reversed, merchant kept the funds
  | 'lost'          // Issuer upheld the dispute, funds permanently reversed
  | 'withdrawn'     // Cardholder withdrew the dispute
  | 'pending'       // Still in flight
  | 'unknown';      // Merchant didn't track the result

export interface DisputeOutcomeRecord {
  /** Stripe dispute ID (dp_*) — the canonical identifier. */
  disputeId: string;

  /** Final outcome reported by the merchant or by Stripe. */
  outcome: DisputeFinalOutcome;

  /** When the outcome was recorded. */
  recordedAt: Date;

  /** Hash of the canonical evidence packet that was submitted (for audit-log linkage). */
  evidencePacketHash?: string;

  /** Stripe-reported eligibility status at time of submission. */
  eligibilityStatusAtSubmission?: 'qualified' | 'requires_action' | 'not_qualified';

  /** Locale of the merchant who submitted (for cross-language pattern analysis). */
  merchantLocale?: string;

  /** Free-form merchant notes — NEVER includes cardholder PII. */
  merchantNotes?: string;

  /** Whether the dispute was Visa CE 3.0 (vs other networks/reason codes). */
  wasVisaCe3?: boolean;

  /** Optional: dollar amount of the dispute (for cohort analysis). */
  disputeAmountUsdCents?: number;
}

export interface OutcomeRecorder {
  /**
   * Record a final outcome. Idempotent on disputeId — calling with the same
   * disputeId updates the existing record.
   */
  record(outcome: DisputeOutcomeRecord): Promise<void>;

  /**
   * Look up the outcome for a dispute. Returns null if not yet recorded.
   */
  get(disputeId: string): Promise<DisputeOutcomeRecord | null>;

  /**
   * List outcomes filtered by criteria. Pagination is recorder-specific.
   */
  list(filter?: OutcomeFilter): Promise<DisputeOutcomeRecord[]>;
}

export interface OutcomeFilter {
  outcome?: DisputeFinalOutcome;
  merchantLocale?: string;
  recordedAfter?: Date;
  recordedBefore?: Date;
  limit?: number;
}
