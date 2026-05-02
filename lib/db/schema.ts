/**
 * Drizzle schema for AgentGuard CB.
 *
 * Tables:
 * - disputes              : dispute state mirror (synced from Stripe webhooks)
 * - stripe_webhook_events : event ID dedupe (idempotency)
 * - dispute_jobs          : background job queue
 * - audit_log             : append-only audit trail with hash chain
 * - evidence_snapshots    : adapter response captures (with SHA-256)
 * - pdf_artifacts         : generated PDF metadata + manifest signatures
 */
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeDisputeId: text('stripe_dispute_id').notNull(),
    stripeChargeId: text('stripe_charge_id').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeReason: text('stripe_reason').notNull(),
    networkBrand: text('network_brand'),
    networkReasonCode: text('network_reason_code'),
    enhancedEligibilityTypes: text('enhanced_eligibility_types').array(),
    status: text('status').notNull(),
    dueBy: timestamp('due_by', { withTimezone: true }),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    livemode: boolean('livemode').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqStripeDisputeId: uniqueIndex('disputes_stripe_dispute_id_uniq').on(t.stripeDisputeId),
    statusIdx: index('disputes_status_idx').on(t.status),
  })
);

export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: text('stripe_event_id').notNull(),
    eventType: text('event_type').notNull(),
    timesSeen: integer('times_seen').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqEventId: uniqueIndex('stripe_webhook_events_event_id_uniq').on(t.stripeEventId),
  })
);

export const disputeJobs = pgTable(
  'dispute_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    disputeId: uuid('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // collect_evidence | generate_pdf | stage_evidence | submit_evidence
    status: text('status').notNull().default('queued'), // queued | running | succeeded | failed | dead
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusRunAfterIdx: index('dispute_jobs_status_run_after_idx').on(t.status, t.runAfter),
    disputeIdx: index('dispute_jobs_dispute_idx').on(t.disputeId),
  })
);

/**
 * audit_log is APPEND-ONLY at the application layer.
 * Each row stores its own SHA-256 (entry_hash) computed over (previous_hash + payload).
 * This builds a tamper-evident hash chain.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    disputeId: uuid('dispute_id').references(() => disputes.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payloadSha256: text('payload_sha256'),
    previousHash: text('previous_hash'),
    entryHash: text('entry_hash').notNull(),
    actorType: text('actor_type'), // system | webhook | admin | job_processor
    actorId: text('actor_id'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    disputeIdx: index('audit_log_dispute_idx').on(t.disputeId),
    createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  })
);

export const evidenceSnapshots = pgTable('evidence_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  adapterName: text('adapter_name').notNull(),
  adapterVersion: text('adapter_version').notNull(),
  bundleSha256: text('bundle_sha256').notNull(),
  bundleJson: jsonb('bundle_json').notNull(),
  ce3Eligibility: jsonb('ce3_eligibility'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdfArtifacts = pgTable('pdf_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  evidenceSnapshotId: uuid('evidence_snapshot_id').notNull().references(() => evidenceSnapshots.id, { onDelete: 'cascade' }),
  pdfSha256: text('pdf_sha256').notNull(),
  manifestJson: jsonb('manifest_json').notNull(),
  manifestSignature: text('manifest_signature').notNull(),
  storagePath: text('storage_path'), // file path or S3 URL — implementation detail
  stripeFileId: text('stripe_file_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
