import { useEffect, useState } from 'react';
import { createExam, deleteExam, listExams, type ExamSummary } from '../study/api';
import { examStatus, formatGrade, gradeTrend, timeLimitFromStatement, type ExamStatus } from '../study/exams';
import { routeToHash, titleFromMarkdown } from '../study/logic';
import { tidyText } from '../study/format';
import type { Topic } from '../study/types';
import { sfx } from '../sfx';
import { askConfirm } from './Dialog';
import { Icon } from './Icon';
import { DropZone, Menu, Modal } from './Kit';

export const STATUS_LABEL: Record<ExamStatus, string> = {
  pendiente: 'Sin hacer',
  'en-curso': 'A medias',
  'sin-corregir': 'Sin corregir',
  corregido: 'Corregido',
};

/** La pestaña Simulacros de una asignatura: la lista, la evolución de notas e importar. */
export function ExamsPanel({ subjectId, topics }: { subjectId: string; topics: Topic[] }) {
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listExams(subjectId).then(setExams).catch((e) => setError(friendlyExam(e.message)));
  useEffect(() => { reload(); }, [subjectId]);

  const topicName = new Map(topics.map((t, i) => [t.id, `${i + 1}`]));
  const trend = exams ? gradeTrend(exams) : [];

  return (
    <div className="stack">
      <header className="topic-head">
        <h2>Simulacros</h2>
        <button className="ghost" onClick={() => { setImporting(true); sfx.open(); }}><Icon name="download" /> Importar simulacro</button>
      </header>

      {trend.length > 0 && (
        <div className="trend" aria-label="Evolución de notas">
          <span className="muted small">Evolución</span>
          {trend.map((g, i) => (
            <span key={i} className="trend-step">
              {i > 0 && <span className={g >= trend[i - 1] ? 'up' : 'down'}>{g >= trend[i - 1] ? '↗' : '↘'}</span>}
              <strong className={gradeClass(g)}>{formatGrade(g)}</strong>
            </span>
          ))}
        </div>
      )}

      {!exams ? (
        <p className="muted">{error ?? 'Cargando simulacros…'}</p>
      ) : (
        <ul className="pages">
          {exams.length === 0 && (
            <li className="empty-state">
              Aún no hay simulacros. Pide uno a la skill («hazme un simulacro de…»), y pégalo o suelta el .md aquí.
            </li>
          )}
          {exams.map((e) => {
            const st = examStatus(e);
            const ts = e.topic_ids.map((id) => topicName.get(id)).filter(Boolean);
            return (
              <li key={e.id} className="page-row exam-row">
                <a href={routeToHash({ view: 'simulacro', subjectId, examId: e.id })} onClick={() => sfx.open()}>
                  <span className="page-name"><Icon name="exam" size={16} /> {e.title}</span>
                  <span className="page-meta">
                    {new Date(e.finished_at ?? e.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {ts.length > 0 && ` · ${ts.length === 1 ? 'tema' : 'temas'} ${ts.join(', ')}`}
                    {e.time_limit_min && ` · ${e.time_limit_min} min`}
                  </span>
                </a>
                {st === 'corregido'
                  ? <span className={`grade-badge ${gradeClass(e.grade!)}`}>{formatGrade(e.grade!)}</span>
                  : <span className={`pill ex-${st}`}>{STATUS_LABEL[st]}</span>}
                <Menu items={[
                  { icon: 'trash', label: 'Borrar', danger: true, onSelect: async () => {
                    if (await askConfirm({ title: `¿Borrar «${e.title}»?`, message: 'Se borran también tus respuestas y la corrección.', confirmLabel: 'Borrar simulacro', danger: true })) {
                      try { await deleteExam(e.id); sfx.remove(); reload(); } catch (err) { setError((err as Error).message); sfx.error(); }
                    }
                  } },
                ]} />
              </li>
            );
          })}
        </ul>
      )}

      {importing && (
        <ImportExam subjectId={subjectId} topics={topics} onClose={() => setImporting(false)}
          onDone={(id) => { setImporting(false); location.hash = routeToHash({ view: 'simulacro', subjectId, examId: id }); }} />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Ventana para meter un simulacro: soltar el .md o pegar el texto, y elegir qué temas entran. */
function ImportExam({ subjectId, topics, onClose, onDone }: { subjectId: string; topics: Topic[]; onClose: () => void; onDone: (id: string) => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length > 0;

  /** Al llegar el texto, se rellenan solos el título y la duración (si el enunciado los dice). */
  function load(content: string, name = '') {
    const clean = tidyText(content);
    setText(clean);
    setFileName(name);
    setTitle(titleFromMarkdown(name || 'Simulacro', clean));
    const t = timeLimitFromStatement(clean);
    setMinutes(t ? String(t) : '');
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const n = Number(minutes);
      const e = await createExam({
        subject_id: subjectId,
        title: title.trim() || 'Simulacro',
        statement: text,
        topic_ids: topics.filter((t) => picked.has(t.id)).map((t) => t.id),
        time_limit_min: Number.isInteger(n) && n > 0 && n <= 600 ? n : null,
      });
      sfx.place();
      onDone(e.id);
    } catch (err) { setError(friendlyExam((err as Error).message)); setBusy(false); sfx.error(); }
  }

  const toggle = (id: string) => {
    sfx.tick();
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  return (
    <Modal title="Importar simulacro" onClose={onClose} footer={<>
      <button className="ghost" onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={!ready || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      {!ready ? (
        <>
          <DropZone accept=".md,.markdown,.txt,text/markdown" hint="el .md que te da la skill"
            onFiles={async ([f]) => { if (f) load(await f.text(), f.name); }} />
          <div className="or"><span>o pega el texto</span></div>
          <textarea rows={5} placeholder="Pega aquí el simulacro…" onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.trim()) { e.preventDefault(); load(t); } }} />
        </>
      ) : (
        <div className="exam-import">
          <label className="field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span>Duración (min)</span>
            <input type="number" min={1} max={600} inputMode="numeric" placeholder="sin límite" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          {topics.length > 0 && (
            <div className="field">
              <span>Temas que entran</span>
              <div className="chips">
                {topics.map((t, i) => (
                  <button key={t.id} type="button" className="chip" aria-pressed={picked.has(t.id)} onClick={() => toggle(t.id)}>{i + 1}. {t.title}</button>
                ))}
              </div>
            </div>
          )}
          <p className="muted small">{fileName ? `${fileName} · ` : ''}{text.split('\n').length} líneas. El enunciado no se muestra hasta que empieces.</p>
          <button className="link" onClick={() => { setText(''); sfx.tick(); }}>Elegir otro</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

/** Color de la nota: rojo si suspende, ámbar del 5 al 7, verde desde el 7. */
export function gradeClass(g: number): string {
  return g < 5 ? 'g-bad' : g < 7 ? 'g-mid' : 'g-good';
}

/** Si aún no se ha ejecutado 04-simulacros.sql, la base de datos no conoce la tabla. */
export function friendlyExam(msg: string): string {
  return /study_exams/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)
    ? 'Falta crear la tabla de simulacros: ejecuta supabase/04-simulacros.sql en el SQL Editor de Supabase.'
    : msg;
}
