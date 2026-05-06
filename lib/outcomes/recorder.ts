/**
 * Outcome recorders — pluggable backends for the data flywheel.
 *
 * Two reference implementations:
 *   - InMemoryOutcomeRecorder: for tests, development, ephemeral environments
 *   - PostgresOutcomeRecorder: for production self-hosted deployments
 *
 * Merchants can implement their own OutcomeRecorder for any backend (S3,
 * Supabase, Redis, custom API). The interface stays minimal: record / get / list.
 */

import type {
  DisputeOutcomeRecord,
  OutcomeFilter,
  OutcomeRecorder,
} from './types';

// ---------- In-memory recorder (tests + dev) ----------

export class InMemoryOutcomeRecorder implements OutcomeRecorder {
  private store = new Map<string, DisputeOutcomeRecord>();

  async record(outcome: DisputeOutcomeRecord): Promise<void> {
    this.store.set(outcome.disputeId, { ...outcome });
  }

  async get(disputeId: string): Promise<DisputeOutcomeRecord | null> {
    return this.store.get(disputeId) ?? null;
  }

  async list(filter?: OutcomeFilter): Promise<DisputeOutcomeRecord[]> {
    let results = Array.from(this.store.values());

    if (filter?.outcome) {
      results = results.filter((o) => o.outcome === filter.outcome);
    }
    if (filter?.merchantLocale) {
      results = results.filter((o) => o.merchantLocale === filter.merchantLocale);
    }
    if (filter?.recordedAfter) {
      results = results.filter((o) => o.recordedAt >= filter.recordedAfter!);
    }
    if (filter?.recordedBefore) {
      results = results.filter((o) => o.recordedAt <= filter.recordedBefore!);
    }
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }
    return results;
  }

  /** For tests / dev: clear all recorded outcomes. */
  clear(): void {
    this.store.clear();
  }

  /** For tests / dev: count of recorded outcomes. */
  size(): number {
    return this.store.size;
  }
}

// ---------- Postgres recorder (production self-hosted) ----------

export interface PostgresLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Reference Postgres adapter. Expects a table created via the migration in
 * docs/migrations/agentguard_cb_dispute_outcomes.sql.
 *
 * The merchant brings their own pg client (node-postgres, postgres.js,
 * Drizzle, etc) and passes anything that implements the minimal `query`
 * interface. The recorder does NOT take a hard dependency on a specific
 * Postgres library.
 */
export class PostgresOutcomeRecorder implements OutcomeRecorder {
  constructor(
    private client: PostgresLike,
    private tableName: string = 'agentguard_cb_dispute_outcomes',
  ) {}

  async record(outcome: DisputeOutcomeRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.tableName} (
         dispute_id, outcome, recorded_at, evidence_packet_hash,
         eligibility_status_at_submission, merchant_locale, merchant_notes,
         was_visa_ce3, dispute_amount_usd_cents
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dispute_id) DO UPDATE SET
         outcome = EXCLUDED.outcome,
         recorded_at = EXCLUDED.recorded_at,
         evidence_packet_hash = EXCLUDED.evidence_packet_hash,
         eligibility_status_at_submission = EXCLUDED.eligibility_status_at_submission,
         merchant_locale = EXCLUDED.merchant_locale,
         merchant_notes = EXCLUDED.merchant_notes,
         was_visa_ce3 = EXCLUDED.was_visa_ce3,
         dispute_amount_usd_cents = EXCLUDED.dispute_amount_usd_cents`,
      [
        outcome.disputeId,
        outcome.outcome,
        outcome.recordedAt,
        outcome.evidencePacketHash ?? null,
        outcome.eligibilityStatusAtSubmission ?? null,
        outcome.merchantLocale ?? null,
        outcome.merchantNotes ?? null,
        outcome.wasVisaCe3 ?? null,
        outcome.disputeAmountUsdCents ?? null,
      ],
    );
  }

  async get(disputeId: string): Promise<DisputeOutcomeRecord | null> {
    const result = await this.client.query(
      `SELECT dispute_id, outcome, recorded_at, evidence_packet_hash,
              eligibility_status_at_submission, merchant_locale, merchant_notes,
              was_visa_ce3, dispute_amount_usd_cents
         FROM ${this.tableName}
        WHERE dispute_id = $1`,
      [disputeId],
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  async list(filter?: OutcomeFilter): Promise<DisputeOutcomeRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filter?.outcome) {
      conditions.push(`outcome = $${paramIdx++}`);
      params.push(filter.outcome);
    }
    if (filter?.merchantLocale) {
      conditions.push(`merchant_locale = $${paramIdx++}`);
      params.push(filter.merchantLocale);
    }
    if (filter?.recordedAfter) {
      conditions.push(`recorded_at >= $${paramIdx++}`);
      params.push(filter.recordedAfter);
    }
    if (filter?.recordedBefore) {
      conditions.push(`recorded_at <= $${paramIdx++}`);
      params.push(filter.recordedBefore);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ? `LIMIT ${Math.min(filter.limit, 1000)}` : 'LIMIT 100';

    const result = await this.client.query(
      `SELECT dispute_id, outcome, recorded_at, evidence_packet_hash,
              eligibility_status_at_submission, merchant_locale, merchant_notes,
              was_visa_ce3, dispute_amount_usd_cents
         FROM ${this.tableName}
         ${where}
         ORDER BY recorded_at DESC
         ${limit}`,
      params,
    );

    return result.rows.map((row) => this.rowToRecord(row as Record<string, unknown>));
  }

  private rowToRecord(row: Record<string, unknown>): DisputeOutcomeRecord {
    return {
      disputeId: row.dispute_id as string,
      outcome: row.outcome as DisputeOutcomeRecord['outcome'],
      recordedAt: new Date(row.recorded_at as string),
      evidencePacketHash: (row.evidence_packet_hash as string | null) ?? undefined,
      eligibilityStatusAtSubmission:
        (row.eligibility_status_at_submission as DisputeOutcomeRecord['eligibilityStatusAtSubmission']) ??
        undefined,
      merchantLocale: (row.merchant_locale as string | null) ?? undefined,
      merchantNotes: (row.merchant_notes as string | null) ?? undefined,
      wasVisaCe3: (row.was_visa_ce3 as boolean | null) ?? undefined,
      disputeAmountUsdCents:
        (row.dispute_amount_usd_cents as number | null) ?? undefined,
    };
  }
}
