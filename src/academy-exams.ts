// Exámenes de Academy en el calendario. Academy guarda cada examen (nombre, día, temas) en Supabase;
// el calendario tiene una copia como evento «examen» con id `acad-<id>`, para que salga en el mes, en Hoy y en los avisos.
// Nombre y día mandan en Academy: si cambian en el calendario, se suben; hora y color son solo del calendario.
import type { AcademyLink, CalendarEvent, GameState, Quest } from './types';
import type { Exam, ExamDate, Subject } from './academy/study/types';
import { HORIZON_DAYS, simDay, simDays, upcoming } from './academy/study/plan';

export const ACADEMY_EVENT_PREFIX = 'acad-';
export const academyEventId = (examId: string) => `${ACADEMY_EVENT_PREFIX}${examId}`;

/**
 * Pone los eventos al día con los exámenes de Academy: crea los nuevos, corrige nombre, día y asignatura,
 * y quita los que ya no existen. Lo demás del evento (hora, color) se queda. Sin cambios devuelve el mismo estado.
 */
export function syncAcademyExams(s: GameState, exams: ExamDate[], subjects: Pick<Subject, 'id' | 'name'>[], now: number): GameState {
  const names = new Map(subjects.map((x) => [x.id, x.name]));
  const events = s.events ?? [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const wanted = new Set<string>();
  let changed = false;
  const next: CalendarEvent[] = [];
  for (const e of events) {
    if (!e.academy) { next.push(e); continue; }
    const exam = exams.find((x) => x.id === e.academy!.examId);
    if (!exam) { changed = true; continue; } // borrado en Academy
    wanted.add(exam.id);
    const fresh = toEvent(exam, names.get(exam.subject_id) ?? e.academy.subject, e, now);
    if (!same(e, fresh)) changed = true;
    next.push(fresh);
  }
  for (const exam of exams) {
    if (wanted.has(exam.id) || byId.has(academyEventId(exam.id))) continue;
    next.push(toEvent(exam, names.get(exam.subject_id) ?? 'Academy', undefined, now));
    changed = true;
  }
  return changed ? { ...s, events: next } : s;
}

function toEvent(exam: ExamDate, subject: string, prev: CalendarEvent | undefined, now: number): CalendarEvent {
  const academy: AcademyLink = { examId: exam.id, subjectId: exam.subject_id, subject };
  const out: CalendarEvent = { id: academyEventId(exam.id), title: exam.title, day: exam.date, kind: 'examen', academy, createdAt: prev?.createdAt ?? now };
  if (prev?.time) out.time = prev.time;
  if (prev?.time && prev.end) out.end = prev.end;
  if (prev?.color) out.color = prev.color;
  return out;
}

const same = (a: CalendarEvent, b: CalendarEvent) =>
  a.title === b.title && a.day === b.day && a.kind === b.kind && !a.repeat
  && a.academy?.examId === b.academy?.examId && a.academy?.subjectId === b.academy?.subjectId && a.academy?.subject === b.academy?.subject;

/** El evento de un examen recién creado desde el calendario (con su hora y color, si se eligieron). */
export function addAcademyEvent(s: GameState, exam: ExamDate, subject: string, extra: Pick<CalendarEvent, 'time' | 'end' | 'color'>, now: number): GameState {
  const ev = toEvent(exam, subject, { ...extra, createdAt: now } as CalendarEvent, now);
  return { ...s, events: [...(s.events ?? []).filter((e) => e.id !== ev.id), ev] };
}

// ---------- Simulacros como misiones ----------

/** Lo que el RPG necesita de un simulacro (sin enunciado ni respuestas). */
export type SimSummary = Pick<Exam, 'id' | 'subject_id' | 'title' | 'topic_ids' | 'finished_at' | 'created_at'>;

export const SIM_QUEST_PREFIX = 'acad-sim-';
export const simQuestId = (simId: string) => `${SIM_QUEST_PREFIX}${simId}`;

export function simQuestTitle(sim: Pick<SimSummary, 'title'>, subject: string): string {
  const t = sim.title.trim() || 'Simulacro';
  return /simulacro/i.test(t) ? `${subject}: ${t}` : `Simulacro de ${subject}: ${t}`;
}

/**
 * Cada simulacro sin entregar es una misión (impacto medio, Sabiduría). Su fecha límite la da `deadlineFor`
 * (el día que el plan del examen le asigna). Un simulacro entregado o borrado en Academy quita su misión pendiente;
 * las misiones ya completadas no se tocan. Las que borraste a mano (`academyIgnored`) no vuelven.
 */
export function syncSimulacros(
  s: GameState, sims: SimSummary[], subjects: Pick<Subject, 'id' | 'name'>[],
  deadlineFor: (sim: SimSummary) => string | undefined, now: number,
): GameState {
  const names = new Map(subjects.map((x) => [x.id, x.name]));
  const ignored = new Set(s.academyIgnored ?? []);
  const open = new Map(sims.filter((x) => !x.finished_at).map((x) => [x.id, x]));
  let changed = false;
  const quests: Quest[] = [];
  for (const q of s.quests) {
    if (!q.academy || q.completedAt || q.academy.plan) { quests.push(q); continue; }
    const sim = open.get(q.academy.simId);
    if (!sim) { changed = true; continue; } // entregado o borrado en Academy
    const next = simQuest(sim, names.get(sim.subject_id) ?? 'Academy', deadlineFor(sim), q);
    if (next.title !== q.title || next.deadline !== q.deadline) changed = true;
    quests.push(next);
  }
  for (const sim of open.values()) {
    if (ignored.has(sim.id) || s.quests.some((q) => q.academy?.simId === sim.id)) continue;
    quests.push(simQuest(sim, names.get(sim.subject_id) ?? 'Academy', deadlineFor(sim), undefined, now));
    changed = true;
  }
  return changed ? { ...s, quests } : s;
}

function simQuest(sim: SimSummary, subject: string, deadline: string | undefined, prev?: Quest, now = 0): Quest {
  const q: Quest = prev
    ? { ...prev, title: simQuestTitle(sim, subject) }
    : { id: simQuestId(sim.id), title: simQuestTitle(sim, subject), type: 'side', impact: 'medio', focus: 'sabiduria', createdAt: now, completedAt: null, academy: { simId: sim.id, subjectId: sim.subject_id } };
  if (deadline) q.deadline = deadline; else delete q.deadline;
  return q;
}

export const planSimId = (examId: string, n: number) => `plan-${examId}-${n}`;

/**
 * Los simulacros que el plan de un examen pide (D-10, D-4, D-1…) y que aún no has creado en Academy también son
 * misiones, con su día del plan como fecha límite. Al crear el simulacro N en Academy, su misión real sustituye
 * a la del plan. Solo exámenes de las próximas 5 semanas. Las completadas no se tocan; las borradas no vuelven.
 */
export function syncPlannedSims(
  s: GameState, sims: SimSummary[], exams: ExamDate[], subjects: Pick<Subject, 'id' | 'name'>[], now: number, today = new Date(now),
): GameState {
  const names = new Map(subjects.map((x) => [x.id, x.name]));
  const ignored = new Set(s.academyIgnored ?? []);
  const overlaps = (a: string[], b: string[]) => !a.length || !b.length || a.some((t) => b.includes(t));
  const wanted = new Map<string, Quest>();
  for (const exam of upcoming(exams, today)) {
    if (exam.daysLeft > HORIZON_DAYS) continue;
    const made = sims.filter((x) => x.subject_id === exam.subject_id && overlaps(exam.topic_ids, x.topic_ids)).length;
    const subject = names.get(exam.subject_id) ?? 'Academy';
    simDays(exam.daysLeft).forEach((_, i) => {
      const n = i + 1;
      if (n <= made) return;
      const id = planSimId(exam.id, n);
      wanted.set(id, {
        id: `${SIM_QUEST_PREFIX}${id}`, title: `Simulacro ${n} de ${subject}${exam.title.trim() ? ` (${exam.title.trim()})` : ''}`,
        type: 'side', impact: 'medio', focus: 'sabiduria', createdAt: now, completedAt: null,
        deadline: simDay(exam.date, n, today) ?? exam.date,
        academy: { simId: id, subjectId: exam.subject_id, plan: { examId: exam.id, n } },
      });
    });
  }
  let changed = false;
  const quests: Quest[] = [];
  for (const q of s.quests) {
    if (!q.academy?.plan || q.completedAt) { quests.push(q); continue; }
    const w = wanted.get(q.academy.simId);
    if (!w) { changed = true; continue; } // ya creado en Academy, examen pasado o borrado
    if (w.title !== q.title || w.deadline !== q.deadline) changed = true;
    quests.push({ ...q, title: w.title, deadline: w.deadline });
  }
  for (const [id, w] of wanted) {
    if (ignored.has(id) || s.quests.some((q) => q.academy?.simId === id)) continue;
    quests.push(w);
    changed = true;
  }
  return changed ? { ...s, quests } : s;
}

/** La misión pendiente de un simulacro, si existe. */
export const pendingSimQuest = (s: GameState, simId: string) => s.quests.find((q) => q.academy?.simId === simId && !q.completedAt);

/**
 * Fecha límite de la misión de un simulacro: el día que el plan del examen le da. El simulacro N de una asignatura
 * (por orden de creación, entre los que entran en ese examen) es el «Simulacro N» del plan del examen más cercano.
 * Sin examen a la vista, sin fecha.
 */
export function simDeadline(sim: SimSummary, allSims: SimSummary[], exams: ExamDate[], today = new Date()): string | undefined {
  const overlaps = (a: string[], b: string[]) => !a.length || !b.length || a.some((t) => b.includes(t));
  const exam = upcoming(exams.filter((e) => e.subject_id === sim.subject_id && overlaps(e.topic_ids, sim.topic_ids)), today)[0];
  if (!exam) return undefined;
  const mine = allSims.filter((x) => x.subject_id === sim.subject_id && overlaps(exam.topic_ids, x.topic_ids))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const n = mine.findIndex((x) => x.id === sim.id) + 1;
  return (n >= 1 ? simDay(exam.date, n, today) : undefined) ?? exam.date;
}
