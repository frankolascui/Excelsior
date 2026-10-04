// Actividad diaria derivada del historial: alimenta la gráfica de XP y el mapa de cuadraditos.
import type { GameState } from './types';
import { dayKey, shiftDay } from './game';

export interface DayActivity {
  day: string; // YYYY-MM-DD local
  ts: number; // mediodía de ese día (evita saltos por cambio de hora)
  xp: number;
  quests: number;
  habits: number;
  deepWork: number; // minutos de foco
}

function noon(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

/** Los últimos `days` días hasta hoy (incluido), en orden cronológico. */
export function activityByDay(s: GameState, now: number, days: number): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = noon(shiftDay(now, -i));
    const a = { day: dayKey(ts), ts, xp: 0, quests: 0, habits: 0, deepWork: 0 };
    byDay.set(a.day, a);
    out.push(a);
  }
  for (const t of s.xp) {
    const a = byDay.get(dayKey(t.at));
    if (!a) continue;
    a.xp += t.amount;
    if (t.source === 'quest') a.quests++;
    if (t.source === 'habit') a.habits++;
  }
  for (const x of s.sessions) {
    const a = byDay.get(dayKey(x.endedAt));
    if (a) a.deepWork += x.minutes;
  }
  return out;
}

/** Intensidad 0–4 de un día respecto al mejor día del periodo (0 = sin XP). */
export function heatLevel(xp: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((xp / max) * 4))) as 1 | 2 | 3 | 4;
}

/** Días seguidos con XP terminando hoy (si hoy aún no hay XP, cuenta hasta ayer). */
export function activeDayStreak(days: DayActivity[]): number {
  let i = days.length - 1;
  if (i >= 0 && days[i].xp <= 0) i--;
  let n = 0;
  while (i >= 0 && days[i].xp > 0) {
    n++;
    i--;
  }
  return n;
}

export function bestDayStreak(days: DayActivity[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.xp > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Marcas «redondas» para el eje Y: 0, paso, 2·paso… cubriendo `max`. */
export function niceTicks(max: number, count = 4): number[] {
  const raw = Math.max(1, max) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(Math.max(1, max) / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
