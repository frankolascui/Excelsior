import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { countNew, hasCardExtras, listAllTopics, listExamDates, listSubjects, loadDue, loadNew, loadStarted, newTopicsToday, saveReview, undoReview } from '../study/api';
import { ensureParams } from '../study/params';
import { examTopics, FINAL_DAYS, finalReview, HORIZON_DAYS, pacedNewPerDay, topicPriority, upcoming } from '../study/plan';
import { routeToHash } from '../study/logic';
import { answer, buildQueue, countsFor, becomesLeech, GRADES, LEECH_LAPSES, newRoom, previewIntervals, requeueIndex, sessionSummary } from '../study/srs';
import type { CardRow, ExamDate, Level, Subject, Topic } from '../study/types';
import type { Grade } from 'ts-fsrs';
import { sfx } from '../sfx';
import { friendly } from './CardsPanel';
import { Icon } from './Icon';
import { studyBridge } from '../bridge';

const Markdown = lazy(() => import('./Markdown').then((m) => ({ default: m.Markdown })));

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

const SOUND: Record<number, () => void> = { 1: sfx.uncheck, 2: sfx.tick, 3: sfx.check, 4: sfx.confirm };

/** La sesión de repaso: anverso → «Mostrar respuesta» → 4 botones con el intervalo de cada uno. */
export function Review({ subjectId, topicIds }: { subjectId?: string; topicIds?: string[] }) {
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [topics, setTopics] = useState<Map<string, Topic>>(new Map());
  const levelOf = useRef<(topicId: string) => Level>(() => 'equilibrado');
  const early = useRef<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  // Para deshacer: cómo estaban la cola y la tarjeta antes de cada respuesta.
  const history = useRef<{ queue: CardRow[]; card: CardRow; reviewId: Promise<string | null> }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [leech, setLeech] = useState<CardRow | null>(null);
  // Para el juego: lo que tardaste en cada respuesta. Se entrega una vez, al vaciar la cola o al salir.
  const durations = useRef<number[]>([]);
  const reported = useRef(false);
  const report = useCallback((cleared: boolean) => {
    if (reported.current || durations.current.length === 0) return;
    reported.current = true;
    studyBridge.onStudy?.({ startedAt: startedAt.current, durations: [...durations.current], cleared: cleared && !subjectId && !topicIds?.length, label: subjectId ? 'Asignatura' : 'Todo' });
  }, [subjectId, topicIds]);
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => () => reportRef.current(false), []);

  useEffect(() => {
    loadQueue(subjectId, topicIds)
      .then(({ queue, topics, levelOfTopic, earlyIds }) => { levelOf.current = levelOfTopic; early.current = earlyIds; setQueue(queue); setTopics(new Map(topics.map((t) => [t.id, t]))); shownAt.current = Date.now(); })
      .catch((e) => setError(friendly(e.message)));
  }, [subjectId, topicIds?.join(',')]);

  const card = queue?.[0];

  const reveal = useCallback(() => { if (card && !revealed) { setRevealed(true); sfx.page(); } }, [card, revealed]);

  const rate = useCallback((grade: Grade) => {
    if (!card || !queue || !revealed) return;
    const now = new Date();
    const next: Partial<CardRow> & ReturnType<typeof answer> = answer(card, grade, now, levelOf.current(card.topic_id));
    // Sanguijuela: al fallarla por 8.ª vez se aparta de los repasos (si ya existe la columna).
    const becameLeech = grade === 1 && becomesLeech(next.lapses) && hasCardExtras();
    if (becameLeech) next.suspended = true;
    const rest = queue.slice(1);
    // Si vuelve en pocos minutos (pasos de aprendizaje), se queda en esta sesión.
    const at = becameLeech ? -1 : requeueIndex(new Date(next.due), now, rest.length);
    if (at >= 0) rest.splice(at, 0, { ...card, ...next });
    const ms = Math.min(Date.now() - shownAt.current, 600_000);
    durations.current.push(ms);
    const reviewId = saveReview(card.id, next, {
      rating: grade, state: card.state, scheduled_days: next.scheduled_days, duration_ms: ms,
    }).catch((e) => { setError(`No se ha podido guardar una respuesta: ${friendly(e.message)}`); return null; });
    history.current.push({ queue, card, reviewId });
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
    setLeech(becameLeech ? card : null);
    SOUND[grade]();
    if (rest.length === 0) setTimeout(() => { sfx.reward(); reportRef.current(true); }, 250);
    setRatings((r) => [...r, grade]);
    setQueue(rest);
    setRevealed(false);
    shownAt.current = Date.now();
  }, [card, queue, revealed]);

  /** Deshacer la última respuesta: la tarjeta vuelve a la pantalla y a como estaba en la base de datos. */
  const undo = useCallback(async () => {
    const last = history.current.pop();
    if (!last) return;
    setCanUndo(history.current.length > 0);
    setQueue(last.queue);
    setRatings((r) => r.slice(0, -1));
    if (!reported.current) durations.current.pop();
    setRevealed(false);
    setLeech(null);
    shownAt.current = Date.now();
    sfx.undo();
    const id = await last.reviewId;
    const { id: _id, topic_id: _t, front: _f, back: _b, created_at: _c, ...before } = last.card;
    if (id) undoReview(last.card.id, { ...before, suspended: last.card.suspended ?? false }, id).catch((e) => setError(`No se ha podido deshacer: ${friendly(e.message)}`));
  }, []);

  // Teclado: espacio o Enter muestra la respuesta; 1-4 la puntúa; Z o Ctrl+Z deshace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) reveal(); else rate(3 as Grade);
      }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); return; }
      const g = GRADES.find((x) => x.key === e.key);
      if (g && revealed) rate(g.grade);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [reveal, rate, revealed, undo]);

  const back = subjectId
    ? routeToHash({ view: 'asignatura', subjectId, topicId: topicIds?.length === 1 ? topicIds[0] : undefined })
    : '#academy/';

  if (error && !queue) return <p className="error">{error}</p>;
  if (!queue) return <p className="muted">Barajando tarjetas…</p>;

  if (!card) {
    const s = sessionSummary(ratings);
    const mins = Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000));
    return (
      <section className="review-done panel">
        <p className="eyebrow">Repaso</p>
        {s.total === 0 ? (
          <>
            <h1 className="section-title">Nada pendiente</h1>
            <p className="muted">No hay tarjetas que toquen ahora aquí. Vuelve más tarde o añade tarjetas nuevas.</p>
          </>
        ) : (
          <>
            <h1 className="section-title">¡Sesión completada!</h1>
            <div className="stats">
              <div><strong>{s.total}</strong><span>respuestas</span></div>
              <div><strong>{s.retention}%</strong><span>recordadas</span></div>
              <div><strong>{mins} min</strong><span>de estudio</span></div>
            </div>
            {s.again > 0 && <p className="muted">Fallaste {s.again}: volverán pronto, es normal. Así se fija la memoria.</p>}
          </>
        )}
        <div className="row">
          <a className="button primary" href={back}><Icon name="left" /> Volver</a>
          {canUndo && <button className="ghost" onClick={undo}><Icon name="undo" /> Deshacer la última</button>}
        </div>
        {leech && <LeechNote card={leech} onClose={() => setLeech(null)} />}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const c = countsFor(queue);
  const topic = topics.get(card.topic_id);
  const intervals = revealed ? previewIntervals(card, new Date(), levelOf.current(card.topic_id)) : null;

  return (
    <section className="review">
      <nav className="crumbs">
        <a className="back-btn" href={back}><Icon name="left" size={16} /> Salir</a>
        <button className="ghost small undo-btn" onClick={undo} disabled={!canUndo} title="Deshacer la última respuesta (Z)"><Icon name="undo" size={16} /> Deshacer</button>
        <span className="counts" title="Nuevas · Aprendiendo · Repaso">
          <span className="pill new">{c.nuevas}</span>
          <span className="pill learn">{c.aprendiendo}</span>
          <span className="pill due">{c.repaso}</span>
        </span>
      </nav>

      {leech && <LeechNote card={leech} onClose={() => setLeech(null)} />}
      <article className="flashcard" onClick={reveal}>
        {topic && <p className="eyebrow">{topic.title}{early.current.has(card.id) && <span className="pill learn early-pill">repaso final</span>}</p>}
        <Suspense fallback={<p>{card.front}</p>}>
          <div className="fc-front"><Markdown text={card.front} /></div>
          {revealed && <><hr /><div className="fc-back"><Markdown text={card.back || '_(sin respuesta)_'} /></div></>}
        </Suspense>
      </article>

      {!revealed ? (
        <button className="primary reveal" onClick={reveal}>Mostrar respuesta <kbd>espacio</kbd></button>
      ) : (
        <div className="grades">
          {GRADES.map((g) => (
            <button key={g.grade} className={`grade g${g.grade}`} onClick={() => rate(g.grade)}>
              <span className="when">{intervals?.[g.grade]}</span>
              <span>{g.label}</span>
              <kbd>{g.key}</kbd>
            </button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Aviso al apartar una sanguijuela, con enlace para reescribirla. */
function LeechNote({ card, onClose }: { card: CardRow; onClose: () => void }) {
  return (
    <div className="leech-note" role="status">
      <p>
        <strong>Has fallado esta tarjeta {LEECH_LAPSES} veces</strong> («{card.front.slice(0, 60)}{card.front.length > 60 ? '…' : ''}»). La he apartado:
        repasarla más no sirve. Reescríbela más corta o divídela en dos, y vuelve a activarla desde su tema.
      </p>
      <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={16} /></button>
    </div>
  );
}

/** Panel «Hoy» de la estantería: cuántas tarjetas tocan, en total y por asignatura. */
export function TodayPanel() {
  const [data, setData] = useState<{ total: ReturnType<typeof countsFor>; bySubject: { s: Subject; n: number }[]; exams: { e: ExamDate; daysLeft: number; s?: Subject }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadQueue(), listSubjects()])
      .then(([{ queue, topics, exams }, subjects]) => {
        const subjectOf = new Map(topics.map((t) => [t.id, t.subject_id]));
        const bySubject = subjects
          .map((s) => ({ s, n: queue.filter((c) => subjectOf.get(c.topic_id) === s.id).length }))
          .filter((x) => x.n > 0);
        const soon = exams.filter((e) => e.daysLeft <= 14).map((e) => ({ e, daysLeft: e.daysLeft, s: subjects.find((s) => s.id === e.subject_id) }));
        setData({ total: countsFor(queue), bySubject, exams: soon });
      })
      .catch((e) => setError(friendly(e.message)));
  }, []);

  if (error) return <div className="today panel"><p className="eyebrow">Hoy</p><p className="muted small">{error}</p></div>;
  if (!data) return null;
  const sum = data.total.nuevas + data.total.aprendiendo + data.total.repaso;

  return (
    <div className="today panel">
      <div className="today-main">
        <div>
          <p className="eyebrow">Hoy</p>
          <p className="today-num">{sum === 0 ? 'Todo repasado' : `${sum} tarjetas`}</p>
          {sum > 0 && (
            <p className="small">
              <span className="pill new">{data.total.nuevas} nuevas</span>{' '}
              <span className="pill learn">{data.total.aprendiendo} aprendiendo</span>{' '}
              <span className="pill due">{data.total.repaso} repaso</span>
            </p>
          )}
        </div>
        {sum > 0 && <a className="button primary" href={routeToHash({ view: 'repasar' })} onClick={() => sfx.open()}><Icon name="play" /> Repasar todo</a>}
      </div>
      {data.exams.length > 0 && (
        <ul className="today-exams">
          {data.exams.map(({ e, daysLeft, s }) => (
            <li key={e.id} style={{ '--spine': s?.color ?? 'var(--c2)' } as React.CSSProperties}>
              <a href={routeToHash({ view: 'simulacros', subjectId: e.subject_id })} onClick={() => sfx.open()}>
                <span className={daysLeft <= 3 ? 'countdown small hot' : 'countdown small'}><strong>{daysLeft}</strong><span>{daysLeft === 1 ? 'día' : 'días'}</span></span>
                <span><strong>{s?.name ?? 'Examen'}</strong> · {e.title}</span>
                <span className="muted small">{daysLeft <= 3 ? 'repaso final activo' : 'ver plan'}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {data.bySubject.length > 1 && (
        <ul className="today-list">
          {data.bySubject.map(({ s, n }) => (
            <li key={s.id} style={{ '--spine': s.color } as React.CSSProperties}>
              <a href={routeToHash({ view: 'repasar', subjectId: s.id })} onClick={() => sfx.open()}>
                <span className="dot" /> {s.name} <strong>{n}</strong>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
