import type { GameEvent, GameInstance } from '@mafia/shared';

function nowIso(): string {
  return new Date().toISOString();
}

/** Picks the target with the most votes among a set of (actorId -> targetId) actions. Ties resolve to no-op. */
function pluralityTarget(targets: string[]): string | null {
  if (targets.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  let winner: string | null = null;
  let max = 0;
  let tied = false;
  for (const [target, count] of counts) {
    if (count > max) {
      max = count;
      winner = target;
      tied = false;
    } else if (count === max) {
      tied = true;
    }
  }
  return tied ? null : winner;
}

export function resolveNightActions(game: GameInstance): void {
  const mafiaTargets = game.nightActions.filter((a) => a.role === 'mafia').map((a) => a.targetId);
  const doctorSaves = game.nightActions.filter((a) => a.role === 'doctor').map((a) => a.targetId);
  const detectiveChecks = game.nightActions.filter((a) => a.role === 'detective');

  const killTarget = pluralityTarget(mafiaTargets);
  const saved = new Set(doctorSaves);

  if (killTarget && !saved.has(killTarget) && game.players[killTarget]?.isAlive) {
    game.players[killTarget].isAlive = false;
    const event: GameEvent = {
      type: 'death',
      visibility: 'public',
      payload: { targetId: killTarget, cause: 'mafia' },
      timestamp: nowIso(),
    };
    game.eventLog.push(event);
  } else {
    game.eventLog.push({
      type: 'system',
      visibility: 'public',
      payload: { message: 'No one died during the night.' },
      timestamp: nowIso(),
    });
  }

  for (const check of detectiveChecks) {
    const target = game.players[check.targetId];
    if (!target) continue;
    game.investigationResults.push({
      detectiveId: check.actorId,
      targetId: check.targetId,
      isMafia: target.role === 'mafia',
      dayNumber: game.dayNumber,
    });
  }

  game.nightActions = [];
}

export function resolveDayVote(game: GameInstance): void {
  const votes = Object.values(game.dayVotes);
  const eliminated = pluralityTarget(votes);

  if (eliminated && game.players[eliminated]?.isAlive) {
    game.players[eliminated].isAlive = false;
    game.lastEliminatedId = eliminated;
    const event: GameEvent = {
      type: 'death',
      visibility: 'public',
      payload: { targetId: eliminated, cause: 'vote' },
      timestamp: nowIso(),
    };
    game.eventLog.push(event);
  } else {
    game.lastEliminatedId = null;
    game.eventLog.push({
      type: 'system',
      visibility: 'public',
      payload: {
        message: votes.length === 0 ? 'No votes were cast.' : 'The vote was tied — no one was eliminated.',
      },
      timestamp: nowIso(),
    });
  }

  game.dayVotes = {};
  game.dayNumber += 1;
}

export function checkWinCondition(game: GameInstance): 'mafia' | 'villagers' | null {
  const alive = Object.values(game.players).filter((p) => p.isAlive);
  const aliveMafia = alive.filter((p) => p.role === 'mafia').length;
  const aliveOthers = alive.length - aliveMafia;

  if (aliveMafia === 0) return 'villagers';
  if (aliveMafia >= aliveOthers) return 'mafia';
  return null;
}
