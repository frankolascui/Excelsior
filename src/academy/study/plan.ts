// El plan hasta el examen: lógica pura (fechas y números), se prueba en plan.test.ts.
import { daysUntil } from './logic';
import { LEVELS, schedulerFor, toCard } from './srs';
import type { CardRow, ExamDate, Level } from './types';

/** Solo se tienen en cuenta los exámenes de las próximas 5 semanas. */
export const HORIZON_DAYS = 35;
/**
 * La última semana antes del examen se adelantan las tarjetas que olvidarías ese día, repartidas:
 * cada día una parte (las que más olvidarías primero), en vez de todas en los 3 últimos días.
 */
export const FINAL_DAYS = 7;
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
 * Se adelantan, las de menor probabilidad primero. FSRS no se toca: solo se adelanta la fecha de repaso.
 * Con `daysLeft` se reparte: hoy toca la parte que corresponde a los días que quedan (la víspera, todas).
 */
export function finalReview(cards: readonly CardRow[], examDate: string, now: Date, level: Level, daysLeft = 0): CardRow[] {
  const [y, m, d] = examDate.split('-').map(Number);
  const at = new Date(y, m - 1, d, 9); // a las 9 de la mañana del día del examen
  const target = Math.max(LEVELS[level].retention, EXAM_DAY_TARGET);
  const s = schedulerFor(level);
  return cards
    .filter((c) => c.state !== 0 && new Date(c.due) > now)
    .map((c) => ({ c, r: s.get_retrievability(toCard(c), at, false) }))
    .filter((x) => x.r < target)
    .sort((a, b) => a.r - b.r)
    .filter((_, i, all) => i < Math.ceil(all.length / Math.max(1, daysLeft)))
    .map((x) => x.c);
}

// ---------- Plan día a día (método de los 3 simulacros) ----------

export type PlanItemKind = 'nuevas' | 'repaso' | 'tema' | 'simulacro' | 'fallos' | 'examen' | 'descanso';

export interface PlanItem {
  kind: PlanItemKind;
  /** Lo que lee el alumno. */
  text: string;
  /** Para abrir el repaso de ese tema. */
  topicId?: string;
  /** Simulacro ya importado. */
  examId?: string;
  /** Número del simulacro del método (1–3), en simulacros y fallos. */
  sim?: number;
  minutes?: number;
  done?: boolean;
}

export interface PlanDay { date: Date; daysLeft: number; items: PlanItem[]; minutes: number }

export interface PlanSim { id: string; title: string; grade: number | null; finishedAt: string | null }

export interface PlanInput {
  daysLeft: number;
  today: Date;
  /** Temas del examen, en orden. */
  topics: { id: string; title: string }[];
  /** Tarjetas sin empezar de cada tema. */
  newByTopic: Map<string, number>;
  /** Nuevas al día según tu nivel. */
  levelPerDay: number;
  /** Tarjetas que tocan cada día (hoy = 0), ya con la parte del repaso final. */
  dueByDay: number[];
  /** Segundos por tarjeta (10 si no hay datos). */
  secPerCard: number;
  /** Simulacros de la asignatura con temas del examen, del más antiguo al más nuevo. */
  sims: PlanSim[];
}

export interface Plan {
  days: PlanDay[];
  /** «Plan comprimido: faltan N días» (menos de 10). */
  note?: string;
  /** No da tiempo a ver todas las nuevas. */
  warn?: string;
}

/** Por debajo de esta nota, dos días de fallos en vez de uno. */
export const LOW_GRADE = 6.5;
const FALLOS_MIN = 25;

/**
 * Qué día (días que faltan) va cada simulacro según lo que queda:
 * ≥10 → D-10, D-4, D-1 · 6–9 → hoy, D-3, D-1 · 4–5 → hoy, D-2 · 2–3 → hoy · 1 → hoy, corto.
 */
export function simDays(daysLeft: number): number[] {
  if (daysLeft >= 10) return [10, 4, 1];
  if (daysLeft >= 6) return [daysLeft, 3, 1];
  if (daysLeft >= 4) return [daysLeft, 2];
  if (daysLeft >= 1) return [daysLeft];
  return [];
}

