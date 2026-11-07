// Revisión semanal: qué funcionó, qué no y qué cambio pruebas. La semana siguiente se pregunta si sirvió.
import type { GameState, WeeklyReview } from './types';
import { dayKey, shiftDay } from './game';
import { weekStart } from './summary';

const clip = (t: string | undefined, max = 400) => {
  const v = t?.trim().slice(0, max);
  return v || undefined;
};

/** Lunes (YYYY-MM-DD) de la semana pasada: la que se revisa esta semana. */
export const reviewWeekKey = (now: number) => dayKey(shiftDay(weekStart(now), -7));

export function weeklyReview(s: GameState, week: string): WeeklyReview | undefined {
  return s.weeklyReviews?.find((r) => r.week === week);
}

/** La revisión anterior a `week` (la que propuso el cambio que ahora se evalúa). */
export function previousReview(s: GameState, week: string): WeeklyReview | undefined {
  return (s.weeklyReviews ?? []).filter((r) => r.week < week).sort((a, b) => b.week.localeCompare(a.week))[0];
}

export function saveWeeklyReview(s: GameState, week: string, r: Omit<WeeklyReview, 'week' | 'at'>, now: number): GameState {
  const next: WeeklyReview = { week, at: now };
  const worked = clip(r.worked), failed = clip(r.failed), change = clip(r.change, 200), focus = clip(r.focus, 200);
  if (worked) next.worked = worked;
  if (failed) next.failed = failed;
  if (change) next.change = change;
  if (focus) next.focus = focus;
  if (r.prevVerdict) next.prevVerdict = r.prevVerdict;
  return { ...s, weeklyReviews: [...(s.weeklyReviews ?? []).filter((x) => x.week !== week), next].sort((a, b) => a.week.localeCompare(b.week)) };
}

/** El cambio que estás probando esta semana (el que escribiste al revisar la semana pasada). */
export function currentChange(s: GameState, now: number): string | undefined {
  return weeklyReview(s, reviewWeekKey(now))?.change;
}

/** Lo más importante de esta semana (lo que decidiste al revisar la pasada). */
export function weekFocus(s: GameState, now: number): string | undefined {
  return weeklyReview(s, reviewWeekKey(now))?.focus;
}

export const VERDICTS: { id: NonNullable<WeeklyReview['prevVerdict']>; name: string }[] = [
  { id: 'si', name: 'Sí, me lo quedo' },
  { id: 'medias', name: 'A medias' },
  { id: 'no', name: 'No, lo cambio' },
];
