#!/usr/bin/env tsx
/**
 * Print installed stripe SDK version + Stripe.API_VERSION.
 * CE 3.0 was added in 2024-10-28.acacia; warn if older.
 */
import { getStripeApiVersionInfo } from '../lib/stripe/client';

const info = getStripeApiVersionInfo();

console.log('stripe package version:', info.packageVersion);
console.log('Stripe.API_VERSION:    ', info.apiVersion);
console.log('CE 3.0 supported:      ', info.ce3Supported ? 'yes' : 'NO (need >= 2024-10-28.acacia)');

if (!info.ce3Supported) {
  console.error('\nWARNING: installed Stripe SDK predates CE 3.0 support.');
  console.error('Run `npm install stripe@latest` and re-run this script.');
  process.exit(1);
}
