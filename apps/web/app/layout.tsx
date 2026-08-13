import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Mafia',
  description: 'Web-based Mafia social deduction game',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <header className="border-b border-slate-800 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-lg font-bold text-slate-100 no-underline transition-opacity hover:opacity-80"
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
