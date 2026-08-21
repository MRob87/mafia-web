import { describe, it, expect } from 'vitest';
import type { RoleConfig } from '@mafia/shared';
import { assignRoles } from './roles.js';

function playerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `player-${i}`);
}

describe('assignRoles', () => {
  it('assigns every player exactly one role matching the configured counts', () => {
    const config: RoleConfig = { mafia: 2, doctor: 1, detective: 1, villager: 4 };
    const ids = playerIds(8);
    const assignment = assignRoles(ids, config);

    expect(Object.keys(assignment).sort()).toEqual([...ids].sort());
    const counts = { mafia: 0, doctor: 0, detective: 0, villager: 0 };
    for (const role of Object.values(assignment)) counts[role]++;
    expect(counts).toEqual(config);
  });

  it('assigns exactly 2 mafia in a 10-player game (the default 10-seat setup)', () => {
    const config: RoleConfig = { mafia: 2, doctor: 1, detective: 1, villager: 6 };
    const assignment = assignRoles(playerIds(10), config);

    expect(Object.keys(assignment)).toHaveLength(10);
    const counts = { mafia: 0, doctor: 0, detective: 0, villager: 0 };
    for (const role of Object.values(assignment)) counts[role]++;
    expect(counts.mafia).toBe(2);
    expect(counts).toEqual(config);
  });

  it('never throws on a negative role count (regression: Array(-1) crash)', () => {
    const config = { mafia: -1, doctor: -5, detective: 0, villager: 0 } as RoleConfig;
    expect(() => assignRoles(playerIds(5), config)).not.toThrow();
  });

  it('never throws on a non-integer or non-finite role count', () => {
    const config = { mafia: NaN, doctor: Infinity, detective: 1.5, villager: 0 } as RoleConfig;
    expect(() => assignRoles(playerIds(5), config)).not.toThrow();
  });

  it('pads missing seats with villager when the pool is smaller than the player count', () => {
    const config: RoleConfig = { mafia: 1, doctor: 0, detective: 0, villager: 0 };
    const assignment = assignRoles(playerIds(4), config);
    const roles = Object.values(assignment);
    expect(roles).toHaveLength(4);
    expect(roles.filter((r) => r === 'mafia')).toHaveLength(1);
    expect(roles.filter((r) => r === 'villager')).toHaveLength(3);
  });

  it('truncates an oversized pool down to the actual player count', () => {
    const config: RoleConfig = { mafia: 5, doctor: 5, detective: 5, villager: 5 };
    const assignment = assignRoles(playerIds(3), config);
    expect(Object.keys(assignment)).toHaveLength(3);
  });
});
