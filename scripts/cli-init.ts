#!/usr/bin/env tsx
/**
 * `npx dispute-defender init`
 *
 * Interactive setup. Generates .env.local from prompts.
 * Does NOT call live Stripe.
 */
import { createInterface } from 'node:readline/promises';
import { writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, fallback = ''): Promise<string> => {
  const a = await rl.question(`${q}${fallback ? ` [${fallback}]` : ''}: `);
  return a.trim() || fallback;
};

async function main() {
  console.log('\ndispute-defender setup\n----------------------\n');

  const targetPath = resolve(process.cwd(), '.env.local');
  if (existsSync(targetPath)) {
    const ans = await ask('.env.local already exists. Overwrite? (y/N)', 'N');
    if (ans.toLowerCase() !== 'y') { console.log('Aborted.'); rl.close(); return; }
  }

  const stripeKey = await ask('Stripe secret key (sk_test_... or sk_live_...)');
  const webhookSecret = await ask('Stripe webhook secret (whsec_...)');
  const dbUrl = await ask('DATABASE_URL', 'postgresql://localhost:5432/dispute_defender');
  const appUrl = await ask('Public app URL', 'http://localhost:3000');
  const adminToken = await ask('ADMIN_TOKEN (leave blank to autogenerate)', '');
  const jobSecret = await ask('JOB_PROCESSOR_SECRET (leave blank to autogenerate)', '');
  const signingKey = await ask('DISPUTE_SIGNING_KEY 64-hex (leave blank to autogenerate)', '');

  const lines = [
    `STRIPE_SECRET_KEY=${stripeKey}`,
    `STRIPE_WEBHOOK_SECRET=${webhookSecret}`,
    `DATABASE_URL=${dbUrl}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `ADMIN_TOKEN=${adminToken || randomBytes(32).toString('hex')}`,
    `JOB_PROCESSOR_SECRET=${jobSecret || randomBytes(32).toString('hex')}`,
    `DISPUTE_SIGNING_KEY=${signingKey || randomBytes(32).toString('hex')}`,
    `DD_AUTO_SUBMIT=false`,
  ];

  writeFileSync(targetPath, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`\nWrote ${targetPath} (mode 0600)`);
  console.log('\nNext steps:');
  console.log('  1. npm run db:generate  (build migrations)');
  console.log('  2. npm run db:migrate   (apply to DB)');
  console.log('  3. npm run stripe:version  (verify SDK is current)');
  console.log('  4. npm run dev          (start the app)');
  console.log('  5. Configure Stripe webhook to POST to /api/webhooks/stripe');
  console.log('\nFor local webhook testing:');
  console.log('  stripe listen --forward-to localhost:3000/api/webhooks/stripe');
  rl.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
