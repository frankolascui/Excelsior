import { useEffect, useState } from 'react';
import { countNew, createExamDate, deleteExamDate, listExamDates, listExams, listReviewsSince, loadStarted, updateExamDate, type ExamSummary } from '../study/api';
import { buildPlan, examTopics, FINAL_DAYS, finalReview, upcoming, type PlanDay, type PlanItem, type PlanItemKind } from '../study/plan';
import { forecast, secondsPerCard } from '../study/stats';
import { routeToHash } from '../study/logic';
import { BlockAdd } from '../../block-add';
import { LEVELS } from '../study/srs';
import type { ExamDate, Level, Topic } from '../study/types';
import { sfx } from '../sfx';
import { studyBridge } from '../bridge';
import { askConfirm } from './Dialog';
import { Icon, type IconName } from './Icon';
import { Menu, Modal } from './Kit';
import { DatePicker } from '../../pickers';

const fmtDay = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
export const inDays = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

/** Fechas de examen de una asignatura y, para la más cercana, el plan día a día. */
export function ExamDatesPanel({ subjectId, topics, level = 'equilibrado' }: { subjectId: string; topics: Topic[]; level?: Level }) {
  const [exams, setExams] = useState<ExamDate[] | null>(null);
  const [editing, setEditing] = useState<ExamDate | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listExamDates()
    .then((all) => { studyBridge.onExamDates?.(all); return all; }).then((all) => setExams(all.filter((e) => e.subject_id === subjectId))).catch((e) => setError(friendlyDates(e.message)));
  useEffect(() => { reload(); }, [subjectId]);

  const next = exams ? upcoming(exams) : [];
  const past = exams ? exams.filter((e) => !next.some((n) => n.id === e.id)) : [];
  const num = new Map(topics.map((t, i) => [t.id, i + 1]));

  return (
    <div className="stack">
      <header className="topic-head">
        <h2>Exámenes</h2>
        <button className="ghost" onClick={() => { setEditing('new'); sfx.open(); }}><Icon name="plus" /> Añadir examen</button>
      </header>
      {error && <p className="error">{error}</p>}
      {exams && next.length === 0 && (
        <p className="empty-state">Sin exámenes a la vista. Añade la fecha y los temas que entran: la web repartirá las tarjetas nuevas hasta ese día y te dará un plan. También saldrá en tu calendario.</p>
      )}
      {next.map((e, i) => (
        <ExamCard key={e.id} exam={e} topics={topics} level={level} perDay={LEVELS[level]?.newPerDay ?? 20} daysLeft={e.daysLeft} open={i === 0} topicIds={examTopics(e, () => topics.map((t) => t.id))}
          topicLabel={e.topic_ids.length ? `temas ${e.topic_ids.map((t) => num.get(t)).filter(Boolean).join(', ')}` : 'todos los temas'}
          onEdit={() => { setEditing(e); sfx.open(); }}
          onDelete={async () => {
            if (await askConfirm({ title: `¿Borrar «${e.title}»?`, message: 'Solo se borra la fecha; tus tarjetas y simulacros se quedan.', confirmLabel: 'Borrar', danger: true })) {
              try { await deleteExamDate(e.id); sfx.remove(); reload(); } catch (err) { setError((err as Error).message); }
            }
          }} />
      ))}
      {past.length > 0 && <p className="muted small">Ya pasados: {past.map((e) => e.title).join(' · ')}</p>}
      {editing && (
        <ExamDateForm subjectId={subjectId} topics={topics} exam={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

const KIND_ICON: Record<PlanItemKind, IconName> = {
  nuevas: 'plus', repaso: 'cards', tema: 'page', simulacro: 'exam', fallos: 'undo', examen: 'exam', descanso: 'clock',
};

/** Lo que el plan necesita de tus datos: nuevas por tema, tarjetas que tocan cada día, tu ritmo y los simulacros. */
async function loadPlanData(exam: ExamDate, topicIds: string[], level: Level) {
  const [newByTopic, started, reviews, sims] = await Promise.all([
    countNew(topicIds),
    loadStarted(topicIds),
    listReviewsSince(30).catch(() => []),
    listExams(exam.subject_id).catch(() => [] as ExamSummary[]),
  ]);
  return { newByTopic, started, secPerCard: secondsPerCard(reviews), level,
    sims: sims.filter((x) => !exam.topic_ids.length || !x.topic_ids.length || x.topic_ids.some((t) => exam.topic_ids.includes(t)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((x) => ({ id: x.id, title: x.title, grade: x.grade, finishedAt: x.finished_at })) };
}

function ExamCard({ exam, topics, level, perDay, daysLeft, open, topicIds, topicLabel, onEdit, onDelete }: {
  exam: ExamDate; topics: Topic[]; level: Level; perDay: number; daysLeft: number; open: boolean; topicIds: string[]; topicLabel: string; onEdit: () => void; onDelete: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPlanData>> | null>(null);
  const [blockFor, setBlockFor] = useState<string | null>(null);
  useEffect(() => { loadPlanData(exam, topicIds, level).then(setData).catch(() => setData(null)); }, [topicIds.join(','), exam.id, exam.date]);
  const newLeft = data ? [...data.newByTopic.values()].reduce((a, b) => a + b, 0) : 0;
  const plan = data ? (() => {
    const now = new Date();
    const fc = forecast(data.started, daysLeft + 1, now).map((d) => d.n);
    // repaso final: lo que olvidarías el día del examen, repartido en la última semana
    const final = finalReview(data.started, exam.date, now, data.level).length;
    const finalDays = Math.min(FINAL_DAYS, daysLeft);
    const dueByDay = fc.map((n, i) => n + (daysLeft - i <= FINAL_DAYS && daysLeft - i > 0 && finalDays > 0 ? Math.ceil(final / finalDays) : 0));
    const order = new Map(topics.map((t, i) => [t.id, i]));
    const planTopics = [...topicIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((id) => ({ id, title: `Tema ${(order.get(id) ?? 0) + 1}` }));
    return buildPlan({ daysLeft, today: now, topics: planTopics, newByTopic: data.newByTopic, levelPerDay: perDay, dueByDay, secPerCard: data.secPerCard, sims: data.sims });
  })() : null;
  const shown = plan?.days.slice(0, 15);
  const go = (it: PlanItem) => {
    if (it.kind === 'simulacro') location.hash = it.examId ? routeToHash({ view: 'simulacro', subjectId: exam.subject_id, examId: it.examId }) : routeToHash({ view: 'simulacros', subjectId: exam.subject_id });
    else if (it.kind === 'fallos') location.hash = routeToHash({ view: 'simulacros', subjectId: exam.subject_id });
    else if (it.kind === 'repaso' || it.kind === 'tema' || it.kind === 'nuevas') location.hash = routeToHash({ view: 'repasar', subjectId: exam.subject_id, topicIds: it.topicId ? [it.topicId] : topicIds });
    else return;
    sfx.page();
  };
  const blockTitle = (d: PlanDay) => `${exam.title}: ${d.items.filter((x) => !x.done && x.kind !== 'descanso').map((x) => x.text.split(' · ')[0].split(':')[0]).slice(0, 2).join(' + ')}`;
  return (
    <details className="exam-date" open={open}>
      <summary>
        <span className={daysLeft <= 3 ? 'countdown hot' : 'countdown'}><strong>{daysLeft}</strong><span>{daysLeft === 1 ? 'día' : 'días'}</span></span>
        <span className="exam-date-main">
          <strong>{exam.title}</strong>
          <span className="muted small">{fmtDay(new Date(`${exam.date}T12:00`))} · {topicLabel}{newLeft ? ` · ${newLeft} tarjetas sin empezar` : ''}</span>
        </span>
        <span onClick={(e) => e.preventDefault()}>
          <Menu label="Opciones del examen" items={[
            { icon: 'edit', label: 'Editar', onSelect: onEdit },
            { icon: 'trash', label: 'Borrar', danger: true, onSelect: onDelete },
          ]} />
        </span>
      </summary>
      {plan && (plan.note || plan.warn) && (
        <p className="plan-flags">{plan.note && <span className="plan-flag">{plan.note}</span>}{plan.warn && <span className="plan-flag warn">{plan.warn}</span>}</p>
      )}
      {!plan && <p className="muted small plan-note">Preparando el plan…</p>}
      {shown && (
        <ol className="plan">
          {shown.map((d, i) => {
            const day = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}`;
            return (
              <li key={d.daysLeft} className={d.daysLeft === 0 ? 'exam-day' : i === 0 ? 'today' : ''}>
                <span className="plan-day">{i === 0 ? 'Hoy' : fmtDay(d.date)}{d.minutes > 0 && <small className="plan-min"> · {d.minutes} min</small>}</span>
                <span className="plan-items">
                  {d.items.map((it, k) => {
                    const clickable = it.kind !== 'examen' && it.kind !== 'descanso';
                    const cls = `plan-item k-${it.kind}${it.kind === 'simulacro' ? ' sim' : ''}${it.done ? ' done' : ''}`;
                    const body = <><Icon name={it.done ? 'check' : KIND_ICON[it.kind]} size={14} /> {it.text}</>;
                    return clickable
                      ? <button key={k} type="button" className={cls} onClick={() => go(it)}>{body}</button>
                      : <span key={k} className={cls}>{body}</span>;
                  })}
                  {d.daysLeft > 0 && studyBridge.addBlock && (
                    <button type="button" className="plan-block" onClick={() => setBlockFor(blockFor === day ? null : day)} aria-expanded={blockFor === day} title="Reservar un hueco en el calendario">
                      <Icon name="clock" size={14} /> Bloque
                    </button>
                  )}
                </span>
                {blockFor === day && studyBridge.addBlock && (
                  <BlockAdd name={blockTitle(d)} initialDay={day} minutes={Math.max(30, Math.ceil(d.minutes / 15) * 15)}
                    onAdd={(w) => { studyBridge.addBlock?.(blockTitle(d), w); setBlockFor(null); }} onClose={() => setBlockFor(null)} />
                )}
              </li>
            );
          })}
          {plan!.days.length > shown!.length && <li className="muted small">… y {plan!.days.length - shown!.length} días más</li>}
        </ol>
      )}
      <p className="muted small plan-note">Pulsa una tarea para hacerla. Las tarjetas de estos temas salen primero en tus repasos{daysLeft <= 3 ? ' y ya está activo el repaso final' : ''}.</p>
    </details>
  );
}

function ExamDateForm({ subjectId, topics, exam, onClose, onDone }: { subjectId: string; topics: Topic[]; exam: ExamDate | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set(exam?.topic_ids ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function save() {
    setBusy(true);
    const row = { title: title.trim(), date, topic_ids: topics.filter((t) => picked.has(t.id)).map((t) => t.id) };
    try {
      if (exam) await updateExamDate(exam.id, row); else await createExamDate({ subject_id: subjectId, ...row });
      sfx.place(); onDone();
    } catch (e) { setError(friendlyDates((e as Error).message)); setBusy(false); sfx.error(); }
  }

  return (
    <Modal title={exam ? 'Editar examen' : 'Nuevo examen'} onClose={onClose} footer={<>
      <button className="ghost" onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={!ok || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      <div className="exam-import">
        <label className="field"><span>Nombre</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p. ej. Parcial de la 1.ª evaluación" maxLength={200} /></label>
        <div className="field"><span>Fecha</span><DatePicker label="Fecha del examen" placeholder="Elegir fecha" value={date || null} onChange={(d) => setDate(d ?? '')} /></div>
        {topics.length > 0 && (
          <div className="field">
            <span>Temas que entran (si no marcas ninguno, todos)</span>
            <div className="chips">
              {topics.map((t, i) => (
                <button key={t.id} type="button" className="chip" aria-pressed={picked.has(t.id)}
                  onClick={() => { sfx.tick(); setPicked((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); }}>
                  {i + 1}. {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

export function friendlyDates(msg: string): string {
  return /study_exam_dates/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)
    ? 'Falta crear la tabla de fechas de examen: ejecuta supabase/05-fechas-examen.sql en el SQL Editor de Supabase.'
    : msg;
}
