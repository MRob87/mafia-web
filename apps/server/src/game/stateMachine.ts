import type { GameInstance, Phase } from '@mafia/shared';

export const DEFAULT_NIGHT_DURATION_MS = 30_000;

// Tunable durations. Kept short for dev/smoke-testing; raise for real play. `night` here is
// only the fallback default — the actual value used per game is GameInstance.nightDurationMs,
// set at room creation (see phaseDurationMs below).
export const PHASE_DURATIONS_MS: Partial<Record<Phase, number>> = {
  night: DEFAULT_NIGHT_DURATION_MS,
  // Long enough for the elimination reveal animation to actually play out, not just flash by.
  night_resolution: 7_000,
  day_discussion: 60_000,
  day_voting: 30_000,
  // Long enough to also cover last-words: an eliminated player gets this whole window to type.
  elimination: 12_000,
};

/** Resolves the actual duration for a timed phase, honoring the per-game night override. */
export function phaseDurationMs(phase: Phase, game: GameInstance): number {
  if (phase === 'night' && game.nightDurationMs) return game.nightDurationMs;
  return PHASE_DURATIONS_MS[phase]!;
}

const PHASE_ORDER: Phase[] = [
  'night',
  'night_resolution',
  'day_discussion',
  'day_voting',
  'elimination',
];

/**
 * night_resolution and elimination carry no extra computation of their own (that already
 * happened when leaving night/day_voting) — they're brief timed phases that exist so
 * clients have a beat to show what just happened before the cycle continues.
 */
export function nextPhase(current: Phase): Phase {
  if (current === 'lobby' || current === 'role_assign') return 'night';
  if (current === 'elimination') return 'night'; // loop back for the next day/night cycle
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return 'night';
  return PHASE_ORDER[idx + 1];
}

export function isTimedPhase(phase: Phase): boolean {
  return phase in PHASE_DURATIONS_MS;
}
