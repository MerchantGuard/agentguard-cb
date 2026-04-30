/**
 * CE 3.0 eligibility + payload tests.
 *
 * Covers the boundary cases called out in docs/verified-facts-stripe-visa-ce3.md:
 * - day window: 119 fails, 120 passes, 364 passes, 365 fails (Stripe bound)
 * - exactly 2 priors required
 * - matching element combinations (valid and invalid)
 * - payload structure (charge required on priors, NOT on disputed; merchandise_or_services on disputed only)
 */
import { describe, it, expect } from 'vitest';
import type { CustomerEvidenceBundle, PriorUndisputedTransaction } from '../lib/evidence/schemas';
import {
  isWithinStripeCe3Window,
  evaluateVisaCe3Eligibility,
  buildStripeVisaCe3EnhancedEvidence,
  STRIPE_CE3_MIN_DAYS,
  STRIPE_CE3_MAX_DAYS,
} from '../lib/evidence/ce3';

const DAY_MS = 24 * 60 * 60 * 1000;

function disputeAt(d: Date) { return d; }
function priorAtDaysBefore(disputed: Date, days: number): Date {
  return new Date(disputed.getTime() - days * DAY_MS);
}

describe('isWithinStripeCe3Window', () => {
  const disputed = new Date('2026-04-30T00:00:00Z');

  it('rejects 119 days (below min)', () => {
    expect(isWithinStripeCe3Window(disputed, priorAtDaysBefore(disputed, 119))).toBe(false);
  });
  it('accepts 120 days (min boundary)', () => {
    expect(isWithinStripeCe3Window(disputed, priorAtDaysBefore(disputed, 120))).toBe(true);
  });
  it('accepts 364 days (Stripe max boundary)', () => {
    expect(isWithinStripeCe3Window(disputed, priorAtDaysBefore(disputed, 364))).toBe(true);
  });
  it('rejects 365 days (above Stripe max — Visa allows 365 but Stripe validator does not)', () => {
    expect(isWithinStripeCe3Window(disputed, priorAtDaysBefore(disputed, 365))).toBe(false);
  });
  it('rejects priors AFTER the disputed transaction', () => {
    const future = new Date(disputed.getTime() + 30 * DAY_MS);
    expect(isWithinStripeCe3Window(disputed, future)).toBe(false);
  });
});

describe('evaluateVisaCe3Eligibility — number of priors', () => {
  const disputed = new Date('2026-04-30T00:00:00Z');
  const baseBundle = makeBundle(disputed, []);

  it('fails with zero priors', () => {
    const r = evaluateVisaCe3Eligibility(baseBundle);
    expect(r.qualified).toBe(false);
    expect(r.reasons.some((s) => s.includes('need >= 2 prior undisputed'))).toBe(true);
  });

  it('fails with one prior in window', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
    ]);
    const r = evaluateVisaCe3Eligibility(b);
    expect(r.qualified).toBe(false);
  });

  it('passes with two priors that share IP + email with disputed', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
    ], { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' });
    const r = evaluateVisaCe3Eligibility(b);
    expect(r.qualified).toBe(true);
    expect(r.selectedPriors).toHaveLength(2);
  });
});

describe('evaluateVisaCe3Eligibility — matching combinations', () => {
  const disputed = new Date('2026-04-30T00:00:00Z');

  it('IP + device fingerprint passes (two main)', () => {
    const fp = 'a'.repeat(20);
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerDeviceFingerprint: fp }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerDeviceFingerprint: fp }),
    ], { customerPurchaseIp: '1.2.3.4', customerDeviceFingerprint: fp });
    expect(evaluateVisaCe3Eligibility(b).qualified).toBe(true);
  });

  it('device fingerprint + device ID alone FAILS (Stripe explicitly rejects)', () => {
    const fp = 'a'.repeat(20);
    const dev = 'b'.repeat(15);
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerDeviceFingerprint: fp, customerDeviceId: dev }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerDeviceFingerprint: fp, customerDeviceId: dev }),
    ], { customerDeviceFingerprint: fp, customerDeviceId: dev });
    // Both fingerprint and device ID count as "device" main element (one category).
    // Without IP or any secondary, this is effectively only one main → fail.
    expect(evaluateVisaCe3Eligibility(b).qualified).toBe(false);
  });

  it('email + account_id alone (two secondaries, no main) FAILS', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerEmailAddress: 'x@x.com', customerAccountId: 'acct-1' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerEmailAddress: 'x@x.com', customerAccountId: 'acct-1' }),
    ], { customerEmailAddress: 'x@x.com', customerAccountId: 'acct-1' });
    expect(evaluateVisaCe3Eligibility(b).qualified).toBe(false);
  });

  it('IP + account ID passes (1 main + 1 secondary)', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerAccountId: 'acct-1' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerAccountId: 'acct-1' }),
    ], { customerPurchaseIp: '1.2.3.4', customerAccountId: 'acct-1' });
    expect(evaluateVisaCe3Eligibility(b).qualified).toBe(true);
  });

  it('device fingerprint + email passes (1 main + 1 secondary)', () => {
    const fp = 'a'.repeat(20);
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerDeviceFingerprint: fp, customerEmailAddress: 'x@x.com' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerDeviceFingerprint: fp, customerEmailAddress: 'x@x.com' }),
    ], { customerDeviceFingerprint: fp, customerEmailAddress: 'x@x.com' });
    expect(evaluateVisaCe3Eligibility(b).qualified).toBe(true);
  });
});

