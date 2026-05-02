/**
 * Event-log tests for AgentGuard CB v1.1.
 *
 * Covers the buyer-readable layer Max Harlow asked for in the May 2 2026
 * X thread: hash-chained, optionally Ed25519-signed, render to plain
 * English / text / CSV. Verification walks the chain and detects tamper.
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import * as ed from '@noble/ed25519';
import {
  InMemoryEventLogStore,
  computeEventHash,
  signHash,
  verifyEvent,
  verifyChain,
  renderEvent,
  renderEventLogText,
  renderEventLogCsv,
  EVENT_TYPES,
  type Event,
} from '../lib/event-log';

const DISPUTE_ID = 'dp_test_001';

function freshSeedHex(): string {
  return randomBytes(32).toString('hex');
}

describe('EVENT_TYPES', () => {
  it('exposes the documented set, exactly', () => {
    expect(EVENT_TYPES).toEqual([
      'webhook_received',
      'bundle_assembled',
      'ce3_eligibility_evaluated',
      'pdf_generated',
      'manifest_signed',
      'submission_staged',
      'human_review_requested',
      'human_review_completed',
      'submitted_to_stripe',
      'stripe_outcome_received',
      'note',
    ]);
  });
});

describe('computeEventHash', () => {
  it('is deterministic for the same inputs', () => {
    const args = {
      payload: { type: 'note' as const, data: { text: 'hello' } },
      prevHash: '',
      timestamp: '2026-05-02T18:00:00.000Z',
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    };
    expect(computeEventHash(args)).toEqual(computeEventHash(args));
  });

  it('changes when prevHash changes', () => {
    const base = {
      payload: { type: 'note' as const, data: { text: 'hello' } },
      timestamp: '2026-05-02T18:00:00.000Z',
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    };
    expect(computeEventHash({ ...base, prevHash: '' })).not.toEqual(
      computeEventHash({ ...base, prevHash: 'a'.repeat(64) }),
    );
  });

  it('changes when payload changes by a single byte', () => {
    const base = {
      prevHash: '',
      timestamp: '2026-05-02T18:00:00.000Z',
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    };
    const a = computeEventHash({
      ...base,
      payload: { type: 'note', data: { text: 'hello' } },
    });
    const b = computeEventHash({
      ...base,
      payload: { type: 'note', data: { text: 'hellp' } },
    });
    expect(a).not.toEqual(b);
  });
});

describe('signHash', () => {
  it('rejects non-hex seeds', async () => {
    await expect(signHash('a'.repeat(64), 'not-hex-seed')).rejects.toThrow();
  });

  it('produces a verifiable Ed25519 signature', async () => {
    const seedHex = freshSeedHex();
    const hashHex = 'b'.repeat(64);
    const { signature } = await signHash(hashHex, seedHex);

    const seed = Buffer.from(seedHex, 'hex');
    const publicKey = await ed.getPublicKeyAsync(seed);
    const valid = await ed.verifyAsync(
      Buffer.from(signature, 'hex'),
      Buffer.from(hashHex, 'hex'),
      publicKey,
    );
    expect(valid).toBe(true);
  });

  it('returns a stable signerKeyId derived from the public key', async () => {
    const seedHex = freshSeedHex();
    const a = await signHash('c'.repeat(64), seedHex);
    const b = await signHash('d'.repeat(64), seedHex);
    expect(a.signerKeyId).toEqual(b.signerKeyId);
  });
});

describe('InMemoryEventLogStore', () => {
  it('chains prevHash to the previous event', async () => {
    const store = new InMemoryEventLogStore();
    const e1 = await store.append({
      payload: { type: 'webhook_received', data: { webhookEvent: 'charge.dispute.created' } },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    const e2 = await store.append({
      payload: {
        type: 'bundle_assembled',
        data: { priorTransactionsFound: 3, matchingPriorsFound: 2, matchingFields: ['IP'] },
      },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    expect(e1.prevHash).toEqual('');
    expect(e2.prevHash).toEqual(e1.hash);
  });

  it('isolates chains by disputeId', async () => {
    const store = new InMemoryEventLogStore();
    await store.append({
      payload: { type: 'note', data: { text: 'A' } },
      actor: 'system:test',
      disputeId: 'dp_A',
    });
    const eB = await store.append({
      payload: { type: 'note', data: { text: 'B' } },
      actor: 'system:test',
      disputeId: 'dp_B',
    });
    expect(eB.prevHash).toEqual('');
    const disputes = await store.listDisputes();
    expect(disputes.sort()).toEqual(['dp_A', 'dp_B']);
  });

  it('signs events when a seed is provided', async () => {
    const store = new InMemoryEventLogStore();
    const seedHex = freshSeedHex();
    const e = await store.append({
      payload: { type: 'note', data: { text: 'signed' } },
      actor: 'system:test',
      disputeId: DISPUTE_ID,
      signingSeedHex: seedHex,
    });
    expect(e.signature).toBeDefined();
    expect(e.signerKeyId).toBeDefined();
  });
});

describe('verifyChain', () => {
  it('reports a valid chain when nothing is tampered with', async () => {
    const store = new InMemoryEventLogStore();
    await store.append({
      payload: { type: 'webhook_received', data: { webhookEvent: 'charge.dispute.created' } },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    await store.append({
      payload: {
        type: 'ce3_eligibility_evaluated',
        data: {
          qualified: true,
          reasons: ['2 priors matched on IP and shipping_address'],
          selectedPriorChargeIds: ['ch_1', 'ch_2'],
          windowDaysMin: 120,
          windowDaysMax: 365,
        },
      },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });

    const events = await store.list(DISPUTE_ID);
    const result = await verifyChain(DISPUTE_ID, events);
    expect(result.eventsChecked).toEqual(2);
    expect(result.hashChainValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects payload tampering on a single event', async () => {
    const store = new InMemoryEventLogStore();
    await store.append({
      payload: { type: 'note', data: { text: 'first' } },
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    });
    const events = await store.list(DISPUTE_ID);
    const tampered: Event[] = events.map(e => ({
      ...e,
      payload: { type: 'note', data: { text: 'TAMPERED' } },
    }));
    const result = await verifyChain(DISPUTE_ID, tampered);
    expect(result.hashChainValid).toBe(false);
    expect(result.errors.some(e => e.includes('hash mismatch'))).toBe(true);
  });

  it('verifies signatures when a public key is provided', async () => {
    const store = new InMemoryEventLogStore();
    const seedHex = freshSeedHex();
    const seed = Buffer.from(seedHex, 'hex');
    const publicKey = await ed.getPublicKeyAsync(seed);
    const publicKeyHex = Buffer.from(publicKey).toString('hex');

    await store.append({
      payload: { type: 'note', data: { text: 'signed event' } },
      actor: 'system:test',
      disputeId: DISPUTE_ID,
      signingSeedHex: seedHex,
    });

    const events = await store.list(DISPUTE_ID);
    const result = await verifyChain(DISPUTE_ID, events, publicKeyHex);
    expect(result.signaturesChecked).toEqual(1);
    expect(result.signaturesValid).toEqual(1);
  });
});

describe('verifyEvent', () => {
  it('reports hashValid=false on payload mutation', async () => {
    const store = new InMemoryEventLogStore();
    const e = await store.append({
      payload: { type: 'note', data: { text: 'orig' } },
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    });
    const tampered: Event = { ...e, payload: { type: 'note', data: { text: 'mutated' } } };
    const result = await verifyEvent(tampered);
    expect(result.hashValid).toBe(false);
  });
});

describe('renderEvent + renderEventLogText + renderEventLogCsv', () => {
  it('renders a webhook_received event with currency uppercased', async () => {
    const store = new InMemoryEventLogStore();
    const e = await store.append({
      payload: {
        type: 'webhook_received',
        data: {
          webhookEvent: 'charge.dispute.created',
          stripeDisputeId: 'dp_123',
          amount: 8900,
          currency: 'usd',
        },
      },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    const r = renderEvent(e);
    expect(r.label).toContain('charge.dispute.created');
    expect(r.label).toContain('dp_123');
    expect(r.details.join(' ')).toContain('$89.00');
    expect(r.details.join(' ')).toContain('USD');
  });

  it('renders a ce3 verdict in plain English', async () => {
    const store = new InMemoryEventLogStore();
    const e = await store.append({
      payload: {
        type: 'ce3_eligibility_evaluated',
        data: {
          qualified: true,
          reasons: ['2 priors found'],
          selectedPriorChargeIds: ['ch_a', 'ch_b'],
          windowDaysMin: 120,
          windowDaysMax: 365,
        },
      },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    const r = renderEvent(e);
    expect(r.label).toContain('QUALIFIED');
    expect(r.details.join(' ')).toContain('ch_a + ch_b');
  });

  it('renders a multi-event chain as plain text', async () => {
    const store = new InMemoryEventLogStore();
    await store.append({
      payload: { type: 'webhook_received', data: { webhookEvent: 'charge.dispute.created' } },
      actor: 'system:agentguard-cb',
      disputeId: DISPUTE_ID,
    });
    await store.append({
      payload: { type: 'note', data: { text: 'manual review note' } },
      actor: 'user:jp@merchantguard.ai',
      disputeId: DISPUTE_ID,
    });
    const events = await store.list(DISPUTE_ID);
    const text = renderEventLogText(events);
    expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('system:agentguard-cb');
    expect(text).toContain('user:jp@merchantguard.ai');
    expect(text).toContain('manual review note');
  });

  it('renders chain as CSV with the documented header', async () => {
    const store = new InMemoryEventLogStore();
    await store.append({
      payload: { type: 'note', data: { text: 'csv test' } },
      actor: 'system:test',
      disputeId: DISPUTE_ID,
    });
    const events = await store.list(DISPUTE_ID);
    const csv = renderEventLogCsv(events);
    const headerRow = csv.split('\n')[0]!;
    for (const col of [
      'timestamp',
      'actor',
      'type',
      'label',
      'details',
      'event_hash',
      'prev_hash',
      'signature_present',
    ]) {
      expect(headerRow).toContain(col);
    }
  });
});
