import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@mafia/shared';
import { registerHandlers } from './socket/handlers.js';

const PORT = Number(process.env.PORT ?? 4100);

/** True for localhost and any private-LAN address, so phones/tablets on the same network can
 *  connect without FRONTEND_ORIGIN being hardcoded to one (DHCP-assigned, so it can change)
 *  IP. Set FRONTEND_ORIGIN explicitly in production to lock this down to a single real origin. */
function isLocalOrLanOrigin(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  if (!origin) {
    callback(null, true); // non-browser clients: curl, server-to-server, socket.io-client scripts
    return;
  }
  if (process.env.FRONTEND_ORIGIN) {
    callback(null, origin === process.env.FRONTEND_ORIGIN);
    return;
  }
  try {
    callback(null, isLocalOrLanOrigin(new URL(origin).hostname));
  } catch {
    callback(null, false);
  }
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin },
});

registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Mafia game server listening on :${PORT}`);
});
