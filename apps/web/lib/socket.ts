import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mafia/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Lazily creates a single shared socket connection for the browser tab. */
export function getSocket(): GameSocket {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4100';
  socket = io(url, { autoConnect: true });
  return socket;
}
