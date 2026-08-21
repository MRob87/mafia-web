/**
 * Local, self-contained flavor text — no external calls, no LLM. Turns the game's mechanical
 * events into a little story: a themed setting, a character title per player, and atmospheric
 * narration for each beat (a night kill, a quiet night, a lynch, the opening, the end).
 *
 * This is the "moderator voice" the automated narrator was missing, done entirely offline. All
 * of it is additive: the mechanical GameEvent.message stays untouched (logic + tests rely on it);
 * these strings ride alongside as an optional `narration` the client prefers when present.
 *
 * Each theme carries its own template pools so the prose fits the setting — a werewolf village
 * hangs the condemned from a rope; a space station cycles them out the airlock.
 */
import type { ThemeId } from '@mafia/shared';

interface NarratorTheme {
  /** Setting names — villages for the gothic themes, station names for space. */
  settingNames: string[];
  /** How prose refers to the killer faction, e.g. "the Mafia" / "the Werewolves". */
  predatorProse: string;
  /** Character titles, one per player. At least 12 (a full room) so titles never repeat. */
  titles: string[];
  fallbackTitle: string;
  templates: {
    intro: string[];
    nightKill: string[];
    peacefulNight: string[];
    lynch: string[];
    noMajority: string[];
    noVotes: string[];
    noLynch: string[];
    epilogueTown: string[];
    epiloguePredator: string[];
  };
}

