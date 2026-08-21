/**
 * Local, self-contained flavor text — no external calls, no LLM. Turns the game's mechanical
 * events into a little story: a themed village, a character title per player, and atmospheric
 * narration for each beat (a night kill, a quiet night, a lynch, the opening, the end).
 *
 * This is the "moderator voice" the automated narrator was missing, done entirely offline. All
 * of it is additive: the mechanical GameEvent.message stays untouched (logic + tests rely on it);
 * these strings ride alongside as an optional `narration` the client prefers when present.
 */

const VILLAGE_NAMES = [
  'Ravenhollow',
  'Blackmoor',
  'Ashford',
  'Grimwald',
  'Duskwood',
  'Thornfield',
  'Mistvale',
  'Hollowbrook',
  'Crowsreach',
  'Fenwick',
  'Marrowgate',
  'Gallowsend',
];

// At least one per seat in a full 12-player room, so titles never need to repeat.
const CHARACTER_TITLES = [
  'the Baker',
  'the Blacksmith',
  'the Innkeeper',
  'the Priest',
  'the Farmer',
  'the Merchant',
  'the Hunter',
  'the Miller',
  'the Tailor',
  'the Physician',
  'the Fisherman',
  'the Gravedigger',
  'the Barkeep',
  'the Cobbler',
  'the Weaver',
  'the Butcher',
];

const FALLBACK_TITLE = 'one of the townsfolk';

function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

/** Picks a village name and assigns each player a unique character title, in random order. */
export function assignSetting(playerIds: string[]): {
  villageName: string;
  characterTitles: Record<string, string>;
} {
  const villageName = pick(VILLAGE_NAMES);
  const titles = shuffle(CHARACTER_TITLES);
  const characterTitles: Record<string, string> = {};
  playerIds.forEach((id, i) => {
    characterTitles[id] = titles[i % titles.length];
  });
  return { villageName, characterTitles };
}

export function narrateIntro(villageName: string, mafiaCount: number): string {
  const killers = mafiaCount === 1 ? 'a single killer hides' : `${mafiaCount} killers hide`;
  return fill(pick([
    'Night has come and gone over {village}, and already the air is wrong. Among its people, {killers} — wearing familiar faces. Find them before they find you.',
    'Welcome to {village}, where {killers} among the townsfolk. Trust is the only weapon you have, and the only one they will use against you.',
    'The bells of {village} toll uneasily. {killers} in plain sight, and no one yet knows their names.',
  ]), { village: villageName, killers });
}

export function narrateNightKill(villageName: string, victimTitle: string): string {
  const victim = victimTitle || FALLBACK_TITLE;
  return fill(pick([
    'As dawn breaks over {village}, {victim} is found cold and still. The Mafia struck in the dark.',
    '{village} wakes to grief: {victim} lies lifeless in the square, a silent blade the only witness.',
    'A scream in the night, then silence. By morning, {victim} is gone from {village}.',
    'The Mafia moved unseen. {victim} did not live to see the sun rise over {village}.',
  ]), { village: villageName, victim });
}

export function narratePeacefulNight(villageName: string): string {
  return fill(pick([
    'The night passed over {village} without blood. Everyone rises to greet an uneasy morning.',
    'Dawn comes quietly to {village} — no one was lost in the dark. But the Mafia are still out there.',
    'For once the streets of {village} are empty of the dead. The night spared everyone… this time.',
  ]), { village: villageName });
}

export function narrateLynch(villageName: string, victimTitle: string): string {
  const victim = victimTitle || FALLBACK_TITLE;
  return fill(pick([
    'The mob of {village} has spoken. {victim} is dragged to the square and silenced for good.',
    'By vote of the town, {victim} meets their end. {village} holds its breath — was it the right call?',
    '{victim} protests to the very last, but {village} has decided. The rope does not wait.',
  ]), { village: villageName, victim });
}

export function narrateNoMajority(villageName: string): string {
  return fill(pick([
    'The town of {village} argues in circles. No majority forms, and no one is condemned.',
    'Voices rise and fall, but {village} cannot agree. The accused walk free — for now.',
  ]), { village: villageName });
}

export function narrateNoVotes(villageName: string): string {
  return fill(pick([
    '{village} stands silent. Not a single accusation is cast, and the day ends in unease.',
    'No one in {village} dares point a finger today. The Mafia must be pleased.',
  ]), { village: villageName });
}

export function narrateNoLynch(villageName: string): string {
  return fill(pick([
    'The town of {village} chooses mercy — or perhaps cowardice. No one is condemned today.',
    '{village} decides to spare the accused. Whether wisdom or folly, only the night will tell.',
  ]), { village: villageName });
}

export function narrateEpilogue(villageName: string, winner: 'mafia' | 'villagers'): string {
  return winner === 'villagers'
    ? fill(pick([
        'The last of the Mafia falls, and {village} breathes free at last. The townsfolk have won.',
        'Dawn breaks clean over {village} — every killer rooted out. The town endures.',
      ]), { village: villageName })
    : fill(pick([
        'Shadows swallow {village}. The Mafia now equal the living — the town is theirs.',
        'The lights of {village} go out one by one. The Mafia have won; nothing remains to save.',
      ]), { village: villageName });
}
