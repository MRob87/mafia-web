import type { GameInstance, NightAction, Phase, Room, Role } from '@mafia/shared';
import { NO_VOTE_TARGET } from '@mafia/shared';
import { assignRoles } from './roles.js';
import { nextPhase, isTimedPhase, phaseDurationMs } from './stateMachine.js';
import { resolveNightActions, resolveDayVote, checkWinCondition } from './actions.js';
import { assignSetting, narrateIntro, narrateEpilogue } from './narrator.js';

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
  const { villageName, characterTitles } = assignSetting(room.playerIds, room.theme);

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
    revealRolesOnDeath: room.revealRolesOnDeath,
    theme: room.theme,
    villageName,
    characterTitles,
    doctorLastTarget: {},
    lastEliminatedId: null,
  };

  game.eventLog.push({
    type: 'system',
    visibility: 'public',
    payload: { message: `The game begins in ${villageName}.`, narration: narrateIntro(room.theme, villageName) },
    timestamp: new Date().toISOString(),
    dayNumber: game.dayNumber,
  });

  games.set(room.roomCode, game);
  // Always open on day discussion — no one dies before anyone has spoken; the first death, if
  // any, comes from a day vote. The rest of the cycle is unchanged (elimination loops to night).
  transitionTo(game, 'day_discussion');
  return game;
}

/** Appends the closing story beat when a game ends — the moderator's last word over the village. */
function pushEpilogue(game: GameInstance, winner: 'mafia' | 'villagers'): void {
  game.eventLog.push({
    type: 'system',
    visibility: 'public',
    payload: {
      message: winner === 'villagers' ? 'The villagers win.' : 'The Mafia win.',
      narration: narrateEpilogue(game.theme, game.villageName, winner),
    },
    timestamp: new Date().toISOString(),
    dayNumber: game.dayNumber,
  });
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
      pushEpilogue(game, winner);
      transitionTo(game, 'game_over');
      onPhaseChange(roomCode);
      return;
    }
  }

  transitionTo(game, nextPhase(game.phase));
  onPhaseChange(roomCode);
}

/** Host action: pushes the current timed phase's deadline out by `extraMs` and reschedules its
 *  auto-advance timer to match. No-op error for phases that have no timer (lobby/role_assign/
 *  game_over). Caller is responsible for re-broadcasting views so clients see the new deadline. */
export function extendPhase(roomCode: string, extraMs: number): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  if (!isTimedPhase(game.phase) || !game.phaseEndsAt) return 'This phase has no timer to extend.';

  const newEndMs = new Date(game.phaseEndsAt).getTime() + extraMs;
  game.phaseEndsAt = new Date(newEndMs).toISOString();

  // Reschedule against the new deadline rather than adding a second timer.
  clearTimer(roomCode);
  const timer = setTimeout(() => advancePhase(roomCode), Math.max(0, newEndMs - Date.now()));
  timers.set(roomCode, timer);
  return null;
}

export function submitNightAction(roomCode: string, actorId: string, targetId: string): string | null {
  const game = games.get(roomCode);
  if (!game) return 'Game not found.';
  if (game.phase !== 'night') return 'Not the night phase.';

  const actor = game.players[actorId];
  if (!actor?.isAlive) return 'You are not able to act.';
  if (actor.role === 'villager') return 'Villagers have no night action.';
  // The Doctor may protect anyone (including themselves), but never the same player two nights
  // running — protecting yourself twice in a row is just targeting your own id twice, so this
  // one check covers both. game.doctorLastTarget holds only the previous night's picks (it's
  // rebuilt each night resolution), so skipping a night frees the constraint. Enforced here
  // server-side so a crafted night:action can't bypass the client disabling that target.
  if (actor.role === 'doctor' && game.doctorLastTarget[actorId] === targetId) {
    return targetId === actorId
      ? "You protected yourself last night — you can't do so two nights in a row."
      : "You protected this player last night — you can't do so two nights in a row.";
  }
  // A role never changes mid-game, so re-investigating the same player can never learn
  // anything new — mirrors the client hiding that option once it's already been used.
  if (
    actor.role === 'detective' &&
    game.investigationResults.some((r) => r.detectiveId === actorId && r.targetId === targetId)
  ) {
    return 'You already investigated this player.';
  }

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
  // A vote must be for the explicit "no lynch" option or a living player — never the dead or a
  // nonexistent id (which would silently sit in the tally and skew the majority math).
  if (targetId !== NO_VOTE_TARGET && !game.players[targetId]?.isAlive) {
    return "You can't vote for that player.";
  }

  // Clicking your current choice again retracts it (removing your vote can drop a target back
  // below majority); clicking a different one switches. This is how the glow reactively turns off.
  if (game.dayVotes[voterId] === targetId) {
    delete game.dayVotes[voterId];
  } else {
    game.dayVotes[voterId] = targetId;
  }
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
    pushEpilogue(game, winner);
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
