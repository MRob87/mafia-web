import type { GameEvent, GameInstance } from '@mafia/shared';
import { NO_VOTE_TARGET } from '@mafia/shared';

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
  const doctorActions = game.nightActions.filter((a) => a.role === 'doctor');
  const doctorSaves = doctorActions.map((a) => a.targetId);
  const detectiveChecks = game.nightActions.filter((a) => a.role === 'detective');

  // Record this night's doctor picks so next night's submitNightAction can block a repeat.
  // Rebuilt fresh (not merged) so a doctor who sat out this night starts next night unconstrained.
  game.doctorLastTarget = {};
  for (const a of doctorActions) game.doctorLastTarget[a.actorId] = a.targetId;

  const killTarget = pluralityTarget(mafiaTargets);
  const saved = new Set(doctorSaves);

  if (killTarget && !saved.has(killTarget) && game.players[killTarget]?.isAlive) {
    game.players[killTarget].isAlive = false;
    const event: GameEvent = {
      type: 'death',
      visibility: 'public',
      payload: { targetId: killTarget, cause: 'mafia' },
      timestamp: nowIso(),
      dayNumber: game.dayNumber,
    };
    game.eventLog.push(event);
  } else {
    game.eventLog.push({
      type: 'system',
      visibility: 'public',
      payload: { message: 'No one died during the night.' },
      timestamp: nowIso(),
      dayNumber: game.dayNumber,
    });

    // The public message above is deliberately vague — but leaving Mafia with zero insight
    // into why their own pick didn't land is indistinguishable from a bug. Doesn't reveal
    // *who* protected the target, just that a save (vs. a vote split) is what happened.
    if (mafiaTargets.length > 0) {
      game.eventLog.push({
        type: 'system',
        visibility: ['mafia'],
        payload: {
          message:
            killTarget && saved.has(killTarget)
              ? 'Your target was protected and survived the night.'
              : "Your group didn't agree on a target, so no one was killed.",
        },
        timestamp: nowIso(),
        dayNumber: game.dayNumber,
      });
    }
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
  const counts = new Map<string, number>();
  for (const target of votes) counts.set(target, (counts.get(target) ?? 0) + 1);

  // Majority-required lynch: a living player is eliminated only if STRICTLY MORE THAN HALF of the
  // living voted for them (floor(alive/2)+1). Because that threshold is a true majority, at most
  // one target can ever reach it, so there's never ambiguity or a tie to break. A tie, a mere
  // plurality that falls short, an empty vote, or the "no lynch" option reaching majority all mean
  // no one dies. (The Mafia's night kill stays plurality — that's a separate resolution.)
  const aliveCount = Object.values(game.players).filter((p) => p.isAlive).length;
  const majority = Math.floor(aliveCount / 2) + 1;

  let eliminated: string | null = null;
  for (const [target, count] of counts) {
    if (target !== NO_VOTE_TARGET && count >= majority && game.players[target]?.isAlive) {
      eliminated = target;
      break;
    }
  }

  if (eliminated) {
    game.players[eliminated].isAlive = false;
    game.lastEliminatedId = eliminated;
    const event: GameEvent = {
      type: 'death',
      visibility: 'public',
      payload: { targetId: eliminated, cause: 'vote' },
      timestamp: nowIso(),
      dayNumber: game.dayNumber,
    };
    game.eventLog.push(event);
  } else {
    game.lastEliminatedId = null;
    const noVoteReachedMajority = (counts.get(NO_VOTE_TARGET) ?? 0) >= majority;
    const message =
      votes.length === 0
        ? 'No votes were cast.'
        : noVoteReachedMajority
          ? 'The town voted not to eliminate anyone.'
          : 'No majority was reached — no one was eliminated.';
    game.eventLog.push({
      type: 'system',
      visibility: 'public',
      payload: { message },
      timestamp: nowIso(),
      dayNumber: game.dayNumber,
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
