// Reglas pequeñas del núcleo (Hoy, hábitos, reinos) que no encajan en game.ts.
import type { DeepWorkSession, GameState, Quest } from './types';
import { dayKey, shiftDay, uid, XP_RULES } from './game';
import { deepWorkRewards } from './attributes';

/**
 * Días seguidos con progreso (cualquier XP salvo el de admin). Cuenta hasta hoy; si hoy aún no has hecho nada,
 * la racha de ayer sigue viva hasta medianoche.
 */
export function activeDayStreak(s: GameState, now: number): { days: number; today: boolean } {
  const active = new Set(s.xp.filter((t) => t.source !== 'admin' && t.amount > 0).map((t) => dayKey(t.at)));
  const today = active.has(dayKey(now));
  let days = 0;
  for (let i = today ? 0 : 1; active.has(dayKey(shiftDay(now, -i))); i++) days++;
  return { days, today };
}

// ---------- Pasos de una misión ----------

function mapQuest(s: GameState, id: string, f: (q: Quest) => Quest): GameState {
  return { ...s, quests: s.quests.map((q) => (q.id === id ? f(q) : q)) };
}

export function addStep(s: GameState, questId: string, title: string): GameState {
  const t = title.trim().slice(0, 80);
  if (!t) return s;
  return mapQuest(s, questId, (q) => ({ ...q, steps: [...(q.steps ?? []), { id: uid(), title: t, done: false }] }));
}

export function toggleStep(s: GameState, questId: string, stepId: string): GameState {
  return mapQuest(s, questId, (q) => ({ ...q, steps: (q.steps ?? []).map((x) => (x.id === stepId ? { ...x, done: !x.done } : x)) }));
}

export function deleteStep(s: GameState, questId: string, stepId: string): GameState {
  return mapQuest(s, questId, (q) => {
    const steps = (q.steps ?? []).filter((x) => x.id !== stepId);
    const next: Quest = { ...q, steps };
    if (!steps.length) delete next.steps;
    return next;
  });
}

export function stepProgress(q: Quest): { done: number; total: number } {
  const steps = q.steps ?? [];
  return { done: steps.filter((x) => x.done).length, total: steps.length };
}

// ---------- Corregir una sesión de Deep Work ----------

/** Lo que midió el reloj: la corrección nunca puede dar más foco ni terminar más tarde que eso. */
export function sessionMeasured(x: DeepWorkSession): { minutes: number; endedAt: number } {
  return x.measured ?? { minutes: x.minutes, endedAt: x.endedAt };
}

/** «HH:MM» → la primera vez que el reloj marca esa hora desde que empezó la sesión (puede ser al día siguiente). */
export function sessionEndAt(x: DeepWorkSession, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(x.startedAt);
  d.setHours(h, m, 0, 0);
  let at = d.getTime();
  if (at < x.startedAt) at = new Date(shiftDay(at, 1)).setHours(h, m, 0, 0);
  // el mismo minuto en que se paró (o se corrigió) es ese instante exacto, con sus segundos
  const exact = [x.endedAt, sessionMeasured(x).endedAt].find((t) => Math.floor(t / 60_000) === at / 60_000);
  return exact ?? at;
}

/** Foco que cabe si la sesión terminó en `endedAt`: lo medido, sin pasarse del tiempo entre inicio y fin (menos descansos y distracciones). */
export function focusForEnd(x: DeepWorkSession, endedAt: number): number {
  const span = Math.floor((endedAt - x.startedAt) / 60_000) - (x.breakMinutes ?? 0) - (x.distractionMinutes ?? 0);
  return Math.max(1, Math.min(sessionMeasured(x).minutes, span));
}

/**
 * Corrige una sesión que se quedó encendida: hora de fin y minutos de foco. Solo puede quitar tiempo
 * (lo medido es el tope, así no se inflan sesiones) y rehace el XP de esa sesión, fechado al nuevo fin.
 */
export function editSession(s: GameState, id: string, patch: { endedAt: number; minutes: number }): GameState {
  const x = s.sessions.find((y) => y.id === id);
  if (!x) return s;
  const measured = sessionMeasured(x);
  const endedAt = Math.max(x.startedAt + 60_000, Math.min(measured.endedAt, patch.endedAt));
  const room = Math.max(1, Math.floor((endedAt - x.startedAt) / 60_000));
  const minutes = Math.max(1, Math.min(measured.minutes, room, Math.round(patch.minutes)));
  if (endedAt === x.endedAt && minutes === x.minutes) return s;
  const next: DeepWorkSession = { ...x, endedAt, minutes, measured };
  return {
    ...s,
    sessions: s.sessions.map((y) => (y.id === id ? next : y)),
    xp: s.xp.map((t) => (t.source === 'deepwork' && t.sourceId === id
      ? { ...t, at: endedAt, amount: minutes * XP_RULES.deepWorkPerMinute, attributes: deepWorkRewards(minutes, x.area) }
      : t)),
  };
}

/** Borra una sesión (p. ej. la empezaste sin querer) y el XP que dio. */
export function deleteSession(s: GameState, id: string): GameState {
  return {
    ...s,
    sessions: s.sessions.filter((x) => x.id !== id),
    xp: s.xp.filter((t) => !(t.source === 'deepwork' && t.sourceId === id)),
  };
}
