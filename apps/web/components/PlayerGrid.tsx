import type { ReactNode } from 'react';

export function PlayerGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">{children}</div>;
}

export function PlayerCard({
  highlighted,
  dimmed,
  children,
}: {
  highlighted?: boolean;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors ${
        highlighted ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-800 bg-slate-900/40'
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      {children}
    </div>
  );
}
