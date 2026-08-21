import { describe, it, expect } from 'vitest';
import type { GameInstance, PlayerGameState, Role } from '@mafia/shared';
import { resolveNightActions, resolveDayVote, checkWinCondition } from './actions.js';

function player(userId: string, role: Role, isAlive = true): PlayerGameState {
  return { userId, role, isAlive, isConnected: true };
}

function makeGame(players: PlayerGameState[], overrides: Partial<GameInstance> = {}): GameInstance {
  return {
    roomCode: 'TEST',
    phase: 'night',
    phaseEndsAt: null,
    dayNumber: 1,
    players: Object.fromEntries(players.map((p) => [p.userId, p])),
    nightActions: [],
    dayVotes: {},
    eventLog: [],
    investigationResults: [],
    winner: null,
    nightDurationMs: 30_000,
    revealRolesOnDeath: false,
    startOnDay: false,
    doctorLastTarget: {},
    lastEliminatedId: null,
    ...overrides,
  };
}

describe('resolveNightActions', () => {
  it('kills the plurality mafia target when undefended', () => {
    const game = makeGame([player('mafia1', 'mafia'), player('villager1', 'villager')], {
      nightActions: [{ actorId: 'mafia1', role: 'mafia', targetId: 'villager1', submittedAt: '' }],
    });
    resolveNightActions(game);
    expect(game.players.villager1.isAlive).toBe(false);
    expect(game.eventLog).toContainEqual(
      expect.objectContaining({ type: 'death', payload: expect.objectContaining({ targetId: 'villager1', cause: 'mafia' }) })
    );
  });

  it('a doctor save on the mafia target prevents the death', () => {
    const game = makeGame([player('mafia1', 'mafia'), player('doc1', 'doctor'), player('villager1', 'villager')], {
      nightActions: [
        { actorId: 'mafia1', role: 'mafia', targetId: 'villager1', submittedAt: '' },
        { actorId: 'doc1', role: 'doctor', targetId: 'villager1', submittedAt: '' },
      ],
    });
    resolveNightActions(game);
    expect(game.players.villager1.isAlive).toBe(true);
    // Mafia gets a private hint that their kill was blocked, without exposing the doctor's identity.
    expect(game.eventLog).toContainEqual(
      expect.objectContaining({
        visibility: ['mafia'],
        payload: expect.objectContaining({ message: 'Your target was protected and survived the night.' }),
      })
    );
  });

  it('a tied mafia vote kills no one', () => {
    const game = makeGame(
      [player('mafia1', 'mafia'), player('mafia2', 'mafia'), player('v1', 'villager'), player('v2', 'villager')],
      {
        nightActions: [
          { actorId: 'mafia1', role: 'mafia', targetId: 'v1', submittedAt: '' },
          { actorId: 'mafia2', role: 'mafia', targetId: 'v2', submittedAt: '' },
        ],
      }
    );
    resolveNightActions(game);
    expect(game.players.v1.isAlive).toBe(true);
    expect(game.players.v2.isAlive).toBe(true);
  });

  it('records a detective investigation result reflecting the true role', () => {
    const game = makeGame([player('det1', 'detective'), player('mafia1', 'mafia')], {
      nightActions: [{ actorId: 'det1', role: 'detective', targetId: 'mafia1', submittedAt: '' }],
    });
    resolveNightActions(game);
    expect(game.investigationResults).toContainEqual(
      expect.objectContaining({ detectiveId: 'det1', targetId: 'mafia1', isMafia: true })
    );
  });

  it('clears nightActions after resolving', () => {
    const game = makeGame([player('mafia1', 'mafia'), player('v1', 'villager')], {
      nightActions: [{ actorId: 'mafia1', role: 'mafia', targetId: 'v1', submittedAt: '' }],
    });
    resolveNightActions(game);
    expect(game.nightActions).toEqual([]);
  });

  it("records the doctor's target in doctorLastTarget for the next-night repeat check", () => {
    const game = makeGame([player('doc1', 'doctor'), player('v1', 'villager')], {
      nightActions: [{ actorId: 'doc1', role: 'doctor', targetId: 'v1', submittedAt: '' }],
    });
    resolveNightActions(game);
    expect(game.doctorLastTarget).toEqual({ doc1: 'v1' });
  });

  it('rebuilds doctorLastTarget each night, clearing a doctor who sat the night out', () => {
    const game = makeGame([player('doc1', 'doctor'), player('v1', 'villager')], {
      // Doctor protected v1 last night, but submits no action this night.
      doctorLastTarget: { doc1: 'v1' },
      nightActions: [],
    });
    resolveNightActions(game);
    expect(game.doctorLastTarget).toEqual({});
  });
});

describe('resolveDayVote', () => {
  it('eliminates the plurality vote target and sets lastEliminatedId', () => {
    const game = makeGame([player('a', 'villager'), player('b', 'villager'), player('c', 'mafia')], {
      dayVotes: { a: 'c', b: 'c' },
    });
    resolveDayVote(game);
    expect(game.players.c.isAlive).toBe(false);
    expect(game.lastEliminatedId).toBe('c');
  });

  it('a tied vote eliminates no one and clears lastEliminatedId', () => {
    const game = makeGame([player('a', 'villager'), player('b', 'villager')], {
      dayVotes: { a: 'b', b: 'a' },
      lastEliminatedId: 'stale',
    });
    resolveDayVote(game);
    expect(game.players.a.isAlive).toBe(true);
    expect(game.players.b.isAlive).toBe(true);
    expect(game.lastEliminatedId).toBeNull();
  });

  it('increments dayNumber and clears dayVotes', () => {
    const game = makeGame([player('a', 'villager')], { dayVotes: { a: 'a' }, dayNumber: 1 });
    resolveDayVote(game);
    expect(game.dayNumber).toBe(2);
    expect(game.dayVotes).toEqual({});
  });
});

describe('checkWinCondition', () => {
  it('villagers win once no mafia remain alive', () => {
    const game = makeGame([player('mafia1', 'mafia', false), player('v1', 'villager')]);
    expect(checkWinCondition(game)).toBe('villagers');
  });

  it('mafia win once they are at or above parity with everyone else alive', () => {
    const game = makeGame([player('mafia1', 'mafia'), player('v1', 'villager', false), player('v2', 'villager')]);
    expect(checkWinCondition(game)).toBe('mafia');
  });

  it('a still-alive mafia player never counts toward the villager win tally', () => {
    // Regression: "villagers win" once wrongly included a living mafia player in the winner list.
    // A living mafia among a majority of villagers means the game must not yet be over.
    const game = makeGame([
      player('mafia1', 'mafia'),
      player('v1', 'villager'),
      player('v2', 'villager'),
      player('v3', 'villager'),
    ]);
    expect(checkWinCondition(game)).toBeNull();
  });

  it('returns null while both sides still have a viable majority', () => {
    const game = makeGame([player('mafia1', 'mafia'), player('v1', 'villager'), player('v2', 'villager')]);
    expect(checkWinCondition(game)).toBeNull();
  });
});
