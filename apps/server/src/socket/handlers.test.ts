import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, connectClient, createRoom, waitForEvent, sleep, type TestClientSocket } from './testServer.js';

let port: number;
let close: () => Promise<void>;

beforeAll(async () => {
  const server = await startTestServer();
  port = server.port;
  close = server.close;
});

afterAll(async () => {
  await close();
});

describe('safe() malformed-payload handling', () => {
  it('never crashes the server on null/undefined/malformed payloads', async () => {
    const socket = await connectClient(port);
    (socket as any).emit('room:create', null);
    (socket as any).emit('room:sync', undefined);
    (socket as any).emit('night:action', 12345);
    (socket as any).emit('room:kick', { roomCode: 'X' }); // missing targetUserId
    await sleep(150);

    // Regression: a null room:create payload used to crash the whole process. The server
    // staying up for a completely unrelated, well-formed request afterward proves it survived.
    const result = await createRoom(socket, 'StillAlive');
    expect(result.room.hostId).toBe(result.userId);
    socket.close();
  });
});

describe('room:sync sessionToken enforcement', () => {
  it('rejects a wrong or empty sessionToken and accepts the correct one', async () => {
    const socket = await connectClient(port);
    const { room, userId, sessionToken } = await createRoom(socket, 'Owner');

    const wrong = await new Promise<any>((resolve) =>
      socket.emit('room:sync', { roomCode: room.roomCode, userId, sessionToken: 'wrong-token' }, resolve)
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe('Invalid session.');

    const correct = await new Promise<any>((resolve) =>
      socket.emit('room:sync', { roomCode: room.roomCode, userId, sessionToken }, resolve)
    );
    expect(correct.ok).toBe(true);
    socket.close();
  });
});

// Both tests below share a single pair of rooms/sockets (rather than creating fresh ones each)
// to stay well under the room:create rate limit (5/min/IP), which is exercised separately in
// handlers.roomCreateRateLimit.test.ts.
describe('cross-room protection', () => {
  let socketA: TestClientSocket;
  let socketB: TestClientSocket;
  let roomACode: string;
  let roomBCode: string;
  let userBId: string;

  beforeAll(async () => {
    socketA = await connectClient(port);
    socketB = await connectClient(port);
    const roomA = await createRoom(socketA, 'HostA');
    const roomB = await createRoom(socketB, 'HostB');
    roomACode = roomA.room.roomCode;
    roomBCode = roomB.room.roomCode;
    userBId = roomB.userId;
  });

  afterAll(() => {
    socketA.close();
    socketB.close();
  });

  it('room:kick rejects a targetUserId that belongs to a different room', async () => {
    const errorPromise = waitForEvent<{ message: string }>(socketA, 'error');
    socketA.emit('room:kick', { roomCode: roomACode, targetUserId: userBId });
    const error = await errorPromise;
    expect(error.message).toBe('Player not found in this room.');
  });

  it('chat:message blocks a client from broadcasting into a room they never joined', async () => {
    const received: string[] = [];
    socketA.on('chat:message', (msg) => received.push(msg.text));

    socketB.emit('chat:message', { roomCode: roomACode, text: 'spoofed' });
    await sleep(150);

    const legitPromise = waitForEvent<{ text: string }>(socketA, 'chat:message', (m) => m.text === 'legit');
    socketA.emit('chat:message', { roomCode: roomACode, text: 'legit' });
    await legitPromise;

    expect(received).toEqual(['legit']);
  });

  // Regression: the browser reuses one socket across room switches. Joining a new room used to
  // leave the socket subscribed to the old room's channel, so it kept receiving that room's
  // roster/chat broadcasts — they leaked onto the new room's screen. Kept last: it moves socketB
  // out of room B for good. (Uses room:join, not create, to stay under the 5/min create limit.)
  it('stops delivering the previous room\'s broadcasts after a socket switches rooms', async () => {
    // Move socketB from room B into room A.
    await new Promise<{ ok: boolean }>((resolve) =>
      socketB.emit('room:join', { roomCode: roomACode, displayName: 'Switcher' }, resolve)
    );

    // Capture any room:updated for the room socketB just left.
    const leakedFromRoomB: string[] = [];
    socketB.on('room:updated', (r) => {
      if (r.roomCode === roomBCode) leakedFromRoomB.push(r.roomCode);
    });

    // Trigger a room B broadcast: a fresh socket joins room B, which fans room:updated out to
    // room B's channel. socketB must no longer be on that channel.
    const socketC = await connectClient(port);
    await new Promise<{ ok: boolean }>((resolve) =>
      socketC.emit('room:join', { roomCode: roomBCode, displayName: 'JoinsB' }, resolve)
    );
    await sleep(150);

    expect(leakedFromRoomB).toEqual([]);
    socketC.close();
  });
});
