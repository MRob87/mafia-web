import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Room, RoleConfig } from '@mafia/shared';
import * as gameManager from './gameManager.js';

let roomCounter = 0;
function makeRoom(playerCount: number, roleConfig: RoleConfig, nightDurationSeconds = 30): Room {
  roomCounter += 1;
  const roomCode = `ROOM${roomCounter}`;
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  return {
    roomCode,
    hostId: playerIds[0],
    maxPlayers: 12,
    minPlayers: 5,
    status: 'in_progress',
    roleConfig,
    playerIds,
    players: playerIds.map((id) => ({ userId: id, displayName: id })),
    nightDurationSeconds,
    revealRolesOnDeath: false,
    createdAt: new Date().toISOString(),
  };
}

describe('startGame', () => {
  afterEach(() => {
    // startGame schedules a real timer for the night phase; avoid leaking it across tests.
    vi.useRealTimers();
  });

  it('assigns roles matching roleConfig and starts everyone alive in the night phase', () => {
    const roleConfig: RoleConfig = { mafia: 1, doctor: 1, detective: 1, villager: 2 };
    const room = makeRoom(5, roleConfig);
    const game = gameManager.startGame(room);

    expect(game.phase).toBe('night');
    expect(Object.keys(game.players)).toHaveLength(5);
    expect(Object.values(game.players).every((p) => p.isAlive)).toBe(true);
    const counts = { mafia: 0, doctor: 0, detective: 0, villager: 0 };
    for (const p of Object.values(game.players)) counts[p.role]++;
    expect(counts).toEqual(roleConfig);

    gameManager.endGame(room.roomCode);
  });

  it('locks in nightDurationMs from the room at game start', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 }, 45);
    const game = gameManager.startGame(room);
    expect(game.nightDurationMs).toBe(45_000);
    gameManager.endGame(room.roomCode);
  });
});

describe('advancePhase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function startFrozenGame(playerCount: number, roleConfig: RoleConfig) {
    // startGame schedules a real setTimeout for the night phase; freeze time immediately after
    // so tests drive advancePhase() manually instead of racing a real timer.
    const room = makeRoom(playerCount, roleConfig);
    const game = gameManager.startGame(room);
    return { room, game };
  }

  it('walks night -> night_resolution -> day_discussion -> day_voting -> elimination -> night', () => {
    const { room } = startFrozenGame(6, { mafia: 1, doctor: 1, detective: 1, villager: 3 });
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('night');

    gameManager.advancePhase(room.roomCode);
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('night_resolution');

    gameManager.advancePhase(room.roomCode);
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('day_discussion');

    gameManager.advancePhase(room.roomCode);
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('day_voting');

    gameManager.advancePhase(room.roomCode);
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('elimination');

    gameManager.advancePhase(room.roomCode);
    // Regression: this used to freeze instead of looping back into the next night.
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('night');

    gameManager.endGame(room.roomCode);
  });

  it('defers the game_over transition until the recap phase (night_resolution), not immediately after the kill', () => {
    // 1 mafia + 1 villager: killing the villager on night 1 makes mafia an immediate majority.
    const { room, game } = startFrozenGame(2, { mafia: 1, doctor: 0, detective: 0, villager: 1 });
    const mafiaId = Object.values(game.players).find((p) => p.role === 'mafia')!.userId;
    const villagerId = Object.values(game.players).find((p) => p.role === 'villager')!.userId;
    gameManager.submitNightAction(room.roomCode, mafiaId, villagerId);

    gameManager.advancePhase(room.roomCode);
    // Regression: checking the win condition right after resolving the kill used to skip
    // straight to game_over, denying the recap beat and the last-words window entirely.
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('night_resolution');
    expect(gameManager.getGame(room.roomCode)!.winner).toBeNull();

    gameManager.advancePhase(room.roomCode);
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('game_over');
    expect(gameManager.getGame(room.roomCode)!.winner).toBe('mafia');

    gameManager.endGame(room.roomCode);
  });

  it('is a no-op once the game is already over', () => {
    const { room, game } = startFrozenGame(2, { mafia: 1, doctor: 0, detective: 0, villager: 1 });
    const mafiaId = Object.values(game.players).find((p) => p.role === 'mafia')!.userId;
    const villagerId = Object.values(game.players).find((p) => p.role === 'villager')!.userId;
    gameManager.submitNightAction(room.roomCode, mafiaId, villagerId);
    gameManager.advancePhase(room.roomCode); // -> night_resolution
    gameManager.advancePhase(room.roomCode); // -> game_over
    gameManager.advancePhase(room.roomCode); // should do nothing
    expect(gameManager.getGame(room.roomCode)!.phase).toBe('game_over');

    gameManager.endGame(room.roomCode);
  });
});

