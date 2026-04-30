/**
 * High-level DB query helpers used by webhook + job processor + dashboard.
 */
import type Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { disputes, stripeWebhookEvents, disputeJobs } from './schema';

/**
 * Insert webhook event ID with unique constraint. Returns true if this is a
 * REPLAY (event ID already seen), false if first time.
 *
 * Atomic via INSERT ... ON CONFLICT — no read-then-write race.
 */
export async function recordWebhookEvent(stripeEventId: string, eventType: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .insert(stripeWebhookEvents)
    .values({ stripeEventId, eventType })
    .onConflictDoUpdate({
      target: stripeWebhookEvents.stripeEventId,
      set: {
        timesSeen: sql`${stripeWebhookEvents.timesSeen} + 1`,
        lastSeenAt: sql`now()`,
      },
    })
    .returning({ id: stripeWebhookEvents.id, timesSeen: stripeWebhookEvents.timesSeen });
  const row = result[0];
  return Boolean(row && row.timesSeen > 1);
}

export async function upsertDispute(d: Stripe.Dispute) {
  const db = getDb();
  const card = d.payment_method_details?.card;
  const values = {
    stripeDisputeId: d.id,
    stripeChargeId: typeof d.charge === 'string' ? d.charge : d.charge.id,
    stripePaymentIntentId:
      typeof d.payment_intent === 'string'
        ? d.payment_intent
        : d.payment_intent?.id ?? null,
    stripeCustomerId: null,
    stripeReason: d.reason,
    networkBrand: card?.brand ?? null,
    networkReasonCode: card?.network_reason_code ?? null,
    enhancedEligibilityTypes: (d.enhanced_eligibility_types ?? []) as string[],
    status: d.status,
    dueBy: d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000) : null,
    amount: d.amount,
    currency: d.currency,
    livemode: d.livemode,
  };

  const result = await db
    .insert(disputes)
    .values(values)
    .onConflictDoUpdate({
      target: disputes.stripeDisputeId,
      set: {
        ...values,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!result[0]) throw new Error('upsertDispute returned no rows');
  return result[0];
}

export async function enqueueJob(disputeId: string, type: string) {
  const db = getDb();
  const result = await db
    .insert(disputeJobs)
    .values({ disputeId, type })
    .returning();
  if (!result[0]) throw new Error('enqueueJob returned no rows');
  return result[0];
}

export async function getDisputeByStripeId(stripeDisputeId: string) {
  const db = getDb();
  const rows = await db.select().from(disputes).where(eq(disputes.stripeDisputeId, stripeDisputeId)).limit(1);
  return rows[0] ?? null;
}
