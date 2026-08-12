import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@mafia/shared';
import { registerHandlers } from './socket/handlers.js';

const PORT = Number(process.env.PORT ?? 4100);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3200';

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: FRONTEND_ORIGIN },
});

registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Mafia game server listening on :${PORT}`);
});
