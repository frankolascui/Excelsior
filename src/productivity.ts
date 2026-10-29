// Productividad de una sesión de Deep Work: Tiempo real × Rendimiento × Sentido, amplificado por la Mentalidad.
// Horas productivas = horas de foco × (R × S)^(3 / M). R va de 1 a 5 (5 = 1), S sale solo y M = 3 es neutro:
// con 5 el factor R × S se acerca a 1 (sube) y con 1 se hunde (baja). Nunca pasa de las horas de foco.
// No toca el XP: si las notas que te pones dieran XP, inflarlas compensaría y el índice dejaría de servir.
import type { DeepWorkSession, GameState } from './types';
import { dayKey, shiftDay } from './game';

export const FREE_LABEL = 'Deep Work libre';

export const PERFORMANCE_LABELS = ['Casi nada', 'Poco', 'Normal', 'Bueno', 'Excelente'];
export const MINDSET_LABELS = ['Lo sufrí', 'Por obligación', 'Neutral', 'Con ganas', 'Un reto que me hace crecer'];

/** Sentido: con una misión vinculada, 1; con una intención escrita, 0,8; sesión libre, 0,6. */
export function senseOf(x: Pick<DeepWorkSession, 'questId' | 'label'>): number {
  if (x.questId) return 1;
  return x.label && x.label !== FREE_LABEL ? 0.8 : 0.6;
}

export function productiveHours(hours: number, performance: number, sense: number, mindset: number): number {
  const base = Math.max(0, Math.min(1, (performance / 5) * sense));
  return hours * base ** (3 / Math.max(1, Math.min(5, mindset)));
}

/** Horas productivas de una sesión valorada; null si aún no tiene nota. */
export function sessionProductivity(x: DeepWorkSession): number | null {
  if (!x.rating) return null;
  return productiveHours(x.minutes / 60, x.rating.performance, senseOf(x), x.rating.mindset);
}

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export function rateSession(s: GameState, id: string, performance: number, mindset: number): GameState {
  if (!s.sessions.some((x) => x.id === id)) return s;
  const rating = { performance: clamp5(performance), mindset: clamp5(mindset) };
  return { ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, rating } : x)) };
}

/** Últimos 7 días (hoy incluido): horas productivas de las valoradas frente a sus horas de foco. */
export function productivityWeek(s: GameState, now: number): { productive: number; focus: number; rated: number } {
  const from = dayKey(shiftDay(now, -6));
  let productive = 0;
  let focus = 0;
  let rated = 0;
  for (const x of s.sessions) {
    const p = sessionProductivity(x);
    if (p === null || dayKey(x.endedAt) < from) continue;
    productive += p;
    focus += x.minutes / 60;
    rated++;
  }
  return { productive, focus, rated };
}

export const formatHours = (h: number) => `${h.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} h`;
