import type { Room, RoleConfig, User } from '@mafia/shared';
import { generateRoomCode } from './roomCode.js';

interface UserRecord extends User {
  roomCode: string | null;
  socketId: string | null;
}

const DEFAULT_MAX_PLAYERS = 12;
const DEFAULT_MIN_PLAYERS = 5;
const DEFAULT_NIGHT_DURATION_SECONDS = 30;
const MIN_NIGHT_DURATION_SECONDS = 10;
const MAX_NIGHT_DURATION_SECONDS = 120;

function clampNightDuration(seconds: number | undefined): number {
  if (seconds === undefined || Number.isNaN(seconds)) return DEFAULT_NIGHT_DURATION_SECONDS;
  return Math.min(MAX_NIGHT_DURATION_SECONDS, Math.max(MIN_NIGHT_DURATION_SECONDS, Math.round(seconds)));
}

// Classic-4 default ratio: roughly 1 mafia per 4 players, one doctor, one detective
// once the lobby is large enough to support them; the rest are villagers.
function defaultRoleConfig(maxPlayers: number): RoleConfig {
  const mafia = Math.max(1, Math.floor(maxPlayers / 4));
  const doctor = maxPlayers >= 5 ? 1 : 0;
  const detective = maxPlayers >= 5 ? 1 : 0;
  const villager = Math.max(0, maxPlayers - mafia - doctor - detective);
  return { mafia, doctor, detective, villager };
}

const rooms = new Map<string, Room>();
const users = new Map<string, UserRecord>();
const roleOverrides = new Map<string, Partial<RoleConfig>>();

function nowIso(): string {
  return new Date().toISOString();
}

export function createRoom(
  displayName: string,
  roleConfigOverride?: Partial<RoleConfig>,
  nightDurationSecondsInput?: number
): { room: Room; userId: string } {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) roomCode = generateRoomCode();

  const hostId = crypto.randomUUID();
  const maxPlayers = DEFAULT_MAX_PLAYERS;

  if (roleConfigOverride) roleOverrides.set(roomCode, roleConfigOverride);

  const room: Room = {
    roomCode,
    hostId,
    maxPlayers,
    minPlayers: DEFAULT_MIN_PLAYERS,
    status: 'lobby',
    roleConfig: { ...defaultRoleConfig(maxPlayers), ...roleConfigOverride },
    playerIds: [hostId],
    players: [{ userId: hostId, displayName }],
    nightDurationSeconds: clampNightDuration(nightDurationSecondsInput),
    createdAt: nowIso(),
  };

  rooms.set(roomCode, room);
  users.set(hostId, {
    id: hostId,
    displayName,
    connectionStatus: 'connected',
    createdAt: nowIso(),
    roomCode,
    socketId: null,
  });

  return { room, userId: hostId };
}

export function joinRoom(
  roomCode: string,
  displayName: string
): { room: Room; userId: string } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };
  if (room.status !== 'lobby') return { error: 'Game already in progress.' };
  if (room.playerIds.length >= room.maxPlayers) return { error: 'Room is full.' };

  const userId = crypto.randomUUID();
  room.playerIds.push(userId);
  room.players.push({ userId, displayName });
  users.set(userId, {
    id: userId,
    displayName,
    connectionStatus: 'connected',
    createdAt: nowIso(),
    roomCode,
    socketId: null,
  });

  return { room, userId };
}

export function leaveRoom(userId: string): Room | null {
  const user = users.get(userId);
  if (!user?.roomCode) return null;
  const room = rooms.get(user.roomCode);
  if (!room) return null;

  room.playerIds = room.playerIds.filter((id) => id !== userId);
  room.players = room.players.filter((p) => p.userId !== userId);
  user.roomCode = null;

  if (room.playerIds.length === 0) {
    rooms.delete(room.roomCode);
    roleOverrides.delete(room.roomCode);
    return null;
  }
  if (room.hostId === userId) {
    room.hostId = room.playerIds[0];
  }
  return room;
}

export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

export function getUser(userId: string): UserRecord | undefined {
  return users.get(userId);
}

export function attachSocket(userId: string, socketId: string): void {
  const user = users.get(userId);
  if (!user) return;
  user.socketId = socketId;
  user.connectionStatus = 'connected';
}

/** Marks the owning user disconnected and returns their room code, if any. */
export function detachSocket(socketId: string): { userId: string; roomCode: string | null } | null {
  for (const user of users.values()) {
    if (user.socketId === socketId) {
      user.connectionStatus = 'disconnected';
      user.socketId = null;
      return { userId: user.id, roomCode: user.roomCode };
    }
  }
  return null;
}

/**
 * Recomputes the mafia/doctor/detective/villager ratio against the room's ACTUAL joined
 * player count (not its lobby capacity) and applies it, preserving any explicit override
 * passed at room creation. The lobby-time roleConfig is only a provisional placeholder —
 * call this right before the game starts, once the final roster is known. Without this,
 * a small room can silently draw zero mafia (the default ratio was sized for a full
 * 12-seat room, then randomly sliced down to whoever actually joined).
 */
export function finalizeRoleConfig(room: Room): RoleConfig {
  const override = roleOverrides.get(room.roomCode) ?? {};
  const playerCount = room.playerIds.length;
  const base = defaultRoleConfig(playerCount);
  const mafia = override.mafia ?? base.mafia;
  const doctor = override.doctor ?? base.doctor;
  const detective = override.detective ?? base.detective;
  // Only trust an explicit villager override if one was given — otherwise derive it so the
  // total always matches the actual seat count exactly. A *partial* override (e.g. just
  // {mafia: 2}) would otherwise leave villager at its full-lobby default, overflow the pool
  // past playerCount, and let the random slice-to-fit in assignRoles() drop a "guaranteed" role.
  const villager = override.villager ?? Math.max(0, playerCount - mafia - doctor - detective);
  const config = { mafia, doctor, detective, villager };
  room.roleConfig = config;
  return config;
}

export function markRoomInProgress(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) room.status = 'in_progress';
}

export function resetRoomToLobby(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (room) room.status = 'lobby';
}
