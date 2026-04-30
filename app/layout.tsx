import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'dispute-defender',
  description: 'Deterministic Stripe dispute evidence compiler by MerchantGuard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#06091A', color: '#F8FAFC', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
