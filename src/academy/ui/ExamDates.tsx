import { useEffect, useState } from 'react';
import { countNew, createExamDate, deleteExamDate, listExamDates, updateExamDate } from '../study/api';
import { buildPlan, examTopics, upcoming } from '../study/plan';
import { LEVELS } from '../study/srs';
import type { ExamDate, Level, Topic } from '../study/types';
import { sfx } from '../sfx';
import { askConfirm } from './Dialog';
import { Icon } from './Icon';
import { Menu, Modal } from './Kit';

const fmtDay = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
export const inDays = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

/** Fechas de examen de una asignatura y, para la más cercana, el plan día a día. */
export function ExamDatesPanel({ subjectId, topics, level = 'equilibrado' }: { subjectId: string; topics: Topic[]; level?: Level }) {
  const [exams, setExams] = useState<ExamDate[] | null>(null);
  const [editing, setEditing] = useState<ExamDate | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listExamDates().then((all) => setExams(all.filter((e) => e.subject_id === subjectId))).catch((e) => setError(friendlyDates(e.message)));
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
        <p className="empty-state">Sin exámenes a la vista. Añade la fecha y los temas que entran: la web repartirá las tarjetas nuevas hasta ese día y te dará un plan.</p>
      )}
      {next.map((e, i) => (
        <ExamCard key={e.id} exam={e} perDay={LEVELS[level]?.newPerDay ?? 20} daysLeft={e.daysLeft} open={i === 0} topicIds={examTopics(e, () => topics.map((t) => t.id))}
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

function ExamCard({ exam, perDay, daysLeft, open, topicIds, topicLabel, onEdit, onDelete }: {
  exam: ExamDate; perDay: number; daysLeft: number; open: boolean; topicIds: string[]; topicLabel: string; onEdit: () => void; onDelete: () => void;
}) {
  const [newLeft, setNewLeft] = useState<number | null>(null);
  useEffect(() => { countNew(topicIds).then((m) => setNewLeft([...m.values()].reduce((a, b) => a + b, 0))).catch(() => setNewLeft(0)); }, [topicIds.join(',')]);
  const plan = newLeft === null ? null : buildPlan(daysLeft, newLeft, new Date(), perDay);
  const shown = plan?.slice(0, 15);
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
      {shown && (
        <ol className="plan">
          {shown.map((d) => (
            <li key={d.daysLeft} className={d.daysLeft === 0 ? 'exam-day' : d.daysLeft === daysLeft ? 'today' : ''}>
              <span className="plan-day">{d.daysLeft === daysLeft ? 'Hoy' : fmtDay(d.date)}</span>
              <span className="plan-items">{d.items.map((it) => <span key={it} className={/Simulacro/.test(it) ? 'plan-item sim' : 'plan-item'}>{it}</span>)}</span>
            </li>
          ))}
          {plan!.length > shown!.length && <li className="muted small">… y {plan!.length - shown!.length} días más con repasos</li>}
        </ol>
      )}
      <p className="muted small plan-note">Plan sugerido. Las tarjetas de estos temas salen primero en tus repasos{daysLeft <= 3 ? ' y ya está activo el repaso final' : ''}.</p>
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
        <label className="field"><span>Fecha</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
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
