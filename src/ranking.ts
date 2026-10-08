// Rankings (V2): entre amigos y dentro del gremio. Semana de lunes a domingo (hora local de cada jugador).
// Cada jugador publica en su perfil lo que hizo esta semana y la anterior (stats.week y stats.prev), calculado
// desde su propia partida. No hay ranking global: los datos los sube cada app y solo se comparan entre conocidos.
import type { GameState } from './types';
import type { PublicProfile } from './social';

export interface WeekStats {
  /** Lunes de esa semana, «2026-10-05». */
  key: string;
  xp: number;
  deep: number; // minutos
  habits: number;
}

export type Period = 'week' | 'last' | 'all';
export const PERIOD_LABEL: Record<Period, string> = { week: 'Esta semana', last: 'Semana pasada', all: 'Siempre' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Lunes a las 00:00 (hora local) de la semana de `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Mismo día y hora `weeks` semanas después (respeta los cambios de hora). */
export function addWeeks(t: number, weeks: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + weeks * 7);
  return d.getTime();
}

export function weekKey(t: number): string {
  const d = new Date(weekStart(t));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** XP (sin el del modo admin), minutos de foco y hábitos de la semana que empieza en `start`. */
export function weekStats(s: GameState, start: number): WeekStats {
  const end = addWeeks(start, 1);
  const inside = (t: number) => t >= start && t < end;
  return {
    key: weekKey(start),
    xp: Math.floor(s.xp.filter((t) => inside(t.at) && t.source !== 'admin').reduce((n, t) => n + t.amount, 0)),
    deep: Math.floor(s.sessions.filter((x) => inside(x.endedAt)).reduce((n, x) => n + x.minutes, 0)),
    habits: s.habitCompletions.filter((c) => inside(c.at)).length,
  };
}

/** Lo que se publica en el perfil: esta semana y la anterior. */
export function publicWeeks(s: GameState, now: number): { week: WeekStats; prev: WeekStats } {
  const start = weekStart(now);
  return { week: weekStats(s, start), prev: weekStats(s, addWeeks(start, -1)) };
}

/** Lo que hizo alguien en la semana `key`. Si su perfil no la tiene (no ha entrado desde entonces), cuenta 0. */
export function statsFor(p: Pick<PublicProfile, 'stats'>, key: string): WeekStats {
  const { week, prev } = p.stats ?? {};
  if (week?.key === key) return week;
  if (prev?.key === key) return prev;
  return { key, xp: 0, deep: 0, habits: 0 };
}

export interface RankRow {
  p: PublicProfile;
  value: number;
  place: number;
  week: WeekStats | null;
}

/** Ordena por XP del periodo; los empates comparten puesto (1, 1, 3) y se ordenan por nombre. */
export function rankRows(people: PublicProfile[], period: Period, now: number): RankRow[] {
  const key = period === 'week' ? weekKey(now) : period === 'last' ? weekKey(addWeeks(weekStart(now), -1)) : '';
  const rows = people.map((p) => {
    const week = key ? statsFor(p, key) : null;
    return { p, week, value: week ? week.xp : p.xp, place: 0 };
  });
  rows.sort((a, b) => b.value - a.value || a.p.name.localeCompare(b.p.name, 'es'));
  rows.forEach((r, i) => { r.place = i > 0 && r.value === rows[i - 1].value ? rows[i - 1].place : i + 1; });
  return rows;
}

/** Quién ganó la semana pasada (con algo de XP), para coronarle esta semana. */
export function lastWeekChampion(people: PublicProfile[], now: number): string | null {
  const [top, second] = rankRows(people, 'last', now);
  if (!top || top.value <= 0 || (second && second.value === top.value)) return null;
  return top.p.user_id;
}

/** «Termina en 3 d 4 h» / «Termina en 5 h». */
export function weekEndsIn(now: number): string {
  const ms = addWeeks(weekStart(now), 1) - now;
  const h = Math.max(1, Math.ceil(ms / 3_600_000));
  const d = Math.floor(h / 24);
  return d ? `Termina en ${d} d ${h % 24} h` : `Termina en ${h} h`;
}
