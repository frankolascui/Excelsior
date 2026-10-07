// Rituales de ascensión: para subir de avatar ya no basta con cumplir los requisitos.
// Hiperión te hace unas preguntas (tu porqué, tus objetivos, un juramento) y entonces asciendes.
import { useState } from 'react';
import type { Game } from './screens';
import type { GameState, RitualAnswer } from './types';
import {
  AVATARS, avatarInfo, completeRitual, deleteGoal, dueReview, extendGoal, formatAttrXp, goalProgress, recordReview, setGoalTarget, updateGoal,
} from './attributes';
import { GuidePortrait } from './tutorial';
import { confetti } from './confetti';
import { sfx } from './sfx';
import { AvatarPortrait, initialOf } from './portrait';

const DAY_MS = 86_400_000;

type Step =
  | { kind: 'question'; q: string; placeholder: string }
  | { kind: 'goals'; text: string; required: boolean; deadlineDays?: number; avatarId: string };

interface RitualDef {
  intro: (name: string) => string;
  steps: Step[];
  oath: string;
}

/** Avatar que va después de `id` (para colgarle las metas que jures en este ritual). */
const after = (id: string) => AVATARS[AVATARS.findIndex((a) => a.id === id) + 1]?.id ?? null;

const optionalGoal = (id: string): Step[] => {
  const nextId = after(id);
  const next = AVATARS.find((a) => a.id === nextId);
  return next ? [{ kind: 'goals', required: false, avatarId: next.id, text: `Si quieres, júrate una meta de tu vida real para llegar a ${next.name}. Contará como requisito. Puedes saltarlo.` }] : [];
};

const reflection = (id: string, q: string, placeholder: string, oath: string, intro?: string): RitualDef => ({
  intro: (name) => intro ?? `${name}, has cumplido todo lo que pide ${AVATARS.find((a) => a.id === id)!.name}. Antes de ascender, mira atrás un momento.`,
  steps: [{ kind: 'question', q, placeholder }, ...optionalGoal(id)],
  oath,
});

export const RITUALS: Record<string, RitualDef> = {
  iniciado: {
    intro: (name) => `${name}, has encendido la llama: tres días de progreso y nivel 3. Antes de convertirte en Iniciado quiero conocer tu porqué y lo que quieres conseguir.`,
    steps: [
      { kind: 'question', q: '¿Por qué has empezado esto? ¿Qué quieres que cambie en tu vida?', placeholder: 'Quiero dejar de posponer lo importante y…' },
      { kind: 'question', q: 'Imagina que han pasado 3 meses y todo ha salido bien. ¿Cómo es un día normal tuyo?', placeholder: 'Me levanto a las 7, entreno, trabajo 3 horas en mi proyecto…' },
      {
        kind: 'goals', required: true, deadlineDays: 90, avatarId: 'forjador',
        text: 'Ahora conviértelo en objetivos medibles a 3 meses (de 1 a 3). Serán requisito para ascender a Forjador, el avatar que se alcanza más o menos en ese tiempo.',
      },
    ],
    oath: 'Juro encender la llama cada día, aunque sea pequeña.',
  },
  disciplinado: reflection('disciplinado', 'Has aguantado una racha de 7 días. ¿Qué es lo que más te costó y cómo lo venciste?', 'Lo más difícil fue…', 'Juro no negociar con la pereza.'),
  artifice: reflection('artifice', '¿Qué cosa real vas a crear con tus manos en el próximo mes?', 'Voy a terminar…', 'Juro crear antes que consumir.'),
  arquitecto: reflection('arquitecto', '¿Qué proyecto grande vas a planificar paso a paso a partir de ahora?', 'Mi próximo reino será…', 'Juro pensar antes de construir y construir lo que pienso.'),
  cazador: reflection('cazador', '¿Qué miedo o «bestia» de tu vida real vas a enfrentar ahora?', 'Voy a dejar de huir de…', 'Juro no huir de lo difícil.'),
  forjador: {
    intro: (name) => `${name}, hace unos meses escribiste tus objetivos. Hoy los has cumplido y te ganas el título de Forjador.`,
    steps: [
      { kind: 'question', q: '¿Qué has aprendido de ti mismo en estos meses?', placeholder: 'He aprendido que…' },
      { kind: 'goals', required: false, deadlineDays: 90, avatarId: 'fundador', text: 'Márcate los objetivos de tus próximos 3 meses. Serán requisito para Fundador.' },
    ],
    oath: 'Juro forjar mi carácter cada día.',
  },
  fundador: reflection('fundador', '¿Qué has levantado que antes no existía? ¿Qué quieres construir ahora?', 'He construido…', 'Juro levantar lo que otros solo imaginan.'),
  titan: reflection('titan', '¿A quién quieres ayudar a subir con todo lo que has aprendido?', 'Quiero ayudar a…', 'Juro usar mi fuerza para elevar a otros.'),
  prime: reflection('prime', 'Has llegado a la cima. ¿Qué significa para ti «siempre más alto»?', 'Para mí significa…', 'Juro no dejar de subir.'),
};

