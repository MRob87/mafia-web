'use client';

import { createContext, useContext, type ReactNode, createElement } from 'react';
import type { Role, ThemeId } from '@mafia/shared';

/** A cosmetic skin. The engine and internal role ids never change — only these player-facing
 *  labels, emoji, and names. Add a new edition by adding an entry here + a NARRATOR_THEMES entry
 *  server-side (narrator.ts). Role colors stay shared (see lib/roleTheme). */
export interface ThemeConfig {
  id: ThemeId;
  /** Game/app name shown in the room. */
  name: string;
  roleLabels: Record<Role, string>;
  roleEmoji: Record<Role, string>;
  /** Header for the killers' private night channel ("Mafia Chat" / "Werewolf Den"). */
  killerChatLabel: string;
  /** The killer team's name, for the win banner ("Mafia win" / "Werewolves win"). */
  killerTeam: string;
  /** The innocent majority's collective name ("Villagers" / "Crew"), for the win banner etc. */
  townTeam: string;
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  mafia: {
    id: 'mafia',
    name: 'Mafia',
    roleLabels: { mafia: 'Mafia', doctor: 'Doctor', detective: 'Detective', villager: 'Villager' },
    roleEmoji: { mafia: '🔪', doctor: '🩺', detective: '🔍', villager: '🧑' },
    killerChatLabel: 'Mafia Chat',
    killerTeam: 'Mafia',
    townTeam: 'Villagers',
  },
  werewolf: {
    id: 'werewolf',
    name: 'Werewolf',
    roleLabels: { mafia: 'Werewolf', doctor: 'Healer', detective: 'Seer', villager: 'Villager' },
    roleEmoji: { mafia: '🐺', doctor: '🌿', detective: '🔮', villager: '🧑' },
    killerChatLabel: 'Werewolf Den',
    killerTeam: 'Werewolves',
    townTeam: 'Villagers',
  },
  space: {
    id: 'space',
    name: 'Space Station',
    roleLabels: { mafia: 'Saboteur', doctor: 'Medic', detective: 'Security Officer', villager: 'Crewmate' },
    roleEmoji: { mafia: '🛠️', doctor: '💉', detective: '🛡️', villager: '🧑‍🚀' },
    killerChatLabel: 'Saboteur Comms',
    killerTeam: 'Saboteurs',
    townTeam: 'Crew',
  },
  alien: {
    id: 'alien',
    name: 'Alien',
    roleLabels: { mafia: 'Alien', doctor: 'Field Medic', detective: 'Scientist', villager: 'Researcher' },
    roleEmoji: { mafia: '👽', doctor: '🩹', detective: '🔬', villager: '🧑‍🔬' },
    killerChatLabel: 'The Hive',
    killerTeam: 'Aliens',
    townTeam: 'Humans',
  },
};

export function getTheme(id: ThemeId | undefined | null): ThemeConfig {
  return (id && THEMES[id]) || THEMES.mafia;
}

const ThemeContext = createContext<ThemeConfig>(THEMES.mafia);

export function ThemeProvider({ theme, children }: { theme: ThemeConfig; children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): ThemeConfig {
  return useContext(ThemeContext);
}
