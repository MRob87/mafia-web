import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Room, RoleConfig } from '@mafia/shared';
import { NO_VOTE_TARGET } from '@mafia/shared';
import * as gameManager from './gameManager.js';
import { buildPlayerView } from './views.js';

let roomCounter = 0;
function makeRoom(playerCount: number, roleConfig: RoleConfig, revealRolesOnDeath = false): Room {
  roomCounter += 1;
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  return {
    roomCode: `VIEWROOM${roomCounter}`,
    hostId: playerIds[0],
    maxPlayers: 12,
    minPlayers: 5,
    status: 'in_progress',
    roleConfig,
    playerIds,
    players: playerIds.map((id) => ({ userId: id, displayName: id })),
    nightDurationSeconds: 30,
    revealRolesOnDeath,
    createdAt: new Date().toISOString(),
  };
}

describe('buildPlayerView role reveal', () => {
  afterEach(() => vi.useRealTimers());

  const roleConfig: RoleConfig = { mafia: 2, doctor: 1, detective: 1, villager: 2 };

  function startFreshGame(revealRolesOnDeath = false) {
    const room = makeRoom(6, roleConfig, revealRolesOnDeath);
    const game = gameManager.startGame(room);
    const players = Object.values(game.players);
    const mafia = players.filter((p) => p.role === 'mafia');
    const villager = players.find((p) => p.role === 'villager')!;
    const detective = players.find((p) => p.role === 'detective')!;
    return { room, game, mafia, villager, detective };
  }

  it('does NOT expose a dead player\'s role to the town while the game is ongoing', () => {
    const { room, game, villager, detective } = startFreshGame();
    // Kill the villager; game is still ongoing (no winner yet).
    game.players[villager.userId].isAlive = false;

    // The detective (a townsperson) must not see the dead villager's role.
    const view = buildPlayerView(game, detective.userId);
    const deadEntry = view.players.find((p) => p.userId === villager.userId)!;
    expect(deadEntry.isAlive).toBe(false);
    expect(deadEntry.revealedRole).toBeNull();

    gameManager.endGame(room.roomCode);
  });

  it('reveals every role once the game ends', () => {
    const { room, game, villager, detective } = startFreshGame();
    game.players[villager.userId].isAlive = false;
    game.winner = 'villagers';

    const view = buildPlayerView(game, detective.userId);
    const deadEntry = view.players.find((p) => p.userId === villager.userId)!;
    expect(deadEntry.revealedRole).toBe('villager');

    gameManager.endGame(room.roomCode);
  });

  it('reveals a dead player\'s role to the town mid-game when reveal-on-death is enabled', () => {
    const { room, game, villager, detective } = startFreshGame(true);
    game.players[villager.userId].isAlive = false;

    // Same ongoing-game state as the first test, but the host opted into reveal-on-death,
    // so the town now sees the eliminated villager's role immediately.
    const view = buildPlayerView(game, detective.userId);
    const deadEntry = view.players.find((p) => p.userId === villager.userId)!;
    expect(deadEntry.isAlive).toBe(false);
    expect(deadEntry.revealedRole).toBe('villager');

    gameManager.endGame(room.roomCode);
  });

  it('with reveal-on-death enabled, a LIVING player\'s role still stays hidden', () => {
    const { room, game, villager, detective } = startFreshGame(true);
    // villager is still alive — reveal-on-death must not leak the role of the living.
    const view = buildPlayerView(game, detective.userId);
    const livingEntry = view.players.find((p) => p.userId === villager.userId)!;
    expect(livingEntry.isAlive).toBe(true);
    expect(livingEntry.revealedRole).toBeNull();

    gameManager.endGame(room.roomCode);
  });

  it('exposes the live day-vote tally, majority threshold, and the viewer\'s own vote', () => {
    const { room, game, mafia, villager, detective } = startFreshGame();
    // 6 alive -> majority is 4. Two players vote for the villager; the detective abstains.
    game.dayVotes = {
      [mafia[0].userId]: villager.userId,
      [mafia[1].userId]: villager.userId,
      [detective.userId]: NO_VOTE_TARGET,
    };

    const view = buildPlayerView(game, detective.userId);
    expect(view.dayVoteCounts[villager.userId]).toBe(2);
    expect(view.dayVoteCounts[NO_VOTE_TARGET]).toBe(1);
    expect([...view.dayVoteVoters[villager.userId]].sort()).toEqual(
      [mafia[0].userId, mafia[1].userId].sort()
    );
    expect(view.dayVoteVoters[NO_VOTE_TARGET]).toEqual([detective.userId]);
    expect(view.dayVoteMajorityThreshold).toBe(4);
    expect(view.myDayVote).toBe(NO_VOTE_TARGET);

    gameManager.endGame(room.roomCode);
  });

  it('gives the host night-action progress (aggregate only), and nobody else', () => {
    const { room, game, mafia, villager, detective } = startFreshGame();
    game.phase = 'night';
    // One of two mafia and the detective have acted; the doctor and the other mafia have not.
    game.nightActions = [
      { actorId: mafia[0].userId, role: 'mafia', targetId: villager.userId, submittedAt: '' },
      { actorId: detective.userId, role: 'detective', targetId: villager.userId, submittedAt: '' },
    ];

    // Host view (isHost = true) sees aggregate counts — no targets, no identities.
    const hostView = buildPlayerView(game, mafia[0].userId, true);
    expect(hostView.nightActionProgress).toEqual({
      mafia: { submitted: 1, expected: 2 },
      doctor: { submitted: 0, expected: 1 },
      detective: { submitted: 1, expected: 1 },
    });

    // A non-host (even a fellow mafia) never receives the progress.
    expect(buildPlayerView(game, mafia[1].userId, false).nightActionProgress).toBeNull();
    expect(buildPlayerView(game, villager.userId, false).nightActionProgress).toBeNull();

    gameManager.endGame(room.roomCode);
  });

  it('exposes the Mafia night tally to Mafia only — never to the town', () => {
    const { room, game, mafia, villager, detective } = startFreshGame();
    const [m1, m2] = mafia;
    game.phase = 'night';
    // Both Mafia target the villager tonight.
    game.nightActions = [
      { actorId: m1.userId, role: 'mafia', targetId: villager.userId, submittedAt: '' },
      { actorId: m2.userId, role: 'mafia', targetId: villager.userId, submittedAt: '' },
    ];

    const mafiaView = buildPlayerView(game, m1.userId);
    expect(mafiaView.mafiaVoteCounts[villager.userId]).toBe(2);
    expect(mafiaView.mafiaVoteMajorityThreshold).toBe(2); // 2 alive mafia -> floor(2/2)+1
    expect(mafiaView.myMafiaVote).toBe(villager.userId);

    // A townsperson must never see the Mafia's private night tally.
    const townView = buildPlayerView(game, detective.userId);
    expect(townView.mafiaVoteCounts).toEqual({});
    expect(townView.mafiaVoteMajorityThreshold).toBe(0);
    expect(townView.myMafiaVote).toBeNull();

    gameManager.endGame(room.roomCode);
  });

  it('exposes a majority threshold of 6 for a 10-player game, shrinking as players die', () => {
    const room = makeRoom(10, { mafia: 2, doctor: 1, detective: 1, villager: 6 });
    const game = gameManager.startGame(room);
    const someone = Object.keys(game.players)[0];

    // 10 alive -> majority is floor(10/2)+1 = 6.
    expect(buildPlayerView(game, someone).dayVoteMajorityThreshold).toBe(6);

    // Kill three players -> 7 alive -> majority is floor(7/2)+1 = 4.
    Object.values(game.players)
      .slice(0, 3)
      .forEach((p) => (p.isAlive = false));
    expect(buildPlayerView(game, someone).dayVoteMajorityThreshold).toBe(4);

    gameManager.endGame(room.roomCode);
  });

  it('still lets living Mafia see their fellow Mafia (dead or alive)', () => {
    const { room, game, mafia } = startFreshGame();
    const [viewer, partner] = mafia;
    // Partner dies mid-game; the surviving mafia already knew them and should still see them.
    game.players[partner.userId].isAlive = false;

    const view = buildPlayerView(game, viewer.userId);
    const partnerEntry = view.players.find((p) => p.userId === partner.userId)!;
    expect(partnerEntry.revealedRole).toBe('mafia');

    gameManager.endGame(room.roomCode);
  });
});
