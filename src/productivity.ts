// Productividad de una sesión de Deep Work: Tiempo real × Rendimiento × Sentido, amplificado por la Mentalidad.
// Horas productivas = horas de foco × (R/5 × S/5)^(3 / M). R, S y M van de 1 a 5 y M = 3 es neutro:
// con 5 el factor R × S se acerca a 1 (sube) y con 1 se hunde (baja). Con 5, 5 y 5 da el tiempo real entero
// y nunca pasa de él. El Sentido lo eliges tú (viene propuesto: misión 5, intención 4, libre 3); antes salía
// solo y una sesión sin misión no podía llegar nunca al máximo.
// No toca el XP: si las notas que te pones dieran XP, inflarlas compensaría y el índice dejaría de servir.
import type { DeepWorkSession, GameState } from './types';
import { dayKey, shiftDay } from './game';

export const FREE_LABEL = 'Deep Work libre';

export const PERFORMANCE_LABELS = ['Casi nada', 'Poco', 'Normal', 'Bueno', 'Excelente'];
export const SENSE_LABELS = ['Ninguno', 'Poco', 'Algo', 'Importante', 'Clave para mis metas'];
export const MINDSET_LABELS = ['Lo sufrí', 'Por obligación', 'Neutral', 'Con ganas', 'Un reto que me hace crecer'];

/** Sentido propuesto (1–5): con una misión vinculada, 5; con una intención escrita, 4; sesión libre, 3. */
export function suggestedSense(x: Pick<DeepWorkSession, 'questId' | 'label'>): number {
  if (x.questId) return 5;
  return x.label && x.label !== FREE_LABEL ? 4 : 3;
}

/** Sentido de una sesión (1–5): el que elegiste o, en valoraciones antiguas, el propuesto. */
export function senseOf(x: Pick<DeepWorkSession, 'questId' | 'label' | 'rating'>): number {
  return x.rating?.sense ?? suggestedSense(x);
}

/** R, S y M de 1 a 5. Con 5 en rendimiento y sentido da las horas enteras, sea cual sea la mentalidad. */
export function productiveHours(hours: number, performance: number, sense: number, mindset: number): number {
  const base = Math.max(0, Math.min(1, (performance / 5) * (sense / 5)));
  return hours * base ** (3 / Math.max(1, Math.min(5, mindset)));
}

/** Horas productivas de una sesión valorada; null si aún no tiene nota. */
export function sessionProductivity(x: DeepWorkSession): number | null {
  if (!x.rating) return null;
  return productiveHours(x.minutes / 60, x.rating.performance, senseOf(x), x.rating.mindset);
}

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export function rateSession(s: GameState, id: string, performance: number, mindset: number, sense?: number): GameState {
  if (!s.sessions.some((x) => x.id === id)) return s;
  const rating = { performance: clamp5(performance), mindset: clamp5(mindset), ...(sense ? { sense: clamp5(sense) } : {}) };
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
