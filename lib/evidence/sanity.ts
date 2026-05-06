/**
 * Sanity validation for CustomerEvidenceBundle.
 *
 * The zod schemas in schemas.ts already enforce structural validity (types,
 * formats, required fields). Sanity validation goes a layer deeper: it flags
 * states that are STRUCTURALLY VALID but LOGICALLY IMPOSSIBLE or SUSPICIOUS,
 * before the merchant stages the dispute.
 *
 * Examples of sanity violations:
 *   - Customer signed up AFTER the disputed transaction (impossible)
 *   - Prior transaction timestamp AFTER the disputed transaction (impossible)
 *   - Prior transactions within < 120 days or > 364 days (won't qualify)
 *   - Disputed transaction with empty productDescription (Stripe rejects)
 *   - Same IP address across all transactions but no device identifier
 *     (single-machine pattern — not necessarily fraud, but flag-worthy)
 *
 * Sanity violations are WARNINGS, not blocks. The merchant sees them and
 * decides whether to proceed. The SDK does NOT auto-reject submissions
 * based on sanity warnings — that's the merchant's call.
 *
 * No LLM, no fabrication detection — pure deterministic logic on
 * structured data. Stays consistent with the "no LLM in evidence pipeline"
 * guarantee in LEGAL.md.
 */

import type { CustomerEvidenceBundle } from './schemas';
import { STRIPE_CE3_MIN_DAYS, STRIPE_CE3_MAX_DAYS } from './ce3';

export type SanitySeverity = 'info' | 'warn' | 'block';

export interface SanityFinding {
  /** Stable identifier for the rule (for telemetry / dedup). */
  ruleId: string;
  /** Human-readable severity. block-level findings indicate Stripe will reject. */
  severity: SanitySeverity;
  /** Human-readable explanation. */
  message: string;
  /** Optional: the field path that triggered this finding. */
  field?: string;
}

