import { describe, it, expect } from 'vitest';
import type { ThemeId } from '@mafia/shared';
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

const THEMES: ThemeId[] = ['mafia', 'werewolf'];

describe('assignSetting', () => {
  it.each(THEMES)('assigns a %s village and a unique title to every player', (theme) => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const { villageName, characterTitles } = assignSetting(ids, theme);

    expect(villageName.length).toBeGreaterThan(0);
    expect(Object.keys(characterTitles).sort()).toEqual([...ids].sort());
    expect(new Set(Object.values(characterTitles)).size).toBe(12); // no shared titles
  });
});

describe('narration templates', () => {
  it.each(THEMES)('fills every placeholder and never leaks a {token} — %s', (theme) => {
    const village = assignSetting(['a'], theme).villageName;
    const samples = [
      narrateIntro(theme, village),
      narrateNightKill(theme, village, 'the Baker'),
      narratePeacefulNight(theme, village),
      narrateLynch(village, 'the Priest'),
      narrateNoMajority(village),
      narrateNoVotes(theme, village),
      narrateNoLynch(village),
      narrateEpilogue(theme, village, 'villagers'),
      narrateEpilogue(theme, village, 'mafia'),
    ];
    for (const line of samples) {
      expect(line).not.toMatch(/\{.*?\}/);
      expect(line).toContain(village);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('names the right predator per theme and never the wrong one', () => {
    // Both mafia-win variants name the predator; run enough to cover the random pick.
    for (let i = 0; i < 30; i++) {
      const mafia = narrateEpilogue('mafia', 'Testburg', 'mafia');
      expect(mafia).toContain('the Mafia');
      expect(mafia).not.toContain('Werewolves');

      const werewolf = narrateEpilogue('werewolf', 'Testburg', 'mafia');
      expect(werewolf).toContain('the Werewolves');
      expect(werewolf).not.toContain('the Mafia');
    }
  });

  it('handles a missing victim title without leaving a hole', () => {
    const line = narrateNightKill('werewolf', 'Nightwood', '');
    expect(line).not.toMatch(/\{.*?\}/);
    expect(line).toContain('Nightwood');
  });
});