// ---------- Abrir el ritual desde cualquier pantalla ----------

const EVENT = 'excelsior:ritual';

/** Abre el ritual del siguiente avatar. `force` (solo modo admin) lo abre aunque no cumplas los requisitos. */
export function openRitual(force = false) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { force } }));
}

export function onRitualRequest(fn: (force: boolean) => void): () => void {
  const handler = (e: Event) => fn(!!(e as CustomEvent<{ force?: boolean }>).detail?.force);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Botón «Ritual disponible» (tarjeta de avatar y camino del héroe). */
export function RitualCTA({ state, now }: { state: GameState; now: number }) {
  const a = avatarInfo(state, now);
  if (!a.ready || !a.next) return null;
  return (
    <button className="primary ritual-cta" onClick={() => openRitual()}>
      🕯️ Ritual de ascensión: {a.next.name}
    </button>
  );
}

// ---------- El ritual ----------

interface GoalDraft { name: string; start: string; target: string; unit: string }
const EMPTY_GOAL: GoalDraft = { name: '', start: '', target: '', unit: '' };

function validGoal(g: GoalDraft): boolean {
  return !!g.name.trim() && g.start !== '' && g.target !== '' && !Number.isNaN(Number(g.start)) && !Number.isNaN(Number(g.target)) && Number(g.start) !== Number(g.target);
}

export function RitualDialog({ game, guide, onClose }: { game: Game; guide: string; onClose: () => void }) {
  const { state } = game;
  const [target] = useState(() => avatarInfo(state, Date.now()).next); // fijo mientras dura el ritual
  const def = target ? RITUALS[target.id] : null;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [goals, setGoals] = useState<Record<number, GoalDraft[]>>({});
  const [done, setDone] = useState(false);
  if (!target || !def) return null;

  const total = def.steps.length + 2; // intro + pasos + juramento
  const isIntro = step === 0;
  const isOath = step === total - 1;
  const current = !isIntro && !isOath ? def.steps[step - 1] : null;
  const rows = goals[step] ?? [{ ...EMPTY_GOAL }];
  const blocked =
    (current?.kind === 'question' && (answers[step] ?? '').trim().length < 3) ||
    (current?.kind === 'goals' && current.required && !rows.some(validGoal)) ||
    (current?.kind === 'goals' && rows.some((g) => (g.name || g.start || g.target) && !validGoal(g)));

  function setRow(i: number, patch: Partial<GoalDraft>) {
    setGoals({ ...goals, [step]: rows.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  }

  function swear() {
    const now = Date.now();
    const qa: RitualAnswer[] = def!.steps.flatMap((s, i) => (s.kind === 'question' ? [{ q: s.q, a: (answers[i + 1] ?? '').trim() }] : []));
    const sworn = def!.steps.flatMap((s, i) => (s.kind !== 'goals' ? [] : (goals[i + 1] ?? []).filter(validGoal).map((g) => ({
      name: g.name, unit: g.unit, start: Number(g.start), target: Number(g.target), avatarId: s.avatarId,
      deadline: s.deadlineDays ? now + s.deadlineDays * DAY_MS : undefined,
    }))));
    game.act((s) => completeRitual(s, target!.id, { answers: qa, oath: def!.oath, goals: sworn }, now));
    setDone(true);
    sfx.levelUp();
    setTimeout(() => sfx.victory(), 450);
    confetti({ big: true, count: 240 });
  }

  if (done) {
    return (
      <div className="overlay ritual-overlay" role="dialog" aria-modal="true" aria-labelledby="ascend-h">
        <div className="levelup ascension">
          <p className="eyebrow">Ascensión</p>
          <div className="ascend-icon"><AvatarPortrait tier={AVATARS.indexOf(target)} photo={state.profile?.photo} label={initialOf(state.profile?.name)} size={150} title={`Tu nuevo aro de ${target.name}`} /></div>
          <h2 id="ascend-h">Ahora eres {target.name}</h2>
          <p className="rung-motto">«{target.motto}»</p>
          <p className="muted small-text">Tus respuestas quedan en Personaje → Tu camino.</p>
          <button className="primary big" autoFocus onClick={onClose}>Continuar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay ritual-overlay" role="dialog" aria-modal="true" aria-labelledby="ritual-h">
      <div className="overlay-card ritual">
        <div className="ritual-head">
          <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
          <div>
            <p className="eyebrow">{guide} · Ritual de {target.name} · {step + 1}/{total}</p>
            <h2 id="ritual-h" className="tour-title">{isIntro ? `${target.icon} Ritual de ascensión` : isOath ? 'El juramento' : current?.kind === 'goals' ? 'Tus objetivos' : 'Responde con honestidad'}</h2>
          </div>
        </div>

        {isIntro && <p className="ritual-text">{def.intro(state.profile?.name ?? '')}</p>}

        {current?.kind === 'question' && (
          <label className="field">
            <span className="ritual-text">{current.q}</span>
            <textarea id="ritual-answer" rows={4} maxLength={600} value={answers[step] ?? ''} placeholder={current.placeholder} autoFocus
              onChange={(e) => { const next = [...answers]; next[step] = e.target.value; setAnswers(next); }} />
          </label>
        )}

        {current?.kind === 'goals' && (
          <div className="stack-gap">
            <p className="ritual-text">{current.text}</p>
            {rows.map((g, i) => (
              <div key={i} className="goal-form ritual-goal">
                <input value={g.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Objetivo (ej. Ahorrar)" maxLength={60} aria-label={`Objetivo ${i + 1}`} />
                <input type="number" step="any" value={g.start} onChange={(e) => setRow(i, { start: e.target.value })} placeholder="Ahora" aria-label={`Valor actual del objetivo ${i + 1}`} />
                <input type="number" step="any" value={g.target} onChange={(e) => setRow(i, { target: e.target.value })} placeholder="Meta" aria-label={`Meta del objetivo ${i + 1}`} />
                <input value={g.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="Unidad (€, kg…)" maxLength={12} aria-label={`Unidad del objetivo ${i + 1}`} />
              </div>
            ))}
            {rows.length < 3 && <button className="link" onClick={() => setGoals({ ...goals, [step]: [...rows, { ...EMPTY_GOAL }] })}>+ Otro objetivo</button>}
            <p className="muted small-text">Ejemplos: ahorrar de 0 a 1500 €, bajar de 82 a 76 kg, leer 0 → 6 libros. «Ahora» y «Meta» tienen que ser números distintos.</p>
          </div>
        )}

        {isOath && (
          <>
            <p className="ritual-text">Último paso. Si de verdad lo sientes, dilo en voz alta:</p>
            <blockquote className="oath">{def.oath}</blockquote>
          </>
        )}

        <div className="tour-actions">
          <button className="link" onClick={onClose}>Más tarde</button>
          <span className="tour-nav">
            {step > 0 && <button className="ghost" onClick={() => setStep(step - 1)}>Atrás</button>}
            {isOath
              ? <button className="primary" onClick={swear}>Lo juro</button>
              : <button className="primary" disabled={blocked} onClick={() => setStep(step + 1)}>{isIntro ? 'Empezar' : 'Siguiente'}</button>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Personaje: tu camino ----------

/** Objetivos con fecha (los de 3 meses) con su cuenta atrás. */
export function TimedGoals({ game }: { game: Game }) {
  const { state, act } = game;
  const goals = state.goals.filter((g) => g.deadline);
  if (goals.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="timed-goals-h">
      <header className="panel-head">
        <h3 id="timed-goals-h">Objetivos a 3 meses</h3>
        {dueReview(state, Date.now()) && <button className="primary small" onClick={openReview}>Revisar con Hiperión</button>}
      </header>
      <ul className="list">
        {goals.map((g) => {
          const p = goalProgress(g);
          const left = Math.ceil((g.deadline! - Date.now()) / DAY_MS);
          const avatar = AVATARS.find((a) => a.id === g.avatarId);
          return (
            <li key={g.id} className={p >= 1 ? 'item goal done-goal' : 'item goal'}>
              <div className="item-body">
                <span className="item-title">{g.name}</span>
                <div className="attr-bar"><div style={{ width: `${p * 100}%` }} /></div>
                <span className="mono muted small-text">
                  {formatAttrXp(g.current)} / {formatAttrXp(g.target)} {g.unit} · {Math.floor(p * 100)} % · {p >= 1 ? 'cumplido' : left > 0 ? `quedan ${left} días` : 'plazo terminado'}
                  {avatar ? ` · requisito de ${avatar.name}` : ''}
                </span>
              </div>
              <div className="item-actions goal-actions">
                <input type="number" step="any" className="goal-input" aria-label={`Valor actual de ${g.name}`} value={g.current}
                  onChange={(e) => e.target.value !== '' && act((s) => updateGoal(s, g.id, Number(e.target.value)))} />
                <button className="icon-btn" onClick={() => act((s) => deleteGoal(s, g.id))} aria-label={`Borrar ${g.name}`}>×</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Lo que respondiste en cada ritual: tu porqué, tu visión y tus juramentos. */
export function HeroJournal({ state }: { state: GameState }) {
  const rituals = state.rituals ?? [];
  if (rituals.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="journal-h">
      <header className="panel-head"><h3 id="journal-h">Tu camino</h3></header>
      <ol className="journal">
        {rituals.map((r) => {
          const a = AVATARS.find((x) => x.id === r.avatarId);
          return (
            <li key={r.at}>
              <p className="eyebrow">{a?.icon} {a?.name} · {new Date(r.at).toLocaleDateString('es-ES')}</p>
              {r.answers.map((x) => (
                <div key={x.q} className="journal-qa">
                  <p className="muted small-text">{x.q}</p>
                  <p>{x.a}</p>
                </div>
              ))}
              <blockquote className="oath small">{r.oath}</blockquote>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------- Revisiones de Hiperión (días 30, 60, 90…) ----------

const REVIEW_EVENT = 'excelsior:review';

export function openReview() {
  window.dispatchEvent(new CustomEvent(REVIEW_EVENT));
}

export function onReviewRequest(fn: () => void): () => void {
  window.addEventListener(REVIEW_EVENT, fn);
  return () => window.removeEventListener(REVIEW_EVENT, fn);
}

function reviewIntro(name: string, day: number, final: boolean): string {
  if (final) return `${name}, se acabó el plazo. Mira qué has cumplido. Lo que no, renegócialo con honestidad: más tiempo, otra meta o dejarlo ir.`;
  if (day <= 30) return `${name}, llevas ${day} días desde que juraste tus objetivos. Actualiza cómo vas y dime qué te está frenando.`;
  return `${name}, ${day} días. Ya ves la meta: actualiza tus números y decide qué vas a apretar.`;
}

/** Aviso en Hoy cuando toca revisar los objetivos. */
export function ReviewBanner({ state, now, guide }: { state: GameState; now: number; guide: string }) {
  const due = dueReview(state, now);
  if (!due) return null;
  return (
    <section className="panel review-banner" aria-labelledby="review-banner-h">
      <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
      <div>
        <p className="eyebrow">{guide} · Día {due.day}</p>
        <h3 id="review-banner-h">{due.final ? 'Fin del plazo de tus objetivos' : 'Toca revisar tus objetivos'}</h3>
      </div>
      <button className="primary" onClick={openReview}>Revisar</button>
    </section>
  );
}

export function ReviewDialog({ game, guide, onClose }: { game: Game; guide: string; onClose: () => void }) {
  const { state, act } = game;
  const [due] = useState(() => dueReview(state, Date.now()));
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  if (!due) return null;
  const goals = state.goals.filter((g) => g.createdAt === due.batch && g.deadline);
  const allMet = goals.length > 0 && goals.every((g) => goalProgress(g) >= 1);

  function finish() {
    act((s) => recordReview(s, due!.batch, due!.day, note, Date.now()));
    if (allMet) {
      sfx.victory();
      confetti({ big: true });
    } else sfx.tick();
    onClose();
  }

  return (
    <div className="overlay ritual-overlay" role="dialog" aria-modal="true" aria-labelledby="review-h">
      <div className="overlay-card ritual">
        <div className="ritual-head">
          <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
          <div>
            <p className="eyebrow">{guide} · Revisión del día {due.day}</p>
            <h2 id="review-h" className="tour-title">{due.final ? 'Fin del plazo' : 'Cómo vas'}</h2>
          </div>
        </div>
        <p className="ritual-text">{reviewIntro(state.profile?.name ?? '', due.day, due.final)}</p>
        <ul className="list">
          {goals.map((g) => {
            const p = goalProgress(g);
            const left = Math.ceil((g.deadline! - Date.now()) / DAY_MS);
            return (
              <li key={g.id} className={p >= 1 ? 'item goal done-goal' : 'item goal'}>
                <div className="item-body">
                  <span className="item-title">{g.name}</span>
                  <div className="attr-bar"><div style={{ width: `${p * 100}%` }} /></div>
                  <span className="mono muted small-text">
                    {formatAttrXp(g.current)} / {formatAttrXp(g.target)} {g.unit} · {Math.floor(p * 100)} % · {p >= 1 ? 'cumplido' : left > 0 ? `quedan ${left} días` : 'plazo terminado'}
                  </span>
                  {due.final && p < 1 && (
                    <span className="renegotiate">
                      <button className="ghost small" onClick={() => act((s) => extendGoal(s, g.id, 30))}>+30 días</button>
                      {editing === g.id ? (
                        <form className="admin-inline" onSubmit={(e) => { e.preventDefault(); if (target !== '' && !Number.isNaN(Number(target))) act((s) => setGoalTarget(s, g.id, Number(target))); setEditing(null); }}>
                          <input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Nueva meta de ${g.name}`} autoFocus />
                          <button type="submit" className="ghost small">Guardar</button>
                        </form>
                      ) : <button className="ghost small" onClick={() => { setEditing(g.id); setTarget(String(g.target)); }}>Cambiar la meta</button>}
                      <button className="ghost small danger" onClick={() => act((s) => deleteGoal(s, g.id))}>Dejarlo</button>
                    </span>
                  )}
                </div>
                <div className="item-actions goal-actions">
                  <input type="number" step="any" className="goal-input" aria-label={`Valor actual de ${g.name}`} value={g.current}
                    onChange={(e) => e.target.value !== '' && act((s) => updateGoal(s, g.id, Number(e.target.value)))} />
                </div>
              </li>
            );
          })}
        </ul>
        <label className="field">
          <span className="ritual-text">{allMet ? '¿Qué ha hecho que lo consigas?' : '¿Qué te está frenando y qué vas a cambiar?'}</span>
          <textarea id="review-note" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escríbelo en una frase. Hiperión te lo recordará." />
        </label>
        <div className="tour-actions">
          <button className="link" onClick={onClose}>Más tarde</button>
          <button className="primary" onClick={finish}>Guardar revisión</button>
        </div>
      </div>
    </div>
  );
}

/** Para la crónica semanal: tu porqué y tu último juramento. */
export function ChronicleOath({ state }: { state: GameState }) {
  const rituals = state.rituals ?? [];
  if (rituals.length === 0) return null;
  const why = rituals.find((r) => r.avatarId === 'iniciado')?.answers[0]?.a;
  const lastNote = [...(state.reviews ?? [])].reverse().find((r) => r.note)?.note;
  return (
    <div className="chron-oath">
      {why && <p><span className="muted small-text">Tu porqué</span><br />«{why}»</p>}
      <blockquote className="oath small">{rituals.at(-1)!.oath}</blockquote>
      {lastNote && <p className="small-text"><span className="muted">En tu última revisión dijiste:</span> «{lastNote}»</p>}
    </div>
  );
}
