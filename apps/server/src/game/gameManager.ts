import type { GameInstance, NightAction, Phase, Room, Role } from '@mafia/shared';
import { assignRoles } from './roles.js';
import { nextPhase, isTimedPhase, PHASE_DURATIONS_MS } from './stateMachine.js';
import { resolveNightActions, resolveDayVote, checkWinCondition } from './actions.js';

const games = new Map<string, GameInstance>();
const timers = new Map<string, NodeJS.Timeout>();

export type PhaseChangeListener = (roomCode: string) => void;
let onPhaseChange: PhaseChangeListener = () => {};
export function setPhaseChangeListener(listener: PhaseChangeListener): void {
  onPhaseChange = listener;
}

export function getGame(roomCode: string): GameInstance | undefined {
  return games.get(roomCode);
}

function scheduleNextPhase(roomCode: string, phase: Phase): void {
  clearTimer(roomCode);
  if (!isTimedPhase(phase)) return;
  const duration = PHASE_DURATIONS_MS[phase]!;
  const timer = setTimeout(() => advancePhase(roomCode), duration);
  timers.set(roomCode, timer);
}

function clearTimer(roomCode: string): void {
  const existing = timers.get(roomCode);
  if (existing) clearTimeout(existing);
  timers.delete(roomCode);
}

export function startGame(room: Room): GameInstance {
  const roleAssignment: Record<string, Role> = assignRoles(room.playerIds, room.roleConfig);

  const game: GameInstance = {
    roomCode: room.roomCode,
    phase: 'role_assign',
    phaseEndsAt: null,
    dayNumber: 1,
    players: Object.fromEntries(
      room.playerIds.map((id) => [
        id,
        { userId: id, role: roleAssignment[id], isAlive: true, isConnected: true },
      ])
    ),
    nightActions: [],
    dayVotes: {},
    eventLog: [],
    investigationResults: [],
    winner: null,
  };

  games.set(room.roomCode, game);
  transitionTo(game, 'night');
  return game;
}

function transitionTo(game: GameInstance, phase: Phase): void {
  game.phase = phase;
  game.phaseEndsAt = isTimedPhase(phase)
    ? new Date(Date.now() + PHASE_DURATIONS_MS[phase]!).toISOString()
    : null;
  scheduleNextPhase(game.roomCode, phase);
}

/** Advances the state machine one step. Resolves the phase being left, checks for a winner, then moves on. */
export function advancePhase(roomCode: string): void {
  const game = games.get(roomCode);
  if (!game) return;

  if (game.phase === 'night') {
    resolveNightActions(game);
  } else if (game.phase === 'day_voting') {
    resolveDayVote(game);
  }

  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    transitionTo(game, 'game_over');
    onPhaseChange(roomCode);
    return;
  }

  transitionTo(game, nextPhase(game.phase));
  onPhaseChange(roomCode);
}

export function submitNightAction(roomCode: string, actorId: string, targetId: string): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  if (game.phase !== 'night') return 'Not the night phase.';

  const actor = game.players[actorId];
  if (!actor?.isAlive) return 'You are not able to act.';
  if (actor.role === 'villager') return 'Villagers have no night action.';

  const action: NightAction = { actorId, role: actor.role, targetId, submittedAt: new Date().toISOString() };
  game.nightActions = game.nightActions.filter((a) => a.actorId !== actorId);
  game.nightActions.push(action);
  return null;
}

export function submitDayVote(roomCode: string, voterId: string, targetId: string): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  if (game.phase !== 'day_voting') return 'Not the voting phase.';
  if (!game.players[voterId]?.isAlive) return 'Dead players cannot vote.';

  game.dayVotes[voterId] = targetId;
  return null;
}

export function setPlayerConnected(roomCode: string, userId: string, connected: boolean): void {
  const game = games.get(roomCode);
  const player = game?.players[userId];
  if (player) player.isConnected = connected;
}

export function endGame(roomCode: string): void {
  clearTimer(roomCode);
  games.delete(roomCode);
}
