import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as roomManager from './roomManager.js';

const BASE_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRoom / joinRoom / leaveRoom', () => {
  it('creates a room with the host as sole player and issues a sessionToken', () => {
    const { room, userId, sessionToken } = roomManager.createRoom('Alice');
    expect(room.playerIds).toEqual([userId]);
    expect(room.hostId).toBe(userId);
    expect(sessionToken).toBeTruthy();
    expect(roomManager.verifySessionToken(userId, sessionToken)).toBe(true);
  });

  it('trims and caps an oversized display name, falling back to "Player" when blank', () => {
    const { room } = roomManager.createRoom('   ');
    expect(room.players[0].displayName).toBe('Player');

    const long = 'x'.repeat(50);
    const { room: room2 } = roomManager.createRoom(long);
    expect(room2.players[0].displayName).toHaveLength(24);
  });

  it('clamps a negative or absurd roleConfig override into range (regression: Array(-1) crash)', () => {
    const { room } = roomManager.createRoom('Host', { mafia: -5, doctor: 999 });
    expect(room.roleConfig.mafia).toBe(0);
    expect(room.roleConfig.doctor).toBe(20);
  });

  it('joinRoom adds a player and rejects once the room is full or in progress', () => {
    const { room } = roomManager.createRoom('Host');
    const joined = roomManager.joinRoom(room.roomCode, 'Guest');
    expect('room' in joined).toBe(true);
    if ('room' in joined) expect(joined.room.playerIds).toHaveLength(2);

    const bad = roomManager.joinRoom('NOPE', 'Ghost');
    expect(bad).toEqual({ error: 'Room not found.' });
  });

  it('leaveRoom deletes an emptied room and reassigns host when the host leaves', () => {
    const { room, userId: hostId } = roomManager.createRoom('Host');
    const joined = roomManager.joinRoom(room.roomCode, 'Guest');
    if (!('room' in joined)) throw new Error('join failed');

    const afterHostLeaves = roomManager.leaveRoom(hostId);
    expect(afterHostLeaves?.hostId).toBe(joined.userId);

    const afterLastLeaves = roomManager.leaveRoom(joined.userId);
    expect(afterLastLeaves).toBeNull();
    expect(roomManager.getRoom(room.roomCode)).toBeUndefined();
  });
});

describe('verifySessionToken', () => {
  it('rejects a wrong or empty token', () => {
    const { userId, sessionToken } = roomManager.createRoom('Host');
    expect(roomManager.verifySessionToken(userId, 'wrong-token')).toBe(false);
    expect(roomManager.verifySessionToken(userId, '')).toBe(false);
    expect(roomManager.verifySessionToken(userId, sessionToken)).toBe(true);
  });
});

describe('finalizeRoleConfig', () => {
  it('recomputes the role ratio against the actual joined player count, not room capacity', () => {
    // Regression: sizing the default ratio off maxPlayers (12) for a 5-player room could
    // slice mafia out of the pool entirely once roles were randomly assigned to who actually joined.
    const { room } = roomManager.createRoom('Host');
    for (let i = 0; i < 4; i++) roomManager.joinRoom(room.roomCode, `Guest${i}`);
    expect(room.playerIds).toHaveLength(5);

    const config = roomManager.finalizeRoleConfig(room);
    expect(config.mafia).toBeGreaterThan(0);
    expect(config.mafia + config.doctor + config.detective + config.villager).toBe(5);
  });

  // Standard ratio breakpoints: 5–6 -> 1 mafia, 7–9 -> 2, 10–12 -> 3.
  it.each([
    { players: 6, mafia: 1 },
    { players: 7, mafia: 2 },
    { players: 9, mafia: 2 },
    { players: 10, mafia: 3 },
    { players: 12, mafia: 3 },
  ])('sizes a $players-player room to $mafia mafia', ({ players, mafia }) => {
    const { room } = roomManager.createRoom('Host');
    for (let i = 0; i < players - 1; i++) roomManager.joinRoom(room.roomCode, `Guest${i}`);
    expect(room.playerIds).toHaveLength(players);

    const config = roomManager.finalizeRoleConfig(room);
    expect(config.mafia).toBe(mafia);
    expect(config).toEqual({ mafia, doctor: 1, detective: 1, villager: players - mafia - 2 });
    expect(config.mafia + config.doctor + config.detective + config.villager).toBe(players);
  });

  it('preserves an explicit override while still recomputing villager as the remainder', () => {
    const { room } = roomManager.createRoom('Host', { mafia: 1 });
    for (let i = 0; i < 4; i++) roomManager.joinRoom(room.roomCode, `Guest${i}`);
    const config = roomManager.finalizeRoleConfig(room);
    expect(config.mafia).toBe(1);
    expect(config.mafia + config.doctor + config.detective + config.villager).toBe(5);
  });
});

describe('createRoom theme', () => {
  it('defaults to the mafia theme', () => {
    const { room } = roomManager.createRoom('Host');
    expect(room.theme).toBe('mafia');
  });

  it('accepts the werewolf theme', () => {
    const { room } = roomManager.createRoom('Host', undefined, undefined, undefined, 'werewolf');
    expect(room.theme).toBe('werewolf');
  });

  it('falls back to mafia for an unknown theme', () => {
    const { room } = roomManager.createRoom('Host', undefined, undefined, undefined, 'dragons' as never);
    expect(room.theme).toBe('mafia');
  });
});

describe('getExpiredRoomCodes', () => {
  it('does not expire a freshly created, connected room', () => {
    const { room, userId } = roomManager.createRoom('Host');
    roomManager.attachSocket(userId, 'socket-1');
    expect(roomManager.getExpiredRoomCodes()).not.toContain(room.roomCode);
  });

  it('expires a room older than the 2-hour hard cap even while a player is still connected', () => {
    const { room, userId } = roomManager.createRoom('Host');
    roomManager.attachSocket(userId, 'socket-1');
    vi.setSystemTime(BASE_TIME + TWO_HOURS_MS + 1_000);
    expect(roomManager.getExpiredRoomCodes()).toContain(room.roomCode);
  });

  it('expires a room with zero connected players after the disconnected grace period', () => {
    const { room } = roomManager.createRoom('Host');
    // Never attachSocket — simulates a player who created the room and never actually connected
    // a live socket (or one that has since dropped).
    vi.setSystemTime(BASE_TIME + TEN_MINUTES_MS + 1_000);
    expect(roomManager.getExpiredRoomCodes()).toContain(room.roomCode);
  });

  it('does not expire a disconnected room still inside its grace period', () => {
    const { room } = roomManager.createRoom('Host');
    vi.setSystemTime(BASE_TIME + TEN_MINUTES_MS - 1_000);
    expect(roomManager.getExpiredRoomCodes()).not.toContain(room.roomCode);
  });

  it('does not expire a room past the grace period if a player is connected', () => {
    const { room, userId } = roomManager.createRoom('Host');
    roomManager.attachSocket(userId, 'socket-1');
    vi.setSystemTime(BASE_TIME + TEN_MINUTES_MS + 1_000);
    expect(roomManager.getExpiredRoomCodes()).not.toContain(room.roomCode);
  });
});

describe('deleteRoom', () => {
  it('removes the room and every one of its user records', () => {
    const { room, userId } = roomManager.createRoom('Host');
    roomManager.deleteRoom(room.roomCode);
    expect(roomManager.getRoom(room.roomCode)).toBeUndefined();
    expect(roomManager.getUser(userId)).toBeUndefined();
  });
});
