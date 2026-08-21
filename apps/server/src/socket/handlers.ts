import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, Room } from '@mafia/shared';
import * as roomManager from '../rooms/roomManager.js';
import * as gameManager from '../game/gameManager.js';
import { buildPlayerView } from '../game/views.js';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketData {
  userId: string;
  roomCode: string;
}

function socketData(socket: IoSocket): Partial<SocketData> {
  return socket.data as Partial<SocketData>;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

const CHAT_TEXT_MAX_LENGTH = 500;
const IDLE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** How much time the host's "add time" control grants per press. */
const PHASE_EXTENSION_MS = 60_000;

/**
 * Every handler below runs inside this wrapper. A malformed/unexpected payload (or any other
 * bug) throwing synchronously used to be an unauthenticated, single-message crash of the whole
 * process — proven live during a security review (a null room:join payload took the server
 * down for every connected player, recovered only because pm2 restarted it). Catching locally
 * per-event means one bad message can never take down anyone else's game.
 */
function safe<Args extends unknown[]>(handler: (...args: Args) => void): (...args: Args) => void {
  return (...args: Args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error('Unhandled error in socket handler:', err);
    }
  };
}

/** Simple sliding-window limiter: at most maxCalls per windowMs, per key. */
function createRateLimiter(maxCalls: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    isAllowed(key: string): boolean {
      const now = Date.now();
      const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (timestamps.length >= maxCalls) {
        hits.set(key, timestamps);
        return false;
      }
      timestamps.push(now);
      hits.set(key, timestamps);
      return true;
    },
    clear(key: string): void {
      hits.delete(key);
    },
  };
}

// room:create/join are keyed by IP (survives a reconnect, which resets a per-socket limit for
// free); everything else that matters while actively playing is keyed by socket.id.
const roomCreateLimiter = createRateLimiter(5, 60_000);
const roomJoinLimiter = createRateLimiter(20, 60_000);
const chatLimiter = createRateLimiter(15, 10_000);
const actionLimiter = createRateLimiter(20, 10_000);

function broadcastRoomUpdate(io: IoServer, room: Room): void {
  io.to(room.roomCode).emit('room:updated', room);
}

/** Sends each connected player their own filtered view — never a shared broadcast. */
function broadcastGameViews(io: IoServer, roomCode: string): void {
  const room = roomManager.getRoom(roomCode);
  const game = gameManager.getGame(roomCode);
  if (!room || !game) return;

  for (const playerId of room.playerIds) {
    const user = roomManager.getUser(playerId);
    if (!user?.socketId) continue;
    io.to(user.socketId).emit('game:view', buildPlayerView(game, playerId, room.hostId === playerId));
  }
}

function mafiaRoomName(roomCode: string): string {
  return `${roomCode}:mafia`;
}

/** Detach this socket from whatever room it was last in before it joins a different one.
 *  The browser keeps one shared socket across room switches; without this it stays subscribed
 *  to the old room's Socket.IO channels and keeps receiving that room's roster/chat broadcasts,
 *  which then leak onto the new room's screen. No-op when re-entering the same room (reconnect). */
function leavePreviousRoom(socket: IoSocket, nextRoomCode: string): void {
  const prev = socketData(socket).roomCode;
  if (prev && prev !== nextRoomCode) {
    socket.leave(prev);
    socket.leave(mafiaRoomName(prev));
  }
}

/** Re-sends each living Mafia player their own filtered view — used to push the live night
 *  tally as teammates pick targets, without touching (or signaling to) anyone else. The tally
 *  itself lives in PlayerView and is gated to Mafia there, so this only reaches the right eyes. */
function broadcastMafiaViews(io: IoServer, roomCode: string): void {
  const game = gameManager.getGame(roomCode);
  if (!game) return;
  const room = roomManager.getRoom(roomCode);

  for (const player of Object.values(game.players)) {
    if (player.role !== 'mafia') continue;
    const socketId = roomManager.getUser(player.userId)?.socketId;
    if (!socketId) continue;
    io.to(socketId).emit('game:view', buildPlayerView(game, player.userId, room?.hostId === player.userId));
  }
}

/** Joins every Mafia player's current socket to the private mafia room, so their night
 *  coordination (target visibility + mafia:chat) never reaches anyone else. Clears out
 *  stale membership first — otherwise a player who was Mafia in a previous game (before a
 *  restart) would keep overhearing the new game's private channel after roles reshuffle. */
