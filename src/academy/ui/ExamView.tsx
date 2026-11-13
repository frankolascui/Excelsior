import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { deleteExam, getExam, listSubjects, updateExam } from '../study/api';
import { correctionPrompt, examStatus, formatClock, formatGrade, gradeFromCorrection } from '../study/exams';
import { routeToHash } from '../study/logic';
import type { Exam, Subject } from '../study/types';
import { sfx } from '../sfx';
import { askConfirm, askText } from './Dialog';
import { friendlyExam, gradeClass, STATUS_LABEL } from './Exams';
import { Icon } from './Icon';
import { Menu } from './Kit';

const Markdown = lazy(() => import('./Markdown').then((m) => ({ default: m.Markdown })));
const Md = ({ text }: { text: string }) => <Suspense fallback={<p className="muted">Cargando…</p>}><Markdown text={text} /></Suspense>;

/**
 * Un simulacro, en tres pasos:
 * 1. Empezar → ves el enunciado, corre el reloj y escribes (se guarda solo).
 * 2. Terminar → copias enunciado + respuestas y lo pegas en el proyecto para que la skill lo corrija.
 * 3. Pegas la corrección → queda guardada con su nota.
 */
export function ExamView({ subjectId, examId }: { subjectId: string; examId: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getExam(examId).then(setExam).catch((e) => setError(friendlyExam(e.message)));
    listSubjects().then((ss) => setSubject(ss.find((s) => s.id === subjectId) ?? null)).catch(() => {});
  }, [examId, subjectId]);

  /** Cambia el simulacro en pantalla y en la base de datos. */
  async function patch(p: Partial<Exam>, sound?: () => void) {
    if (!exam) return;
    setExam({ ...exam, ...p });
    try { await updateExam(exam.id, p); sound?.(); } catch (e) { setError((e as Error).message); sfx.error(); }
  }

  const back = routeToHash({ view: 'simulacros', subjectId });
  if (!exam) return <p className="muted">{error ?? 'Abriendo simulacro…'}</p>;
  const st = examStatus(exam);

  return (
    <section className="stack" style={{ '--spine': subject?.color ?? 'var(--c2)' } as React.CSSProperties}>
      <nav className="crumbs">
        <a className="back-btn" href={back} onClick={() => sfx.page()}><Icon name="left" size={16} /> Simulacros</a>
        <a href="#academy/">Estantería</a> <span>›</span>
        <a href={routeToHash({ view: 'asignatura', subjectId })}>{subject?.name ?? '…'}</a>
      </nav>

      <header className="exam-head">
        <div>
          <p className="eyebrow">Simulacro · {STATUS_LABEL[st]}</p>
          <h1 className="page-title">{exam.title}</h1>
        </div>
        {st === 'corregido' && <span className={`grade-badge big ${gradeClass(exam.grade!)}`}>{formatGrade(exam.grade!)}</span>}
        <Menu label="Opciones del simulacro" items={[
          { icon: 'edit', label: 'Renombrar', onSelect: async () => {
            const t = await askText({ title: 'Renombrar simulacro', label: 'Título', initial: exam.title });
            if (t) patch({ title: t }, sfx.saved);
          } },
          ...(st === 'corregido' ? [{ icon: 'undo' as const, label: 'Cambiar la corrección', onSelect: () => patch({ grade: null }, sfx.undo) }] : []),
          { icon: 'trash', label: 'Borrar', danger: true, onSelect: async () => {
            if (await askConfirm({ title: `¿Borrar «${exam.title}»?`, message: 'Se borran también tus respuestas y la corrección.', confirmLabel: 'Borrar simulacro', danger: true })) {
              try { await deleteExam(exam.id); sfx.remove(); location.hash = back; } catch (e) { setError((e as Error).message); sfx.error(); }
            }
          } },
        ]} />
      </header>

      {st === 'pendiente' && <Start exam={exam} onStart={() => patch({ started_at: new Date().toISOString() }, sfx.start)}
        onPaper={() => patch({ finished_at: new Date().toISOString() }, sfx.page)} />}
      {st === 'en-curso' && <Doing exam={exam} onError={setError} onFinish={async (answers) => {
        const sec = Math.round((Date.now() - new Date(exam.started_at!).getTime()) / 1000);
        await patch({ answers, finished_at: new Date().toISOString(), duration_sec: sec }, sfx.done);
      }} />}
      {st === 'sin-corregir' && <Correct exam={exam} subjectName={subject?.name ?? ''} onSave={(correction, grade) => patch({ correction, grade }, sfx.victory)} />}
      {st === 'corregido' && <Result exam={exam} />}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Start({ exam, onStart, onPaper }: { exam: Exam; onStart: () => void; onPaper: () => void }) {
  return (
    <div className="exam-start panel">
      <Icon name="exam" size={34} />
      <p>
        {exam.time_limit_min ? <>Tienes <strong>{exam.time_limit_min} min</strong>. </> : 'Sin límite de tiempo: el reloj solo cuenta. '}
        Sin apuntes, como en el examen de verdad. El enunciado aparece al empezar.
      </p>
      <button className="primary big" onClick={onStart}><Icon name="play" /> Empezar</button>
      <button className="link" onClick={onPaper}>Ya lo he hecho en papel</button>
    </div>
  );
}

function Doing({ exam, onFinish, onError }: { exam: Exam; onFinish: (answers: string) => Promise<void>; onError: (m: string) => void }) {
  const [answers, setAnswers] = useState(exam.answers);
  const [saved, setSaved] = useState(true);
  const [now, setNow] = useState(Date.now());
  const latest = useRef(answers);
  latest.current = answers;

  // El reloj cuenta desde started_at (guardado en la base de datos): si recargas la página, no se pierde.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Guardado automático 1,5 s después de dejar de escribir.
  useEffect(() => {
    if (answers === exam.answers && saved) return;
    setSaved(false);
    const t = setTimeout(() => updateExam(exam.id, { answers: latest.current }).then(() => setSaved(true)).catch((e) => onError(e.message)), 1500);
    return () => clearTimeout(t);
  }, [answers]);

  const elapsed = (now - new Date(exam.started_at!).getTime()) / 1000;
  const limit = exam.time_limit_min ? exam.time_limit_min * 60 : null;
  const over = limit !== null && elapsed > limit;

  async function finish() {
    if (!(await askConfirm({ title: '¿Entregar el simulacro?', message: 'Ya no podrás cambiar las respuestas.', confirmLabel: 'Entregar' }))) return;
    await onFinish(answers);
  }

  return (
    <>
      <div className={over ? 'exam-bar over' : 'exam-bar'}>
        <span className="clock"><Icon name="clock" /> {limit !== null && !over ? formatClock(limit - elapsed) : formatClock(elapsed)}</span>
        <span className="muted small">{limit === null ? 'transcurrido' : over ? `pasado de ${exam.time_limit_min} min` : 'quedan'} · {saved ? 'guardado' : 'guardando…'}</span>
        <button className="primary" onClick={finish}><Icon name="check" /> Entregar</button>
      </div>
      <div className="exam-work">
        <article className="paper exam-paper"><Md text={exam.statement} /></article>
        <div className="exam-answers">
          <label className="muted small" htmlFor="answers">Tus respuestas (pon el número de cada pregunta)</label>
          <textarea id="answers" value={answers} onChange={(e) => setAnswers(e.target.value)} spellCheck placeholder={'1.1. …\n\n1.2. …'} />
        </div>
      </div>
    </>
  );
}

function Correct({ exam, subjectName, onSave }: { exam: Exam; subjectName: string; onSave: (correction: string, grade: number) => void }) {
  const [copied, setCopied] = useState(false);
  const [correction, setCorrection] = useState(exam.correction);
  const [grade, setGrade] = useState(exam.correction ? String(gradeFromCorrection(exam.correction) ?? '') : '');
  const n = Number(grade.replace(',', '.'));
  const valid = grade.trim() !== '' && n >= 0 && n <= 10;

  async function copy() {
    const text = correctionPrompt(exam, subjectName);
    try { await navigator.clipboard.writeText(text); } catch {
      // Sin permiso para el portapapeles: se descarga como archivo.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      a.download = `${exam.title}.md`;
      a.click();
    }
    setCopied(true); sfx.confirm();
  }

  return (
    <div className="stack">
      <ol className="steps">
        <li className={copied ? 'done' : ''}>
          <div>
            <strong>Copia el simulacro con tus respuestas</strong>
            <p className="muted small">{exam.answers.trim() ? 'Pégalo en el proyecto Protocolo Excelsior.' : 'Pégalo en el proyecto Protocolo Excelsior y añade las fotos de tus respuestas.'}</p>
          </div>
          <button className={copied ? 'ghost' : 'primary'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiado' : 'Copiar para corregir'}</button>
        </li>
        <li>
          <div>
            <strong>Pega aquí la corrección</strong>
            <p className="muted small">La nota se lee sola si la corrección dice «Nota: X / 10».</p>
          </div>
        </li>
      </ol>
      <textarea className="correction-input" rows={8} value={correction} placeholder="Pega la corrección de Claude…"
        onChange={(e) => {
          setCorrection(e.target.value);
          const g = gradeFromCorrection(e.target.value);
          if (g !== null) setGrade(String(g).replace('.', ','));
        }} />
      <div className="row correction-foot">
        <label className="grade-field">Nota <input value={grade} onChange={(e) => setGrade(e.target.value)} inputMode="decimal" placeholder="—" aria-label="Nota sobre 10" /> / 10</label>
        <button className="primary" disabled={!valid} onClick={() => onSave(correction.trim(), Math.round(n * 100) / 100)}><Icon name="check" /> Guardar corrección</button>
      </div>
      <Details exam={exam} />
    </div>
  );
}

function Result({ exam }: { exam: Exam }) {
  return (
    <div className="stack">
      <p className="muted small exam-meta">
        {exam.finished_at && new Date(exam.finished_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        {exam.duration_sec ? ` · ${Math.max(1, Math.round(exam.duration_sec / 60))} min` : ' · en papel'}
        {exam.time_limit_min ? ` de ${exam.time_limit_min}` : ''}
      </p>
      {exam.correction.trim()
        ? <article className="paper"><Md text={exam.correction} /></article>
        : <p className="empty-state">Guardaste solo la nota.</p>}
      <Details exam={exam} />
    </div>
  );
}

function Details({ exam }: { exam: Exam }) {
  return (
    <>
      <details className="fold">
        <summary><Icon name="exam" size={16} /> Enunciado</summary>
        <div className="paper"><Md text={exam.statement} /></div>
      </details>
      {exam.answers.trim() && (
        <details className="fold">
          <summary><Icon name="edit" size={16} /> Tus respuestas</summary>
          <pre className="answers-text">{exam.answers}</pre>
        </details>
      )}
    </>
  );
}
