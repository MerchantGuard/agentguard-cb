/**
 * Append-only audit log with SHA-256 hash chain.
 *
 * Each entry's `entry_hash` = sha256(previous_hash || canonical_json(entry_payload)).
 * This produces a tamper-evident chain — any modification to an old entry
 * invalidates all subsequent hashes.
 *
 * Application code MUST call auditLog() and never UPDATE/DELETE on the table.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { auditLog as auditLogTable } from '../db/schema';

export interface AuditLogInput {
  eventType: string;
  disputeId?: string | null;
  payloadSha256?: string | null;
  actorType?: 'system' | 'webhook' | 'admin' | 'job_processor';
  actorId?: string;
  meta?: Record<string, unknown>;
}

export async function auditLog(input: AuditLogInput): Promise<void> {
  const db = getDb();

  // Find the most recent entry's entry_hash to chain from.
  const lastEntries = await db
    .select({ entryHash: auditLogTable.entryHash })
    .from(auditLogTable)
    .orderBy(sql`${auditLogTable.createdAt} desc`)
    .limit(1);
  const previousHash = lastEntries[0]?.entryHash ?? '';

  const payload = canonicalJson({
    eventType: input.eventType,
    disputeId: input.disputeId ?? null,
    payloadSha256: input.payloadSha256 ?? null,
    actorType: input.actorType ?? 'system',
    actorId: input.actorId ?? null,
    meta: input.meta ?? {},
    timestamp: new Date().toISOString(),
  });

  const entryHash = createHash('sha256').update(previousHash + payload).digest('hex');

  await db.insert(auditLogTable).values({
    disputeId: input.disputeId ?? null,
    eventType: input.eventType,
    payloadSha256: input.payloadSha256 ?? null,
    previousHash: previousHash || null,
    entryHash,
    actorType: input.actorType ?? 'system',
    actorId: input.actorId ?? null,
    meta: input.meta ?? {},
  });
}

/**
 * Stable JSON serialization — sorted keys, no whitespace.
 * Hash inputs MUST be deterministic across runs.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map((v) => canonicalJson(v)).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}
