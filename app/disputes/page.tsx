/**
 * Disputes dashboard — lists from tool DB (not live Stripe list).
 *
 * NOTE: This page is intentionally minimal. Real auth (Clerk/Auth0/NextAuth)
 * should be added before exposing in production. Default deployment relies
 * on the admin token guard in /api/disputes/[id]/submit.
 */
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { disputes } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DisputesPage() {
  let rows: Array<typeof disputes.$inferSelect> = [];
  let dbError: string | null = null;
  try {
    rows = await getDb().select().from(disputes).orderBy(desc(disputes.createdAt)).limit(50);
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'unknown';
  }

  return (
    <main style={{ maxWidth: 1100, margin: '48px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Disputes</h1>
      {dbError && (
        <div style={{ padding: 16, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 8, marginBottom: 24, color: '#F87171', fontFamily: 'monospace', fontSize: 13 }}>
          DB error: {dbError}
          <div style={{ marginTop: 8, fontSize: 12, color: '#94A3B8' }}>
            Run `npm run db:migrate` and ensure DATABASE_URL is set in .env.local.
          </div>
        </div>
      )}
      {!dbError && rows.length === 0 && (
        <p style={{ color: '#94A3B8' }}>No disputes yet. Configure your Stripe webhook to POST to /api/webhooks/stripe.</p>
      )}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(42,188,180,0.06)', textAlign: 'left' }}>
              <th style={th}>Stripe ID</th>
              <th style={th}>Reason</th>
              <th style={th}>Network code</th>
              <th style={th}>Status</th>
              <th style={th}>Amount</th>
              <th style={th}>Due by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={td}>
                  <Link href={`/disputes/${r.id}`} style={{ color: '#7EE8E0', textDecoration: 'none' }}>
                    {r.stripeDisputeId}
                  </Link>
                </td>
                <td style={td}>{r.stripeReason}</td>
                <td style={td}>{r.networkBrand} · {r.networkReasonCode ?? '-'}</td>
                <td style={td}>{r.status}</td>
                <td style={td}>{(r.amount / 100).toFixed(2)} {r.currency.toUpperCase()}</td>
                <td style={td}>{r.dueBy?.toISOString().slice(0, 10) ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 16px', color: '#F8FAFC' };
