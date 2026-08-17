const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
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
  const fill = colorFor(id);
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

export function avatarColor(id: string): string {
  return colorFor(id);
}
