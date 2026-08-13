import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mafia/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Lazily creates a single shared socket connection for the browser tab. */
export function getSocket(): GameSocket {
  if (socket) return socket;
  // Falls back to whatever host the page was actually loaded from (server always runs on
  // 4000), so this works unmodified from localhost, a LAN IP, or a real domain without ever
  // needing a rebuild — set NEXT_PUBLIC_SERVER_URL only when the API lives elsewhere.
  const url = process.env.NEXT_PUBLIC_SERVER_URL ?? `http://${window.location.hostname}:4000`;
  socket = io(url, { autoConnect: true });
  return socket;
}
