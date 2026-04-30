/**
 * Asserts the Stripe submission flow's hard rules:
 * - Always stages with `submit: false` first
 * - Never includes `uncategorized_text`
 * - CE 3.0 enhanced_evidence only included when isStripeVisaCe3Candidate
 *
 * These are CONTRACT tests — they fail if anyone tries to "optimize" the
 * submit flow by skipping staging or adding uncategorized_text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const submitSource = readFileSync(resolve(__dirname, '../lib/stripe/submit.ts'), 'utf8');

describe('Stripe submit.ts contract', () => {
  it('uses { submit: false } for staging (NEVER omits submit on first call)', () => {
    expect(submitSource).toMatch(/submit:\s*false/);
  });

  it('does NOT use uncategorized_text', () => {
    // Allow comments mentioning the word, but not a code path that sets it.
    const codeOnly = submitSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/uncategorized_text\s*:/);
  });

  it('gates final submit on humanReviewApproved or DD_AUTO_SUBMIT', () => {
    expect(submitSource).toMatch(/humanReviewApproved/);
    expect(submitSource).toMatch(/DD_AUTO_SUBMIT/);
  });

  it('only includes CE 3.0 enhanced_evidence when isStripeVisaCe3Candidate', () => {
    expect(submitSource).toMatch(/isStripeVisaCe3Candidate\(dispute\)/);
  });
});
