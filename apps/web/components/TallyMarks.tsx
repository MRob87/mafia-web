/** Renders a vote count as classic tally marks: vertical strokes grouped in fives, with the
 *  fifth stroke slashing diagonally across the prior four. Font-independent (drawn with divs),
 *  and inherits the current text color via `bg-current` so callers can tint it (e.g. red at
 *  majority). Returns nothing for a zero/negative count. */
export function TallyMarks({ count }: { count: number }) {
  if (count <= 0) return null;

  const groups: number[] = [];
  for (let remaining = count; remaining > 0; remaining -= 5) {
    groups.push(Math.min(5, remaining));
  }

  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${count} votes`}>
      {groups.map((n, gi) => (
        <span key={gi} className="relative inline-flex items-center gap-[3px]">
          {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
            <span key={i} className="block h-3.5 w-[2px] rounded-sm bg-current" />
          ))}
          {n === 5 && (
            <span className="absolute inset-x-[-2px] top-1/2 h-[2px] -translate-y-1/2 -rotate-[20deg] rounded-sm bg-current" />
          )}
        </span>
      ))}
    </span>
  );
}
