/**
 * Visa CE 3.0 eligibility evaluation + Stripe payload construction.
 *
 * Source of truth: docs/verified-facts-stripe-visa-ce3.md
 *
 * Critical rules encoded here:
 * - Stripe operating window: 120-364 days from disputed transaction date.
 *   (Visa's published material says 120-365; we use Stripe's stricter validator
 *   bound because Stripe's API is what gates qualification.)
 * - Exactly 2 prior undisputed transactions in the Stripe payload.
 * - Each prior transaction must include `charge`.
 * - Disputed transaction does NOT include `charge` (implicit from dispute).
 * - Prior transactions do NOT include `merchandise_or_services` (disputed only).
 * - Valid matching combinations:
 *     * IP + device fingerprint
 *     * IP + device ID
 *     * IP + shipping address
 *     * IP + customer email
 *     * IP + customer account ID
 *     * device fingerprint + shipping address / email / account ID
 *     * device ID + shipping address / email / account ID
 *   INVALID:
 *     * device fingerprint + device ID alone (Stripe explicitly rejects)
 *     * any two secondary elements without an IP/device main element
 *     * one prior transaction; three+ priors
 *     * non-Visa; Visa reason code != 10.4
 */
import type Stripe from 'stripe';
import type {
  CustomerEvidenceBundle,
  PriorUndisputedTransaction,
  ShippingAddress,
} from './schemas';

export const STRIPE_CE3_MIN_DAYS = 120;
export const STRIPE_CE3_MAX_DAYS = 364; // Stripe's stricter bound; Visa's published is 365

// ---------- Eligibility gate (call before constructing payload) ----------
export function isStripeVisaCe3Candidate(dispute: Stripe.Dispute): boolean {
  const card = dispute.payment_method_details?.card;
  if (!card) return false;
  if (card.brand !== 'visa') return false;
  if (card.network_reason_code !== '10.4') return false;
  const types = (dispute.enhanced_eligibility_types ?? []) as readonly string[];
  return types.includes('visa_compelling_evidence_3');
}

// ---------- Day-window check ----------
export function isWithinStripeCe3Window(disputedAt: Date, priorAt: Date): boolean {
  const ms = disputedAt.getTime() - priorAt.getTime();
  if (ms < 0) return false; // prior must be BEFORE disputed
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return days >= STRIPE_CE3_MIN_DAYS && days <= STRIPE_CE3_MAX_DAYS;
}

// ---------- Matching elements ----------
type MainElement = 'ip' | 'device';
type SecondaryElement = 'shipping' | 'email' | 'account_id';

interface ElementSet {
  main: MainElement[]; // 'ip' and/or 'device' (device = fingerprint OR id, counts as ONE)
  secondary: SecondaryElement[];
}

function elementSet(
  customerPurchaseIp: string | undefined,
  customerDeviceFingerprint: string | undefined,
  customerDeviceId: string | undefined,
  customerEmailAddress: string | undefined,
  customerAccountId: string | undefined,
  shippingAddress: ShippingAddress | undefined
): ElementSet {
  const main: MainElement[] = [];
  if (customerPurchaseIp) main.push('ip');
  if (customerDeviceFingerprint || customerDeviceId) main.push('device');
  const secondary: SecondaryElement[] = [];
  if (shippingAddress && isShippingAddressComplete(shippingAddress)) secondary.push('shipping');
  if (customerEmailAddress) secondary.push('email');
  if (customerAccountId) secondary.push('account_id');
  return { main, secondary };
}

function isShippingAddressComplete(s: ShippingAddress): boolean {
  return Boolean(s.city && s.country && s.line1 && s.postal_code && s.state);
}

/**
 * Check that the disputed transaction and BOTH priors share at least one valid
 * matching combination (per Stripe's encoded rules).
 *
 * Valid: 2 main, OR 1 main + 1 secondary.
 * Invalid: device fingerprint + device ID alone (counts as 1 main, not 2).
 *          Any two secondaries without main.
 */
export function hasValidMatchingCombination(
  ...elementSets: ElementSet[]
): { valid: boolean; reason?: string } {
  if (elementSets.length < 3) {
    return { valid: false, reason: 'need disputed + 2 priors' };
  }

  // Find all elements common to ALL three transactions
  const commonMain = elementSets.reduce<MainElement[]>((acc, set, i) => {
    if (i === 0) return [...set.main];
    return acc.filter((e) => set.main.includes(e));
  }, []);
  const commonSecondary = elementSets.reduce<SecondaryElement[]>((acc, set, i) => {
    if (i === 0) return [...set.secondary];
    return acc.filter((e) => set.secondary.includes(e));
  }, []);

  // Two main: ip + device
  if (commonMain.includes('ip') && commonMain.includes('device')) {
    return { valid: true };
  }
  // One main + one secondary
  if (commonMain.length >= 1 && commonSecondary.length >= 1) {
    return { valid: true };
  }
  return { valid: false, reason: 'need 2 main or 1 main + 1 secondary common to all 3' };
}

