#!/usr/bin/env tsx
import 'dotenv/config';
import { processJobBatch } from '../lib/jobs/processor';

async function main() {
  const result = await processJobBatch();
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
