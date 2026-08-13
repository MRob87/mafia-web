const COLORS = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function Avatar({ id, name, size = 'md' }: { id: string; name: string; size?: 'sm' | 'md' }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || '?';
  const dimensions = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span
      className={`inline-flex ${dimensions} flex-shrink-0 items-center justify-center rounded-full ${colorFor(id)} font-semibold text-white`}
    >
      {initials}
    </span>
  );
}
