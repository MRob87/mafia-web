import { describe, it, expect } from 'vitest';
import type { GameInstance, PlayerGameState, Role } from '@mafia/shared';
import { NO_VOTE_TARGET } from '@mafia/shared';
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
    villageName: 'Testburg',
    characterTitles: {},
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
  it('eliminates a player who reaches a majority of the living', () => {
    // 3 alive, majority is 2; c gets both other votes.
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

  it('eliminates no one when the No-vote option reaches a majority', () => {
    // 3 alive, majority is 2; the two no-votes are themselves a majority for no lynch.
    const game = makeGame([player('a', 'villager'), player('b', 'villager'), player('c', 'mafia')], {
      dayVotes: { a: NO_VOTE_TARGET, b: NO_VOTE_TARGET, c: 'a' },
    });
    resolveDayVote(game);
    expect(Object.values(game.players).every((p) => p.isAlive)).toBe(true);
    expect(game.lastEliminatedId).toBeNull();
    expect(game.eventLog).toContainEqual(
      expect.objectContaining({
        type: 'system',
        payload: expect.objectContaining({ message: 'The town voted not to eliminate anyone.' }),
      })
    );
  });

  it('does NOT eliminate a plurality leader that falls short of a majority', () => {
    // 4 alive, majority is 3. c leads with 2 votes but that's only a plurality — no lynch.
    const game = makeGame(
      [player('a', 'villager'), player('b', 'villager'), player('c', 'mafia'), player('d', 'villager')],
      { dayVotes: { a: 'c', b: 'c', c: 'a', d: NO_VOTE_TARGET } }
    );
    resolveDayVote(game);
    expect(game.players.c.isAlive).toBe(true);
    expect(game.lastEliminatedId).toBeNull();
    expect(game.eventLog).toContainEqual(
      expect.objectContaining({
        type: 'system',
        payload: expect.objectContaining({ message: 'No majority was reached — no one was eliminated.' }),
      })
    );
  });

  it('eliminates once a target crosses the majority threshold', () => {
    // 4 alive, majority is 3. Three of the four vote for c.
    const game = makeGame(
      [player('a', 'villager'), player('b', 'villager'), player('c', 'mafia'), player('d', 'villager')],
      { dayVotes: { a: 'c', b: 'c', d: 'c', c: 'a' } }
    );
    resolveDayVote(game);
    expect(game.players.c.isAlive).toBe(false);
    expect(game.lastEliminatedId).toBe('c');
  });

  it('increments dayNumber and clears dayVotes', () => {
    const game = makeGame([player('a', 'villager')], { dayVotes: { a: 'a' }, dayNumber: 1 });
    resolveDayVote(game);
    expect(game.dayNumber).toBe(2);
    expect(game.dayVotes).toEqual({});
  });
});

describe('resolveDayVote — majority threshold scales with the living', () => {
  /** A game with `alive` living villagers p0..p(alive-1), plus `dead` already-dead players. */
  function gameWith(alive: number, dead: number, votes: Record<string, string>): GameInstance {
    const living = Array.from({ length: alive }, (_, i) => player(`p${i}`, 'villager'));
    const corpses = Array.from({ length: dead }, (_, i) => player(`d${i}`, 'villager', false));
    return makeGame([...living, ...corpses], { dayVotes: votes });
  }

  function votesFor(target: string, count: number): Record<string, string> {
    const votes: Record<string, string> = {};
    // Voters p1..pN so a voter is never the target (p0).
    for (let i = 1; i <= count; i++) votes[`p${i}`] = target;
    return votes;
  }

  // majority(n) = floor(n / 2) + 1 — a strict majority of the living.
  const cases: { alive: number; majority: number }[] = [
    { alive: 3, majority: 2 },
    { alive: 4, majority: 3 },
    { alive: 5, majority: 3 },
    { alive: 6, majority: 4 },
    { alive: 7, majority: 4 },
    { alive: 8, majority: 5 },
    { alive: 9, majority: 5 },
    { alive: 10, majority: 6 },
  ];

  for (const { alive, majority } of cases) {
    it(`${alive} alive: exactly ${majority} votes eliminates the target`, () => {
      const game = gameWith(alive, 0, votesFor('p0', majority));
      resolveDayVote(game);
      expect(game.players.p0.isAlive).toBe(false);
      expect(game.lastEliminatedId).toBe('p0');
    });

    it(`${alive} alive: one short of majority (${majority - 1} votes) eliminates no one`, () => {
      const game = gameWith(alive, 0, votesFor('p0', majority - 1));
      resolveDayVote(game);
      expect(game.players.p0.isAlive).toBe(true);
      expect(game.lastEliminatedId).toBeNull();
      expect(game.eventLog).toContainEqual(
        expect.objectContaining({
          type: 'system',
          payload: expect.objectContaining({ message: 'No majority was reached — no one was eliminated.' }),
        })
      );
    });
  }

  it('counts only the living toward the majority — dead players never raise the bar', () => {
    // 10 seats but 4 are already dead, so only 6 are alive -> majority is 4, not 6.
    const four = votesFor('p0', 4);
    const game = gameWith(6, 4, four);
    resolveDayVote(game);
    expect(game.players.p0.isAlive).toBe(false);
    expect(game.lastEliminatedId).toBe('p0');
  });

  it('a count that was short becomes a majority once the living shrinks', () => {
    // 5 votes for p0: short at 10 alive (majority 6), decisive at 9 alive (majority 5).
    const at10 = gameWith(10, 0, votesFor('p0', 5));
    resolveDayVote(at10);
    expect(at10.players.p0.isAlive).toBe(true);

    const at9 = gameWith(9, 1, votesFor('p0', 5));
    resolveDayVote(at9);
    expect(at9.players.p0.isAlive).toBe(false);
    expect(at9.lastEliminatedId).toBe('p0');
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
