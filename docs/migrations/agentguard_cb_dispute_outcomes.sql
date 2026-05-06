-- AgentGuard CB outcome capture migration.
--
-- Run this against your own Postgres instance to enable PostgresOutcomeRecorder.
-- The table sits in the merchant's own database; the publisher (Dunecrest
-- Ventures Inc.) does not have access to merchant outcomes.

CREATE TABLE IF NOT EXISTS agentguard_cb_dispute_outcomes (
  -- Stripe dispute ID is the canonical key
  dispute_id                       TEXT PRIMARY KEY,

  -- Final outcome reported by the merchant
  outcome                          TEXT NOT NULL CHECK (
    outcome IN ('won', 'lost', 'withdrawn', 'pending', 'unknown')
  ),

  -- When the outcome was recorded
  recorded_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hash of the canonical evidence packet (for linkage to the audit log)
  evidence_packet_hash             TEXT,

  -- Stripe-reported eligibility status at time of submission
  eligibility_status_at_submission TEXT CHECK (
    eligibility_status_at_submission IS NULL
    OR eligibility_status_at_submission IN ('qualified', 'requires_action', 'not_qualified')
  ),

  -- Locale of the merchant (for cross-language analysis if you choose to track it)
  merchant_locale                  TEXT,

  -- Free-form merchant notes. SHOULD NOT include cardholder PII.
  merchant_notes                   TEXT,

  -- Whether the dispute was Visa CE 3.0
  was_visa_ce3                     BOOLEAN,

  -- Dispute amount in USD cents
  dispute_amount_usd_cents         INTEGER
);

-- Index for cohort analysis queries
CREATE INDEX IF NOT EXISTS agentguard_cb_outcomes_recorded_at_idx
  ON agentguard_cb_dispute_outcomes (recorded_at DESC);

CREATE INDEX IF NOT EXISTS agentguard_cb_outcomes_outcome_idx
  ON agentguard_cb_dispute_outcomes (outcome);

CREATE INDEX IF NOT EXISTS agentguard_cb_outcomes_locale_idx
  ON agentguard_cb_dispute_outcomes (merchant_locale)
  WHERE merchant_locale IS NOT NULL;

-- Optional row-level security: enable if your deployment requires it
-- ALTER TABLE agentguard_cb_dispute_outcomes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY agentguard_cb_outcomes_service_role ON agentguard_cb_dispute_outcomes
--   USING (current_setting('role') = 'service_role');
