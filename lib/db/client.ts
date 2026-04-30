/**
 * Lazy-initialized Postgres + drizzle client.
 *
 * Uses postgres-js driver (works on Node + most edge runtimes that support net).
 * Webhook handler explicitly sets runtime = 'nodejs', so we're fine.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required. Set it in .env.local (see .env.example).');
  }
  const sql = postgres(url, { max: 5, idle_timeout: 20 });
  _db = drizzle(sql, { schema });
  return _db;
}