const VILLAGE_TITLES = [
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

/** The gothic-village voice, shared by the Mafia and Werewolf skins (predator noun differs). */
const VILLAGE_TEMPLATES: NarratorTheme['templates'] = {
  intro: [
    'Night has come and gone over {setting}, and already the air is wrong. Somewhere among its people, {predator} hide — wearing familiar faces. Find them before they find you.',
    'Welcome to {setting}. {predator} walk among the townsfolk, and trust is the only weapon you have — the same one they will use against you.',
    'The bells of {setting} toll uneasily. {predator} move in plain sight, and no one yet knows their names.',
  ],
  nightKill: [
    'As dawn breaks over {setting}, {victim} is found cold and still. {predator} struck in the dark.',
    '{setting} wakes to grief: {victim} lies lifeless in the square, and {predator} leave no witness.',
    'A scream in the night, then silence. By morning, {victim} is gone from {setting}.',
    '{predator} moved unseen. {victim} did not live to see the sun rise over {setting}.',
  ],
  peacefulNight: [
    'The night passed over {setting} without blood. Everyone rises to greet an uneasy morning.',
    'Dawn comes quietly to {setting} — no one was lost in the dark. But {predator} are still out there.',
    'For once the streets of {setting} are empty of the dead. The night spared everyone… this time.',
  ],
  lynch: [
    'The mob of {setting} has spoken. {victim} is dragged to the square and silenced for good.',
    'By vote of the town, {victim} meets their end. {setting} holds its breath — was it the right call?',
    '{victim} protests to the very last, but {setting} has decided. The rope does not wait.',
  ],
  noMajority: [
    'The town of {setting} argues in circles. No majority forms, and no one is condemned.',
    'Voices rise and fall, but {setting} cannot agree. The accused walk free — for now.',
  ],
  noVotes: [
    '{setting} stands silent. Not a single accusation is cast, and the day ends in unease.',
    'No one in {setting} dares point a finger today. {predator} must be pleased.',
  ],
  noLynch: [
    'The town of {setting} chooses mercy — or perhaps cowardice. No one is condemned today.',
    '{setting} decides to spare the accused. Whether wisdom or folly, only the night will tell.',
  ],
  epilogueTown: [
    'The last of {predator} falls, and {setting} breathes free at last. The townsfolk have won.',
    'Dawn breaks clean over {setting} — every last hunter rooted out. The town endures.',
  ],
  epiloguePredator: [
    'Shadows swallow {setting}. {predator} now equal the living — the town is theirs.',
    'The lights of {setting} go out one by one. {predator} have won; nothing remains to save.',
  ],
};

const NARRATOR_THEMES: Record<ThemeId, NarratorTheme> = {
  mafia: {
    settingNames: [
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
    ],
    predatorProse: 'the Mafia',
    titles: VILLAGE_TITLES,
    fallbackTitle: 'one of the townsfolk',
    templates: VILLAGE_TEMPLATES,
  },
  werewolf: {
    settingNames: [
      'Wolfsbane Hollow',
      'Moonvale',
      'Grimfang',
      'Dire Hollow',
      'Nightwood',
      'Silverpine',
      'Bloodmoon Vale',
      'Fell Thicket',
      'Howlbrook',
      'Ashen Wood',
      'Gravewood',
      'Mistfang',
    ],
    predatorProse: 'the Werewolves',
    titles: VILLAGE_TITLES,
    fallbackTitle: 'one of the townsfolk',
    templates: VILLAGE_TEMPLATES,
  },
  space: {
    settingNames: [
      'Station Meridian',
      'Outpost Kepler',
      'Deepwatch Station',
      'The Erebus',
      'Halcyon Ring',
      'Station Vesta',
      'Persephone Dock',
      'The Argent Spur',
      'Waypoint Tycho',
      'Station Caldera',
      'The Long Dark',
      'Relay Ganymede',
    ],
    predatorProse: 'the Saboteurs',
    titles: [
      'the Engineer',
      'the Navigator',
      'the Comms Officer',
      'the Botanist',
      'the Pilot',
      'the Roboticist',
      'the Quartermaster',
      'the Geologist',
      'the Surgeon',
      'the Technician',
      'the Astrophysicist',
      'the Cartographer',
      'the Chef',
      'the Janitor',
      'the Chaplain',
      'the Mechanic',
    ],
    fallbackTitle: 'one of the crew',
    templates: {
      intro: [
        'All hands aboard {setting}: something is wrong. {predator} have infiltrated the crew, wearing familiar uniforms. Find them before the station goes dark.',
        '{setting} drifts far from any help. Somewhere in its corridors, {predator} are already at work — and they look just like everyone else.',
        'The morning klaxon sounds across {setting}. Diagnostics report tampering in the night. {predator} are aboard, and no one knows their faces.',
      ],
      nightKill: [
        'The night shift ends in horror aboard {setting}: {victim} is found lifeless beside a failed airlock. {predator} struck while the station slept.',
        'An airlock cycles in the dark. By morning muster, {victim} is gone from {setting} — only a drifting tether remains.',
        'The lights flicker back on aboard {setting}, and the count comes up short. {victim} never made it to morning. {predator} leave no witnesses.',
        '{predator} moved through the maintenance shafts unseen. {victim} did not live to see the next sunrise over the hull of {setting}.',
      ],
      peacefulNight: [
        'The reactors hum steadily through the night. {setting} wakes with every bunk accounted for — this time.',
        'Morning muster aboard {setting}: all present. But the diagnostics still show tampering, and {predator} are still aboard.',
        'No alarms, no blood in the corridors. {setting} passes a quiet night — an uneasy gift.',
      ],
      lynch: [
        'The crew of {setting} has decided. {victim} is marched to the airlock, and the void does the rest.',
        'By vote of the crew, {victim} is cast out of {setting}. The outer door closes; the silence after is worse.',
        '{victim} swears innocence all the way down the corridor, but {setting} has spoken. The airlock does not listen.',
      ],
      noMajority: [
        'The crew of {setting} shouts across the mess hall, but no majority forms. The airlock stays shut.',
        'Accusations ricochet around {setting} and land nowhere. No one is spaced — for now.',
      ],
      noVotes: [
        'Not one accusation is logged aboard {setting} today. The silence in the mess hall is deafening — and {predator} must be pleased.',
        'The crew of {setting} avoids each other’s eyes. No charges, no vote, no justice today.',
      ],
      noLynch: [
        'The crew of {setting} stays the airlock. Mercy — or a mistake they’ll count in bodies.',
        '{setting} votes to space no one today. Whether that was wisdom, the night will tell.',
      ],
      epilogueTown: [
        'The last of {predator} is dragged from hiding, and {setting} is finally quiet. The crew endures.',
        'Every saboteur found, every system restored. {setting} sails on — the crew have won.',
      ],
      epiloguePredator: [
        'One by one the lights of {setting} go out. {predator} now outnumber the loyal crew — the station is theirs.',
        'The distress beacon of {setting} dies mid-broadcast. {predator} have won; no rescue is coming.',
      ],
    },
  },
  alien: {
    settingNames: [
      'Outpost 13',
      'Station Aurora',
      'Icehold',
      'Research Base Pelagia',
      'The Vanguard',
      'Whiteout Station',
      'Outpost Calder',
      'Station Nadir',
      'Frostfall Base',
      'The Terminus',
      'Outpost Vigil',
      'Blacksite Helix',
    ],
    predatorProse: 'the Aliens',
    titles: [
      'the Biologist',
      'the Radio Operator',
      'the Meteorologist',
      'the Glaciologist',
      'the Mechanic',
      'the Cook',
      'the Field Medic',
      'the Surveyor',
      'the Pilot',
      'the Geophysicist',
      'the Dog Handler',
      'the Station Chief',
      'the Electrician',
      'the Archivist',
      'the Welder',
      'the Cartographer',
    ],
    fallbackTitle: 'one of the researchers',
    templates: {
      intro: [
        'The storm has cut {setting} off from the world. Something came in from the ice — and now {predator} wear the faces of friends. Trust no one completely.',
        'Blood tests inconclusive. Comms are down. Somewhere inside {setting}, {predator} are perfectly imitating the people you know.',
        'Whatever thawed out in Lab 3 is loose in {setting}. {predator} could be anyone now — they remember everything the real ones knew.',
      ],
      nightKill: [
        'In the night, something wearing a familiar face followed {victim} into the dark. By morning, only what was left of them says {predator} are still among us at {setting}.',
        '{setting} wakes to a torn parka and a red trail on the ice. {victim} is gone — {predator} fed in the night.',
        'The generator hiccuped at 3 a.m. When the lights returned to {setting}, {victim} was no longer human — and no longer anything at all.',
        'A door left open to the storm. {victim} is found at the perimeter of {setting}, and what killed them left no footprints leading away.',
      ],
      peacefulNight: [
        'The storm howls over {setting}, but morning head-count comes up even. Everyone is alive. Everyone *seems* to be themselves.',
        'No one died in the night at {setting}. Somehow that makes the silence at breakfast worse.',
        'The night passes over {setting} without a scream. {predator} are patient — that is the worst part.',
      ],
      lynch: [
        'The crew of {setting} corners {victim} in the rec room. Whatever they really were, the flamethrower leaves nothing to test.',
        'By vote of the survivors, {victim} is forced out into the whiteout. {setting} bars the door and tries not to listen.',
        '{victim} swears they are still human, right up until the end. {setting} could not afford to believe them.',
      ],
      noMajority: [
        'Accusations fly across the mess hall of {setting}, but no majority forms. Everyone keeps one hand near a weapon.',
        'The survivors of {setting} cannot agree who is still human. The vote collapses; the paranoia does not.',
      ],
      noVotes: [
        'No one at {setting} dares make an accusation today. Eyes down, doors locked. {predator} must be pleased.',
        'The blood-test kits sit unused. Not one accusation is voiced at {setting} — fear has won the day.',
      ],
      noLynch: [
        'The survivors of {setting} stay their hand. No one burns today — a mercy, or a fatal mistake.',
        '{setting} votes to trust, just this once. The night will grade that decision.',
      ],
      epilogueTown: [
        'The last imitation shrieks and dies, and the survivors of {setting} stand alone — truly alone — at last. The humans have won.',
        'Every one of {predator} unmasked and destroyed. When the rescue plane reaches {setting}, there is someone left to save.',
      ],
      epiloguePredator: [
        'The storm clears over {setting}, and everything that walks out is wearing a borrowed face. {predator} have won.',
        'The rescue team will find {setting} calm, friendly, and eager to leave the ice. {predator} have won; the world just doesn\'t know it yet.',
      ],
    },
  },
};

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

function narrate(
  theme: ThemeId,
  key: keyof NarratorTheme['templates'],
  settingName: string,
  victimTitle?: string
): string {
  const t = NARRATOR_THEMES[theme];
  return fill(pick(t.templates[key]), {
    setting: settingName,
    predator: t.predatorProse,
    victim: victimTitle || t.fallbackTitle,
  });
}

/** Picks a themed setting name and assigns each player a unique character title, in random order. */
export function assignSetting(
  playerIds: string[],
  theme: ThemeId
): { villageName: string; characterTitles: Record<string, string> } {
  const t = NARRATOR_THEMES[theme];
  const villageName = pick(t.settingNames);
  const titles = shuffle(t.titles);
  const characterTitles: Record<string, string> = {};
  playerIds.forEach((id, i) => {
    characterTitles[id] = titles[i % titles.length];
  });
  return { villageName, characterTitles };
}

export function narrateIntro(theme: ThemeId, settingName: string): string {
  return narrate(theme, 'intro', settingName);
}

export function narrateNightKill(theme: ThemeId, settingName: string, victimTitle: string): string {
  return narrate(theme, 'nightKill', settingName, victimTitle);
}

export function narratePeacefulNight(theme: ThemeId, settingName: string): string {
  return narrate(theme, 'peacefulNight', settingName);
}

export function narrateLynch(theme: ThemeId, settingName: string, victimTitle: string): string {
  return narrate(theme, 'lynch', settingName, victimTitle);
}

export function narrateNoMajority(theme: ThemeId, settingName: string): string {
  return narrate(theme, 'noMajority', settingName);
}

export function narrateNoVotes(theme: ThemeId, settingName: string): string {
  return narrate(theme, 'noVotes', settingName);
}

export function narrateNoLynch(theme: ThemeId, settingName: string): string {
  return narrate(theme, 'noLynch', settingName);
}

export function narrateEpilogue(theme: ThemeId, settingName: string, winner: 'mafia' | 'villagers'): string {
  return narrate(theme, winner === 'villagers' ? 'epilogueTown' : 'epiloguePredator', settingName);
}
