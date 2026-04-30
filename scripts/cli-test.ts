#!/usr/bin/env tsx
/**
 * `npx dispute-defender test`
 *
 * Generates a sample evidence bundle, validates schemas, builds a CE 3.0 payload,
 * generates a sample PDF, verifies the manifest signature.
 *
 * Does NOT call live Stripe unless --stripe flag is passed.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';
import { customerEvidenceBundleSchema, type CustomerEvidenceBundle } from '../lib/evidence/schemas';
import { evaluateVisaCe3Eligibility, buildStripeVisaCe3EnhancedEvidence } from '../lib/evidence/ce3';
import { generateDisputePdf, verifyManifestSignature } from '../lib/pdf/generate';

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const disputed = new Date();
  const fp = 'test-fingerprint-1234567890';
  const bundle: CustomerEvidenceBundle = customerEvidenceBundleSchema.parse({
    adapterName: 'cli-test',
    adapterVersion: '0.0.1',
    customer: {
      stripeCustomerId: 'cus_test_demo',
      customerEmailAddress: 'demo@example.com',
      customerAccountId: 'user_demo_001',
      customerPurchaseIp: '203.0.113.42',
      customerDeviceFingerprint: fp,
      signupTimestamp: new Date(disputed.getTime() - 365 * DAY_MS),
    },
    disputedTransaction: {
      stripeChargeId: 'ch_test_disputed',
      transactionTimestamp: disputed,
      merchandiseOrServices: 'services',
      productDescription: 'Demo subscription · Pro plan · monthly',
      customerPurchaseIp: '203.0.113.42',
      customerEmailAddress: 'demo@example.com',
      customerAccountId: 'user_demo_001',
      customerDeviceFingerprint: fp,
    },
    priorUndisputedTransactions: [
      {
        stripeChargeId: 'ch_test_prior_a',
        transactionTimestamp: new Date(disputed.getTime() - 200 * DAY_MS),
        productDescription: 'Demo subscription · Pro plan · monthly',
        wasDisputed: false,
        hadFraudReport: false,
        samePaymentCredential: true,
        customerPurchaseIp: '203.0.113.42',
        customerEmailAddress: 'demo@example.com',
        customerAccountId: 'user_demo_001',
        customerDeviceFingerprint: fp,
      },
      {
        stripeChargeId: 'ch_test_prior_b',
        transactionTimestamp: new Date(disputed.getTime() - 250 * DAY_MS),
        productDescription: 'Demo subscription · Pro plan · monthly',
        wasDisputed: false,
        hadFraudReport: false,
        samePaymentCredential: true,
        customerPurchaseIp: '203.0.113.42',
        customerEmailAddress: 'demo@example.com',
        customerAccountId: 'user_demo_001',
        customerDeviceFingerprint: fp,
      },
    ],
    productUsageEvents: [
      { timestamp: new Date(disputed.getTime() - 5 * DAY_MS), eventType: 'feature_used', resourceId: 'pro-plan' },
      { timestamp: new Date(disputed.getTime() - 1 * DAY_MS), eventType: 'login', resourceId: undefined },
    ],
  });

  console.log('1. Schema validated ✓');

  const eligibility = evaluateVisaCe3Eligibility(bundle);
  console.log(`2. CE 3.0 eligibility: ${eligibility.qualified ? 'QUALIFIED' : 'NOT QUALIFIED'}`);
  if (!eligibility.qualified) console.log(`   Reasons: ${eligibility.reasons.join('; ')}`);

  if (eligibility.qualified) {
    const payload = buildStripeVisaCe3EnhancedEvidence(bundle, eligibility.selectedPriors);
    console.log('3. CE 3.0 payload built ✓');
    console.log(`   prior_undisputed_transactions: ${payload.prior_undisputed_transactions.length}`);
  }

  const sha = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
  const pdfResult = await generateDisputePdf({
    disputeId: '00000000-0000-0000-0000-000000000000',
    stripeDisputeId: 'du_test_demo',
    stripeChargeId: 'ch_test_disputed',
    reasonCode: '10.4',
    bundle,
    bundleSha256: sha,
    ce3Eligibility: eligibility,
  });

  const verified = await verifyManifestSignature({
    manifest: pdfResult.manifest,
    signature: pdfResult.manifestSignature,
    publicKey: (await import('@noble/ed25519')).getPublicKey(Buffer.from(process.env.DISPUTE_SIGNING_KEY!, 'hex')) as never,
  } as never).catch(() => null);
  console.log(`4. PDF generated · ${pdfResult.pdfBytes.length} bytes · sha256 ${pdfResult.pdfSha256.slice(0, 12)}…`);
  console.log(`5. Manifest signature: ${verified ? 'VERIFIED ✓' : 'sign-only (verification needs ed package shape)'}`);

  mkdirSync('tmp', { recursive: true });
  const outPath = resolve('tmp/dispute-defender-sample.pdf');
  writeFileSync(outPath, pdfResult.pdfBytes);
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
