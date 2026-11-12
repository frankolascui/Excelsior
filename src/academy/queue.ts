// Cola de repaso de hoy (portada de Excelsior Academy, ui/Review.tsx → loadQueue). Lee de las tablas study_*.
import { countNew, listAllTopics, listExamDates, listSubjects, loadDue, loadNew, loadStarted, newTopicsToday } from './api';
import { ensureParams } from './params';
import { examTopics, FINAL_DAYS, finalReview, HORIZON_DAYS, pacedNewPerDay, topicPriority, upcoming } from './plan';
import { buildQueue, newRoom } from './srs';
import type { CardRow, ExamDate, Level } from './types';

/**
 * Cola de hoy para un ámbito (unos temas, una asignatura o todo):
 * 1. las tarjetas que ya tocan;
 * 2. si hay examen en los próximos 3 días, el «repaso final» de sus temas (plan.ts);
 * 3. las nuevas de cada asignatura: el límite de su nivel o, si hay examen cerca y no te da tiempo,
 *    las que hagan falta para verlas todas la víspera (pacedNewPerDay);
 * 4. todo ordenado por cercanía del examen e intercalado por temas.
 */
export async function loadQueue(subjectId?: string, topicIds?: string[]) {
  const [topics, subjects, startedToday, exams] = await Promise.all([
    listAllTopics(), listSubjects(), newTopicsToday(), ensureParams(),
    listExamDates().catch(() => [] as ExamDate[]), // si aún no existe la tabla, sin plan
  ]).then(([t, s, n, , e]) => [t, s, n, e] as const);
  const now = new Date();
  const subjectOf = new Map(topics.map((t) => [t.id, t.subject_id]));
  const levelOf = new Map<string, Level>(subjects.map((s) => [s.id, s.level ?? 'equilibrado']));
  const topicsOfSubject = (sid: string) => topics.filter((t) => t.subject_id === sid).map((t) => t.id);

  const inScope = topicIds?.length ? topicIds : subjectId ? topicsOfSubject(subjectId) : null;
  const scopeTopics = inScope ?? topics.map((t) => t.id);
  const scope = new Set(scopeTopics);

  const done = new Map<string, number>();
  for (const tid of startedToday) { const s = subjectOf.get(tid); if (s) done.set(s, (done.get(s) ?? 0) + 1); }
  const room = newRoom(levelOf, done);

  // Exámenes cercanos: prioridad por tema y examen más próximo de cada asignatura.
  const priority = topicPriority(exams, topicsOfSubject, now);
  const nextExam = new Map<string, ReturnType<typeof upcoming<ExamDate>>[number]>();
  for (const e of upcoming(exams, now)) if (e.daysLeft <= HORIZON_DAYS && !nextExam.has(e.subject_id)) nextExam.set(e.subject_id, e);
  const examTopicIds = [...priority.keys()].filter((t) => scope.has(t));
  const newLeft = await countNew(examTopicIds).catch(() => new Map<string, number>());

  const freshLoads: Promise<CardRow[]>[] = [];
  for (const [sid, levelRoom] of room) {
    const mine = scopeTopics.filter((t) => subjectOf.get(t) === sid);
    if (!mine.length) continue;
    const e = nextExam.get(sid);
    if (!e) { freshLoads.push(loadNew(mine, levelRoom)); continue; }
    const eTopics = new Set(examTopics(e, topicsOfSubject));
    const left = mine.filter((t) => eTopics.has(t)).reduce((n, t) => n + (newLeft.get(t) ?? 0), 0);
    const need = Math.max(levelRoom, pacedNewPerDay(left, e.daysLeft) - (done.get(sid) ?? 0));
    freshLoads.push(loadNew(mine.filter((t) => eTopics.has(t)), need).then(async (examNew) => [
      ...examNew,
      ...(await loadNew(mine.filter((t) => !eTopics.has(t)), Math.max(0, levelRoom - examNew.length))),
    ]));
  }

  // Repaso final de los exámenes de los próximos días.
  const finals = [...nextExam.values()].filter((e) => e.daysLeft <= FINAL_DAYS);
  const finalLoads = finals.map(async (e) => {
    const ts = examTopics(e, topicsOfSubject).filter((t) => scope.has(t));
    return finalReview(await loadStarted(ts), e.date, now, levelOf.get(e.subject_id) ?? 'equilibrado');
  });

  const [due, fresh, final] = await Promise.all([
    scopeTopics.length ? loadDue(inScope) : Promise.resolve([]),
    Promise.all(freshLoads),
    Promise.all(finalLoads),
  ]);
  // Las del repaso final se tratan como si ya tocaran (due = ahora), sin repetir ninguna.
  const seen = new Set(due.map((c) => c.id));
  const early = final.flat().filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ ...c, due: now.toISOString() }));
  // El límite de nuevas ya se ha aplicado al pedirlas: aquí solo se ordena e intercala.
  const queue = buildQueue([...due, ...early, ...fresh.flat()], now, 0, Infinity, priority);
  return {
    queue, topics, subjects, exams: upcoming(exams, now),
    earlyIds: new Set(early.map((c) => c.id)),
    levelOfTopic: (tid: string): Level => levelOf.get(subjectOf.get(tid) ?? '') ?? 'equilibrado',
  };
}

