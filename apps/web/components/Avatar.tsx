'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

// 12 distinct hues spread around the wheel — one per seat in a full 12-player room, so colors
// assigned by roster position never repeat within a room.
const COLORS = [
  '#f43f5e', // rose
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
];

/** Fallback color when no roster context is available (e.g. a one-off avatar): a stable hash of
 *  the id. Within a room, prefer AvatarColorProvider, which guarantees uniqueness by position. */
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** Maps userId -> color for everyone in a room. Provided by AvatarColorProvider from the roster
 *  order; null outside a room, in which case Avatar falls back to the hash. */
const AvatarColorContext = createContext<Record<string, string> | null>(null);

/** Assigns each player a unique color by their (stable) position in the roster, so no two players
 *  in the same room ever share a color. Wrap the room UI in this and pass the ordered user ids. */
export function AvatarColorProvider({ orderedIds, children }: { orderedIds: string[]; children: ReactNode }) {
  const key = orderedIds.join(',');
  const map = useMemo(() => {
    const m: Record<string, string> = {};
    orderedIds.forEach((id, i) => {
      m[id] = COLORS[i % COLORS.length];
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <AvatarColorContext.Provider value={map}>{children}</AvatarColorContext.Provider>;
}

const SIZE_PX = { sm: 24, md: 32, lg: 64 };

export type AvatarState = 'idle' | 'sleeping' | 'dead';

export function Avatar({
  id,
  name,
  size = 'md',
  state = 'idle',
}: {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  state?: AvatarState;
}) {
  const px = SIZE_PX[size];
  const roster = useContext(AvatarColorContext);
  const fill = roster?.[id] ?? colorFor(id);
  const dead = state === 'dead';
  const sleeping = state === 'sleeping';

  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: px, height: px }} aria-label={name}>
      <svg viewBox="0 0 40 40" width={px} height={px} className={dead ? 'grayscale opacity-50' : ''}>
        <ellipse cx="20" cy="22" rx="15" ry="16" fill={fill} />
        {dead ? (
          <>
            <path d="M13 15 L17 19 M17 15 L13 19" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
            <path d="M23 15 L27 19 M27 15 L23 19" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : sleeping ? (
          <>
            <path d="M13 17 Q15.5 19 18 17" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M22 17 Q24.5 19 27 17" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="15.5" cy="18" r="2" fill="#1e293b" />
            <circle cx="25.5" cy="18" r="2" fill="#1e293b" />
          </>
        )}
      </svg>
      {sleeping && size !== 'sm' && <span className="absolute -top-1 -right-1 animate-pulse text-[10px]">💤</span>}
    </span>
  );
}
