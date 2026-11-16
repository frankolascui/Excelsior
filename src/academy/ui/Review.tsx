import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { countNew, deleteCard, hasCardExtras, listAllTopics, listExamDates, listReviewsSince, listSubjects, loadDue, loadNew, loadStarted, newTopicsToday, saveReview, undoReview } from '../study/api';
import { ensureParams } from '../study/params';
import { allocateNew, BUDGET_OPTIONS, dailyBudget, estimateMinutes } from '../study/budget';
import { secondsPerCard } from '../study/stats';
import { examTopics, FINAL_DAYS, finalReview, HORIZON_DAYS, pacedNewPerDay, topicPriority, upcoming } from '../study/plan';
import { routeToHash } from '../study/logic';
import { answer, buildQueue, countsFor, becomesLeech, GRADES, LEECH_LAPSES, newRoom, previewIntervals, requeueIndex, sessionSummary } from '../study/srs';
import type { CardRow, ExamDate, Level, Subject, Topic } from '../study/types';
import type { Grade } from 'ts-fsrs';
import { sfx } from '../sfx';
import { friendly } from './CardsPanel';
import { Icon } from './Icon';
import { studyBridge } from '../bridge';
import { askConfirm } from './Dialog';
import { ADMIN } from '../../admin';

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

  // Repaso final de los exámenes de la última semana (repartido día a día).
  const finals = [...nextExam.values()].filter((e) => e.daysLeft <= FINAL_DAYS);
  const finalLoads = finals.map(async (e) => {
    const ts = examTopics(e, topicsOfSubject).filter((t) => scope.has(t));
    return finalReview(await loadStarted(ts), e.date, now, levelOf.get(e.subject_id) ?? 'equilibrado', e.daysLeft);
  });
  const budgetMin = studyBridge.budgetMin;
  const [due, final, history, allDue] = await Promise.all([
    scopeTopics.length ? loadDue(inScope) : Promise.resolve([]),
    Promise.all(finalLoads),
    budgetMin ? listReviewsSince(30).catch(() => []) : Promise.resolve([]),
    // El presupuesto es de todo el día: con un solo tema abierto, también cuentan los repasos de los demás.
    budgetMin && inScope ? loadDue(null) : Promise.resolve(null),
  ]);
  // Las del repaso final se tratan como si ya tocaran (due = ahora), sin repetir ninguna.
  const seen = new Set(due.map((c) => c.id));
  const early = final.flat().filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ ...c, due: now.toISOString() }));

  // Minutos al día: los repasos que tocan nunca se esconden; lo que no cabe son las nuevas.
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const secPerCard = secondsPerCard(history);
  const budget = dailyBudget({
    budgetMin,
    dueCards: (allDue ?? due).length + early.length,
    secPerCard,
    doneSec: history.filter((r) => new Date(r.reviewed_at).getTime() >= today0).reduce((n, r) => n + Math.min(r.duration_ms ?? 0, 120_000), 0) / 1000,
  });

  // Nuevas que quiere cada asignatura: el límite de su nivel o, con examen cerca, las que hagan falta.
  type Want = { key: string; want: number; examTopics: string[] | null; rest: string[]; levelRoom: number; days: number };
  const wants: Want[] = [];
  for (const [sid, levelRoom] of room) {
    const mine = scopeTopics.filter((t) => subjectOf.get(t) === sid);
    if (!mine.length) continue;
    const e = nextExam.get(sid);
    if (!e) { wants.push({ key: sid, want: levelRoom, examTopics: null, rest: mine, levelRoom, days: Infinity }); continue; }
    const eTopics = new Set(examTopics(e, topicsOfSubject));
    const inExam = mine.filter((t) => eTopics.has(t));
    const left = inExam.reduce((n, t) => n + (newLeft.get(t) ?? 0), 0);
    const need = Math.max(levelRoom, pacedNewPerDay(left, e.daysLeft) - (done.get(sid) ?? 0));
    wants.push({ key: sid, want: need, examTopics: inExam, rest: mine.filter((t) => !eTopics.has(t)), levelRoom, days: e.daysLeft });
  }
  wants.sort((a, b) => a.days - b.days); // el examen más cercano primero
  const wanted = wants.reduce((n, w) => n + w.want, 0);
  const share = allocateNew(wants, budget ? budget.newCap : Infinity);
  const fresh = await Promise.all(wants.map(async (w) => {
    const n = share.get(w.key) ?? 0;
    if (!w.examTopics) return loadNew(w.rest, n);
    const examNew = await loadNew(w.examTopics, n);
    return [...examNew, ...(await loadNew(w.rest, Math.min(n, w.levelRoom) - examNew.length))];
  }));
  // El límite de nuevas ya se ha aplicado al pedirlas: aquí solo se ordena e intercala.
  const queue = buildQueue([...due, ...early, ...fresh.flat()], now, 0, Infinity, priority);
  const freshCount = fresh.reduce((n, f) => n + f.length, 0);
  // Si alguna asignatura con examen no recibe las nuevas que necesita para llegar, se avisa.
  const examShort = !!budget && wants.some((w) => w.examTopics && (share.get(w.key) ?? 0) < w.want && w.days <= HORIZON_DAYS);
  return {
    queue, topics, subjects, exams: upcoming(exams, now),
    earlyIds: new Set(early.map((c) => c.id)),
    budget: budget && { ...budget, wanted, freshCount, examShort, estMin: estimateMinutes((allDue ?? due).length + early.length, freshCount, secPerCard) },
    levelOfTopic: (tid: string): Level => levelOf.get(subjectOf.get(tid) ?? '') ?? 'equilibrado',
  };
}

