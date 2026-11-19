// Desgaste por inactividad (pedido de Nicolas, 2026-11-19): desde el 2.º día seguido sin hacer nada,
// cada día pierdes un 5 % del progreso de tu nivel actual. Nunca bajas de nivel.
// Se guarda aparte del historial de XP (GameState.decay) para que no cuente como «día con progreso».
import type { GameState } from './types';
import { dayKey, levelInfo, shiftDay, totalXp } from './game';

export const DECAY_RULES = {
  pct: 0.05, // del progreso dentro del nivel actual, por día
  graceDays: 1, // el primer día sin hacer nada no cuesta nada
  /** Primer día que cuenta. Poner aquí el día de publicar para no cobrar días de antes. */
  since: '2026-11-20',
};

/** Días con algo hecho: XP ganado (salvo el de admin), hábitos marcados o sesiones de Deep Work. */
export function activeDays(s: GameState): Set<string> {
  const days = new Set<string>();
  for (const t of s.xp) if (t.source !== 'admin' && t.amount > 0) days.add(dayKey(t.at));
  for (const c of s.habitCompletions) days.add(c.day);
  for (const x of s.sessions) days.add(dayKey(x.endedAt));
  return days;
}

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();

/**
 * Apunta el desgaste de los días cerrados (hasta ayer) que lo merecen y quita el de los días que al final
 * sí tuvieron actividad (p. ej. un hábito marcado a posteriori). Devuelve el mismo objeto si no cambia nada.
 */
export function applyInactivity(s: GameState, now: number): GameState {
  if (!s.profile) return s;
  const yesterday = dayKey(shiftDay(now, -1));
  const born = dayKey(s.profile.createdAt);
  const start = born > DECAY_RULES.since ? born : DECAY_RULES.since;
  const old = s.decay ?? [];
  if (start > yesterday && old.length === 0) return s;
  const active = activeDays(s);
  const prev = new Map(old.map((d) => [d.day, d]));
  const kept = old.filter((d) => d.day < start || d.day > yesterday); // fuera del tramo: no se tocan
  let state: GameState = { ...s, decay: kept };
  let idle = 0;
  for (let t = noon(start); dayKey(t) <= yesterday; t = shiftDay(t, 1)) {
    const day = dayKey(t);
    if (active.has(day)) { idle = 0; continue; }
    idle++;
    if (idle <= DECAY_RULES.graceDays) continue;
    const before = prev.get(day);
    // el XP que tenías al acabar ese día (lo ganado después no cuenta)
    const at = new Date(`${day}T23:59:59`).getTime();
    const xpThen = s.xp.reduce((n, x) => n + (x.at <= at ? x.amount : 0), 0) - (state.decay ?? []).reduce((n, d) => n + (d.day <= day ? d.amount : 0), 0);
    const amount = before?.amount ?? Math.floor(levelInfo(xpThen).current * DECAY_RULES.pct);
    if (amount > 0) state = { ...state, decay: [...(state.decay ?? []), { day, amount }] };
  }
  const next = state.decay ?? [];
  const same = next.length === old.length && next.every((d) => prev.get(d.day)?.amount === d.amount);
  return same ? s : state;
}

/** XP perdido por inactividad en los últimos `days` días (para avisar en Hoy). */
export function recentDecay(s: GameState, now: number, days = 7): number {
  const from = dayKey(shiftDay(now, -days));
  return (s.decay ?? []).filter((d) => d.day >= from).reduce((n, d) => n + d.amount, 0);
}

/**
 * Aviso para hoy: «danger» si hoy, de no hacer nada, ya cuenta como desgaste (ayer tampoco hiciste nada);
 * null si hoy ya has hecho algo o no hay riesgo.
 */
export function decayWarning(s: GameState, now: number): { lose: number } | null {
  if (!s.profile) return null;
  const today = dayKey(now);
  const yesterday = dayKey(shiftDay(now, -1));
  const active = activeDays(s);
  if (active.has(today) || active.has(yesterday) || today < DECAY_RULES.since) return null;
  if (dayKey(s.profile.createdAt) > yesterday) return null;
  return { lose: Math.floor(levelInfo(totalXp(s)).current * DECAY_RULES.pct) };
}
