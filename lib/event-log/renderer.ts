/**
 * Renderer: turns a typed Event into a buyer-readable RenderedEvent.
 *
 * This is the layer Max Harlow asked for in the May 2 2026 thread:
 * "the finance/legal reader usually needs the boring version before
 * they trust the cryptographic one." The boring version is composed
 * here, deterministically, from the structured payload of each event.
 *
 * Design rules:
 *   - One renderer function per event type. No fall-through.
 *   - Labels are short, declarative, past-tense. Finance reads them.
 *   - Numeric values formatted with locale-stable rules (USD $ with
 *     two decimals; date-times in ISO if no locale specified).
 *   - The renderer never throws; unknown future event types degrade
 *     to a generic "unknown event" label so old chains still render
 *     under newer code.
 */

import type { Event, EventPayload, RenderedEvent } from './types';

function formatUSD(amount: number | undefined): string {
  if (amount === undefined) return '(amount unknown)';
  return `$${(amount / 100).toFixed(2)}`;
}

function renderPayload(payload: EventPayload): { label: string; details: string[] } {
  switch (payload.type) {
    case 'webhook_received': {
      const { webhookEvent, stripeDisputeId, amount, currency } = payload.data;
      const label = `Stripe webhook received: ${webhookEvent}${stripeDisputeId ? ` (${stripeDisputeId})` : ''}`;
      const details: string[] = [];
      if (amount !== undefined) {
        details.push(`Amount: ${formatUSD(amount)} ${currency?.toUpperCase() ?? ''}`.trim());
      }
      return { label, details };
    }

    case 'bundle_assembled': {
      const d = payload.data;
      const label = `Customer evidence bundle assembled from production data`;
      const details: string[] = [];
      if (d.customerAccountId) {
        const tenure = d.customerTenureMonths !== undefined
          ? `, ${d.customerTenureMonths}-month tenure`
          : '';
        details.push(`Customer account: ${d.customerAccountId}${tenure}`);
      }
      if (d.disputedAmount !== undefined && d.disputedTransactionDate) {
        details.push(`Disputed: ${formatUSD(d.disputedAmount)} on ${d.disputedTransactionDate}`);
      }
      details.push(
        `${d.matchingPriorsFound} of ${d.priorTransactionsFound} prior undisputed transactions matched on ${d.matchingFields.join(' + ') || 'no fields'}`,
      );
      return { label, details };
    }

    case 'ce3_eligibility_evaluated': {
      const { qualified, reasons, selectedPriorChargeIds, windowDaysMin, windowDaysMax } = payload.data;
      const verdict = qualified ? 'QUALIFIED' : 'NOT QUALIFIED';
      const label = `Visa CE 3.0 eligibility evaluated: ${verdict}`;
      const details: string[] = [];
      if (reasons.length > 0) {
        details.push(`Reasons: ${reasons.join('; ')}`);
      }
      if (qualified && selectedPriorChargeIds.length === 2) {
        details.push(`Priors selected: ${selectedPriorChargeIds.join(' + ')} (window ${windowDaysMin}-${windowDaysMax} days)`);
      }
      return { label, details };
    }

    case 'pdf_generated': {
      const { pages, bytes, pdfSha256Hex } = payload.data;
      const label = `PDF generated`;
      const details: string[] = [
        `${pages} pages, ${(bytes / 1024).toFixed(1)} KB`,
        `sha256: ${pdfSha256Hex.slice(0, 16)}...`,
      ];
      return { label, details };
    }

    case 'manifest_signed': {
      const { manifestSha256Hex, signatureHex, signingKeyId } = payload.data;
      const label = `Manifest cryptographically signed (Ed25519)`;
      const details: string[] = [
        `manifest sha256: ${manifestSha256Hex.slice(0, 16)}...`,
        `signature: ${signatureHex.slice(0, 16)}...`,
        `signing key id: ${signingKeyId}`,
      ];
      return { label, details };
    }

    case 'submission_staged': {
      const { awaitingReviewer, expectedReviewWindowHours } = payload.data;
      const label = `Submission staged for human review (submit:false)`;
      const details: string[] = [];
      if (awaitingReviewer) details.push(`Awaiting reviewer: ${awaitingReviewer}`);
      if (expectedReviewWindowHours !== undefined) {
        details.push(`Expected review window: ${expectedReviewWindowHours} hours`);
      }
      return { label, details };
    }

    case 'human_review_requested': {
      const { reviewer, channel } = payload.data;
      const label = `Human review requested via ${channel}`;
      const details: string[] = [`Reviewer notified: ${reviewer}`];
      return { label, details };
    }

    case 'human_review_completed': {
      const { reviewer, decision, notes } = payload.data;
      const decisionLabel =
        decision === 'approve' ? 'APPROVED' :
        decision === 'reject' ? 'REJECTED' :
        'CHANGES REQUESTED';
      const label = `Human review completed: ${decisionLabel}`;
      const details: string[] = [`Reviewer: ${reviewer}`];
      if (notes) details.push(`Notes: ${notes}`);
      return { label, details };
    }

    case 'submitted_to_stripe': {
      const { stripeDisputeId, stripeApiVersion, enhancedEvidenceIncluded } = payload.data;
      const label = `Submitted to Stripe Disputes API (submit:true)`;
      const details: string[] = [`Stripe dispute: ${stripeDisputeId}`];
      if (stripeApiVersion) details.push(`Stripe API version: ${stripeApiVersion}`);
      details.push(`Enhanced evidence included: ${enhancedEvidenceIncluded ? 'yes' : 'no'}`);
      return { label, details };
    }

    case 'stripe_outcome_received': {
      const { outcome, stripeReason, netRecoveredAmount } = payload.data;
      const outcomeLabel = outcome.toUpperCase();
      const label = `Stripe outcome received: ${outcomeLabel}`;
      const details: string[] = [];
      if (stripeReason) details.push(`Reason: ${stripeReason}`);
      if (netRecoveredAmount !== undefined) {
        details.push(`Net recovered: ${formatUSD(netRecoveredAmount)}`);
      }
      return { label, details };
    }

    case 'note': {
      return { label: payload.data.text, details: [] };
    }
  }
}

