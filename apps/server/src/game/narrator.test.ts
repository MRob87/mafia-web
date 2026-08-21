import { describe, it, expect } from 'vitest';
import {
  assignSetting,
  narrateIntro,
  narrateNightKill,
  narratePeacefulNight,
  narrateLynch,
  narrateNoMajority,
  narrateNoVotes,
  narrateNoLynch,
  narrateEpilogue,
} from './narrator.js';

describe('assignSetting', () => {
  it('assigns a village name and a unique title to every player in a full room', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const { villageName, characterTitles } = assignSetting(ids);

    expect(villageName.length).toBeGreaterThan(0);
    expect(Object.keys(characterTitles).sort()).toEqual([...ids].sort());
    const titles = Object.values(characterTitles);
    expect(new Set(titles).size).toBe(12); // no two players share a title
  });
});

describe('narration templates', () => {
  const village = 'Ravenhollow';
  const samples = [
    narrateIntro(village, 1),
    narrateIntro(village, 3),
    narrateNightKill(village, 'the Baker'),
    narratePeacefulNight(village),
    narrateLynch(village, 'the Priest'),
    narrateNoMajority(village),
    narrateNoVotes(village),
    narrateNoLynch(village),
    narrateEpilogue(village, 'villagers'),
    narrateEpilogue(village, 'mafia'),
  ];

  it('fills every placeholder (no leftover {tokens}) and names the village', () => {
    for (const line of samples) {
      expect(line).not.toMatch(/\{.*?\}/);
      expect(line).toContain(village);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('handles a missing victim title without leaving a hole', () => {
    const line = narrateNightKill(village, '');
    expect(line).not.toMatch(/\{.*?\}/);
    expect(line).toContain(village);
  });
});
