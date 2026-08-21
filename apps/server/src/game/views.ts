import type { GameEvent, GameInstance, PlayerView, Role } from '@mafia/shared';
import { getUser } from '../rooms/roomManager.js';

function isVisibleTo(event: GameEvent, viewerRole: Role): boolean {
  if (event.visibility === 'public') return true;
  return event.visibility.includes(viewerRole);
}

/** Decides whether `viewerRole` may see `targetRole`, given game state.
 *  - Game over: every role is revealed to everyone (the curtain call).
 *  - Fellow Mafia always see each other's identity.
 *  - If the room enabled reveal-on-death, a dead player's role is exposed to everyone the
 *    moment they die (classic tabletop "flip the card").
 *  - Otherwise every role stays hidden, even for the dead, so the town can't confirm reads. */
function revealRoleFor(
  viewerRole: Role,
  targetRole: Role,
  gameOver: boolean,
  revealRolesOnDeath: boolean,
  targetIsAlive: boolean
): Role | null {
  if (gameOver) return targetRole;
  if (viewerRole === 'mafia' && targetRole === 'mafia') return 'mafia';
  if (revealRolesOnDeath && !targetIsAlive) return targetRole;
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
      revealedRole: revealRoleFor(
        self.role,
        p.role,
        game.winner !== null,
        game.revealRolesOnDeath,
        p.isAlive
      ),
    })),
    visibleEvents: game.eventLog.filter((e) => isVisibleTo(e, self.role)),
    lastInvestigationResult: lastInvestigation
      ? { targetId: lastInvestigation.targetId, isMafia: lastInvestigation.isMafia }
      : null,
    investigationHistory: ownInvestigations.map((r) => ({ targetId: r.targetId, isMafia: r.isMafia })),
    winner: game.winner,
    lastEliminatedId: game.lastEliminatedId,
    doctorNoSelfSave: game.doctorNoSelfSave,
  };
}
