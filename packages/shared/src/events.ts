import type { PlayerView, Room, RoleConfig } from './types.js';

/** Events emitted by the client, handled by the server. */
export interface ClientToServerEvents {
  'room:create': (
    payload: {
      displayName: string;
      roleConfig?: Partial<RoleConfig>;
      nightDurationSeconds?: number;
      revealRolesOnDeath?: boolean;
      doctorNoSelfSave?: boolean;
    },
    ack: (
      res: { ok: true; room: Room; userId: string; sessionToken: string } | { ok: false; error: string }
    ) => void
  ) => void;

  'room:join': (
    payload: { roomCode: string; displayName: string },
    ack: (
      res: { ok: true; room: Room; userId: string; sessionToken: string } | { ok: false; error: string }
    ) => void
  ) => void;

  /** Fetches current room + game state on demand, e.g. right after a client mounts the room page.
   *  sessionToken proves ownership of userId — without it, anyone who merely saw your userId in the
   *  room roster or a chat message could otherwise reclaim your seat. */
  'room:sync': (
    payload: { roomCode: string; userId: string; sessionToken: string },
    ack: (res: { ok: true; room: Room; view: PlayerView | null } | { ok: false; error: string }) => void
  ) => void;

  'room:leave': (payload: { roomCode: string }) => void;

  'room:start': (payload: { roomCode: string }) => void;

  /** Host only: forces the current phase to end immediately. */
  'room:skipPhase': (payload: { roomCode: string }) => void;

  /** Host only: removes a player from the lobby, or eliminates them if a game is running. */
  'room:kick': (payload: { roomCode: string; targetUserId: string }) => void;

  /** Host only: ends the current game (if any) and returns the room to the lobby. */
  'room:restart': (payload: { roomCode: string }) => void;

  'night:action': (payload: { roomCode: string; targetId: string }) => void;

  'day:vote': (payload: { roomCode: string; targetId: string }) => void;

  /** Only accepted from the player named in PlayerView.lastEliminatedId, during 'elimination'. */
  'game:lastWords': (payload: { roomCode: string; text: string }) => void;

  'chat:message': (payload: { roomCode: string; text: string }) => void;

  /** Mafia-only private chat, mirrored to a private socket room no one else can join. */
  'mafia:chat': (payload: { roomCode: string; text: string }) => void;
}

/** Events emitted by the server, handled by the client. */
export interface ServerToClientEvents {
  'room:updated': (room: Room) => void;
  'game:view': (view: PlayerView) => void;
  /** Sent to a kicked player's socket only, right before it's removed from the room. */
  'room:kicked': () => void;
  'chat:message': (msg: { fromUserId: string; displayName: string; text: string; timestamp: string }) => void;
  'mafia:chat': (msg: { fromUserId: string; displayName: string; text: string; timestamp: string }) => void;
  /** Mafia-only: teammates' current night target picks, live — resets at the start of each night. */
  'game:mafiaNightStatus': (status: {
    targets: Array<{ actorId: string; actorDisplayName: string; targetId: string; targetDisplayName: string }>;
  }) => void;
  'error': (payload: { message: string }) => void;
}
