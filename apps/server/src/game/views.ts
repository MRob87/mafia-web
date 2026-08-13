import type { GameEvent, GameInstance, PlayerView, Role } from '@mafia/shared';
import { getUser } from '../rooms/roomManager.js';

function isVisibleTo(event: GameEvent, viewerRole: Role): boolean {
  if (event.visibility === 'public') return true;
  return event.visibility.includes(viewerRole);
}

/** Fellow Mafia see each other's identity; every other role only sees public info. */
function revealRoleFor(viewerRole: Role, targetRole: Role): Role | null {
  if (viewerRole === 'mafia' && targetRole === 'mafia') return 'mafia';
  return null;
}

export function buildPlayerView(game: GameInstance, userId: string): PlayerView {
  const self = game.players[userId];
  if (!self) {
    throw new Error(`buildPlayerView: user ${userId} is not part of game ${game.roomCode}`);
  }

  const ownInvestigations = game.investigationResults.filter((r) => r.detectiveId === userId);
  const lastInvestigation = ownInvestigations[ownInvestigations.length - 1];

  return {
    roomCode: game.roomCode,
    phase: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    dayNumber: game.dayNumber,
    self: { userId, role: self.role, isAlive: self.isAlive },
    players: Object.values(game.players).map((p) => ({
      userId: p.userId,
      displayName: getUser(p.userId)?.displayName ?? 'Unknown',
      isAlive: p.isAlive,
      isConnected: p.isConnected,
      revealedRole: revealRoleFor(self.role, p.role),
    })),
    visibleEvents: game.eventLog.filter((e) => isVisibleTo(e, self.role)),
    lastInvestigationResult: lastInvestigation
      ? { targetId: lastInvestigation.targetId, isMafia: lastInvestigation.isMafia }
      : null,
    investigationHistory: ownInvestigations.map((r) => ({ targetId: r.targetId, isMafia: r.isMafia })),
    winner: game.winner,
    lastEliminatedId: game.lastEliminatedId,
  };
}