/** Tarjetas por tanda: entre tanda y tanda, una pausa con su resumen (Nicolas, 2026-11-14). */
export const BATCH = 8;

const SOUND: Record<number, () => void> = { 1: sfx.uncheck, 2: sfx.tick, 3: sfx.check, 4: sfx.confirm };

/** La sesión de repaso: anverso → «Mostrar respuesta» → 4 botones con el intervalo de cada uno. */
export function Review({ subjectId, topicIds }: { subjectId?: string; topicIds?: string[] }) {
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [pause, setPause] = useState(false);
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
    }).catch((e) => { if (!ADMIN) setError(`No se ha podido guardar una respuesta: ${friendly(e.message)}`); return null; }); // en modo admin no se guarda a propósito
    history.current.push({ queue, card, reviewId });
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
    setLeech(becameLeech ? card : null);
    SOUND[grade]();
    if (rest.length === 0) setTimeout(() => { sfx.reward(); reportRef.current(true); }, 250);
    setRatings((r) => [...r, grade]);
    // Tandas de 8: al acabar una, una pausa corta con su resumen (si aún quedan tarjetas).
    if (rest.length > 0 && (ratings.length + 1) % BATCH === 0) setPause(true);
    setQueue(rest);
    setRevealed(false);
    shownAt.current = Date.now();
  }, [card, queue, revealed, ratings.length]);

  /**
   * Deshacer la última respuesta: la tarjeta vuelve a la pantalla y a como estaba en la base de datos.
   * Con `change`, vuelve ya con la respuesta a la vista para elegir otro botón («Cambiar la anterior»).
   */
  const undo = useCallback(async (change = false) => {
    const last = history.current.pop();
    if (!last) return;
    setCanUndo(history.current.length > 0);
    setPause(false);
    setQueue(last.queue);
    setRatings((r) => r.slice(0, -1));
    if (!reported.current) durations.current.pop();
    setRevealed(change);
    setLeech(null);
    shownAt.current = Date.now();
    sfx.undo();
    const id = await last.reviewId;
    const { id: _id, topic_id: _t, front: _f, back: _b, created_at: _c, ...before } = last.card;
    if (id) undoReview(last.card.id, { ...before, suspended: last.card.suspended ?? false }, id).catch((e) => setError(`No se ha podido deshacer: ${friendly(e.message)}`));
  }, []);

  /** Borrar la tarjeta que está en pantalla (con «¿Seguro?»): sale de la cola y de la base de datos. */
  const removeCard = useCallback(async () => {
    if (!card) return;
    const ok = await askConfirm({ title: '¿Borrar esta tarjeta?', message: 'Se borra para siempre, con su historial de repasos.', confirmLabel: 'Borrar tarjeta', danger: true });
    if (!ok) return;
    try {
      await deleteCard(card.id);
      history.current = history.current.filter((h) => h.card.id !== card.id).map((h) => ({ ...h, queue: h.queue.filter((c) => c.id !== card.id) }));
      setCanUndo(history.current.length > 0);
      setQueue((q) => (q ?? []).filter((c) => c.id !== card.id));
      setRevealed(false);
      shownAt.current = Date.now();
      sfx.remove();
    } catch (e) {
      setError(`No se ha podido borrar: ${friendly((e as Error).message)}`);
    }
  }, [card]);

  // Teclado: espacio o Enter muestra la respuesta; 1-4 la puntúa; Z o Ctrl+Z deshace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (document.querySelector('.dialog-backdrop, [data-testid="sure-dialog"]')) return; // con una ventana abierta, las teclas son suyas
      if (pause) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPause(false); shownAt.current = Date.now(); sfx.open(); }
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); void undo(true); }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) reveal(); else rate(3 as Grade);
      }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); void undo(true); return; }
      const g = GRADES.find((x) => x.key === e.key);
      if (g && revealed) rate(g.grade);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [reveal, rate, revealed, undo, pause]);

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
          <a className="primary" href={back}><Icon name="left" /> Volver</a>
          {canUndo && <button className="ghost" onClick={() => void undo(true)}><Icon name="undo" /> Cambiar la última respuesta</button>}
        </div>
        {leech && <LeechNote card={leech} onClose={() => setLeech(null)} />}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  if (pause) {
    const round = ratings.slice(-BATCH);
    const s = sessionSummary(round);
    const n = Math.round(ratings.length / BATCH);
    return (
      <section className="review-done panel batch-done" data-testid="batch-done">
        <p className="eyebrow">Tanda {n} hecha</p>
        <h1 className="section-title">{s.total - s.again} de {s.total} recordadas</h1>
        <p className="muted">{s.again ? (s.again === 1 ? "La que fallaste volverá dentro de un rato." : `Las ${s.again} que fallaste volverán dentro de un rato.`) : 'Ni un fallo en esta tanda.'} {queue.length === 1 ? 'Queda 1 tarjeta' : `Quedan ${queue.length} tarjetas`} hoy.</p>
        <div className="row">
          <button className="primary" autoFocus onClick={() => { setPause(false); shownAt.current = Date.now(); sfx.open(); }}>
            <Icon name="play" /> Siguiente tanda ({Math.min(BATCH, queue.length)}) <kbd>espacio</kbd>
          </button>
          <a className="ghost" href={back}><Icon name="left" /> Terminar aquí</a>
          {canUndo && <button className="ghost" onClick={() => void undo(true)}><Icon name="undo" /> Cambiar la última</button>}
        </div>
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
        <button className="ghost small undo-btn" onClick={() => void undo()} disabled={!canUndo} title="Deshacer la última respuesta"><Icon name="undo" size={16} /> Deshacer</button>
        <button className="ghost small danger delete-card" onClick={() => void removeCard()} title="Borrar esta tarjeta para siempre"><Icon name="trash" size={16} /> Borrar tarjeta</button>
        <span className="batch-dots" aria-label={`Tanda: ${ratings.length % BATCH} de ${BATCH}`} title="Tanda de 8">
          {Array.from({ length: BATCH }, (_, i) => <i key={i} className={i < ratings.length % BATCH ? 'on' : undefined} />)}
        </span>
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
        <div className="reveal-row">
          {canUndo && (
            <button className="ghost change-answer" onClick={() => void undo(true)} title="Vuelve a la tarjeta anterior para elegir otra dificultad (Z)">
              <Icon name="undo" /> Cambiar la anterior <kbd>Z</kbd>
            </button>
          )}
          <button className="primary reveal" onClick={reveal}>Mostrar respuesta <kbd>espacio</kbd></button>
        </div>
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
type TodayData = {
  total: ReturnType<typeof countsFor>; bySubject: { s: Subject; n: number }[];
  exams: { e: ExamDate; daysLeft: number; s?: Subject }[]; budget: Awaited<ReturnType<typeof loadQueue>>['budget'];
};

/**
 * «Hoy» sale al instante: se pinta lo último que se calculó (de hoy) y se refresca por detrás.
 * La cuenta tarda varias consultas a la base de datos; sin esto el panel aparecía con retraso y movía la estantería.
 */
const TODAY_KEY = 'excelsior:acad-today';
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let todayMem: { day: string; data: TodayData } | null = null;
let todayLoad: Promise<TodayData> | null = null;

function cachedToday(): TodayData | null {
  if (!todayMem) {
    try { todayMem = JSON.parse(localStorage.getItem(TODAY_KEY) ?? 'null'); } catch { todayMem = null; }
  }
  return todayMem?.day === localDay() ? todayMem.data : null;
}

/** Empieza a calcular «Hoy» (la estantería lo llama al abrirse, a la vez que carga las asignaturas). */
export function prefetchToday(): Promise<TodayData> {
  todayLoad ??= Promise.all([loadQueue(), listSubjects()])
    .then(([{ queue, topics, exams, budget }, subjects]) => {
      const subjectOf = new Map(topics.map((t) => [t.id, t.subject_id]));
      const bySubject = subjects
        .map((s) => ({ s, n: queue.filter((c) => subjectOf.get(c.topic_id) === s.id).length }))
        .filter((x) => x.n > 0);
      const soon = exams.filter((e) => e.daysLeft <= 14).map((e) => ({ e, daysLeft: e.daysLeft, s: subjects.find((s) => s.id === e.subject_id) }));
      const data: TodayData = { total: countsFor(queue), bySubject, exams: soon, budget };
      todayMem = { day: localDay(), data };
      try { localStorage.setItem(TODAY_KEY, JSON.stringify(todayMem)); } catch { /* sin espacio: solo memoria */ }
      return data;
    })
    .finally(() => { todayLoad = null; });
  return todayLoad;
}

export function TodayPanel() {
  const [data, setData] = useState<TodayData | null>(cachedToday);
  const [error, setError] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetMin, setBudgetMin] = useState(studyBridge.budgetMin);
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    // Al cambiar los minutos hay que recalcular aunque ya hubiera una cuenta en marcha.
    if (!first.current) todayLoad = null;
    first.current = false;
    prefetchToday()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(friendly(e.message)); });
    return () => { alive = false; };
  }, [budgetMin]);

  function pickBudget(min: number | null) {
    studyBridge.setBudget?.(min);
    studyBridge.budgetMin = min;
    setBudgetMin(min);
    setEditBudget(false);
    sfx.tick();
  }

  if (error && !data) return <div className="today panel"><p className="eyebrow">Hoy</p><p className="muted small">{error}</p></div>;
  if (!data) return (
    <div className="today panel" aria-busy="true" data-testid="today-loading">
      <div className="today-main"><div><p className="eyebrow">Hoy</p><p className="today-num muted">Contando tarjetas…</p></div></div>
    </div>
  );
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
        {sum > 0 && <a className="primary" href={routeToHash({ view: 'repasar' })} onClick={() => sfx.open()}><Icon name="play" /> Repasar todo</a>}
      </div>
      <BudgetLine budget={data.budget} budgetMin={budgetMin} editing={editBudget} onEdit={() => { setEditBudget(!editBudget); sfx.tick(); }} onPick={pickBudget} />
      {data.exams.length > 0 && (
        <ul className="today-exams">
          {data.exams.map(({ e, daysLeft, s }) => (
            <li key={e.id} style={{ '--spine': s?.color ?? 'var(--c2)' } as React.CSSProperties}>
              <a href={routeToHash({ view: 'simulacros', subjectId: e.subject_id })} onClick={() => sfx.open()}>
                <span className={daysLeft <= 3 ? 'countdown small hot' : 'countdown small'}><strong>{daysLeft}</strong><span>{daysLeft === 1 ? 'día' : 'días'}</span></span>
                <span><strong>{s?.name ?? 'Examen'}</strong> · {e.title}</span>
                <span className="muted small">{daysLeft <= FINAL_DAYS ? 'repaso final activo' : 'ver plan'}</span>
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

/**
 * Minutos al día: estimación de lo que te espera hoy frente a tu tiempo, y aviso honesto si no cabe.
 * Lo que no cabe son las nuevas; los repasos que tocan nunca se esconden.
 */
function BudgetLine({ budget, budgetMin, editing, onEdit, onPick }: {
  budget: Awaited<ReturnType<typeof loadQueue>>['budget']; budgetMin: number | null; editing: boolean;
  onEdit: () => void; onPick: (min: number | null) => void;
}) {
  return (
    <div className="budget" data-testid="academy-budget">
      <p className="budget-line">
        <Icon name="clock" />
        {!budgetMin ? <span>Sin límite de tiempo al día.</span>
          : budget ? <span>Hoy: unos <strong>{budget.estMin} min</strong> de tus <strong>{budgetMin} min</strong>{budget.doneMin >= 1 ? ` · llevas ${Math.round(budget.doneMin)} min` : ''} <span className="muted">(estimación con tu tiempo real por tarjeta: {budget.secPerCard} s)</span></span>
          : <span>Tu tiempo: {budgetMin} min al día.</span>}
        <button type="button" className="link" onClick={onEdit} aria-expanded={editing}>{budgetMin ? 'Cambiar' : 'Ponte minutos al día'}</button>
      </p>
      {editing && (
        <div className="budget-chips" role="radiogroup" aria-label="Minutos al día">
          {BUDGET_OPTIONS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={budgetMin === m} className={budgetMin === m ? 'chip-btn on' : 'chip-btn'} onClick={() => onPick(m)}>{m} min</button>
          ))}
          <button type="button" role="radio" aria-checked={!budgetMin} className={!budgetMin ? 'chip-btn on' : 'chip-btn'} onClick={() => onPick(null)}>Sin límite</button>
        </div>
      )}
      {budget && budget.deficitMin > 0 && (
        <div className="warn-note" role="status" data-testid="budget-deficit">
          <Icon name="clock" />
          <p><strong>Hoy no te cabe todo:</strong> solo los repasos que tocan son unos {Math.round(budget.dueMin)} min{budget.doneMin >= 1 ? ` (y ya llevas ${Math.round(budget.doneMin)})` : ''}, y tu tiempo es {budget.budgetMin} min. Hoy no salen tarjetas nuevas.
            Para salir de aquí: sube los minutos, pasa alguna asignatura a «Mínimo» o aparta las tarjetas que no necesites.{budget.examShort ? ' Ojo: a este ritmo no verás todas las nuevas de tu examen antes de la fecha.' : ''}</p>
        </div>
      )}
      {budget && budget.deficitMin === 0 && budget.newCap < budget.wanted && budget.freshCount >= budget.newCap && (
        <p className="muted small budget-note">Hoy salen {budget.freshCount} nuevas (sin límite de tiempo serían hasta {budget.wanted}) para no pasarte de tus minutos.{budget.examShort ? ' A este ritmo no verás todas las nuevas del examen antes de la fecha: sube los minutos si puedes.' : ''}</p>
      )}
    </div>
  );
}
