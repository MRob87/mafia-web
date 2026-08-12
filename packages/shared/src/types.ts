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

export type GameEventType = 'death' | 'vote' | 'phase_change' | 'accusation' | 'system';

/** 'public' = visible to everyone; a Role[] restricts visibility to those roles only. */
export type EventVisibility = 'public' | Role[];

export interface GameEvent {
  type: GameEventType;
  visibility: EventVisibility;
  payload: Record<string, unknown>;
  timestamp: string;
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
  winner: 'mafia' | 'villagers' | null;
}
