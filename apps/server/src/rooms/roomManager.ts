import type { Room, RoleConfig, User } from '@mafia/shared';
import { generateRoomCode } from './roomCode.js';

interface UserRecord extends User {
  roomCode: string | null;
  socketId: string | null;
  /** Proves ownership of this userId on room:sync — userId alone isn't a secret, it's visible
   *  to every other player in the room roster and every chat message they send. */
  sessionToken: string;
}

const DEFAULT_MAX_PLAYERS = 12;
const DEFAULT_MIN_PLAYERS = 5;
const DEFAULT_NIGHT_DURATION_SECONDS = 30;
const MIN_NIGHT_DURATION_SECONDS = 10;
const MAX_NIGHT_DURATION_SECONDS = 120;
const DISPLAY_NAME_MAX_LENGTH = 24;
const MAX_ROLE_COUNT = 20;
// Hard cap on a room's total lifetime, regardless of activity — MRob's call: a room open this
// long is done, even if people are still actively connected to it.
const MAX_ROOM_AGE_MS = 2 * 60 * 60 * 1000;
// A room with zero currently-connected players for this long is considered abandoned (closing
// a tab doesn't trigger any explicit "leave", so this is the only thing that ever reclaims a
// room after everyone just wanders off). Short enough to actually clean up promptly, long
// enough that a phone locking its screen for a minute doesn't wipe an active game out from
// under its players the moment it briefly drops to zero connections.
const DISCONNECTED_GRACE_MS = 10 * 60 * 1000;

function clampNightDuration(seconds: number | undefined): number {
  if (seconds === undefined || Number.isNaN(seconds)) return DEFAULT_NIGHT_DURATION_SECONDS;
  return Math.min(MAX_NIGHT_DURATION_SECONDS, Math.max(MIN_NIGHT_DURATION_SECONDS, Math.round(seconds)));
}

function sanitizeDisplayName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, DISPLAY_NAME_MAX_LENGTH) : '';
  return trimmed || 'Player';
}

/** Clamps a role count to a safe non-negative integer. Without this, a client-supplied
 *  negative or absurdly large roleConfig value crashes assignRoles() (Array(n) throws for
 *  negative/non-integer n) — this was a real, unauthenticated, single-message DoS. */
function clampRoleCount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_ROLE_COUNT, Math.max(0, Math.round(value)));
}

function sanitizeRoleConfigOverride(override: Partial<RoleConfig> | undefined): Partial<RoleConfig> | undefined {
  if (!override || typeof override !== 'object') return undefined;
  const sanitized: Partial<RoleConfig> = {};
  const mafia = clampRoleCount(override.mafia);
  const doctor = clampRoleCount(override.doctor);
  const detective = clampRoleCount(override.detective);
  if (mafia !== undefined) sanitized.mafia = mafia;
  if (doctor !== undefined) sanitized.doctor = doctor;
  if (detective !== undefined) sanitized.detective = detective;
  // villager is never trusted from an override regardless (see finalizeRoleConfig) — no need
  // to sanitize a field that's always recomputed.
  return sanitized;
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
const roomActivity = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function touchRoom(roomCode: string): void {
  roomActivity.set(roomCode, Date.now());
}

export function createRoom(
  displayNameInput: string,
  roleConfigOverrideInput?: Partial<RoleConfig>,
  nightDurationSecondsInput?: number,
  revealRolesOnDeathInput?: boolean,
  startOnDayInput?: boolean
): { room: Room; userId: string; sessionToken: string } {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) roomCode = generateRoomCode();

  const hostId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const maxPlayers = DEFAULT_MAX_PLAYERS;
  const displayName = sanitizeDisplayName(displayNameInput);
  const roleConfigOverride = sanitizeRoleConfigOverride(roleConfigOverrideInput);

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
    // Coerce to a strict boolean — never trust the raw client value's type. Default false
    // keeps the historical behavior (roles hidden until game end) unless the host opts in.
    revealRolesOnDeath: revealRolesOnDeathInput === true,
    // Defaults ON: only an explicit `false` opts back into the classic Night-1-kill start.
    startOnDay: startOnDayInput !== false,
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
    sessionToken,
  });
  touchRoom(roomCode);

  return { room, userId: hostId, sessionToken };
}

export function joinRoom(
  roomCode: string,
  displayNameInput: string
): { room: Room; userId: string; sessionToken: string } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };
  if (room.status !== 'lobby') return { error: 'Game already in progress.' };
  if (room.playerIds.length >= room.maxPlayers) return { error: 'Room is full.' };

  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const displayName = sanitizeDisplayName(displayNameInput);
  room.playerIds.push(userId);
  room.players.push({ userId, displayName });
  users.set(userId, {
    id: userId,
    displayName,
    connectionStatus: 'connected',
    createdAt: nowIso(),
    roomCode,
    socketId: null,
    sessionToken,
  });
  touchRoom(roomCode);

  return { room, userId, sessionToken };
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
    roomActivity.delete(room.roomCode);
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

/** Proves the caller actually owns userId, rather than having merely seen it somewhere
 *  (the room roster, a chat message) — see the UserRecord.sessionToken doc comment. */
export function verifySessionToken(userId: string, sessionToken: string): boolean {
  const user = users.get(userId);
  return !!user && !!sessionToken && user.sessionToken === sessionToken;
}

export function attachSocket(userId: string, socketId: string): void {
  const user = users.get(userId);
  if (!user) return;
  if (user.roomCode) touchRoom(user.roomCode);
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
  // Villager has no special ability, so it's always just "everyone else" once mafia/doctor/
  // detective are set — never trust an explicit villager override. Any partial override that
  // leaves it to a stale default (or mismatches the other three) would otherwise overflow the
  // pool past playerCount and let the random slice-to-fit in assignRoles() drop a "guaranteed"
  // role — this is what actually caused the very first zero-mafia bug this function fixed.
  const villager = Math.max(0, playerCount - mafia - doctor - detective);
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

/** Room codes eligible for cleanup, either because the room has simply been open too long
 *  (MAX_ROOM_AGE_MS, regardless of activity) or because it currently has no connected players
 *  and has sat that way past DISCONNECTED_GRACE_MS. */
export function getExpiredRoomCodes(): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const [roomCode, room] of rooms) {
    const ageMs = now - new Date(room.createdAt).getTime();
    if (ageMs > MAX_ROOM_AGE_MS) {
      expired.push(roomCode);
      continue;
    }
    const hasConnectedPlayer = room.playerIds.some((id) => !!users.get(id)?.socketId);
    if (hasConnectedPlayer) continue;
    const lastActive = roomActivity.get(roomCode) ?? 0;
    if (now - lastActive > DISCONNECTED_GRACE_MS) expired.push(roomCode);
  }
  return expired;
}

/** Removes a room and every user record that belongs to it. Caller is responsible for also
 *  ending any associated game (roomManager doesn't know about gameManager, by design). */
export function deleteRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const id of room.playerIds) users.delete(id);
  rooms.delete(roomCode);
  roleOverrides.delete(roomCode);
  roomActivity.delete(roomCode);
}
