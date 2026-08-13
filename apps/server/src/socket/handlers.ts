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
    io.to(user.socketId).emit('game:view', buildPlayerView(game, playerId));
  }
}

function mafiaRoomName(roomCode: string): string {
  return `${roomCode}:mafia`;
}

/** Pushes the Mafia team's current night target picks to their private room only. */
function broadcastMafiaNightStatus(io: IoServer, roomCode: string): void {
  const game = gameManager.getGame(roomCode);
  if (!game) return;

  const targets = game.nightActions
    .filter((a) => a.role === 'mafia')
    .map((a) => ({
      actorId: a.actorId,
      actorDisplayName: roomManager.getUser(a.actorId)?.displayName ?? 'Unknown',
      targetId: a.targetId,
      targetDisplayName: roomManager.getUser(a.targetId)?.displayName ?? 'Unknown',
    }));

  io.to(mafiaRoomName(roomCode)).emit('game:mafiaNightStatus', { targets });
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
    broadcastGameViews(io, roomCode);
    // Fresh night — nightActions was just cleared, so this resets the mafia's live
    // target panel instead of leaving the previous night's picks stale on screen.
    const game = gameManager.getGame(roomCode);
    if (game?.phase === 'night') broadcastMafiaNightStatus(io, roomCode);
  });

  io.on('connection', (socket: IoSocket) => {
    socket.on('room:create', ({ displayName, roleConfig, nightDurationSeconds }, ack) => {
      const { room, userId } = roomManager.createRoom(displayName, roleConfig, nightDurationSeconds);
      roomManager.attachSocket(userId, socket.id);
      socket.data = { userId, roomCode: room.roomCode } satisfies SocketData;
      socket.join(room.roomCode);
      ack({ ok: true, room, userId });
    });

    socket.on('room:join', ({ roomCode, displayName }, ack) => {
      const result = roomManager.joinRoom(roomCode, displayName);
      if ('error' in result) {
        ack({ ok: false, error: result.error });
        return;
      }
      const { room, userId } = result;
      roomManager.attachSocket(userId, socket.id);
      socket.data = { userId, roomCode: room.roomCode } satisfies SocketData;
      socket.join(room.roomCode);
      ack({ ok: true, room, userId });
      broadcastRoomUpdate(io, room);
    });

    // Lets a client fetch current room + game state on demand instead of waiting on a
    // broadcast — needed right after the room page mounts, since it may attach its
    // socket listeners too late to catch a broadcast fired just before navigation.
    socket.on('room:sync', ({ roomCode, userId }, ack) => {
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.playerIds.includes(userId)) {
        ack({ ok: false, error: 'Room not found.' });
        return;
      }

      roomManager.attachSocket(userId, socket.id);
      socket.data = { userId, roomCode } satisfies SocketData;
      socket.join(roomCode);

      const game = gameManager.getGame(roomCode);
      if (game) gameManager.setPlayerConnected(roomCode, userId, true);
      if (game?.players[userId]?.role === 'mafia') socket.join(mafiaRoomName(roomCode));
      const view = game ? buildPlayerView(game, userId) : null;

      ack({ ok: true, room, view });
      broadcastRoomUpdate(io, room);
      if (game) broadcastGameViews(io, roomCode);
    });

    socket.on('room:leave', ({ roomCode }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const room = roomManager.leaveRoom(userId);
      socket.leave(roomCode);
      if (room) broadcastRoomUpdate(io, room);
    });

    socket.on('room:start', ({ roomCode }) => {
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
    });

    socket.on('room:skipPhase', ({ roomCode }) => {
      const { userId } = socketData(socket);
      const room = roomManager.getRoom(roomCode);
      if (!room || !userId) return;
      if (room.hostId !== userId) {
        socket.emit('error', { message: 'Only the host can skip the phase.' });
        return;
      }
      gameManager.advancePhase(roomCode);
    });

    socket.on('room:kick', ({ roomCode, targetUserId }) => {
      const { userId } = socketData(socket);
      const room = roomManager.getRoom(roomCode);
      if (!room || !userId) return;
      if (room.hostId !== userId) {
        socket.emit('error', { message: 'Only the host can remove players.' });
        return;
      }
      if (targetUserId === userId) {
        socket.emit('error', { message: "You can't remove yourself." });
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
    });

    socket.on('room:restart', ({ roomCode }) => {
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
    });

    socket.on('night:action', ({ roomCode, targetId }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const error = gameManager.submitNightAction(roomCode, userId, targetId);
      if (error) {
        socket.emit('error', { message: error });
        return;
      }
      const game = gameManager.getGame(roomCode);
      if (game?.players[userId]?.role === 'mafia') broadcastMafiaNightStatus(io, roomCode);
    });

    socket.on('day:vote', ({ roomCode, targetId }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const error = gameManager.submitDayVote(roomCode, userId, targetId);
      if (error) socket.emit('error', { message: error });
    });

    socket.on('game:lastWords', ({ roomCode, text }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const error = gameManager.submitLastWords(roomCode, userId, text);
      if (error) {
        socket.emit('error', { message: error });
        return;
      }
      broadcastGameViews(io, roomCode);
    });

    socket.on('chat:message', ({ roomCode, text }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const user = roomManager.getUser(userId);
      if (!user) return;
      io.to(roomCode).emit('chat:message', {
        fromUserId: userId,
        displayName: user.displayName,
        text,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('mafia:chat', ({ roomCode, text }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const game = gameManager.getGame(roomCode);
      const user = roomManager.getUser(userId);
      if (!game || !user) return;
      if (game.players[userId]?.role !== 'mafia') return;
      io.to(mafiaRoomName(roomCode)).emit('mafia:chat', {
        fromUserId: userId,
        displayName: user.displayName,
        text,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      const detached = roomManager.detachSocket(socket.id);
      if (!detached?.roomCode) return;
      gameManager.setPlayerConnected(detached.roomCode, detached.userId, false);
      const room = roomManager.getRoom(detached.roomCode);
      if (room) broadcastRoomUpdate(io, room);
      broadcastGameViews(io, detached.roomCode);
    });
  });
}
