// Secciones que se desbloquean al subir de nivel; cada una trae su propio tutorial al abrirla.
import type { GameState } from './types';
import type { IconName } from './icon-data';
import type { Tab } from './screens';
import { levelInfo, totalXp } from './game';
import { ADMIN } from './admin';

export const UNLOCKS: { tab: Tab; level: number; name: string; icon: IconName }[] = [
  { tab: 'reinos', level: 3, name: 'Reinos', icon: 'castle' },
  { tab: 'arena', level: 5, name: 'Arena', icon: 'crossed-swords' },
  { tab: 'gremios', level: 5, name: 'Gremios', icon: 'round-shield' },
];

/** En el nivel 5 entras en gremios por invitación; fundar el tuyo pide nivel 10. */
export const GUILD_FOUND_LEVEL = 10;
export const canFoundGuild = (s: GameState) => ADMIN || levelInfo(totalXp(s)).level >= GUILD_FOUND_LEVEL;

export function unlockLevel(tab: Tab): number | null {
  return UNLOCKS.find((u) => u.tab === tab)?.level ?? null;
}

export function isUnlocked(s: GameState, tab: Tab): boolean {
  const lvl = unlockLevel(tab);
  return ADMIN || lvl === null || levelInfo(totalXp(s)).level >= lvl;
}

/** Secciones que se abren justo al pasar de `from` a `to`. */
export function unlockedBetween(from: number, to: number) {
  return UNLOCKS.filter((u) => u.level > from && u.level <= to);
}
