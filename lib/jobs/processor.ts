/**
 * Job processor — claims a small batch atomically and processes each job.
 *
 * Job types:
 * - collect_evidence
 * - generate_pdf
 * - stage_evidence
 * - submit_evidence
 *
 * Uses postgres SKIP LOCKED for concurrency-safe claiming.
 *
 * NOTE: The job handlers below are scaffolded. The full implementations
 * (calling adapter, generating PDF, uploading to Stripe, etc.) wire together
 * the pieces already in lib/evidence/*, lib/pdf/*, and lib/stripe/*.
 */
import { sql, and, eq, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { disputeJobs } from '../db/schema';
import { auditLog } from '../audit/log';

const BATCH_SIZE = 5;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export interface ProcessBatchResult {
  claimed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function processJobBatch(): Promise<ProcessBatchResult> {
  const db = getDb();
  const lockedBy = `processor-${process.pid}-${Date.now()}`;

  // Atomic claim with SKIP LOCKED
  const claimed = await db.execute(sql`
    UPDATE dispute_jobs
       SET status = 'running',
           locked_at = now(),
           locked_by = ${lockedBy},
           attempts = attempts + 1,
           updated_at = now()
     WHERE id IN (
       SELECT id FROM dispute_jobs
        WHERE status = 'queued'
          AND run_after <= now()
        ORDER BY created_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (claimed as unknown as { rows: any[] }).rows ?? (claimed as unknown as any[]);

  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  for (const job of rows as Array<typeof disputeJobs.$inferSelect>) {
    try {
      await runJob(job);
      await db.update(disputeJobs)
        .set({ status: 'succeeded', lockedAt: null, lockedBy: null, updatedAt: sql`now()` })
        .where(eq(disputeJobs.id, job.id));
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      errors.push(`${job.type}/${job.id}: ${msg}`);
      const isDead = job.attempts >= job.maxAttempts - 1;
      const backoffMs = Math.min(60000 * Math.pow(2, job.attempts), 3600000);
      await db.update(disputeJobs)
        .set({
          status: isDead ? 'dead' : 'queued',
          lastError: msg,
          lockedAt: null,
          lockedBy: null,
          runAfter: sql`now() + (${backoffMs} || ' milliseconds')::interval`,
          updatedAt: sql`now()`,
        })
        .where(eq(disputeJobs.id, job.id));
      failed++;
    }
  }

  // Reclaim stuck jobs (lockedAt older than LOCK_TIMEOUT_MS)
  await db
    .update(disputeJobs)
    .set({ status: 'queued', lockedAt: null, lockedBy: null })
    .where(and(eq(disputeJobs.status, 'running'), lte(disputeJobs.lockedAt, sql`now() - interval '5 minutes'`)));

  return { claimed: rows.length, succeeded, failed, errors };
}

async function runJob(job: typeof disputeJobs.$inferSelect): Promise<void> {
  switch (job.type) {
    case 'collect_evidence':
      // TODO: load adapter from config, call getCustomerEvidence, persist to evidence_snapshots,
      // hash bundleJson, audit `adapter_response_hashed`, enqueue generate_pdf.
      await auditLog({
        eventType: 'adapter_response_hashed',
        disputeId: job.disputeId,
        actorType: 'job_processor',
        meta: { jobId: job.id, todo: 'wire adapter selection' },
      });
      throw new Error('collect_evidence handler not yet implemented — see lib/jobs/processor.ts');
    case 'generate_pdf':
      throw new Error('generate_pdf handler not yet implemented');
    case 'stage_evidence':
      throw new Error('stage_evidence handler not yet implemented');
    case 'submit_evidence':
      throw new Error('submit_evidence handler not yet implemented');
    default:
      throw new Error(`unknown job type: ${job.type}`);
  }
}
