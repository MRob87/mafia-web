import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Mafia',
  description: 'Web-based Mafia social deduction game',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#111', color: '#eee' }}>
        <header style={{ padding: '12px 24px', borderBottom: '1px solid #222' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: '#eee',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            <span aria-hidden="true">🎭</span>
            <span>Mafia</span>
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
