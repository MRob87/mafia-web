// Classic 4 role set for MVP. Extend this union in Phase 2 (Jester, Vigilante, Mayor, ...).
export type Role = 'villager' | 'mafia' | 'doctor' | 'detective';

export type Phase =
  | 'lobby'
  | 'role_assign'
  | 'night'
  | 'night_resolution'
  | 'day_discussion'
  | 'day_voting'
  | 'elimination'
  | 'game_over';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface User {
  id: string;
  displayName: string;
  connectionStatus: ConnectionStatus;
  createdAt: string;
}

export interface RoleConfig {
  mafia: number;
  doctor: number;
  detective: number;
  villager: number;
}

export type RoomStatus = 'lobby' | 'in_progress' | 'completed';

export interface Room {
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  minPlayers: number;
  status: RoomStatus;
  roleConfig: RoleConfig;
  playerIds: string[];
  /** Display names for playerIds, kept in the same order. Lets clients render names instead of raw ids. */
  players: Array<{ userId: string; displayName: string }>;
  /** How long the night phase lasts once the game starts. Set at room creation; default 30. */
  nightDurationSeconds: number;
  /** Host option: when true, an eliminated player's role is revealed to everyone the moment
   *  they die (classic tabletop "flip the card"). When false (default), roles stay hidden until
   *  the game ends. Set at room creation; locked into the GameInstance when the game starts. */
  revealRolesOnDeath: boolean;
  createdAt: string;
}

export interface PlayerGameState {
  userId: string;
  role: Role;
  isAlive: boolean;
  isConnected: boolean;
}

export interface NightAction {
  actorId: string;
  role: Role;
  targetId: string;
  submittedAt: string;
}

export type GameEventType = 'death' | 'vote' | 'phase_change' | 'accusation' | 'system' | 'last_words' | 'kicked';

/** 'public' = visible to everyone; a Role[] restricts visibility to those roles only. */
export type EventVisibility = 'public' | Role[];

export interface GameEvent {
  type: GameEventType;
  visibility: EventVisibility;
  payload: Record<string, unknown>;
  timestamp: string;
  /** The GameInstance.dayNumber this happened under — lets clients group the timeline by round. */
  dayNumber: number;
}

export interface InvestigationResult {
  detectiveId: string;
  targetId: string;
  isMafia: boolean;
  dayNumber: number;
}

export interface GameInstance {
  roomCode: string;
  phase: Phase;
  phaseEndsAt: string | null;
  dayNumber: number;
  players: Record<string, PlayerGameState>;
  nightActions: NightAction[];
  dayVotes: Record<string, string>;
  eventLog: GameEvent[];
  investigationResults: InvestigationResult[];
  winner: 'mafia' | 'villagers' | null;
  /** Locked in from Room.nightDurationSeconds when the game starts. */
  nightDurationMs: number;
  /** Locked in from Room.revealRolesOnDeath when the game starts — see that field. */
  revealRolesOnDeath: boolean;
  /** Each Doctor's target from the immediately preceding night (doctorId -> targetId), used to
   *  enforce the always-on "no protecting the same player two nights in a row" rule (self counts,
   *  since protecting yourself is just targeting your own id). Rebuilt every night resolution
   *  from that night's doctor actions, so skipping a night clears a doctor's constraint. */
  doctorLastTarget: Record<string, string>;
  /** Who the most recent day vote eliminated, if anyone — they get a last-words window. */
  lastEliminatedId: string | null;
}

/**
 * Per-player filtered view sent to each client. Never send the raw GameInstance —
 * it contains every player's role and every private night action.
 */
export interface PlayerView {
  roomCode: string;
  phase: Phase;
  phaseEndsAt: string | null;
  dayNumber: number;
  self: {
    userId: string;
    role: Role;
    isAlive: boolean;
  };
  players: Array<{
    userId: string;
    displayName: string;
    isAlive: boolean;
    isConnected: boolean;
    /** Only populated when `self` shares a reveal condition with this player (e.g. fellow Mafia). */
    revealedRole: Role | null;
  }>;
  visibleEvents: GameEvent[];
  /** Present only for Detective after an investigation resolves. */
  lastInvestigationResult: { targetId: string; isMafia: boolean } | null;
  /** Every player this Detective has ever investigated, across the whole game — lets the
   *  client stop them from re-investigating someone whose role can't have changed. Empty for
   *  every other role. */
  investigationHistory: Array<{ targetId: string; isMafia: boolean }>;
  winner: 'mafia' | 'villagers' | null;
  /** Who the most recent day vote eliminated, if anyone — drives the last-words prompt. */
  lastEliminatedId: string | null;
  /** For a Doctor viewer only: the player they protected last night, if any — the client uses
   *  it to disable re-selecting that target (they can't protect the same person, or themselves,
   *  two nights running). null for every other role and on the first night. */
  doctorLastProtectedId: string | null;
}
