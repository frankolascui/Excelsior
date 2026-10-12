// Trofeos sociales (V2): estandartes de encargos de gremio, MVP de cada encargo y coronas de la semana entre amigos.
// Viven en la partida (GameState.trophies), así que se conservan aunque dejes el gremio. Algunos dan monedas y un título.
import type { GameState, Trophy } from './types';
import type { PublicProfile } from './social';
import { uid } from './game';
import { addWeeks, lastWeekChampion, weekKey, weekStart } from './ranking';

export const CROWN_COINS = 50;
export const CROWN_TITLE = 'Corona de la semana';
export const MVP_TITLE = 'MVP del gremio';

export const TROPHY_KIND: Record<Trophy['kind'], string> = { guild: 'Estandarte de gremio', mvp: 'MVP', crown: 'Corona semanal' };

export const trophies = (s: GameState): Trophy[] => s.trophies ?? [];

/** Añade un trofeo si no lo tenías ya (mismo tipo y mismo encargo o semana). */
export function addTrophy(s: GameState, t: Omit<Trophy, 'id'>): GameState {
  if (trophies(s).some((x) => x.kind === t.kind && x.sourceId === t.sourceId)) return s;
  return { ...s, trophies: [...trophies(s), { ...t, id: uid() }] };
}

/** Monedas ganadas con trofeos (MVP y coronas). */
export const trophyCoins = (s: GameState): number => trophies(s).reduce((n, t) => n + (t.coins ?? 0), 0);

/** Títulos que puedes equiparte, del más reciente al más antiguo, sin repetir. */
export function unlockedTitles(s: GameState): string[] {
  return [...new Set([...trophies(s)].sort((a, b) => b.at - a.at).map((t) => t.title).filter((x): x is string => !!x))];
}

/** Equipa un título que hayas desbloqueado (o ninguno con null). */
export function equipTitle(s: GameState, title: string | null): GameState {
  if (title !== null && !unlockedTitles(s).includes(title)) return s;
  return { ...s, title };
}

const short = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

/**
 * Si ganaste la semana pasada entre tus amigos (con alguien más en la tabla), te llevas la corona una vez.
 * `people` incluye tu propio perfil.
 */
export function crownCheck(s: GameState, people: PublicProfile[], me: string, now: number): GameState {
  if (people.length < 2 || lastWeekChampion(people, now) !== me) return s;
  const start = addWeeks(weekStart(now), -1);
  return addTrophy(s, {
    kind: 'crown', sourceId: weekKey(start), name: 'Corona de la semana', icon: 'crown', at: now,
    detail: `Semana del ${short(start)} entre amigos`, coins: CROWN_COINS, title: CROWN_TITLE,
  });
}
