/**
 * Stripe webhook handler.
 *
 * CRITICAL CONSTRAINTS (per docs/verified-facts-stripe-visa-ce3.md):
 * - MUST run on Node runtime (not Edge) — Stripe signature verification
 *   requires the unmodified raw request body, and Edge runtimes can silently
 *   parse it. We pin runtime = 'nodejs' for predictability.
 * - MUST read the raw body via `await req.text()` BEFORE calling
 *   stripe.webhooks.constructEvent.
 * - MUST NOT do evidence collection inline. Webhooks have a 5s response
 *   budget; collection involves DB queries and PDF generation which are
 *   minutes-scale. Enqueue a job and return 200 immediately.
 * - MUST be idempotent. Stripe retries on 5xx, and we may receive the same
 *   event ID more than once. Insert event ID with unique constraint; on
 *   conflict, return 200 with `{replayed: true}`.
 *
 * Events handled:
 * - charge.dispute.created    -> upsert dispute row, enqueue collect_evidence job
 * - charge.dispute.updated    -> update dispute row, no job
 * - charge.dispute.closed     -> mark dispute terminal, no job
 */
import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { upsertDispute, recordWebhookEvent, enqueueJob } from '@/lib/db/queries';
import { auditLog } from '@/lib/audit/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
  }

  // Read raw body BEFORE any parsing — Stripe signature verification
  // fails if the body is mutated.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    // Log full error server-side; return only a generic verdict to the caller.
    // Surfacing err.message could leak Stripe SDK internals or library stack
    // detail to whoever is hitting the webhook URL (caught by deepsec scan
    // 2026-05-04, error-message-leak matcher).
    console.error('[stripe-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'signature verification failed' }, { status: 400 });
  }

  // Idempotency: insert event ID with unique constraint.
  // On conflict (replay), return 200 immediately — this is normal Stripe retry behavior.
  const replayed = await recordWebhookEvent(event.id, event.type);
  if (replayed) {
    await auditLog({
      eventType: 'webhook_replay_ignored',
      payloadSha256: hashEventId(event.id),
      meta: { stripeEventId: event.id, type: event.type },
    });
    return NextResponse.json({ received: true, replayed: true });
  }

  await auditLog({
    eventType: 'webhook_received',
    payloadSha256: hashEventId(event.id),
    meta: { stripeEventId: event.id, type: event.type, livemode: event.livemode },
  });

  // Dispatch on event type
  try {
    switch (event.type) {
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const disputeRow = await upsertDispute(dispute);
        await auditLog({
          eventType: 'dispute_record_upserted',
          disputeId: disputeRow.id,
          payloadSha256: hashEventId(dispute.id),
          meta: { stripeEventId: event.id, status: dispute.status },
        });
        await enqueueJob(disputeRow.id, 'collect_evidence');
        await auditLog({
          eventType: 'job_enqueued',
          disputeId: disputeRow.id,
          meta: { jobType: 'collect_evidence' },
        });
        break;
      }
      case 'charge.dispute.updated': {
        const dispute = event.data.object as Stripe.Dispute;
        const disputeRow = await upsertDispute(dispute);
        await auditLog({
          eventType: 'dispute_record_upserted',
          disputeId: disputeRow.id,
          payloadSha256: hashEventId(dispute.id),
          meta: { stripeEventId: event.id, status: dispute.status, updated: true },
        });
        break;
      }
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        const disputeRow = await upsertDispute(dispute);
        await auditLog({
          eventType: 'dispute_record_upserted',
          disputeId: disputeRow.id,
          payloadSha256: hashEventId(dispute.id),
          meta: { stripeEventId: event.id, status: dispute.status, closed: true },
        });
        break;
      }
      default:
        // Unhandled event type — Stripe sends many; we just ack so they don't retry.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('webhook handler error', err);
    // Return 200 to prevent Stripe retry loops — we'll surface the error via audit log.
    await auditLog({
      eventType: 'webhook_received',
      payloadSha256: hashEventId(event.id),
      meta: { stripeEventId: event.id, type: event.type, error: msg },
    });
  }

  return NextResponse.json({ received: true });
}

// Minimal hash helper — used only for audit log payload references, not security-sensitive.
function hashEventId(id: string): string {
  // Lightweight: just use the ID itself as the reference. Real SHA-256 hashing happens
  // in lib/audit/log.ts when an actual payload is hashed.
  return id;
}
