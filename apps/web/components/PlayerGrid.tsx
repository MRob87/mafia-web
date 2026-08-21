import type { ReactNode } from 'react';

export function PlayerGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">{children}</div>;
}

export function PlayerCard({
  highlighted,
  dimmed,
  glow,
  children,
}: {
  highlighted?: boolean;
  dimmed?: boolean;
  /** Majority-reached state: red, glowing border. Takes precedence over `highlighted`. */
  glow?: boolean;
  children: ReactNode;
}) {
  const borderBg = glow
    ? 'border-red-500 bg-red-500/10'
    : highlighted
      ? 'border-indigo-500 bg-indigo-500/15'
      : 'border-slate-800 bg-slate-900/40';
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${borderBg} ${
        glow ? 'animate-pulse shadow-[0_0_18px_rgba(239,68,68,0.75)]' : ''
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      {children}
    </div>
  );
}
