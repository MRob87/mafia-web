import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mafia/shared';
import { registerHandlers } from './handlers.js';

export type TestClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** Boots a real socket.io server on an ephemeral port for integration tests. Not a *.test.ts
 *  file itself — a shared helper imported by the handler test suites. */
export async function startTestServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const httpServer: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        httpServer.close(() => resolve());
      }),
  };
}

export function connectClient(port: number): Promise<TestClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestClientSocket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

export function waitForEvent<T>(
  socket: TestClientSocket,
  event: string,
  predicate?: (payload: T) => boolean
): Promise<T> {
  const untypedSocket = socket as unknown as { on: Function; off: Function };
  return new Promise((resolve) => {
    function handler(payload: T) {
      if (!predicate || predicate(payload)) {
        untypedSocket.off(event, handler);
        resolve(payload);
      }
    }
    untypedSocket.on(event, handler);
  });
}

export function createRoom(
  socket: TestClientSocket,
  displayName = 'Host'
): Promise<{ room: import('@mafia/shared').Room; userId: string; sessionToken: string }> {
  return new Promise((resolve, reject) => {
    socket.emit('room:create', { displayName }, (res) => {
      if (res.ok) resolve(res);
      else reject(new Error(res.error));
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
