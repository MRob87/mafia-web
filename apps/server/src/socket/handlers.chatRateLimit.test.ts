import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, connectClient, createRoom, sleep } from './testServer.js';

// Isolated in its own file for the same reason as the room:create limit suite — chatLimiter
// (keyed by socket.id) is module-level state in handlers.ts.
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

describe('chat:message / mafia:chat rate limiting', () => {
  it('caps a single socket to 15 chat messages per 10s window', async () => {
    const socket = await connectClient(port);
    const { room } = await createRoom(socket, 'Chatty');

    const received: string[] = [];
    socket.on('chat:message', (msg) => received.push(msg.text));

    for (let i = 0; i < 20; i++) {
      socket.emit('chat:message', { roomCode: room.roomCode, text: `msg-${i}` });
    }
    await sleep(300);

    // Prevents a single client from flooding the room; the exact cap (15/10s) is an
    // implementation detail, but it must be enforced well below the 20 sent here.
    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThanOrEqual(15);

    socket.close();
  });
});