function joinMafiaRoom(io: IoServer, roomCode: string): void {
  const game = gameManager.getGame(roomCode);
  if (!game) return;

  const roomName = mafiaRoomName(roomCode);
  io.in(roomName).socketsLeave(roomName);

  for (const player of Object.values(game.players)) {
    if (player.role !== 'mafia') continue;
    const socketId = roomManager.getUser(player.userId)?.socketId;
    if (!socketId) continue;
    io.sockets.sockets.get(socketId)?.join(roomName);
  }
}

export function registerHandlers(io: IoServer): void {
  gameManager.setPhaseChangeListener((roomCode) => {
    // broadcastGameViews already re-sends every player their view, including Mafia — and since
    // nightActions was just cleared entering a fresh night, the Mafia tally naturally resets.
    broadcastGameViews(io, roomCode);
  });

  // Rooms with everyone disconnected for a long stretch are abandoned (closing a tab doesn't
  // trigger any explicit "leave", so this is the only thing that ever reclaims them) — without
  // this the in-memory room/game maps grow forever, a slow unauthenticated memory-exhaustion DoS.
  setInterval(() => {
    for (const roomCode of roomManager.getExpiredRoomCodes()) {
      gameManager.endGame(roomCode);
      roomManager.deleteRoom(roomCode);
    }
  }, IDLE_SWEEP_INTERVAL_MS);

  io.on('connection', (socket: IoSocket) => {
    socket.on(
      'room:create',
      safe((payload, ack) => {
        if (!isNonEmptyString(payload?.displayName)) {
          ack?.({ ok: false, error: 'Enter your name.' });
          return;
        }
        const ip = socket.handshake.address;
        if (!roomCreateLimiter.isAllowed(ip)) {
          ack?.({ ok: false, error: 'Too many rooms created — try again in a minute.' });
          return;
        }
        const { room, userId, sessionToken } = roomManager.createRoom(
          payload.displayName,
          payload.roleConfig,
          payload.nightDurationSeconds,
          payload.revealRolesOnDeath,
          payload.theme
        );
        roomManager.attachSocket(userId, socket.id);
        leavePreviousRoom(socket, room.roomCode);
        socket.data = { userId, roomCode: room.roomCode } satisfies SocketData;
        socket.join(room.roomCode);
        ack?.({ ok: true, room, userId, sessionToken });
      })
    );

    socket.on(
      'room:join',
      safe((payload, ack) => {
        if (!isNonEmptyString(payload?.roomCode) || !isNonEmptyString(payload?.displayName)) {
          ack?.({ ok: false, error: 'Enter your name and room code.' });
          return;
        }
        const ip = socket.handshake.address;
        if (!roomJoinLimiter.isAllowed(ip)) {
          ack?.({ ok: false, error: 'Too many attempts — try again in a minute.' });
          return;
        }
        const result = roomManager.joinRoom(payload.roomCode, payload.displayName);
        if ('error' in result) {
          ack?.({ ok: false, error: result.error });
          return;
        }
        const { room, userId, sessionToken } = result;
        roomManager.attachSocket(userId, socket.id);
        leavePreviousRoom(socket, room.roomCode);
        socket.data = { userId, roomCode: room.roomCode } satisfies SocketData;
        socket.join(room.roomCode);
        ack?.({ ok: true, room, userId, sessionToken });
        broadcastRoomUpdate(io, room);
      })
    );

    // Lets a client fetch current room + game state on demand instead of waiting on a
    // broadcast — needed right after the room page mounts, since it may attach its
    // socket listeners too late to catch a broadcast fired just before navigation.
    // sessionToken proves the caller actually owns userId — userId alone isn't a secret,
    // it's visible to every other player in the room roster and every chat message they send.
    socket.on(
      'room:sync',
      safe((payload, ack) => {
        if (
          !isNonEmptyString(payload?.roomCode) ||
          !isNonEmptyString(payload?.userId) ||
          !isNonEmptyString(payload?.sessionToken)
        ) {
          ack?.({ ok: false, error: 'Invalid request.' });
          return;
        }
        const { roomCode, userId, sessionToken } = payload;
        const room = roomManager.getRoom(roomCode);
        if (!room || !room.playerIds.includes(userId)) {
          ack?.({ ok: false, error: 'Room not found.' });
          return;
        }
        if (!roomManager.verifySessionToken(userId, sessionToken)) {
          ack?.({ ok: false, error: 'Invalid session.' });
          return;
        }

        roomManager.attachSocket(userId, socket.id);
        leavePreviousRoom(socket, roomCode);
        socket.data = { userId, roomCode } satisfies SocketData;
        socket.join(roomCode);

        const game = gameManager.getGame(roomCode);
        if (game) gameManager.setPlayerConnected(roomCode, userId, true);
        if (game?.players[userId]?.role === 'mafia') socket.join(mafiaRoomName(roomCode));
        const view = game ? buildPlayerView(game, userId, room.hostId === userId) : null;

        ack?.({ ok: true, room, view });
        broadcastRoomUpdate(io, room);
        if (game) broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'room:leave',
      safe(() => {
        const { userId, roomCode } = socketData(socket);
        if (!userId) return;
        const room = roomManager.leaveRoom(userId);
        // Derived from server-tracked state, not the (unused) client payload — a mismatched
        // payload roomCode used to leave the wrong Socket.IO channel, desyncing what the
        // socket was actually subscribed to from what the room roster said.
        if (roomCode) socket.leave(roomCode);
        if (room) broadcastRoomUpdate(io, room);
      })
    );

    socket.on(
      'room:start',
      safe(({ roomCode }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can start the game.' });
          return;
        }
        if (room.playerIds.length < room.minPlayers) {
          socket.emit('error', { message: `Need at least ${room.minPlayers} players to start.` });
          return;
        }

        roomManager.finalizeRoleConfig(room);
        roomManager.markRoomInProgress(roomCode);
        gameManager.startGame(room);
        joinMafiaRoom(io, roomCode);
        broadcastRoomUpdate(io, room);
        broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'room:skipPhase',
      safe(({ roomCode }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can skip the phase.' });
          return;
        }
        gameManager.advancePhase(roomCode);
      })
    );

    socket.on(
      'room:extendPhase',
      safe(({ roomCode }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can add time.' });
          return;
        }
        const error = gameManager.extendPhase(roomCode, PHASE_EXTENSION_MS);
        if (error) {
          socket.emit('error', { message: error });
          return;
        }
        // Push the new deadline to everyone so their countdowns update.
        broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'room:setTheme',
      safe(({ roomCode, theme }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can change the theme.' });
          return;
        }
        const updated = roomManager.setRoomTheme(roomCode, theme);
        if (!updated) return; // unknown theme value — ignore
        // If a game is running, re-skin it too (re-rolls the setting + titles for the new theme).
        gameManager.setTheme(roomCode, updated.theme);
        broadcastRoomUpdate(io, updated);
        broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'room:kick',
      safe(({ roomCode, targetUserId }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId || !isNonEmptyString(targetUserId)) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can remove players.' });
          return;
        }
        if (targetUserId === userId) {
          socket.emit('error', { message: "You can't remove yourself." });
          return;
        }
        // Without this, a host of ANY room could kick — or silently hijack the host role
        // of — a player in a completely unrelated room, just by knowing their userId.
        if (!room.playerIds.includes(targetUserId)) {
          socket.emit('error', { message: 'Player not found in this room.' });
          return;
        }

        const targetSocketId = roomManager.getUser(targetUserId)?.socketId;
        const game = gameManager.getGame(roomCode);
        if (game) gameManager.kickPlayer(roomCode, targetUserId);

        const updatedRoom = roomManager.leaveRoom(targetUserId);

        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          targetSocket?.emit('room:kicked');
          targetSocket?.leave(roomCode);
          targetSocket?.leave(mafiaRoomName(roomCode));
        }

        if (updatedRoom) broadcastRoomUpdate(io, updatedRoom);
        if (game) broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'room:restart',
      safe(({ roomCode }) => {
        const { userId } = socketData(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || !userId) return;
        if (room.hostId !== userId) {
          socket.emit('error', { message: 'Only the host can restart the game.' });
          return;
        }
        gameManager.endGame(roomCode);
        roomManager.resetRoomToLobby(roomCode);
        broadcastRoomUpdate(io, room);
      })
    );

    socket.on(
      'night:action',
      safe(({ roomCode, targetId }) => {
        const { userId } = socketData(socket);
        if (!userId || !isNonEmptyString(targetId)) return;
        if (!actionLimiter.isAllowed(socket.id)) return;
        const error = gameManager.submitNightAction(roomCode, userId, targetId);
        if (error) {
          socket.emit('error', { message: error });
          return;
        }
        const game = gameManager.getGame(roomCode);
        const room = roomManager.getRoom(roomCode);
        // Refresh the host's night-action progress on ANY submission — including the doctor's and
        // detective's, which otherwise pushed no update to the host and left the counter stale.
        if (game && room) {
          const hostSocketId = roomManager.getUser(room.hostId)?.socketId;
          if (hostSocketId) io.to(hostSocketId).emit('game:view', buildPlayerView(game, room.hostId, true));
        }
        // Refresh the Mafia's live target tally when one of them acts.
        if (game?.players[userId]?.role === 'mafia') broadcastMafiaViews(io, roomCode);
      })
    );

    socket.on(
      'day:vote',
      safe(({ roomCode, targetId }) => {
        const { userId } = socketData(socket);
        if (!userId || !isNonEmptyString(targetId)) return;
        if (!actionLimiter.isAllowed(socket.id)) return;
        const error = gameManager.submitDayVote(roomCode, userId, targetId);
        if (error) {
          socket.emit('error', { message: error });
          return;
        }
        // Push the updated tally to everyone so vote counts and the majority glow update live.
        broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'game:lastWords',
      safe(({ roomCode, text }) => {
        const { userId } = socketData(socket);
        if (!userId) return;
        const error = gameManager.submitLastWords(roomCode, userId, text);
        if (error) {
          socket.emit('error', { message: error });
          return;
        }
        broadcastGameViews(io, roomCode);
      })
    );

    socket.on(
      'chat:message',
      safe(({ roomCode, text }) => {
        const { userId, roomCode: myRoomCode } = socketData(socket);
        const cleanText = sanitizeText(text, CHAT_TEXT_MAX_LENGTH);
        if (!userId || !cleanText) return;
        // Without this, a client could broadcast into a room's Public Chat they were never
        // actually a member of, just by knowing/guessing its room code.
        if (myRoomCode !== roomCode) return;
        if (!chatLimiter.isAllowed(socket.id)) return;
        const user = roomManager.getUser(userId);
        if (!user) return;
        // Eliminated players get their moment via the dedicated last-words prompt during
        // 'elimination' — after that, they're muted in Public Chat for the rest of this game
        // (this also naturally covers a kicked player, since kicks mark the player dead too).
        const game = gameManager.getGame(roomCode);
        if (game && game.players[userId]?.isAlive === false) {
          socket.emit('error', { message: "Eliminated players can't use Public Chat." });
          return;
        }
        io.to(roomCode).emit('chat:message', {
          fromUserId: userId,
          displayName: user.displayName,
          text: cleanText,
          timestamp: new Date().toISOString(),
        });
      })
    );

    socket.on(
      'mafia:chat',
      safe(({ roomCode, text }) => {
        const { userId, roomCode: myRoomCode } = socketData(socket);
        const cleanText = sanitizeText(text, CHAT_TEXT_MAX_LENGTH);
        if (!userId || !cleanText) return;
        if (myRoomCode !== roomCode) return;
        if (!chatLimiter.isAllowed(socket.id)) return;
        const game = gameManager.getGame(roomCode);
        const user = roomManager.getUser(userId);
        if (!game || !user) return;
        if (game.players[userId]?.role !== 'mafia') return;
        io.to(mafiaRoomName(roomCode)).emit('mafia:chat', {
          fromUserId: userId,
          displayName: user.displayName,
          text: cleanText,
          timestamp: new Date().toISOString(),
        });
      })
    );

    socket.on(
      'disconnect',
      safe(() => {
        chatLimiter.clear(socket.id);
        actionLimiter.clear(socket.id);
        const detached = roomManager.detachSocket(socket.id);
        if (!detached?.roomCode) return;
        gameManager.setPlayerConnected(detached.roomCode, detached.userId, false);
        const room = roomManager.getRoom(detached.roomCode);
        if (room) broadcastRoomUpdate(io, room);
        broadcastGameViews(io, detached.roomCode);
      })
    );
  });
}
