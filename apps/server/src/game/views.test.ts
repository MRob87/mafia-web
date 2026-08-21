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
    startOnDay: false,
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
    expect(view.dayVoteMajorityThreshold).toBe(4);
    expect(view.myDayVote).toBe(NO_VOTE_TARGET);

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
