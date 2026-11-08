// Acciones del árbol de misiones que necesitan las reglas del juego (crear misiones, fechas).
import type { GameState, Quest } from './types';
import { addQuest, dayKey, daysUntil, pendingQuests, shiftDay } from './game';
import { childrenOf, descendants, effectiveDeadline } from './tree';

export const MAX_SESSIONS = 20;

/** Añade una submisión (hereda el impacto de la misión de arriba). */
export function addSubQuest(s: GameState, parentId: string, title: string, now: number): GameState {
  const t = title.trim().slice(0, 120);
  if (!t) return s;
  return addQuest(s, t, 'daily', now, { parentId });
}

/**
 * «Repartir sesiones»: crea `n` submisiones («Sesión 1», «Sesión 2»…) repartidas por días entre hoy
 * y el día antes de la fecha límite (la suya o la heredada). Sin fecha, una por día desde hoy.
 * Cada una sale en pendientes el día que le toca. La numeración sigue si ya había sesiones.
 */
export function splitIntoSessions(s: GameState, parentId: string, n: number, now: number, label = 'Sesión'): GameState {
  const parent = s.quests.find((q) => q.id === parentId);
  const count = Math.max(1, Math.min(MAX_SESSIONS, Math.floor(n)));
  if (!parent || parent.completedAt) return s;
  const deadline = effectiveDeadline(s, parent);
  const left = deadline ? daysUntil(deadline, now)! : count;
  // días disponibles: de hoy (0) al anterior a la fecha; si la fecha es hoy o ya pasó, todo hoy
  const span = Math.max(1, left);
  const already = childrenOf(s, parentId).filter((q) => q.title.startsWith(`${label} `)).length;
  let state = s;
  for (let i = 0; i < count; i++) {
    const offset = Math.floor((i * span) / count);
    const before = state.quests.length;
    state = addQuest(state, `${label} ${already + i + 1}`, 'daily', now + i, { parentId });
    if (offset > 0 && state.quests.length > before) {
      const id = state.quests[state.quests.length - 1].id;
      const startsOn = dayKey(shiftDay(now, offset));
      state = { ...state, quests: state.quests.map((q) => (q.id === id ? { ...q, startsOn } : q)) };
    }
  }
  return state;
}

/**
 * Misiones de primer nivel pendientes, en el orden de su hoja más urgente/importante
 * (el mismo que usa «¿Qué hago ahora?»). Las que no tienen nada para hoy van al final.
 */
export function rootsInOrder(s: GameState, now: number, filter: (q: Quest) => boolean = () => true): Quest[] {
  const order = new Map(pendingQuests(s, now).map((q, i) => [q.id, i]));
  const today = dayKey(now);
  const rank = (q: Quest) => Math.min(...[q, ...descendants(s, q.id)].map((x) => order.get(x.id) ?? Infinity));
  return s.quests
    .filter((q) => !q.parentId && !q.completedAt && !(q.startsOn && q.startsOn > today) && filter(q))
    .map((q) => ({ q, r: rank(q) }))
    .sort((a, b) => a.r - b.r || a.q.createdAt - b.q.createdAt)
    .map((x) => x.q);
}