export interface SanityResult {
  /** True if no `block`-severity findings were raised. */
  passed: boolean;
  /** All findings, including info / warn / block. */
  findings: SanityFinding[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY;
}

/**
 * Validate a CustomerEvidenceBundle for logical consistency before staging.
 * Returns a list of findings sorted by severity (block first, then warn, then info).
 */
export function validateBundleSanity(bundle: CustomerEvidenceBundle): SanityResult {
  const findings: SanityFinding[] = [];

  const disputedAt = bundle.disputedTransaction.transactionTimestamp;

  // ---------- Disputed transaction sanity ----------

  if (!bundle.disputedTransaction.productDescription || bundle.disputedTransaction.productDescription.trim().length === 0) {
    findings.push({
      ruleId: 'disputed-product-description-empty',
      severity: 'block',
      message: 'Disputed transaction has empty productDescription. Stripe rejects this field empty.',
      field: 'disputedTransaction.productDescription',
    });
  }

  // ---------- Customer signup sanity ----------

  if (bundle.customer.signupTimestamp && bundle.customer.signupTimestamp > disputedAt) {
    findings.push({
      ruleId: 'signup-after-dispute',
      severity: 'block',
      message: 'Customer signed up AFTER the disputed transaction. Logically impossible — review your data sources.',
      field: 'customer.signupTimestamp',
    });
  }

  if (
    bundle.customer.signupTimestamp &&
    daysBetween(bundle.customer.signupTimestamp, disputedAt) < 1
  ) {
    findings.push({
      ruleId: 'signup-same-day-as-dispute',
      severity: 'warn',
      message: 'Customer signed up < 24 hours before the disputed transaction. Reviewable but not fatal.',
      field: 'customer.signupTimestamp',
    });
  }

  // ---------- Prior transaction sanity ----------

  for (let i = 0; i < bundle.priorUndisputedTransactions.length; i++) {
    const prior = bundle.priorUndisputedTransactions[i]!;
    const priorPath = `priorUndisputedTransactions[${i}]`;

    // Priors must be BEFORE the disputed transaction
    if (prior.transactionTimestamp >= disputedAt) {
      findings.push({
        ruleId: 'prior-after-or-equal-dispute',
        severity: 'block',
        message: `Prior transaction ${priorPath} is at or after the disputed transaction. Priors must precede the dispute.`,
        field: `${priorPath}.transactionTimestamp`,
      });
    } else {
      // Window check
      const days = daysBetween(disputedAt, prior.transactionTimestamp);
      if (days < STRIPE_CE3_MIN_DAYS) {
        findings.push({
          ruleId: 'prior-within-min-window',
          severity: 'warn',
          message: `Prior transaction ${priorPath} is ${days.toFixed(1)} days before dispute (Stripe requires ${STRIPE_CE3_MIN_DAYS}+). Will not qualify for CE 3.0.`,
          field: `${priorPath}.transactionTimestamp`,
        });
      } else if (days > STRIPE_CE3_MAX_DAYS) {
        findings.push({
          ruleId: 'prior-beyond-max-window',
          severity: 'warn',
          message: `Prior transaction ${priorPath} is ${days.toFixed(1)} days before dispute (Stripe maximum is ${STRIPE_CE3_MAX_DAYS}). Will not qualify for CE 3.0.`,
          field: `${priorPath}.transactionTimestamp`,
        });
      }
    }

    // Disputed-or-fraud-reported priors must be filtered out before payload construction
    if (prior.wasDisputed) {
      findings.push({
        ruleId: 'prior-was-disputed',
        severity: 'block',
        message: `Prior transaction ${priorPath} is marked wasDisputed=true. Stripe will reject; pick a different prior.`,
        field: `${priorPath}.wasDisputed`,
      });
    }
    if (prior.hadFraudReport) {
      findings.push({
        ruleId: 'prior-had-fraud-report',
        severity: 'block',
        message: `Prior transaction ${priorPath} is marked hadFraudReport=true. Stripe will reject; pick a different prior.`,
        field: `${priorPath}.hadFraudReport`,
      });
    }

    // Missing description
    if (!prior.productDescription || prior.productDescription.trim().length === 0) {
      findings.push({
        ruleId: 'prior-product-description-empty',
        severity: 'block',
        message: `Prior transaction ${priorPath} has empty productDescription. Stripe rejects this field empty.`,
        field: `${priorPath}.productDescription`,
      });
    }
  }

  // ---------- Cross-transaction matching-element coherence ----------

  // If the disputed transaction has an IP address but no priors share it, the
  // matching combination is weak. CE 3.0 requires SHARED matching elements
  // across disputed + 2 priors.
  if (bundle.disputedTransaction.customerPurchaseIp && bundle.priorUndisputedTransactions.length >= 2) {
    const priorsSharingIp = bundle.priorUndisputedTransactions.filter(
      (p) => p.customerPurchaseIp === bundle.disputedTransaction.customerPurchaseIp,
    );
    if (priorsSharingIp.length === 0) {
      findings.push({
        ruleId: 'no-shared-ip-across-priors',
        severity: 'info',
        message:
          'Disputed transaction has an IP but no priors share it. Make sure another matching element (device fingerprint, email, account ID, shipping address) is shared across disputed + 2 priors.',
        field: 'disputedTransaction.customerPurchaseIp',
      });
    }
  }

  // ---------- Prior count check ----------

  if (bundle.priorUndisputedTransactions.length < 2) {
    findings.push({
      ruleId: 'fewer-than-two-priors',
      severity: 'warn',
      message: `CE 3.0 requires exactly 2 prior undisputed transactions. Bundle has ${bundle.priorUndisputedTransactions.length}.`,
      field: 'priorUndisputedTransactions',
    });
  }
  if (bundle.priorUndisputedTransactions.length > 10) {
    findings.push({
      ruleId: 'too-many-priors',
      severity: 'info',
      message: `Bundle has ${bundle.priorUndisputedTransactions.length} priors. evaluateVisaCe3Eligibility will pick the best 2; the rest are unused.`,
      field: 'priorUndisputedTransactions',
    });
  }

  // ---------- Sort by severity (block first, then warn, then info) ----------

  const severityOrder: Record<SanitySeverity, number> = { block: 0, warn: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    passed: findings.every((f) => f.severity !== 'block'),
    findings,
  };
}
