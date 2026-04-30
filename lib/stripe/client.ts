/**
 * Lazy-initialized Stripe client.
 *
 * Per the Verified-Facts Appendix (docs/verified-facts-stripe-visa-ce3.md):
 * - We do NOT hardcode an apiVersion. The installed `stripe` SDK has its own
 *   pinned default. Hardcoding can produce a type-vs-runtime mismatch where
 *   types describe a newer API than the runtime actually uses.
 * - To inspect what's installed, run `npm run stripe:version`. This calls
 *   `getStripeApiVersionInfo()` below.
 * - CE 3.0 requires API version >= 2024-10-28.acacia. The version helper
 *   warns if the installed SDK is older.
 */

import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is required. Set it in .env.local (see .env.example).'
    );
  }

  stripe = new Stripe(key, {
    maxNetworkRetries: 3,
    appInfo: {
      name: 'dispute-defender',
      version: process.env.npm_package_version ?? '0.2.0',
      url: 'https://merchantguard.ai',
    },
  });

  return stripe;
}

export interface StripeApiVersionInfo {
  packageVersion: string;
  apiVersion: string;
  ce3Supported: boolean;
}

/**
 * Inspect the installed stripe SDK + its pinned API version.
 * Used by `npm run stripe:version` and tests.
 *
 * CE 3.0 was added in 2024-10-28.acacia; any acacia/basil/clover/dahlia
 * release at or after that date supports CE 3.0.
 */
export function getStripeApiVersionInfo(): StripeApiVersionInfo {
  // Stripe.API_VERSION is the SDK's pinned default (set by stripe-node at build time)
  const apiVersion = (Stripe as unknown as { PACKAGE_VERSION?: string; API_VERSION?: string }).API_VERSION || 'unknown';
  // Read installed package version from package.json without requiring a runtime import
  // (avoids polluting the bundle on Edge). For server-side scripts, package.json is fine.
  let packageVersion = 'unknown';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    packageVersion = require('stripe/package.json').version;
  } catch {
    // best-effort
  }

  const ce3Supported = isApiVersionAtLeast(apiVersion, '2024-10-28.acacia');

  return { packageVersion, apiVersion, ce3Supported };
}

/**
 * Compare two Stripe API versions. They sort lexicographically by date prefix
 * (YYYY-MM-DD), then by major-name suffix (acacia < basil < clover < dahlia).
 * Returns true if `a` >= `b`.
 */
export function isApiVersionAtLeast(a: string, b: string): boolean {
  const dateA = a.slice(0, 10);
  const dateB = b.slice(0, 10);
  if (dateA !== dateB) return dateA >= dateB;
  // Same date — compare major name (acacia, basil, clover, dahlia, ...)
  const ranks: Record<string, number> = {
    acacia: 1,
    basil: 2,
    clover: 3,
    dahlia: 4,
  };
  const nameA = (a.split('.')[1] || '').toLowerCase();
  const nameB = (b.split('.')[1] || '').toLowerCase();
  return (ranks[nameA] ?? 0) >= (ranks[nameB] ?? 0);
}