describe('submitNightAction', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects an action from a dead player', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const targetId = Object.keys(game.players).find((id) => id !== room.hostId)!;
    game.players[room.hostId].isAlive = false;

    const error = gameManager.submitNightAction(room.roomCode, room.hostId, targetId);
    expect(error).toBe('You are not able to act.');
    gameManager.endGame(room.roomCode);
  });

  it('rejects a villager submitting a night action', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const villagerId = Object.values(game.players).find((p) => p.role === 'villager')!.userId;
    const otherId = Object.keys(game.players).find((id) => id !== villagerId)!;

    const error = gameManager.submitNightAction(room.roomCode, villagerId, otherId);
    expect(error).toBe('Villagers have no night action.');
    gameManager.endGame(room.roomCode);
  });

  it('blocks a detective from re-investigating a player they already checked', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const detectiveId = Object.values(game.players).find((p) => p.role === 'detective')!.userId;
    const targetId = Object.keys(game.players).find((id) => id !== detectiveId)!;
    game.investigationResults.push({ detectiveId, targetId, isMafia: false, dayNumber: 1 });

    const error = gameManager.submitNightAction(room.roomCode, detectiveId, targetId);
    expect(error).toBe('You already investigated this player.');
    gameManager.endGame(room.roomCode);
  });

  it('blocks a doctor from protecting the same player two nights in a row', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const doctorId = Object.values(game.players).find((p) => p.role === 'doctor')!.userId;
    const otherId = Object.keys(game.players).find((id) => id !== doctorId)!;
    // Simulate: the doctor protected `otherId` last night.
    game.doctorLastTarget[doctorId] = otherId;

    const error = gameManager.submitNightAction(room.roomCode, doctorId, otherId);
    expect(error).toBe("You protected this player last night — you can't do so two nights in a row.");
    expect(game.nightActions).toHaveLength(0);
    gameManager.endGame(room.roomCode);
  });

  it('blocks a doctor from protecting themselves two nights in a row', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const doctorId = Object.values(game.players).find((p) => p.role === 'doctor')!.userId;
    game.doctorLastTarget[doctorId] = doctorId;

    const error = gameManager.submitNightAction(room.roomCode, doctorId, doctorId);
    expect(error).toBe("You protected yourself last night — you can't do so two nights in a row.");
    gameManager.endGame(room.roomCode);
  });

  it('lets a doctor protect a different player than last night (and self-protect when it was someone else)', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const doctorId = Object.values(game.players).find((p) => p.role === 'doctor')!.userId;
    const otherId = Object.keys(game.players).find((id) => id !== doctorId)!;
    game.doctorLastTarget[doctorId] = otherId;

    // A different target is fine...
    const thirdId = Object.keys(game.players).find((id) => id !== doctorId && id !== otherId)!;
    expect(gameManager.submitNightAction(room.roomCode, doctorId, thirdId)).toBeNull();
    // ...and self-protection is allowed since last night's target was someone else.
    expect(gameManager.submitNightAction(room.roomCode, doctorId, doctorId)).toBeNull();
    gameManager.endGame(room.roomCode);
  });

  it('accepts a valid action and replaces any prior action from the same actor', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const mafiaId = Object.values(game.players).find((p) => p.role === 'mafia')!.userId;
    const ids = Object.keys(game.players).filter((id) => id !== mafiaId);

    expect(gameManager.submitNightAction(room.roomCode, mafiaId, ids[0])).toBeNull();
    expect(gameManager.submitNightAction(room.roomCode, mafiaId, ids[1])).toBeNull();
    expect(game.nightActions).toHaveLength(1);
    expect(game.nightActions[0].targetId).toBe(ids[1]);
    gameManager.endGame(room.roomCode);
  });
});

describe('submitDayVote', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects a vote outside the day_voting phase', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const error = gameManager.submitDayVote(room.roomCode, room.hostId, room.playerIds[1]);
    expect(error).toBe('Not the voting phase.');
    gameManager.endGame(room.roomCode);
  });

  it('rejects a vote from a dead player', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    game.phase = 'day_voting';
    game.players[room.hostId].isAlive = false;
    const error = gameManager.submitDayVote(room.roomCode, room.hostId, room.playerIds[1]);
    expect(error).toBe('Dead players cannot vote.');
    gameManager.endGame(room.roomCode);
  });
});

describe('kickPlayer', () => {
  afterEach(() => vi.useRealTimers());

  it('eliminates the player and can end the game if it decides the win condition', () => {
    const room = makeRoom(2, { mafia: 1, doctor: 0, detective: 0, villager: 1 });
    const game = gameManager.startGame(room);
    const villagerId = Object.values(game.players).find((p) => p.role === 'villager')!.userId;

    gameManager.kickPlayer(room.roomCode, villagerId);
    expect(game.players[villagerId].isAlive).toBe(false);
    expect(game.phase).toBe('game_over');
    expect(game.winner).toBe('mafia');
    gameManager.endGame(room.roomCode);
  });

  it('is a harmless no-op on an already-dead player', () => {
    const room = makeRoom(5, { mafia: 1, doctor: 1, detective: 1, villager: 2 });
    const game = gameManager.startGame(room);
    const targetId = Object.keys(game.players)[0];
    game.players[targetId].isAlive = false;
    expect(gameManager.kickPlayer(room.roomCode, targetId)).toBeNull();
    gameManager.endGame(room.roomCode);
  });
});
