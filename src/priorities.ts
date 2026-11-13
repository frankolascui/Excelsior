// Priorización estratégica: impacto de cada misión, «Las 3 de hoy» y limpieza de lo que no merece tu tiempo.
// El impacto es el antiguo tipo de misión: decide el orden y el XP (alto 50, medio 20, bajo 15).
// El tope diario de XP frena marcarlo todo como alto. Cerrar tus 3 del día da un bonus fijo (PRIORITY_BONUS).
import type { GameState, Impact, Quest } from './types';
import { dayKey, deleteQuest, IMPACT_TYPE, impactOf, shiftDay, XP_RULES } from './game';
import { hasChildren, isLeaf, rootOf } from './tree';

export const MAX_PRIORITIES = 3;

export const IMPACTS: { id: Impact; name: string; hint: string; xp: number }[] = [
  { id: 'alto', name: 'Alto', hint: 'Mueve de verdad un objetivo importante', xp: XP_RULES.quest.main },
  { id: 'medio', name: 'Medio', hint: 'Ayuda, pero no cambia mucho', xp: XP_RULES.quest.daily },
  { id: 'bajo', name: 'Bajo', hint: 'Se podría posponer, delegar o eliminar', xp: XP_RULES.quest.side },
];

/** Orden para decidir: alto, medio y bajo. */
export const IMPACT_RANK: Record<Impact, number> = { alto: 0, medio: 1, bajo: 2 };
export const impactRank = (q: Pick<Quest, 'impact' | 'type'>) => IMPACT_RANK[impactOf(q)];

/** Cambia el impacto (y con él el XP y el tipo, que van juntos). Lo ya ganado no cambia. */
export function setQuestImpact(s: GameState, id: string, impact: Impact): GameState {
  return { ...s, quests: s.quests.map((q) => (q.id === id ? { ...q, impact, type: IMPACT_TYPE[impact] } : q)) };
}

// ---------- Las 3 de hoy ----------

/** Ids elegidos para ese día (pueden incluir misiones ya hechas o borradas). */
export function priorityIds(s: GameState, day: string): string[] {
  return s.priorities?.find((p) => p.day === day)?.ids ?? [];
}

/** Guarda las prioridades de un día (máx. 3, sin repetir). Se conservan los últimos 60 días. */
export function setPriorities(s: GameState, day: string, ids: string[], now: number): GameState {
  const clean = [...new Set(ids)].filter((id) => s.quests.some((q) => q.id === id)).slice(0, MAX_PRIORITIES);
  const from = dayKey(shiftDay(now, -60));
  const rest = (s.priorities ?? []).filter((p) => p.day !== day && p.day >= from);
  return { ...s, priorities: clean.length ? [...rest, { day, ids: clean }] : rest };
}

/** Las misiones elegidas para ese día, en el orden en que las elegiste. */
export function priorityQuests(s: GameState, day: string): Quest[] {
  return priorityIds(s, day).map((id) => s.quests.find((q) => q.id === id)).filter((q): q is Quest => !!q);
}

/** Candidatas para elegir: pendientes (o visibles ese día), de más a menos impacto. */
export function priorityCandidates(s: GameState, day: string): Quest[] {
  return s.quests
    .filter((q) => isLeaf(s, q) && !(q.startsOn && q.startsOn > day))
    .sort((a, b) => impactRank(a) - impactRank(b) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.createdAt - b.createdAt);
}

/** Días de una semana (desde `from`, 7 días) con 3 prioridades elegidas y cuántos se cerraron enteros. */
export function priorityWeek(s: GameState, from: number): { planned: number; closed: number } {
  let planned = 0;
  let closed = 0;
  for (let i = 0; i < 7; i++) {
    const day = dayKey(shiftDay(from, i));
    const qs = priorityQuests(s, day);
    if (priorityIds(s, day).length < MAX_PRIORITIES) continue;
    planned++;
    if (qs.length === MAX_PRIORITIES && qs.every((q) => q.completedAt && dayKey(q.completedAt) <= day)) closed++;
  }
  return { planned, closed };
}

// ---------- Limpieza ----------

export const STALE_DAYS = { bajo: 14, medio: 30 };
const DAY_MS = 86_400_000;

/**
 * Misiones que llevan demasiado tiempo pendientes para lo que aportan: impacto bajo y más de 14 días,
 * o medio y más de 30. No cuentan las de un reino (son construcciones de un proyecto)
 * ni las que se repiten. Las que conservaste no vuelven a salir hasta 14 días después.
 */
export function staleQuests(s: GameState, now: number): Quest[] {
  const today = dayKey(now);
  return s.quests
    .filter((q) => {
      const impact = impactOf(q);
      if (q.completedAt || q.repeat || impact === 'alto' || rootOf(s, q).kingdomId || hasChildren(s, q.id)) return false;
      if (q.startsOn && q.startsOn > today) return false;
      const limit = STALE_DAYS[impact];
      const since = Math.max(q.createdAt, q.keptAt ?? 0);
      const wait = q.keptAt ? STALE_DAYS.bajo : limit;
      return now - since >= wait * DAY_MS;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

export const staleAge = (q: Quest, now: number) => Math.floor((now - q.createdAt) / DAY_MS);

/** «La hago»: se queda y no vuelve a preguntar en 14 días. */
export function keepQuest(s: GameState, id: string, now: number): GameState {
  return { ...s, quests: s.quests.map((q) => (q.id === id ? { ...q, keptAt: now } : q)) };
}

/** «Posponer»: desaparece de pendientes una semana. */
export function postponeQuest(s: GameState, id: string, now: number, days = 7): GameState {
  const startsOn = dayKey(shiftDay(now, days));
  return { ...s, quests: s.quests.map((q) => (q.id === id ? { ...q, startsOn, keptAt: now } : q)) };
}

export const dropQuest = deleteQuest;

/**
 * «Pasar a mañana»: la quita de las prioridades de hoy y la pone en las de mañana (al final).
 * Si mañana ya tiene 3, no hace nada y devuelve ok = false.
 */
export function pushToTomorrow(s: GameState, id: string, now: number): { state: GameState; ok: boolean } {
  const today = dayKey(now);
  const tomorrow = dayKey(shiftDay(now, 1));
  const next = priorityIds(s, tomorrow);
  if (!next.includes(id) && next.length >= MAX_PRIORITIES) return { state: s, ok: false };
  let state = setPriorities(s, today, priorityIds(s, today).filter((x) => x !== id), now);
  state = setPriorities(state, tomorrow, next.includes(id) ? next : [...next, id], now);
  return { state, ok: true };
}

/** Lo que toca mañana además de las prioridades: lo que vence y lo que vuelve (repeticiones y pospuestas). */
export function tomorrowQuests(s: GameState, now: number): { due: Quest[]; back: Quest[] } {
  const tomorrow = dayKey(shiftDay(now, 1));
  const prio = priorityIds(s, tomorrow);
  const open = s.quests.filter((q) => !q.completedAt && !prio.includes(q.id));
  return {
    due: open.filter((q) => q.deadline === tomorrow),
    back: open.filter((q) => q.startsOn === tomorrow),
  };
}
