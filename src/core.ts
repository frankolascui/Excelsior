// Reglas pequeñas del núcleo (Hoy, hábitos, reinos) que no encajan en game.ts.
import type { GameState } from './types';
import { dayKey, shiftDay } from './game';

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
