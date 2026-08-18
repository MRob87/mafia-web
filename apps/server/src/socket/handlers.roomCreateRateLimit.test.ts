import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, connectClient } from './testServer.js';

// Isolated in its own file: the room:create limiter is keyed by IP and lives as module-level
// state in handlers.ts for the lifetime of the process. Running this alongside other suites
// that also call room:create would make pass/fail depend on execution order.
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

describe('room:create rate limiting', () => {
  it('allows 5 room creations per IP per minute, then rejects the 6th', async () => {
    const socket = await connectClient(port);

    for (let i = 0; i < 5; i++) {
      const res = await new Promise<any>((resolve) =>
        socket.emit('room:create', { displayName: `Host${i}` }, resolve)
      );
      expect(res.ok).toBe(true);
    }

    const sixth = await new Promise<any>((resolve) =>
      socket.emit('room:create', { displayName: 'HostSixth' }, resolve)
    );
    expect(sixth.ok).toBe(false);
    expect(sixth.error).toBe('Too many rooms created — try again in a minute.');

    socket.close();
  });
});
