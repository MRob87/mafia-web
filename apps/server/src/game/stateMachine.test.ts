import { describe, it, expect } from 'vitest';
import type { GameInstance } from '@mafia/shared';
import { nextPhase, isTimedPhase, phaseDurationMs, PHASE_DURATIONS_MS } from './stateMachine.js';

function makeGame(overrides: Partial<GameInstance> = {}): GameInstance {
  return {
    roomCode: 'TEST',
    phase: 'night',
    phaseEndsAt: null,
    dayNumber: 1,
    players: {},
    nightActions: [],
    dayVotes: {},
    eventLog: [],
    investigationResults: [],
    winner: null,
    nightDurationMs: 30_000,
    revealRolesOnDeath: false,
    startOnDay: false,
    doctorLastTarget: {},
    lastEliminatedId: null,
    ...overrides,
  };
}

describe('nextPhase', () => {
  it('walks the full day/night cycle in order', () => {
    expect(nextPhase('night')).toBe('night_resolution');
    expect(nextPhase('night_resolution')).toBe('day_discussion');
    expect(nextPhase('day_discussion')).toBe('day_voting');
    expect(nextPhase('day_voting')).toBe('elimination');
  });

  it('loops from elimination back to night, never freezing the cycle', () => {
    // Regression: the historic bug left `elimination` with no PHASE_ORDER entry, which meant
    // the state machine simply stopped advancing after the first full day/night cycle.
    expect(nextPhase('elimination')).toBe('night');
  });

  it('sends lobby and role_assign into night', () => {
    expect(nextPhase('lobby')).toBe('night');
    expect(nextPhase('role_assign')).toBe('night');
  });

  it('falls back to night for an unrecognized phase', () => {
    expect(nextPhase('game_over')).toBe('night');
  });
});

describe('isTimedPhase', () => {
  it('is true for every phase with a configured duration', () => {
    expect(isTimedPhase('night')).toBe(true);
    expect(isTimedPhase('night_resolution')).toBe(true);
    expect(isTimedPhase('day_discussion')).toBe(true);
    expect(isTimedPhase('day_voting')).toBe(true);
    expect(isTimedPhase('elimination')).toBe(true);
  });

  it('is false for untimed phases', () => {
    expect(isTimedPhase('lobby')).toBe(false);
    expect(isTimedPhase('role_assign')).toBe(false);
    expect(isTimedPhase('game_over')).toBe(false);
  });
});

describe('phaseDurationMs', () => {
  it('honors the per-game nightDurationMs override for the night phase', () => {
    const game = makeGame({ nightDurationMs: 45_000 });
    expect(phaseDurationMs('night', game)).toBe(45_000);
  });

  it('falls back to the default night duration when nightDurationMs is falsy', () => {
    const game = makeGame({ nightDurationMs: 0 });
    expect(phaseDurationMs('night', game)).toBe(PHASE_DURATIONS_MS.night);
  });

  it('uses the fixed table for non-night timed phases regardless of nightDurationMs', () => {
    const game = makeGame({ nightDurationMs: 999_999 });
    expect(phaseDurationMs('day_voting', game)).toBe(PHASE_DURATIONS_MS.day_voting);
    expect(phaseDurationMs('elimination', game)).toBe(PHASE_DURATIONS_MS.elimination);
  });
});