describe('buildStripeVisaCe3EnhancedEvidence', () => {
  const disputed = new Date('2026-04-30T00:00:00Z');

  it('produces exactly 2 priors with charge IDs', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com', stripeChargeId: 'ch_a' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com', stripeChargeId: 'ch_b' }),
    ], { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' });
    const r = evaluateVisaCe3Eligibility(b);
    const payload = buildStripeVisaCe3EnhancedEvidence(b, r.selectedPriors);
    expect(payload.prior_undisputed_transactions).toHaveLength(2);
    expect(payload.prior_undisputed_transactions[0]!.charge).toBe('ch_a');
    expect(payload.prior_undisputed_transactions[1]!.charge).toBe('ch_b');
  });

  it('disputed_transaction has merchandise_or_services and NO charge field', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
    ], { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' });
    const r = evaluateVisaCe3Eligibility(b);
    const payload = buildStripeVisaCe3EnhancedEvidence(b, r.selectedPriors);
    expect(payload.disputed_transaction.merchandise_or_services).toBe('services');
    expect((payload.disputed_transaction as unknown as { charge?: string }).charge).toBeUndefined();
  });

  it('prior_undisputed_transactions do NOT have merchandise_or_services', () => {
    const b = makeBundle(disputed, [
      makePrior(priorAtDaysBefore(disputed, 200), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
      makePrior(priorAtDaysBefore(disputed, 250), { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' }),
    ], { customerPurchaseIp: '1.2.3.4', customerEmailAddress: 'x@x.com' });
    const r = evaluateVisaCe3Eligibility(b);
    const payload = buildStripeVisaCe3EnhancedEvidence(b, r.selectedPriors);
    for (const p of payload.prior_undisputed_transactions) {
      expect((p as unknown as { merchandise_or_services?: string }).merchandise_or_services).toBeUndefined();
    }
  });

  it('throws if not exactly 2 priors', () => {
    const b = makeBundle(disputed, []);
    expect(() => buildStripeVisaCe3EnhancedEvidence(b, [])).toThrow(/exactly 2 priors/);
  });
});

// ---------- helpers ----------
function makeBundle(
  disputedAt: Date,
  priors: PriorUndisputedTransaction[],
  disputedExtras: Partial<CustomerEvidenceBundle['disputedTransaction']> = {}
): CustomerEvidenceBundle {
  return {
    adapterName: 'test',
    adapterVersion: '0.0.1',
    customer: { stripeCustomerId: 'cus_test' },
    disputedTransaction: {
      stripeChargeId: 'ch_disputed',
      transactionTimestamp: disputedAt,
      merchandiseOrServices: 'services',
      productDescription: 'Test product',
      ...disputedExtras,
    },
    priorUndisputedTransactions: priors,
    loginEvents: [],
    productUsageEvents: [],
    refundEvents: [],
    communicationEvents: [],
  };
}

function makePrior(
  at: Date,
  extras: Partial<PriorUndisputedTransaction> = {}
): PriorUndisputedTransaction {
  return {
    stripeChargeId: extras.stripeChargeId ?? 'ch_' + Math.random().toString(36).slice(2, 8),
    transactionTimestamp: at,
    productDescription: 'Prior product',
    wasDisputed: false,
    hadFraudReport: false,
    ...extras,
  };
}

it('STRIPE_CE3_MIN_DAYS and MAX_DAYS are 120 and 364', () => {
  expect(STRIPE_CE3_MIN_DAYS).toBe(120);
  expect(STRIPE_CE3_MAX_DAYS).toBe(364);
});
