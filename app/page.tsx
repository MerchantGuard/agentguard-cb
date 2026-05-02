import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>dispute-defender</h1>
      <p style={{ color: '#94A3B8', marginBottom: 32, lineHeight: 1.6 }}>
        Deterministic Stripe dispute evidence compiler. Static templates only, no
        model-generated text. Audit-logged from adapter response to PDF to
        Stripe submission.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/disputes" style={{ color: '#7EE8E0', textDecoration: 'none' }}>
          → Disputes dashboard
        </Link>
        <a href="/api/webhooks/stripe" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 14 }}>
          /api/webhooks/stripe — Stripe webhook endpoint
        </a>
        <a href="https://github.com/MerchantGuard/agentguard-cb" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 14 }}>
          → README on GitHub
        </a>
      </div>
      <hr style={{ margin: '40px 0', borderColor: '#1E2A4A' }} />
      <p style={{ color: '#64748B', fontSize: 12, fontFamily: 'monospace' }}>
        Powered by MerchantGuard · Compliance layer for the AI agent economy
      </p>
    </main>
  );
}
