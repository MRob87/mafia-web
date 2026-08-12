import type { Phase } from '@mafia/shared';

// Tunable durations. Kept short for dev/smoke-testing; raise for real play.
export const PHASE_DURATIONS_MS: Partial<Record<Phase, number>> = {
  night: 20_000,
  day_discussion: 60_000,
  day_voting: 30_000,
};

const PHASE_ORDER: Phase[] = [
  'night',
  'night_resolution',
  'day_discussion',
  'day_voting',
  'elimination',
];

/**
 * night_resolution and elimination are instantaneous server computations, not
 * timed phases — advancePhase resolves them and moves straight through.
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
