import type { Role, RoleConfig } from '@mafia/shared';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function assignRoles(playerIds: string[], roleConfig: RoleConfig): Record<string, Role> {
  const pool: Role[] = [
    ...Array(roleConfig.mafia).fill('mafia'),
    ...Array(roleConfig.doctor).fill('doctor'),
    ...Array(roleConfig.detective).fill('detective'),
    ...Array(roleConfig.villager).fill('villager'),
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
