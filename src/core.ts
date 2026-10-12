// Reglas pequeñas del núcleo (Hoy, hábitos, reinos) que no encajan en game.ts.
import type { GameState, Quest } from './types';
import { dayKey, shiftDay, uid } from './game';

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
