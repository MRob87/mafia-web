export const ROLE_COLORS: Record<string, string> = {
  mafia: 'text-rose-400',
  doctor: 'text-emerald-400',
  detective: 'text-sky-400',
  villager: 'text-slate-300',
};

/** Hex versions of ROLE_COLORS, for contexts that can't use Tailwind classes (SVG fills, canvas-ish particle colors). */
export const ROLE_HEX: Record<string, string> = {
  mafia: '#fb7185',
  doctor: '#34d399',
  detective: '#38bdf8',
  villager: '#cbd5e1',
};

export const ROLE_EMOJI: Record<string, string> = {
  mafia: '🔪',
  doctor: '🩺',
  detective: '🔍',
  villager: '🧑',
};
