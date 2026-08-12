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

export function registerHandlers(io: IoServer): void {
  gameManager.setPhaseChangeListener((roomCode) => broadcastGameViews(io, roomCode));

  io.on('connection', (socket: IoSocket) => {
    socket.on('room:create', ({ displayName, roleConfig }, ack) => {
      const { room, userId } = roomManager.createRoom(displayName, roleConfig);
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

      roomManager.markRoomInProgress(roomCode);
      gameManager.startGame(room);
      broadcastRoomUpdate(io, room);
      broadcastGameViews(io, roomCode);
    });

    socket.on('night:action', ({ roomCode, targetId }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const error = gameManager.submitNightAction(roomCode, userId, targetId);
      if (error) socket.emit('error', { message: error });
    });

    socket.on('day:vote', ({ roomCode, targetId }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const error = gameManager.submitDayVote(roomCode, userId, targetId);
      if (error) socket.emit('error', { message: error });
    });

    socket.on('chat:message', ({ roomCode, text }) => {
      const { userId } = socketData(socket);
      if (!userId) return;
      const user = roomManager.getUser(userId);
      if (!user) return;
      // MVP: single public channel. Phase 2 splits a Mafia-only night channel
      // using a separate socket room joined only by mafia players.
      io.to(roomCode).emit('chat:message', {
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
