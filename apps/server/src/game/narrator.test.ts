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

const THEMES: ThemeId[] = ['mafia', 'werewolf', 'space'];

describe('assignSetting', () => {
  it.each(THEMES)('assigns a %s setting and a unique title to every player', (theme) => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const { villageName, characterTitles } = assignSetting(ids, theme);

    expect(villageName.length).toBeGreaterThan(0);
    expect(Object.keys(characterTitles).sort()).toEqual([...ids].sort());
    expect(new Set(Object.values(characterTitles)).size).toBe(12); // no shared titles
  });
});

describe('narration templates', () => {
  it.each(THEMES)('fills every placeholder and never leaks a {token} — %s', (theme) => {
    const setting = assignSetting(['a'], theme).villageName;
    const samples = [
      narrateIntro(theme, setting),
      narrateNightKill(theme, setting, 'the Baker'),
      narratePeacefulNight(theme, setting),
      narrateLynch(theme, setting, 'the Priest'),
      narrateNoMajority(theme, setting),
      narrateNoVotes(theme, setting),
      narrateNoLynch(theme, setting),
      narrateEpilogue(theme, setting, 'villagers'),
      narrateEpilogue(theme, setting, 'mafia'),
    ];
    for (const line of samples) {
      expect(line).not.toMatch(/\{.*?\}/);
      expect(line).toContain(setting);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('names the right predator per theme and never the wrong one', () => {
    // Both predator-win epilogue variants name the predator; loop to cover the random pick.
    for (let i = 0; i < 30; i++) {
      const mafia = narrateEpilogue('mafia', 'Testburg', 'mafia');
      expect(mafia).toContain('the Mafia');

      const werewolf = narrateEpilogue('werewolf', 'Testburg', 'mafia');
      expect(werewolf).toContain('the Werewolves');
      expect(werewolf).not.toContain('the Mafia');

      const space = narrateEpilogue('space', 'Station Test', 'mafia');
      expect(space).toContain('the Saboteurs');
      expect(space).not.toContain('the Mafia');
      expect(space).not.toContain('Werewolves');
    }
  });

  it('handles a missing victim title without leaving a hole', () => {
    for (const theme of THEMES) {
      const line = narrateNightKill(theme, 'Testplace', '');
      expect(line).not.toMatch(/\{.*?\}/);
      expect(line).toContain('Testplace');
    }
  });
});
