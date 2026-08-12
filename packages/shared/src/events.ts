import type { PlayerView, Room, RoleConfig } from './types.js';

/** Events emitted by the client, handled by the server. */
export interface ClientToServerEvents {
  'room:create': (
    payload: { displayName: string; roleConfig?: Partial<RoleConfig> },
    ack: (res: { ok: true; room: Room; userId: string } | { ok: false; error: string }) => void
  ) => void;

  'room:join': (
    payload: { roomCode: string; displayName: string },
    ack: (res: { ok: true; room: Room; userId: string } | { ok: false; error: string }) => void
  ) => void;

  /** Fetches current room + game state on demand, e.g. right after a client mounts the room page. */
  'room:sync': (
    payload: { roomCode: string; userId: string },
    ack: (res: { ok: true; room: Room; view: PlayerView | null } | { ok: false; error: string }) => void
  ) => void;

  'room:leave': (payload: { roomCode: string }) => void;

  'room:start': (payload: { roomCode: string }) => void;

  'night:action': (payload: { roomCode: string; targetId: string }) => void;

  'day:vote': (payload: { roomCode: string; targetId: string }) => void;

  'chat:message': (payload: { roomCode: string; text: string }) => void;
}

/** Events emitted by the server, handled by the client. */
export interface ServerToClientEvents {
  'room:updated': (room: Room) => void;
  'game:view': (view: PlayerView) => void;
  'chat:message': (msg: { fromUserId: string; displayName: string; text: string; timestamp: string }) => void;
  'error': (payload: { message: string }) => void;
}
