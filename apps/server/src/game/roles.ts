import type { Role, RoleConfig } from '@mafia/shared';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Defensive floor even though callers are expected to sanitize first (roomManager does) —
// Array(n) throws for negative/non-integer n, which previously crashed the whole process on
// a single malicious room:create call. Belt-and-suspenders: this can never throw regardless
// of what reaches it.
function safeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function assignRoles(playerIds: string[], roleConfig: RoleConfig): Record<string, Role> {
  const pool: Role[] = [
    ...Array(safeCount(roleConfig.mafia)).fill('mafia'),
    ...Array(safeCount(roleConfig.doctor)).fill('doctor'),
    ...Array(safeCount(roleConfig.detective)).fill('detective'),
    ...Array(safeCount(roleConfig.villager)).fill('villager'),
  ];

  // Pad/truncate defensively so a mismatched roleConfig never crashes assignment —
  // extra seats fill as villagers, missing seats are simply unused.
  while (pool.length < playerIds.length) pool.push('villager');

  const shuffledPlayers = shuffle(playerIds);
  const shuffledRoles = shuffle(pool).slice(0, shuffledPlayers.length);

  const assignment: Record<string, Role> = {};
  shuffledPlayers.forEach((playerId, i) => {
    assignment[playerId] = shuffledRoles[i];
  });
  return assignment;
}
