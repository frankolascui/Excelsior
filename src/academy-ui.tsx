// Panel de Academy dentro de Deep Work (V3): el repaso de hoy, tus asignaturas y añadir tarjetas.
// Las tarjetas viven en tu cuenta (tablas study_*, las mismas que la web de Excelsior Academy).
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Grade } from 'ts-fsrs';
import type { Game } from './screens';
import { useCloud } from './cloud';
import { Icon } from './icons';
import { InfoTip } from './infotip';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { createCards, createSubject, createTopic, hasCardExtras, saveReview } from './academy/api';
import { loadQueue } from './academy/queue';
import { answer, becomesLeech, countsFor, GRADES, parseCardLines, previewIntervals, requeueIndex, sessionSummary } from './academy/srs';
import type { CardRow, Level, Subject, Topic } from './academy/types';
import { academyFounded, cardsToday, foundAcademy, recordStudy, STUDY_RULES, studyMinutes } from './academy-game';
import { dayKey, habitStreak } from './game';
import './academy.css';

const Markdown = lazy(() => import('./academy/Markdown'));
export const ACADEMY_WEB = 'https://frankolascui.github.io/ExcelsiorAcademy/';
const COLORS = ['#a855f7', '#ec4899', '#6366f1', '#14b8a6', '#f59e0b', '#ef4444'];

function friendly(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/fetch|network|load failed/i.test(m)) return 'Sin conexión: Academy necesita internet para traer tus tarjetas.';
  if (/study_|does not exist|schema cache|not find/i.test(m)) return 'Faltan las tablas de Academy en Supabase. Comprueba con comprobar-sql.sql cuáles faltan.';
  return `Algo falló con Academy. (${m})`;
}

interface Loaded {
  queue: CardRow[];
  topics: Topic[];
  subjects: Subject[];
  levelOfTopic: (tid: string) => Level;
}

const SOUND: Record<number, () => void> = { 1: sfx.uncheck, 2: sfx.tick, 3: sfx.check, 4: sfx.confirm };

