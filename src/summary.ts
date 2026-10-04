// Crónica semanal: resumen de la semana pasada (lunes a domingo) comparado con la anterior.
import type { AttributeId, GameState } from './types';
import { dayKey, shiftDay } from './game';
import { ATTRIBUTES } from './attributes';
import { bossStatus } from './bosses';

/** Lunes (00:00) de la semana de `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  const monday = shiftDay(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), -((d.getDay() + 6) % 7));
  return monday;
}

// Boss que se propone como reto para el atributo más flojo.
const CHALLENGE: Record<AttributeId, string> = {
  voluntad: 'cerbero', sabiduria: 'esfinge', maestria: 'medusa', conexion: 'polifemo', creacion: 'caos',
};

export function weekSummary(s: GameState, now: number) {
  const thisWeek = weekStart(now);
  const from = shiftDay(thisWeek, -7);
  const prevFrom = shiftDay(thisWeek, -14);
  const inRange = (at: number, a: number, b: number) => at >= a && at < b;
  const xpIn = (a: number, b: number) => s.xp.filter((t) => inRange(t.at, a, b));

  const txs = xpIn(from, thisWeek);
  const xp = txs.reduce((n, t) => n + t.amount, 0);
  const prevXp = xpIn(prevFrom, from).reduce((n, t) => n + t.amount, 0);
  const sessions = s.sessions.filter((x) => inRange(x.endedAt, from, thisWeek));
  const deepWork = sessions.reduce((n, x) => n + x.minutes, 0);
  const focusPct = deepWork ? Math.round(sessions.reduce((n, x) => n + (x.focusPct ?? 100) * x.minutes, 0) / deepWork) : null;

  const byDay = new Map<string, number>();
  for (const t of txs) byDay.set(dayKey(t.at), (byDay.get(dayKey(t.at)) ?? 0) + t.amount);
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  const gains = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, 0])) as Record<AttributeId, number>;
  for (const t of txs) for (const [id, n] of Object.entries(t.attributes ?? {})) gains[id as AttributeId] += n ?? 0;
  const weakest = ATTRIBUTES.reduce((m, a) => (gains[a.id] < gains[m.id] ? a : m), ATTRIBUTES[0]);

  return {
    weekKey: dayKey(from),
    from,
    to: shiftDay(thisWeek, -1),
    xp,
    prevXp,
    deltaPct: prevXp ? Math.round(((xp - prevXp) / prevXp) * 100) : null,
    activeDays: byDay.size,
    deepWork,
    focusPct,
    quests: txs.filter((t) => t.source === 'quest').length,
    habits: txs.filter((t) => t.source === 'habit').length,
    bestDay: best ? { day: best[0], xp: best[1] } : null,
    gains,
    weakest,
    bossesDefeated: s.bosses.filter((b) => {
      const st = bossStatus(s, b, now);
      return st.defeatedAt !== null && inRange(st.defeatedAt, from, thisWeek);
    }).length,
    challenge: CHALLENGE[weakest.id],
  };
}

export type WeekSummary = ReturnType<typeof weekSummary>;
