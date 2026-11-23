// Exámenes de Academy en el calendario. Academy guarda cada examen (nombre, día, temas) en Supabase;
// el calendario tiene una copia como evento «examen» con id `acad-<id>`, para que salga en el mes, en Hoy y en los avisos.
// Nombre y día mandan en Academy: si cambian en el calendario, se suben; hora y color son solo del calendario.
import type { AcademyLink, CalendarEvent, GameState } from './types';
import type { ExamDate, Subject } from './academy/study/types';

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