export function buildPlan(p: PlanInput): Plan {
  const { daysLeft, today, topics, secPerCard } = p;
  const when = simDays(daysLeft);
  const nSims = when.length;
  const lastNewDay = 2; // a partir de D-2, nada nuevo
  const newDays = Math.max(0, daysLeft - lastNewDay);
  const newLeft = [...p.newByTopic.values()].reduce((a, b) => a + b, 0);
  const per = Math.max(p.levelPerDay, pacedNewPerDay(newLeft, newDays));
  const left = new Map(topics.map((t) => [t.id, p.newByTopic.get(t.id) ?? 0]));
  const name = new Map(topics.map((t, i) => [t.id, t.title || `Tema ${i + 1}`]));

  // Días de fallos: el siguiente a cada simulacro (dos si la nota fue baja); si el siguiente es el examen, el mismo día.
  const fallos = new Map<number, number>(); // días que faltan → número de simulacro
  // Con 2–5 días no hay tercer simulacro: los fallos del último se hacen la víspera.
  const eve = daysLeft >= 2 && nSims < 3 && !when.includes(1);
  when.forEach((rest, k) => {
    const grade = p.sims[k]?.grade ?? null;
    const n = grade !== null && grade < LOW_GRADE ? 2 : 1;
    const first = eve && k === nSims - 1 ? 1 : rest - 1;
    for (let j = 0; j < n; j++) {
      const r = first - j;
      if (r >= 1 && r < rest && !when.includes(r) && !fallos.has(r)) fallos.set(r, k + 1);
    }
  });

  let topicTurn = 0;
  const days: PlanDay[] = [];
  for (let i = 0; i <= daysLeft; i++) {
    const rest = daysLeft - i;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const items: PlanItem[] = [];
    if (rest === 0) {
      items.push({ kind: 'examen', text: 'Examen. Solo 10 min de tus errores al despertar', minutes: 10 });
      days.push({ date, daysLeft: rest, items, minutes: 10 });
      continue;
    }
    const k = when.indexOf(rest);
    if (k >= 0) {
      const sim = p.sims[k];
      const short = k === 2 || (daysLeft === 1);
      const kind = k === 0 ? (daysLeft >= 10 ? 'diagnóstico, completo' : 'en frío, completo') : k === 1 ? 'completo, otra formulación' : 'corto, formato real';
      const label = `Simulacro ${k + 1}`;
      const done = !!sim?.finishedAt;
      const text = sim
        ? `${label} (${short && daysLeft === 1 ? 'corto' : kind})${sim.grade !== null ? ` · ${String(sim.grade).replace('.', ',')}` : done ? ' · hecho' : ''}`
        : `${label} (${short && daysLeft === 1 ? 'corto' : kind}) · pídelo a Claude e impórtalo`;
      items.push({ kind: 'simulacro', text, sim: k + 1, examId: sim?.id, minutes: short ? 30 : 60, done });
      if (rest === 1) items.push({ kind: 'fallos', text: `Rehaz sus fallos`, sim: k + 1, minutes: 15 });
    }
    const f = fallos.get(rest);
    if (f) items.push({ kind: 'fallos', text: `Rehaz los fallos del Simulacro ${f}`, sim: f, minutes: FALLOS_MIN });
    // Nuevas, por temas en orden, hasta D-3.
    if (rest > lastNewDay) {
      let room = per;
      for (const t of topics) {
        const n = Math.min(room, left.get(t.id) ?? 0);
        if (n <= 0) continue;
        left.set(t.id, (left.get(t.id) ?? 0) - n);
        room -= n;
        items.push({ kind: 'nuevas', text: `${n} ${n === 1 ? 'nueva' : 'nuevas'} del ${name.get(t.id)}`, topicId: t.id, minutes: Math.ceil((n * secPerCard * 3) / 60) });
        if (room <= 0) break;
      }
    }
    // Tema del día, por turnos, los días sin simulacro (primero los que aún tienen nuevas).
    if (k < 0 && topics.length > 0 && rest > 1) {
      const order = [...topics].sort((a, b) => Number((left.get(b.id) ?? 0) > 0) - Number((left.get(a.id) ?? 0) > 0));
      const t = order[topicTurn % order.length];
      topicTurn++;
      items.push({ kind: 'tema', text: `${name.get(t.id)}: esquema sin mirar (3 min) y repasa solo sus tarjetas`, topicId: t.id, minutes: 3 });
    }
    const cards = Math.max(0, Math.round(p.dueByDay[i] ?? 0));
    if (cards > 0) {
      const mins = Math.max(1, Math.round((cards * secPerCard) / 60));
      items.push({ kind: 'repaso', text: `~${cards} ${cards === 1 ? 'tarjeta' : 'tarjetas'} de repaso · ${mins} min`, minutes: mins });
    } else if (i === 0) {
      items.push({ kind: 'repaso', text: 'Repasos de hoy', done: true, minutes: 0 });
    }
    if (rest === 1) items.push({ kind: 'descanso', text: 'Nada nuevo. Duerme 8 h' });
    days.push({ date, daysLeft: rest, items, minutes: items.reduce((a, x) => a + (x.minutes ?? 0), 0) });
  }
  const leftOver = [...left.values()].reduce((a, b) => a + b, 0);
  return {
    days,
    note: daysLeft > 0 && daysLeft < 10 ? `Plan comprimido: faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : undefined,
    warn: leftOver > 0 ? 'No te da tiempo a ver todas las tarjetas nuevas: prioriza los simulacros' : undefined,
  };
}

/** Día (YYYY-MM-DD) que el plan da al simulacro número `n` (1–3) de un examen, o undefined si no lleva. */
export function simDay(examDate: string, n: number, today = new Date()): string | undefined {
  const left = daysUntil(examDate, today);
  if (left === null || left < 0) return undefined;
  const rest = simDays(left)[n - 1];
  if (rest === undefined) return undefined;
  const [y, m, d] = examDate.split('-').map(Number);
  const at = new Date(y, m - 1, d - rest, 12);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}
