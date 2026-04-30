/**
 * Evidence adapter interface + reference Stripe-only adapter.
 *
 * An adapter pulls structured evidence from the merchant's own systems
 * (database, Stripe, external API) and returns a typed CustomerEvidenceBundle.
 *
 * NON-NEGOTIABLE: adapters must NOT fabricate data they don't actually have.
 * Stripe-only adapters cannot return login/device/usage data because Stripe
 * doesn't store that — they must return undefined and let the PDF generator
 * include "data not available" warnings.
 */
import { z } from 'zod';
import type { CustomerEvidenceBundle } from './schemas';
import { customerEvidenceBundleSchema } from './schemas';
import { getStripe } from '../stripe/client';

export interface AdapterInput {
  customerId: string;
  stripeChargeId: string;
  stripePaymentIntentId?: string | null;
  disputedAt: Date;
  networkReasonCode?: string | null;
}

export interface EvidenceAdapter {
  readonly name: string;
  readonly version: string;
  getCustomerEvidence(input: AdapterInput): Promise<CustomerEvidenceBundle>;
}

/**
 * Reference Stripe-only adapter. Pulls everything available from Stripe API
 * (charge, customer, payment intent, refunds) and produces a LIMITED evidence
 * bundle. Login/device/usage events are returned as empty arrays — Stripe
 * doesn't have that data. The PDF generator includes warnings.
 */
export const stripeOnlyAdapter: EvidenceAdapter = {
  name: 'stripe-only',
  version: '0.2.0',
  async getCustomerEvidence(input): Promise<CustomerEvidenceBundle> {
    const stripe = getStripe();

    const charge = await stripe.charges.retrieve(input.stripeChargeId);
    const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
    const customer = customerId ? await stripe.customers.retrieve(customerId) : null;
    const customerObj =
      customer && !('deleted' in customer && customer.deleted) ? customer : null;

    // Pull recent prior charges for this customer to use as CE 3.0 candidates.
    // The actual CE 3.0 selection logic lives in lib/evidence/ce3.ts.
    const priorChargesList = customerId
      ? await stripe.charges.list({ customer: customerId, limit: 100 })
      : { data: [] };

    const refundsList = await stripe.refunds.list({ charge: input.stripeChargeId, limit: 20 });

    const bundle: CustomerEvidenceBundle = {
      adapterName: 'stripe-only',
      adapterVersion: '0.2.0',
      customer: {
        stripeCustomerId: customerId ?? undefined,
        customerEmailAddress: customerObj?.email ?? undefined,
        // Stripe-only adapter cannot provide IP/device/account_id reliably:
        customerAccountId: undefined,
        customerPurchaseIp: undefined,
        customerDeviceFingerprint: undefined,
        customerDeviceId: undefined,
        signupTimestamp: customerObj?.created
          ? new Date(customerObj.created * 1000)
          : undefined,
      },
      disputedTransaction: {
        stripeChargeId: charge.id,
        stripePaymentIntentId:
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id,
        transactionTimestamp: new Date(charge.created * 1000),
        merchandiseOrServices: 'services', // safe default; merchant should override via custom adapter
        productDescription: charge.description ?? 'Charge ' + charge.id,
        customerPurchaseIp: undefined,
        customerEmailAddress: customerObj?.email ?? undefined,
        customerAccountId: undefined,
        customerDeviceFingerprint: undefined,
        customerDeviceId: undefined,
        shippingAddress: charge.shipping?.address
          ? {
              city: charge.shipping.address.city ?? '',
              country: charge.shipping.address.country ?? '',
              line1: charge.shipping.address.line1 ?? '',
              line2: charge.shipping.address.line2 ?? undefined,
              postal_code: charge.shipping.address.postal_code ?? '',
              state: charge.shipping.address.state ?? '',
            }
          : undefined,
      },
      priorUndisputedTransactions: priorChargesList.data
        .filter((c) => c.id !== input.stripeChargeId && c.paid && !c.refunded)
        .map((c) => ({
          stripeChargeId: c.id,
          transactionTimestamp: new Date(c.created * 1000),
          productDescription: c.description ?? 'Charge ' + c.id,
          wasDisputed: c.disputed,
          hadFraudReport: false, // Stripe doesn't expose TC40 fraud reports through this list
          samePaymentCredential: c.payment_method === charge.payment_method,
          customerPurchaseIp: undefined,
          customerEmailAddress: customerObj?.email ?? undefined,
          customerAccountId: undefined,
          customerDeviceFingerprint: undefined,
          customerDeviceId: undefined,
          shippingAddress: c.shipping?.address
            ? {
                city: c.shipping.address.city ?? '',
                country: c.shipping.address.country ?? '',
                line1: c.shipping.address.line1 ?? '',
                line2: c.shipping.address.line2 ?? undefined,
                postal_code: c.shipping.address.postal_code ?? '',
                state: c.shipping.address.state ?? '',
              }
            : undefined,
        })),
      loginEvents: [],
      productUsageEvents: [],
      refundEvents: refundsList.data.map((r) => ({
        timestamp: new Date(r.created * 1000),
        stripeRefundId: r.id,
        amountCents: r.amount,
        currency: r.currency,
        reason: r.reason ?? undefined,
      })),
      communicationEvents: [],
    };

    // Validate before returning. zod will throw on schema violations.
    return customerEvidenceBundleSchema.parse(bundle);
  },
};
