// Priorización estratégica en pantalla: «Las 3 de hoy», elegir las de mañana, limpieza de misiones viejas
// y la revisión semanal dentro de la crónica.
import { useState, type FormEvent } from 'react';
import type { Game } from './screens';
import type { Quest, WeeklyReview } from './types';
import { completeQuest, dayKey, impactOf, PRIORITY_BONUS, shiftDay } from './game';
import {
  IMPACTS, MAX_PRIORITIES, dropQuest, keepQuest, postponeQuest, priorityCandidates, priorityIds, priorityQuests, setPriorities, staleAge, staleQuests, tomorrowQuests,
} from './priorities';
import { currentChange, previousReview, saveWeeklyReview, VERDICTS, weekFocus, weeklyReview } from './review';
import { Icon } from './icons';
import { pathLabel } from './tree';
import './priorities.css';
import { InfoTip } from './infotip';
import { sfx } from './sfx';

const impactName = (q: Quest) => IMPACTS.find((x) => x.id === impactOf(q))!.name.toLowerCase();

/** Lista para marcar hasta 3 misiones de un día. Guarda al pulsar «Listo». */
export function PriorityPicker({ game, day, onDone, compact = false }: { game: Game; day: string; onDone?: () => void; compact?: boolean }) {
  const { state, act } = game;
  const [picked, setPicked] = useState<string[]>(() => priorityIds(state, day).filter((id) => state.quests.some((q) => q.id === id && !q.completedAt)));
  const candidates = priorityCandidates(state, day);
  const flip = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_PRIORITIES ? [...p, id] : p));
  function save() {
    // las que ya estaban hechas ese día se quedan en la lista
    const done = priorityIds(state, day).filter((id) => state.quests.some((q) => q.id === id && q.completedAt));
    act((s) => setPriorities(s, day, [...done, ...picked], Date.now()));
    sfx.saved();
    onDone?.();
  }
  if (candidates.length === 0) return <p className="empty">No tienes misiones pendientes. Crea alguna y vuelve aquí.</p>;
  return (
    <div className={compact ? 'prio-picker compact' : 'prio-picker'}>
      <p className="hint">Elige como máximo {MAX_PRIORITIES}: las que más te acercan a lo que quieres, no las más fáciles. <span className="mono">{picked.length}/{MAX_PRIORITIES}</span></p>
      <ul className="prio-options">
        {candidates.slice(0, compact ? 8 : 12).map((q) => {
          const on = picked.includes(q.id);
          const full = !on && picked.length >= MAX_PRIORITIES;
          return (
            <li key={q.id}>
              <button type="button" className={`prio-option${on ? ' on' : ''}`} aria-pressed={on} disabled={full} onClick={() => flip(q.id)}>
                <span className="prio-box" aria-hidden="true">{on ? picked.indexOf(q.id) + 1 : ''}</span>
                <span className="prio-title">{pathLabel(state, q) && <span className="item-path">{pathLabel(state, q)}</span>}{q.title}</span>
                <span className={`impact-tag imp-${impactOf(q)}`}><Icon name="target" /> {impactName(q)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button type="button" className="primary" onClick={save} disabled={!picked.length && !priorityIds(state, day).length}>
          <Icon name="flag" /> {picked.length || !priorityIds(state, day).length ? 'Fijar prioridades' : 'Quitar prioridades'}
        </button>
        {onDone && <button type="button" className="ghost" onClick={onDone}>Cancelar</button>}
      </div>
    </div>
  );
}

/** Panel de Hoy: tus 3 prioridades del día, o un botón para elegirlas. */
export function TopThree({ game, now }: { game: Game; now: number }) {
  const { state, act } = game;
  const today = dayKey(now);
  const [picking, setPicking] = useState(false);
  const quests = priorityQuests(state, today);
  const change = currentChange(state, now);
  const focus = weekFocus(state, now);
  const doneN = quests.filter((q) => q.completedAt).length;
  const all = quests.length === MAX_PRIORITIES && doneN === MAX_PRIORITIES;
  const pending = state.quests.some((q) => !q.completedAt);
  if (!quests.length && !pending && !picking) return null;
  return (
    <section className="panel top-three" aria-labelledby="top3-h">
      <header className="panel-head">
        <div className="with-info">
          <h3 id="top3-h"><Icon name="flag" /> Las 3 de hoy</h3>
          <InfoTip label="Para qué sirve">
            <p>Antes de hacer, decide qué merece tu tiempo. Elige como máximo tres misiones: «¿Qué hago ahora?» te propone primero la de más impacto de ellas.</p>
            <p>Cerrar las tres el mismo día da +{PRIORITY_BONUS} XP.</p>
          </InfoTip>
        </div>
        {quests.length > 0 && !picking && <button className="link" onClick={() => setPicking(true)}>Cambiar</button>}
      </header>
      {picking ? (
        <PriorityPicker game={game} day={today} onDone={() => setPicking(false)} compact />
      ) : quests.length === 0 ? (
        <div className="top3-empty">
          <p className="muted">Aún no has decidido qué es lo importante hoy.</p>
          <button className="primary" onClick={() => setPicking(true)}><Icon name="flag" /> Elegir las 3 de hoy</button>
        </div>
      ) : (
        <>
          <ol className="top3-list">
            {quests.map((q) => (
              <li key={q.id} className={q.completedAt ? 'done' : ''}>
                {q.completedAt
                  ? <span className="check checked" aria-hidden="true">✓</span>
                  : <button className="check" aria-label={`Completar ${q.title}`} title="Completar misión" onClick={() => act((s) => completeQuest(s, q.id, Date.now()), undefined, { party: q.type === 'main' })}>✓</button>}
                <span className="top3-title">{q.title}</span>
                {!q.completedAt && <span className={`impact-tag imp-${impactOf(q)}`}><Icon name="target" /> {impactName(q)}</span>}
              </li>
            ))}
          </ol>
          <p className="muted small-text">
            {all ? <><Icon name="check" /> Las tres hechas. +{PRIORITY_BONUS} XP.</> : quests.length < MAX_PRIORITIES ? `${doneN}/${quests.length} hechas · con 3 elegidas, cerrarlas da +${PRIORITY_BONUS} XP` : `${doneN}/3 hechas · cerrar las tres da +${PRIORITY_BONUS} XP`}
          </p>
        </>
      )}
      {focus && !picking && <p className="top3-change"><Icon name="target" /> Lo importante de la semana: <em>{focus}</em></p>}
      {change && !picking && <p className="top3-change"><Icon name="sparkles" /> Esta semana pruebas: <em>{change}</em></p>}
    </section>
  );
}

/** En el cierre del día: deja elegidas las prioridades de mañana. */
export function TomorrowPriorities({ game, now }: { game: Game; now: number }) {
  const tomorrow = dayKey(shiftDay(now, 1));
  const chosen = priorityQuests(game.state, tomorrow);
  const [open, setOpen] = useState(false);
  return (
    <div className="tomorrow">
      <p className="tomorrow-head"><Icon name="sunrise" /> <b>Las 3 de mañana</b>
        {!open && <button type="button" className="link" onClick={() => setOpen(true)}>{chosen.length ? 'Cambiar' : 'Elegir'}</button>}
      </p>
      {open ? <PriorityPicker game={game} day={tomorrow} onDone={() => setOpen(false)} compact />
        : chosen.length ? <ol className="tomorrow-list">{chosen.map((q) => <li key={q.id}>{q.title}</li>)}</ol>
        : <p className="muted small-text">Decídelas hoy y mañana te despiertas sabiendo qué hacer.</p>}
    </div>
  );
}

/** Misiones: lo que toca mañana. Las 3 elegidas, lo que vence y lo que vuelve (pospuestas y repeticiones). */
export function TomorrowPanel({ game, now }: { game: Game; now: number }) {
  const { due, back } = tomorrowQuests(game.state, now);
  return (
    <section className="panel tomorrow-panel" aria-labelledby="tomorrow-h">
      <header className="panel-head">
        <div className="with-info">
          <h3 id="tomorrow-h"><Icon name="sunrise" /> Mañana</h3>
          <InfoTip label="Para qué sirve"><p>Deja decididas hoy las 3 de mañana: al día siguiente salen solas en Hoy. Lo que no terminas de Las 3 de hoy lo puedes pasar aquí desde Hoy.</p></InfoTip>
        </div>
      </header>
      <TomorrowPriorities game={game} now={now} />
      {due.length > 0 && (
        <p className="tomorrow-more"><Icon name="calendar" /> Vence mañana: {due.map((q) => q.title).join(' · ')}</p>
      )}
      {back.length > 0 && (
        <p className="tomorrow-more muted"><Icon name="repeat" /> Vuelve mañana: {back.map((q) => q.title).join(' · ')}</p>
      )}
    </section>
  );
}

/** Misiones: lo que lleva demasiado tiempo pendiente para lo que aporta. Una decisión por misión. */
export function CleanupPanel({ game, now }: { game: Game; now: number }) {
  const { state, act, toast } = game;
  const stale = staleQuests(state, now);
  if (!stale.length) return null;
  return (
    <section className="panel cleanup" aria-labelledby="cleanup-h">
      <header className="panel-head">
        <div className="with-info">
          <h3 id="cleanup-h">Limpieza</h3>
          <InfoTip label="Por qué sale esto"><p>Misiones de impacto bajo con más de 14 días, o medio con más de 30. Acumular lo que no importa también cuesta: decide y libera la lista.</p></InfoTip>
        </div>
        <span className="count mono">{stale.length}</span>
      </header>
      <ul className="list">
        {stale.slice(0, 3).map((q) => (
          <li key={q.id} className="item cleanup-item">
            <div className="item-body">
              <span className="item-title">{q.title}</span>
              <span className="item-meta muted">{staleAge(q, now)} días pendiente · impacto {impactName(q)}</span>
            </div>
            <div className="item-actions">
              <button className="ghost small" onClick={() => act((s) => keepQuest(s, q.id, Date.now()))} title="Se queda; no vuelve a preguntar en 14 días">La hago</button>
              <button className="ghost small" onClick={() => { act((s) => postponeQuest(s, q.id, Date.now())); toast('Vuelve dentro de una semana', 'info'); }}>Posponer</button>
              <button className="ghost small danger" onClick={() => { act((s) => dropQuest(s, q.id)); sfx.undo(); toast('Eliminada: una cosa menos', 'info'); }}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dentro de la crónica: tres preguntas y si sirvió el cambio de la semana anterior. */
export function WeeklyReviewForm({ game, week, onSaved }: { game: Game; week: string; onSaved: () => void }) {
  const { state, act, toast } = game;
  const saved = weeklyReview(state, week);
  const prev = previousReview(state, week);
  const [worked, setWorked] = useState(saved?.worked ?? '');
  const [failed, setFailed] = useState(saved?.failed ?? '');
  const [change, setChange] = useState(saved?.change ?? '');
  const [focus, setFocus] = useState(saved?.focus ?? '');
  const [verdict, setVerdict] = useState<WeeklyReview['prevVerdict']>(saved?.prevVerdict);
  const stale = staleQuests(state, Date.now()).length;
  function submit(e: FormEvent) {
    e.preventDefault();
    act((s) => saveWeeklyReview(s, week, { worked, failed, change, focus, prevVerdict: verdict }, Date.now()));
    sfx.saved();
    toast('Revisión guardada', 'info');
    onSaved();
  }
  return (
    <form className="weekly-review" onSubmit={submit}>
      <p className="eyebrow">Revisión semanal</p>
      {prev?.change && (
        <div className="wr-prev">
          <p>La semana pasada decidiste probar: <em>{prev.change}</em>. ¿Te sirvió?</p>
          <div className="segmented" role="radiogroup" aria-label="¿Sirvió el cambio?">
            {VERDICTS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={verdict === v.id} className={verdict === v.id ? 'seg on' : 'seg'} onClick={() => setVerdict(v.id)}>{v.name}</button>
            ))}
          </div>
        </div>
      )}
      <label className="field"><span>¿Qué funcionó?</span>
        <textarea id="wr-worked" rows={2} maxLength={400} value={worked} onChange={(e) => setWorked(e.target.value)} placeholder="Lo que te hizo avanzar y quieres repetir" /></label>
      <label className="field"><span>¿Qué no funcionó?</span>
        <textarea id="wr-failed" rows={2} maxLength={400} value={failed} onChange={(e) => setFailed(e.target.value)} placeholder="Dónde perdiste tiempo o energía" /></label>
      <label className="field"><span>¿Qué cambio pruebas esta semana?</span>
        <input id="wr-change" maxLength={200} value={change} onChange={(e) => setChange(e.target.value)} placeholder="Uno solo y concreto. Ej.: Deep Work antes de mirar el móvil" /></label>
      <label className="field"><span>¿Qué es lo más importante esta semana?</span>
        <input id="wr-focus" maxLength={200} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="El resultado que, si lo consigues, hace buena la semana" /></label>
      {stale > 0 && <p className="muted small-text"><Icon name="info" /> Tienes {stale} {stale === 1 ? 'misión' : 'misiones'} para limpiar en Misiones.</p>}
      <button type="submit" className="primary"><Icon name="save" /> Guardar la revisión</button>
    </form>
  );
}
