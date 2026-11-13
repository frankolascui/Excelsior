// El plan hasta el examen: lógica pura (fechas y números), se prueba en plan.test.ts.
import { daysUntil } from './logic';
import { LEVELS, schedulerFor, toCard } from './srs';
import type { CardRow, ExamDate, Level } from './types';

/** Solo se tienen en cuenta los exámenes de las próximas 5 semanas. */
export const HORIZON_DAYS = 35;
/** Los últimos días antes del examen se adelantan las tarjetas que olvidarías ese día. */
export const FINAL_DAYS = 3;
/** Tope de nuevas al día aunque el examen esté muy cerca (más es empollar, no aprender). */
export const MAX_NEW_PER_DAY = 80;

/** Exámenes de hoy en adelante, el más cercano primero. */
export function upcoming<T extends Pick<ExamDate, 'date'>>(exams: readonly T[], today = new Date()): (T & { daysLeft: number })[] {
  return exams
    .map((e) => ({ ...e, daysLeft: daysUntil(e.date, today) ?? -1 }))
    .filter((e) => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Temas de un examen: los marcados o, si no marcaste ninguno, todos los de la asignatura. */
export function examTopics(e: Pick<ExamDate, 'subject_id' | 'topic_ids'>, topicsOfSubject: (subjectId: string) => string[]): string[] {
  return e.topic_ids.length ? e.topic_ids : topicsOfSubject(e.subject_id);
}

/** Días que faltan para el examen más cercano de cada tema (solo los que están dentro del horizonte). */
export function topicPriority(exams: readonly ExamDate[], topicsOfSubject: (s: string) => string[], today = new Date()): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of upcoming(exams, today)) {
    if (e.daysLeft > HORIZON_DAYS) continue;
    for (const t of examTopics(e, topicsOfSubject)) if (!out.has(t)) out.set(t, e.daysLeft);
  }
  return out;
}

/**
 * Nuevas al día para haber visto todas las de los temas del examen el día ANTES del examen.
 * Ej.: 60 nuevas y faltan 6 días → 10 al día (hoy + 5 días; el día del examen no se aprende nada nuevo).
 */
export function pacedNewPerDay(newLeft: number, daysLeft: number): number {
  if (newLeft <= 0 || daysLeft <= 0) return 0;
  return Math.min(MAX_NEW_PER_DAY, Math.ceil(newLeft / daysLeft));
}

/** El día del examen quieres recordar al menos un 90 %, aunque tu nivel sea «Mínimo» (80 %). */
export const EXAM_DAY_TARGET = 0.9;

/**
 * «Repaso final»: tarjetas de los temas del examen que aún no tocan, pero que según FSRS
 * recordarías el día del examen con menos probabilidad que el objetivo (el mayor entre tu nivel y 90 %).
 * Se adelantan, las de menor probabilidad primero.
 */
export function finalReview(cards: readonly CardRow[], examDate: string, now: Date, level: Level, limit = 60): CardRow[] {
  const [y, m, d] = examDate.split('-').map(Number);
  const at = new Date(y, m - 1, d, 9); // a las 9 de la mañana del día del examen
  const target = Math.max(LEVELS[level].retention, EXAM_DAY_TARGET);
  const s = schedulerFor(level);
  return cards
    .filter((c) => c.state !== 0 && new Date(c.due) > now)
    .map((c) => ({ c, r: s.get_retrievability(toCard(c), at, false) }))
    .filter((x) => x.r < target)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map((x) => x.c);
}

export interface PlanDay { date: Date; daysLeft: number; items: string[] }

/**
 * Plan sugerido día a día, del hoy al examen:
 * - nuevas al ritmo de tu nivel, o repartidas para terminar la víspera si así no llegas;
 * - simulacros sin apuntes a 6 y 3 días (si da tiempo), para que haya días de repaso entre medias;
 * - los 3 últimos días, repaso final de lo que olvidarías;
 * - el día del examen, nada nuevo.
 */
export function buildPlan(daysLeft: number, newLeft: number, today = new Date(), levelPerDay = 0): PlanDay[] {
  const sims = daysLeft >= 7 ? [6, 3] : daysLeft >= 4 ? [3] : daysLeft >= 2 ? [daysLeft] : [];
  // Al ritmo de tu nivel, o más rápido si a ese ritmo no te da tiempo.
  const per = Math.max(levelPerDay, pacedNewPerDay(newLeft, daysLeft));
  let left = newLeft;
  const out: PlanDay[] = [];
  for (let i = 0; i <= daysLeft; i++) {
    const rest = daysLeft - i;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const items: string[] = [];
    if (rest === 0) {
      items.push('Examen', 'Solo un repaso corto de lo que falles al despertar. Nada nuevo.');
    } else {
      const n = Math.min(per, left);
      left -= n;
      if (n > 0) items.push(n === 1 ? '1 tarjeta nueva' : `${n} tarjetas nuevas`);
      items.push(rest <= FINAL_DAYS ? 'Repasos + repaso final de los temas del examen' : 'Repasos del día');
      if (sims.includes(rest)) items.push(sims.length === 2 && rest === 6 ? 'Simulacro 1 sin apuntes' : sims.length === 2 ? 'Simulacro 2 sin apuntes' : 'Simulacro sin apuntes');
      if (rest === 1) items.push('Repasa los fallos del último simulacro y duerme bien');
    }
    out.push({ date, daysLeft: rest, items });
  }
  return out;
}