/** Render a single Event into the buyer-readable form. Pure function;
 *  never throws. */
export function renderEvent(event: Event): RenderedEvent {
  const { label, details } = renderPayload(event.payload);
  return {
    id: event.id,
    type: event.payload.type,
    timestamp: event.timestamp,
    actor: event.actor,
    label,
    details,
    drillDown: {
      hash: event.hash,
      prevHash: event.prevHash,
      signature: event.signature,
      signerKeyId: event.signerKeyId,
      rawPayload: event.payload,
    },
  };
}

/** Render a chain of Events as a multi-line plain-text log suitable for
 *  CSV export, terminal display, or copy-paste into a regulatory filing.
 *  This is the BORING VERSION as a single string. */
export function renderEventLogText(events: Event[]): string {
  return events
    .map(e => {
      const r = renderEvent(e);
      const head = `[${r.timestamp}] ${r.actor}  ${r.label}`;
      const detailLines = r.details.map(d => `                            ${d}`);
      return [head, ...detailLines].join('\n');
    })
    .join('\n');
}

/** Render a chain of Events as CSV rows for finance team export. */
export function renderEventLogCsv(events: Event[]): string {
  const header = ['timestamp', 'actor', 'type', 'label', 'details', 'event_hash', 'prev_hash', 'signature_present'];
  const rows = events.map(e => {
    const r = renderEvent(e);
    return [
      r.timestamp,
      r.actor,
      r.type,
      r.label,
      r.details.join(' | '),
      r.drillDown.hash,
      r.drillDown.prevHash,
      r.drillDown.signature ? 'true' : 'false',
    ];
  });
  return [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