function Review({ game, data, scope, onEnd }: { game: Game; data: Loaded; scope: string; onEnd: (summary: { cards: number; again: number; minutes: number; cleared: boolean }) => void }) {
  const [queue, setQueue] = useState<CardRow[]>(data.queue);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const run = useRef({ startedAt: Date.now(), durations: [] as number[], ratings: [] as number[] });
  const total = useRef(data.queue.length);
  const finished = useRef(false);
  const topicName = new Map(data.topics.map((t) => [t.id, t.title]));
  const card = queue[0];

  const finish = useCallback((cleared: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const r = run.current;
    if (r.durations.length) {
      game.act((s) => recordStudy(s, { startedAt: r.startedAt, durations: r.durations, cleared, label: scope }, Date.now()), undefined, { sound: 'reward', party: cleared });
    }
    const sum = sessionSummary(r.ratings);
    onEnd({ cards: sum.total, again: sum.again, minutes: studyMinutes(r), cleared });
  }, [game, onEnd, scope]);

  // Si sales de Deep Work a mitad de repaso, lo hecho se guarda igual.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => () => finishRef.current(false), []);

  const rate = useCallback((grade: Grade) => {
    if (!card || !revealed) return;
    const now = new Date();
    const next: Partial<CardRow> & ReturnType<typeof answer> = answer(card, grade, now, data.levelOfTopic(card.topic_id));
    const leech = grade === 1 && becomesLeech(next.lapses) && hasCardExtras();
    if (leech) next.suspended = true;
    const rest = queue.slice(1);
    const at = leech ? -1 : requeueIndex(new Date(next.due), now, rest.length);
    if (at >= 0) rest.splice(at, 0, { ...card, ...next });
    const ms = Math.min(Date.now() - shownAt.current, 600_000);
    saveReview(card.id, next, { rating: grade, state: card.state, scheduled_days: next.scheduled_days, duration_ms: ms })
      .catch((e) => setError(`No se pudo guardar una respuesta: ${friendly(e)}`));
    run.current.durations.push(ms);
    run.current.ratings.push(grade);
    SOUND[grade]();
    if (leech) game.toast('Tarjeta apartada: la has fallado muchas veces. Reescríbela en Academy.', 'info', 5000);
    setQueue(rest);
    setRevealed(false);
    shownAt.current = Date.now();
    if (rest.length === 0) setTimeout(() => finish(true), 200);
  }, [card, revealed, queue, data, game, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setRevealed(true); sfx.tick(); }
      else if (revealed && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rate]);

  if (!card) return null;
  const done = run.current.durations.length;
  const intervals = revealed ? previewIntervals(card, new Date(), data.levelOfTopic(card.topic_id)) : null;
  return (
    <section className="panel study-review" aria-label="Repaso" data-testid="study-review">
      <div className="study-top">
        <span className="muted small-text"><Icon name="spell-book" /> {topicName.get(card.topic_id) ?? 'Tema'}</span>
        <span className="mono small-text">{done}/{Math.max(total.current, done + queue.length)}</span>
        <button className="link small" onClick={() => finish(false)}>Terminar</button>
      </div>
      <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${(done / Math.max(1, done + queue.length)) * 100}%` }} /></span>
      <div className="study-card">
        <Suspense fallback={<p>{card.front}</p>}>
          <Markdown text={card.front} />
          {revealed && <><hr /><Markdown text={card.back} /></>}
        </Suspense>
      </div>
      {error && <p className="study-error small-text">{error}</p>}
      {!revealed
        ? <button className="primary big study-reveal" onClick={() => { setRevealed(true); sfx.tick(); }}>Mostrar respuesta <span className="muted small-text">(espacio)</span></button>
        : (
          <div className="study-grades" role="group" aria-label="¿Cómo la recordabas?">
            {GRADES.map((g) => (
              <button key={g.grade} className={`study-grade g${g.grade}`} onClick={() => rate(g.grade)}>
                <span>{g.label}</span><span className="mono small-text">{intervals![g.grade]}</span>
              </button>
            ))}
          </div>
        )}
    </section>
  );
}

function AddCards({ data, onAdded, toast }: { data: Loaded; onAdded: () => void; toast: Game['toast'] }) {
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id ?? '');
  const [newSubject, setNewSubject] = useState('');
  const topicsOf = data.topics.filter((t) => t.subject_id === subjectId);
  const [topicId, setTopicId] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const cards = parseCardLines(text);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cards.length || busy) return;
    setBusy(true);
    try {
      let sid = subjectId;
      if (!sid || sid === '+') {
        const s = await createSubject({ name: newSubject.trim() || 'Asignatura', color: COLORS[data.subjects.length % COLORS.length], position: data.subjects.length });
        sid = s.id;
      }
      let tid = topicId && topicId !== '+' && topicsOf.some((t) => t.id === topicId) ? topicId : '';
      if (!tid) {
        const t = await createTopic({ subject_id: sid, title: newTopic.trim() || 'Tema 1', position: data.topics.filter((x) => x.subject_id === sid).length, exam_date: null });
        tid = t.id;
      }
      await createCards(cards.map((c) => ({ topic_id: tid, front: c.front, back: c.back })));
      sfx.saved();
      toast(`${cards.length} ${cards.length === 1 ? 'tarjeta añadida' : 'tarjetas añadidas'}`, 'info');
      setText('');
      onAdded();
    } catch (err) {
      sfx.error();
      toast(friendly(err), 'info', 6000);
    }
    setBusy(false);
  }
  const needSubject = !subjectId || subjectId === '+';
  const needTopic = needSubject || !topicsOf.some((t) => t.id === topicId);
  return (
    <form className="study-add" onSubmit={submit}>
      <div className="night-grid">
        <label className="field"><span>Asignatura</span>
          <select id="study-subject" value={subjectId || '+'} onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }}>
            {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="+">+ Nueva asignatura</option>
          </select></label>
        {needSubject && <label className="field"><span>Nombre</span><input id="study-new-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Matemáticas" maxLength={60} /></label>}
        <label className="field"><span>Tema</span>
          <select id="study-topic" value={needTopic ? '+' : topicId} onChange={(e) => setTopicId(e.target.value)}>
            {!needSubject && topicsOf.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            <option value="+">+ Nuevo tema</option>
          </select></label>
        {needTopic && <label className="field"><span>Nombre del tema</span><input id="study-new-topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Tema 4: derivadas" maxLength={80} /></label>}
      </div>
      <label className="field"><span>Tarjetas: una por línea, «pregunta;respuesta»</span>
        <textarea id="study-cards" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'¿Derivada de x²?;2x\n¿Capital de Australia?;Canberra'} /></label>
      <button type="submit" className="primary" disabled={!cards.length || busy}><Icon name="plus" /> Añadir {cards.length || ''} {cards.length === 1 ? 'tarjeta' : 'tarjetas'}</button>
    </form>
  );
}

export function AcademyPanel({ game }: { game: Game }) {
  const { state, act } = game;
  const cloud = useCloud();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ queue: CardRow[]; scope: string } | null>(null);
  const [last, setLast] = useState<{ cards: number; again: number; minutes: number; cleared: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const now = Date.now();

  useEffect(() => {
    if (!cloud.userId) return;
    let alive = true;
    setError(null);
    loadQueue().then((d) => alive && setData(d)).catch((e) => alive && setError(friendly(e)));
    return () => { alive = false; };
  }, [cloud.userId, reload]);

  useEffect(() => {
    if (cloud.userId && !academyFounded(state)) act((s) => foundAcademy(s, Date.now()));
  }, [cloud.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const habit = state.habits.find((h) => h.system === 'academy');
  const streak = habit ? habitStreak(state, habit.id, now) : 0;
  const doneToday = !!habit && state.habitCompletions.some((c) => c.habitId === habit.id && c.day === dayKey(now));
  const today = cardsToday(state, now);

  const head = (
    <div className="with-info study-head">
      <h2 className="kingdom-name"><Icon name="graduate-cap" /> Tu repaso de hoy</h2>
      <InfoTip label="Cómo funciona Academy aquí">
        <p>Tus flashcards de Excelsior Academy, con repetición espaciada (FSRS). Repasar cuenta como Deep Work de estudio: 1 XP por minuto de repaso real y Sabiduría. Vaciar la cola del día o repasar {STUDY_RULES.habitCards} tarjetas marca tu hábito «Repasar las tarjetas» y su racha. Apuntes, simulacros, fechas de examen e importar mazos de Anki siguen en la web de Academy.</p>
      </InfoTip>
      {habit && <span className={`study-streak${doneToday ? ' on' : ''}`} title="Días seguidos repasando"><Icon name="flame" /> {streak} {streak === 1 ? 'día' : 'días'}</span>}
    </div>
  );

  if (!cloud.userId) {
    return (
      <section className="panel">
        {head}
        <p>Academy guarda tus apuntes y tarjetas en tu cuenta, así que necesita que entres con tu email (Ajustes → Cuenta). Es la misma cuenta que en la web de Academy.</p>
      </section>
    );
  }
  if (reviewing && data) {
    return <Review game={game} data={{ ...data, queue: reviewing.queue }} scope={reviewing.scope} onEnd={(s) => {
      setReviewing(null);
      setLast(s);
      if (s.cleared) confetti({ count: 120 });
      setReload((n) => n + 1);
    }} />;
  }

  const counts = data ? countsFor(data.queue) : null;
  const subjectOf = new Map((data?.topics ?? []).map((t) => [t.id, t.subject_id]));
  const bySubject = (sid: string) => (data?.queue ?? []).filter((c) => subjectOf.get(c.topic_id) === sid);
  const est = data ? Math.max(1, Math.round((data.queue.length * 12) / 60)) : 0; // ~12 s por tarjeta

  return (
    <>
      <section className="panel study-home" data-testid="academy-panel">
        {head}
        {last && (
          <p className="study-last">
            <Icon name="check" /> {last.cards} {last.cards === 1 ? 'tarjeta' : 'tarjetas'} en {last.minutes} min{last.cards > 0 && <> · {Math.round(((last.cards - last.again) / last.cards) * 100)} % recordadas</>}
            {last.cleared && <> · <b>cola vacía</b> (+{STUDY_RULES.clearBonus} XP)</>}
          </p>
        )}
        {error && <p className="study-error">{error}</p>}
        {!data && !error && <p className="muted">Preparando tu repaso…</p>}
        {data && counts && (
          data.queue.length === 0 ? (
            <div className="study-empty">
              <p><Icon name="check" /> {data.subjects.length ? 'Hoy no te toca nada más. Mañana habrá repaso nuevo.' : 'Aún no tienes tarjetas. Añade las primeras abajo o importa un mazo en la web de Academy.'}</p>
              {today > 0 && <p className="muted small-text">Hoy llevas {today} {today === 1 ? 'tarjeta' : 'tarjetas'}.</p>}
            </div>
          ) : (
            <div className="study-today">
              <div className="study-counts">
                <span><b className="mono">{counts.repaso}</b> repaso</span>
                <span><b className="mono">{counts.aprendiendo}</b> aprendiendo</span>
                <span><b className="mono">{counts.nuevas}</b> nuevas</span>
              </div>
              <button className="primary big" onClick={() => { setLast(null); setReviewing({ queue: data.queue, scope: 'Todo' }); }} data-testid="study-start">
                <Icon name="play" /> Repasar {data.queue.length} {data.queue.length === 1 ? 'tarjeta' : 'tarjetas'} <span className="muted small-text">· unos {est} min</span>
              </button>
            </div>
          )
        )}
        {data && data.subjects.length > 0 && (
          <ul className="study-subjects">
            {data.subjects.map((s) => {
              const q = bySubject(s.id);
              return (
                <li key={s.id}>
                  <span className="study-dot" style={{ background: s.color }} />
                  <span className="study-subject-name">{s.name}</span>
                  <span className="muted small-text">{q.length ? `${q.length} hoy` : 'al día'}</span>
                  {q.length > 0 && <button className="ghost small" onClick={() => { setLast(null); setReviewing({ queue: q, scope: s.name }); }}><Icon name="play" /> Repasar</button>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="row study-actions">
          <button className="link" onClick={() => setAdding(!adding)} aria-expanded={adding}><Icon name="plus" /> Añadir tarjetas</button>
          <a className="link" href={ACADEMY_WEB} target="_blank" rel="noopener noreferrer"><Icon name="spell-book" /> Apuntes, simulacros y Anki en la web de Academy</a>
        </div>
        {adding && data && <AddCards data={data} toast={game.toast} onAdded={() => { setAdding(false); setReload((n) => n + 1); }} />}
      </section>
    </>
  );
}
