import type { GameInstance, NightAction, Phase, Room, Role } from '@mafia/shared';
import { assignRoles } from './roles.js';
import { nextPhase, isTimedPhase, phaseDurationMs } from './stateMachine.js';
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
  const game = games.get(roomCode);
  if (!game) return;
  const timer = setTimeout(() => advancePhase(roomCode), phaseDurationMs(phase, game));
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
    nightDurationMs: room.nightDurationSeconds * 1000,
    lastEliminatedId: null,
  };

  games.set(room.roomCode, game);
  transitionTo(game, 'night');
  return game;
}

function transitionTo(game: GameInstance, phase: Phase): void {
  game.phase = phase;
  game.phaseEndsAt = isTimedPhase(phase)
    ? new Date(Date.now() + phaseDurationMs(phase, game)).toISOString()
    : null;
  scheduleNextPhase(game.roomCode, phase);
}

/** Advances the state machine one step. Resolves the phase being left, checks for a winner, then moves on. */
export function advancePhase(roomCode: string): void {
  const game = games.get(roomCode);
  if (!game || game.phase === 'game_over') return;

  if (game.phase === 'night') {
    resolveNightActions(game);
  } else if (game.phase === 'day_voting') {
    resolveDayVote(game);
  }

  // Only declare a winner once this cycle's recap beat has actually played out —
  // night_resolution after a night kill, elimination after a day vote. Checking right after
  // resolving the kill/vote itself used to let a decisive elimination skip straight to Game
  // Over, denying everyone the recap and denying that player's last-words window entirely.
  if (game.phase === 'night_resolution' || game.phase === 'elimination') {
    const winner = checkWinCondition(game);
    if (winner) {
      game.winner = winner;
      transitionTo(game, 'game_over');
      onPhaseChange(roomCode);
      return;
    }
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

export function submitLastWords(roomCode: string, userId: string, text: string): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  if (game.phase !== 'elimination') return 'Not the right moment for last words.';
  if (game.lastEliminatedId !== userId) return 'Only the player who was just eliminated can speak here.';

  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return 'Say something first.';

  game.eventLog.push({
    type: 'last_words',
    visibility: 'public',
    payload: { actorId: userId, text: trimmed },
    timestamp: new Date().toISOString(),
    dayNumber: game.dayNumber,
  });
  return null;
}

/** Host removal mid-game: eliminates the player (their role/history stays intact for
 *  win-condition purposes) rather than deleting them outright. Re-checks the win condition,
 *  since removing a Mafia member (or the last non-Mafia player) can end the game immediately. */
export function kickPlayer(roomCode: string, userId: string): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  const player = game.players[userId];
  if (!player) return 'Player not found in this game.';
  if (!player.isAlive) return null;

  player.isAlive = false;
  game.eventLog.push({
    type: 'kicked',
    visibility: 'public',
    payload: { actorId: userId },
    timestamp: new Date().toISOString(),
    dayNumber: game.dayNumber,
  });

  const winner = checkWinCondition(game);
  if (winner) {
    game.winner = winner;
    transitionTo(game, 'game_over');
  }
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