// ---------- Eligibility result ----------
export interface Ce3EligibilityResult {
  qualified: boolean;
  reasons: string[];
  selectedPriors: PriorUndisputedTransaction[];
}

export function evaluateVisaCe3Eligibility(
  bundle: CustomerEvidenceBundle
): Ce3EligibilityResult {
  const reasons: string[] = [];
  const disputedAt = bundle.disputedTransaction.transactionTimestamp;

  // Filter candidate priors: window + paid + not disputed + not fraud-reported + same payment credential
  const candidates = bundle.priorUndisputedTransactions.filter((p) => {
    if (p.wasDisputed) return false;
    if (p.hadFraudReport) return false;
    if (!isWithinStripeCe3Window(disputedAt, p.transactionTimestamp)) return false;
    return true;
  });

  if (candidates.length < 2) {
    reasons.push(`need >= 2 prior undisputed in 120-364 day window; have ${candidates.length}`);
    return { qualified: false, reasons, selectedPriors: [] };
  }

  // Try to find 2 priors that match the disputed transaction's elements
  const disputedSet = elementSet(
    bundle.disputedTransaction.customerPurchaseIp,
    bundle.disputedTransaction.customerDeviceFingerprint,
    bundle.disputedTransaction.customerDeviceId,
    bundle.disputedTransaction.customerEmailAddress,
    bundle.disputedTransaction.customerAccountId,
    bundle.disputedTransaction.shippingAddress
  );

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      const setA = elementSet(
        a.customerPurchaseIp,
        a.customerDeviceFingerprint,
        a.customerDeviceId,
        a.customerEmailAddress,
        a.customerAccountId,
        a.shippingAddress
      );
      const setB = elementSet(
        b.customerPurchaseIp,
        b.customerDeviceFingerprint,
        b.customerDeviceId,
        b.customerEmailAddress,
        b.customerAccountId,
        b.shippingAddress
      );
      const match = hasValidMatchingCombination(disputedSet, setA, setB);
      if (match.valid) {
        return { qualified: true, reasons: [], selectedPriors: [a, b] };
      }
    }
  }

  reasons.push('no pair of priors shares a valid matching combination with disputed');
  return { qualified: false, reasons, selectedPriors: [] };
}

// ---------- Stripe payload construction ----------
export interface StripeCe3DisputedTransaction {
  customer_account_id?: string;
  customer_device_fingerprint?: string;
  customer_device_id?: string;
  customer_email_address?: string;
  customer_purchase_ip?: string;
  merchandise_or_services: 'merchandise' | 'services';
  product_description: string;
  shipping_address?: ShippingAddress;
}

export interface StripeCe3PriorUndisputedTransaction {
  charge: string; // REQUIRED by Stripe
  customer_account_id?: string;
  customer_device_fingerprint?: string;
  customer_device_id?: string;
  customer_email_address?: string;
  customer_purchase_ip?: string;
  product_description: string;
  shipping_address?: ShippingAddress;
}

export interface StripeCe3Payload {
  disputed_transaction: StripeCe3DisputedTransaction;
  prior_undisputed_transactions: [
    StripeCe3PriorUndisputedTransaction,
    StripeCe3PriorUndisputedTransaction,
  ];
}

export function buildStripeVisaCe3EnhancedEvidence(
  bundle: CustomerEvidenceBundle,
  selectedPriors: PriorUndisputedTransaction[]
): StripeCe3Payload {
  if (selectedPriors.length !== 2) {
    throw new Error(`buildStripeVisaCe3EnhancedEvidence expects exactly 2 priors, got ${selectedPriors.length}`);
  }
  const dt = bundle.disputedTransaction;
  const [a, b] = selectedPriors as [PriorUndisputedTransaction, PriorUndisputedTransaction];

  const stripPrior = (p: PriorUndisputedTransaction): StripeCe3PriorUndisputedTransaction => ({
    charge: p.stripeChargeId,
    customer_account_id: p.customerAccountId,
    customer_device_fingerprint: p.customerDeviceFingerprint,
    customer_device_id: p.customerDeviceId,
    customer_email_address: p.customerEmailAddress,
    customer_purchase_ip: p.customerPurchaseIp,
    product_description: p.productDescription,
    shipping_address: p.shippingAddress,
  });

  return {
    disputed_transaction: {
      customer_account_id: dt.customerAccountId,
      customer_device_fingerprint: dt.customerDeviceFingerprint,
      customer_device_id: dt.customerDeviceId,
      customer_email_address: dt.customerEmailAddress,
      customer_purchase_ip: dt.customerPurchaseIp,
      merchandise_or_services: dt.merchandiseOrServices,
      product_description: dt.productDescription,
      shipping_address: dt.shippingAddress,
    },
    prior_undisputed_transactions: [stripPrior(a), stripPrior(b)],
  };
}
