/**
 * Stripe dispute submission.
 *
 * Flow:
 * 1. Retrieve dispute, confirm status allows evidence update.
 * 2. Upload PDF to Stripe Files API (purpose: dispute_evidence).
 * 3. Build standard evidence object (uncategorized_file: file.id, no uncategorized_text).
 * 4. If CE 3.0 candidate AND eligibility passes: include enhanced_evidence.visa_compelling_evidence_3.
 * 5. Stage with submit:false; persist returned eligibility status.
 * 6. Final submit only after human review (or auto-submit env override).
 *
 * Hard rules:
 * - NEVER omit `submit` on the first update. Stripe defaults to immediate submit.
 * - NEVER include enhanced_evidence.visa_compelling_evidence_3 when isStripeVisaCe3Candidate is false.
 * - NEVER use uncategorized_text.
 */
import type Stripe from 'stripe';
import { getStripe } from './client';
import { isStripeVisaCe3Candidate, evaluateVisaCe3Eligibility, buildStripeVisaCe3EnhancedEvidence } from '../evidence/ce3';
import type { CustomerEvidenceBundle } from '../evidence/schemas';
import { auditLog } from '../audit/log';

export interface SubmitInput {
  disputeId: string;                    // AgentGuard CB internal UUID
  stripeDisputeId: string;
  bundle: CustomerEvidenceBundle;
  pdfBuffer: Buffer;
  pdfSha256: string;
  humanReviewApproved: boolean;          // gates the final submit:true call
}

export interface SubmitResult {
  staged: boolean;
  submitted: boolean;
  ce3Status: 'qualified' | 'requires_action' | 'not_qualified' | 'not_applicable' | null;
  stripeFileId: string;
  warnings: string[];
}

export async function submitDisputeEvidence(input: SubmitInput): Promise<SubmitResult> {
  const stripe = getStripe();
  const warnings: string[] = [];

  // 1. Retrieve dispute + confirm submission allowed
  const dispute = await stripe.disputes.retrieve(input.stripeDisputeId);
  const TERMINAL_STATUSES: readonly string[] = ['won', 'lost', 'charge_refunded'];
  if (TERMINAL_STATUSES.includes(dispute.status as string)) {
    throw new Error(`dispute ${input.stripeDisputeId} is terminal (${dispute.status}); cannot submit evidence`);
  }
  if (dispute.evidence_details?.submission_count && dispute.evidence_details.submission_count > 0) {
    warnings.push('dispute already has prior submission; new submission may be blocked');
  }

  // 2. Upload PDF
  const file = await stripe.files.create({
    purpose: 'dispute_evidence',
    file: {
      data: input.pdfBuffer,
      name: `agentguard-cb-${input.stripeDisputeId}.pdf`,
      type: 'application/pdf',
    },
  });
  await auditLog({
    eventType: 'stripe_file_uploaded',
    disputeId: input.disputeId,
    payloadSha256: input.pdfSha256,
    meta: { stripeFileId: file.id, stripeDisputeId: input.stripeDisputeId },
  });

  // 3. Build standard evidence (no uncategorized_text — explicitly forbidden)
  const evidence: Stripe.DisputeUpdateParams.Evidence = {
    uncategorized_file: file.id,
    customer_email_address: input.bundle.customer.customerEmailAddress,
    customer_purchase_ip: input.bundle.disputedTransaction.customerPurchaseIp,
    product_description: input.bundle.disputedTransaction.productDescription,
  };

  // 4. CE 3.0 candidate?
  let ce3Status: SubmitResult['ce3Status'] = 'not_applicable';
  if (isStripeVisaCe3Candidate(dispute)) {
    const eligibility = evaluateVisaCe3Eligibility(input.bundle);
    await auditLog({
      eventType: 'ce3_eligibility_checked',
      disputeId: input.disputeId,
      meta: { qualified: eligibility.qualified, reasons: eligibility.reasons },
    });
    if (eligibility.qualified) {
      const ce3Payload = buildStripeVisaCe3EnhancedEvidence(input.bundle, eligibility.selectedPriors);
      // Type-boundary: if installed SDK lacks the nested type, this will compile via structural matching.
      (evidence as Stripe.DisputeUpdateParams.Evidence & { enhanced_evidence?: unknown }).enhanced_evidence = {
        visa_compelling_evidence_3: ce3Payload,
      };
    } else {
      warnings.push(`CE 3.0 not qualified: ${eligibility.reasons.join('; ')}`);
    }
  }

  // 5. Stage (submit: false — NEVER omit this on the first call)
  const staged = await stripe.disputes.update(input.stripeDisputeId, {
    evidence,
    submit: false,
  });
  await auditLog({
    eventType: 'evidence_staged_on_stripe',
    disputeId: input.disputeId,
    payloadSha256: input.pdfSha256,
    meta: { stripeDisputeId: input.stripeDisputeId },
  });

  const stagedCe3 = (staged.evidence_details as unknown as {
    enhanced_eligibility?: { visa_compelling_evidence_3?: { status?: string } };
  })?.enhanced_eligibility?.visa_compelling_evidence_3?.status;
  if (stagedCe3 === 'qualified' || stagedCe3 === 'requires_action' || stagedCe3 === 'not_qualified') {
    ce3Status = stagedCe3;
  }

  // 6. Final submit — only if human review approved (or auto-submit env override)
  const autoSubmit = process.env.DD_AUTO_SUBMIT === 'true';
  if (!input.humanReviewApproved && !autoSubmit) {
    return { staged: true, submitted: false, ce3Status, stripeFileId: file.id, warnings };
  }

  await auditLog({
    eventType: 'human_review_approved',
    disputeId: input.disputeId,
    actorType: 'admin',
    meta: { autoSubmit },
  });

  await stripe.disputes.update(input.stripeDisputeId, { submit: true });
  await auditLog({
    eventType: 'evidence_submitted_to_stripe',
    disputeId: input.disputeId,
    payloadSha256: input.pdfSha256,
    meta: { stripeDisputeId: input.stripeDisputeId, ce3Status },
  });

  return { staged: true, submitted: true, ce3Status, stripeFileId: file.id, warnings };
}
