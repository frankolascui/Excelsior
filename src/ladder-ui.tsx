// Escalera de hábitos en la pantalla de Hábitos: el plan por semanas, el escalón de esta semana con su 80 %
// en vivo y el editor de escalones. La lógica vive en ladder.ts.
import { useState } from 'react';
import type { GameState, LadderStep } from './types';
import { climbNow, createLadder, deleteLadder, LADDER_RULES, lastWeekResult, newStep, stepDates, updateLadderSteps, weekPcts, weeksOnStep } from './ladder';
import { dayKey, MINIMUM_MAX, shiftDay, weekStart } from './game';
import { GuidePortrait } from './tutorial';
import { Icon } from './icons';
import { Select } from './pickers';
import { sureThen } from './confirm';
import { sfx } from './sfx';
import './ladder.css';

type Act = (fn: (s: GameState) => GameState) => void;
type Toast = (text: string, kind: 'info' | 'level') => void;

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
const freqText = (n = 7) => (n >= 7 ? 'cada día' : `${n} ${n === 1 ? 'vez' : 'veces'}/sem`);

function stepTitle(x: LadderStep): string {
  if (x.kind === 'rest') return 'Consolidar: nada nuevo';
  if (x.kind === 'audit') return 'Auditoría: nada nuevo';
  return x.name ?? '';
}
function stepDetail(x: LadderStep): string {
  if (x.kind === 'rest') return 'Cumplir todo lo que ya tienes.';
  if (x.kind === 'audit') return 'Revisa el % de cada hábito y decide qué mínimo se queda fijo.';
  return [freqText(x.perWeek), x.minimum && `mínimo: ${x.minimum}`].filter(Boolean).join(' · ');
}

export function LadderPanel({ state, act, toast, guide, now }: { state: GameState; act: Act; toast: Toast; guide: string; now: number }) {
  const L = state.ladder;
  const [editing, setEditing] = useState(false);
  if (editing || !L) {
    if (!editing) {
      return (
        <section className="panel ladder ladder-empty" aria-labelledby="ladder-h">
          <div className="ladder-head">
            <Icon name="mountain-climb" />
            <div>
              <h3 id="ladder-h">Escalera de hábitos</h3>
              <p className="muted small-text">Un hábito nuevo cada semana, con su mínimo. Solo subes si el domingo todo va al {Math.round(LADDER_RULES.pct * 100)} % o más; si no, repites la semana y el plan se corre solo.</p>
            </div>
          </div>
          <button className="secondary" onClick={() => setEditing(true)}><Icon name="plus" /> Crear mi escalera</button>
        </section>
      );
    }
    return <LadderEditor state={state} guide={guide} now={now} onCancel={() => setEditing(false)} onSave={(steps, start) => {
      if (L) act((s) => updateLadderSteps(s, steps));
      else {
        act((s) => createLadder(s, steps, start, Date.now()));
        sfx.confirm();
        toast(start <= weekStart(Date.now()) && steps[0]?.kind === 'new' ? `{i:mountain-climb} Escalera en marcha. Esta semana: ${steps[0].name}.` : '{i:mountain-climb} Escalera en marcha.', 'level');
      }
      setEditing(false);
    }} />;
  }

  const dates = stepDates(L);
  const today = dayKey(now);
  const started = L.current >= 0;
  const step = started ? L.steps[L.current] : null;
  const next = started ? L.steps[L.current + 1] : L.steps[0];
  const last = lastWeekResult(L, now);
  const live = started && !L.finishedOn ? weekPcts(state, weekStart(now), today) : [];
  const weekN = weeksOnStep(L);
  const doneSteps = L.finishedOn ? L.steps.length : Math.max(0, L.current);

  return (
    <section className="panel ladder" aria-labelledby="ladder-h" data-testid="ladder">
      <div className="ladder-head">
        <Icon name="mountain-climb" />
        <div>
          <h3 id="ladder-h">Escalera de hábitos</h3>
          <p className="muted small-text mono">{doneSteps} de {L.steps.length} escalones{L.finishedOn ? ' · terminada' : started ? ` · escalón ${L.current + 1}${weekN > 1 ? `, semana ${weekN}` : ''}` : ` · empieza el ${fmt(L.startedOn)}`}</p>
        </div>
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar la escalera" title="Editar los escalones que faltan"><Icon name="pencil" /></button>
      </div>

      {last && (
        <p className={`ladder-last ${last.result}`} data-testid="ladder-last">
          {last.result === 'up' && <><Icon name="trend" /> La semana pasada todo pasó del {Math.round(LADDER_RULES.pct * 100)} %: subes un escalón.</>}
          {last.result === 'repeat' && <><Icon name="repeat" /> La semana pasada {last.below!.length === 1 ? <>«{last.below![0]}» quedó</> : <>{last.below!.map((n) => `«${n}»`).join(', ')} quedaron</>} por debajo del {Math.round(LADDER_RULES.pct * 100)} %. Repites esta semana: mejor asentarlo que hundirse.</>}
          {last.result === 'full' && <><Icon name="alert" /> Ya tienes {LADDER_RULES.maxHabits} hábitos o más. Retira uno consolidado para que entre el siguiente.</>}
        </p>
      )}

      {L.finishedOn ? (
        <div className="habit-hints-head ladder-done">
          <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
          <p><span className="eyebrow">{guide}</span><br />Has subido la escalera entera. Revisa qué hábitos ya te salen solos y retíralos, o añade escalones nuevos.</p>
        </div>
      ) : step ? (
        <div className="ladder-now">
          <p className="eyebrow">Esta semana · desde el {fmt(L.week!)}</p>
          <p className="ladder-now-title"><b>{stepTitle(step)}</b> <span className="muted small-text">{stepDetail(step)}</span></p>
          {live.length > 0 && (
            <ul className="ladder-live" aria-label="Cómo vas esta semana">
              {live.map((x) => {
                const pct = Math.round(x.pct * 100);
                return (
                  <li key={x.habit.id} className={x.pct >= LADDER_RULES.pct ? 'ok' : 'low'}>
                    <span className="ladder-live-name">{x.habit.name}</span>
                    <span className="ladder-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /><em style={{ left: `${LADDER_RULES.pct * 100}%` }} /></span>
                    <span className="mono small-text">{x.done}/{x.need}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hint">{next
            ? <>Si el domingo todo está al {Math.round(LADDER_RULES.pct * 100)} % o más, el lunes sube: <b>{stepTitle(next)}</b>.</>
            : <>Es el último escalón: si el domingo todo está al {Math.round(LADDER_RULES.pct * 100)} %, terminas la escalera.</>}{live.length > 0 && ' Cuenta hasta ayer.'}</p>
          <div className="habit-hint-actions">
            <button className="ghost small" onClick={() => sureThen({ title: next ? `¿Subir ya a «${stepTitle(next)}»?` : '¿Dar la escalera por terminada?', message: 'Te saltas la regla del 80 % de esta semana.', confirmLabel: 'Subir ya', icon: 'trend' }, () => { act((s) => climbNow(s, Date.now())); sfx.confirm(); })}>
              <Icon name="trend" /> Subir ya
            </button>
          </div>
        </div>
      ) : (
        <p className="ladder-now">Empieza el lunes {fmt(L.startedOn)} con <b>{stepTitle(L.steps[0])}</b>.</p>
      )}

      <details className="ladder-plan">
        <summary>Ver el plan</summary>
        <ol className="ladder-steps">
          {L.steps.map((x, i) => {
            const state_ = L.finishedOn || i < L.current ? 'done' : i === L.current ? 'now' : 'next';
            return (
              <li key={x.id} className={`ls-${state_} ls-${x.kind}`}>
                <span className="ladder-dot" aria-hidden="true">{state_ === 'done' ? <Icon name="check" /> : i + 1}</span>
                <span className="ladder-step-text"><b>{stepTitle(x)}</b> <span className="muted small-text">{stepDetail(x)}</span></span>
                <span className="mono small-text muted">{state_ === 'next' ? `≈ ${fmt(dates[i])}` : fmt(dates[i])}</span>
              </li>
            );
          })}
        </ol>
        <button className="link danger-text" onClick={() => sureThen({ title: '¿Borrar la escalera?', message: 'Los hábitos que ya entraron se quedan en tu lista.', confirmLabel: 'Borrar escalera' }, () => { sfx.remove(); act(deleteLadder); })}>
          <Icon name="trash" /> Borrar la escalera
        </button>
      </details>
    </section>
  );
}

/** Editor de escalones. Con la escalera en marcha, los ya pasados y el de esta semana no se tocan. */
function LadderEditor({ state, guide, now, onSave, onCancel }: {
  state: GameState; guide: string; now: number; onSave: (steps: LadderStep[], start: string) => void; onCancel: () => void;
}) {
  const L = state.ladder;
  const locked = L ? L.current + 1 : 0;
  const [steps, setSteps] = useState<LadderStep[]>(() => (L ? L.steps : [newStep('new')]));
  const thisMonday = weekStart(now);
  const nextMonday = weekStart(shiftDay(now, 7));
  // de viernes a domingo, mejor empezar el lunes: la semana ya va medio hecha
  const [start, setStart] = useState(() => ([0, 5, 6].includes(new Date(now).getDay()) ? nextMonday : thisMonday));
  const set = (i: number, patch: Partial<LadderStep>) => setSteps(steps.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < locked || j >= steps.length) return;
    const out = [...steps];
    [out[i], out[j]] = [out[j], out[i]];
    setSteps(out);
  };
  const valid = steps.slice(locked).every((x) => x.kind !== 'new' || x.name?.trim()) && steps.length > 0;
  const full = steps.length >= LADDER_RULES.maxSteps;
  return (
    <section className="panel ladder" aria-labelledby="ladder-edit-h" data-testid="ladder-editor">
      <div className="ladder-head">
        <Icon name="mountain-climb" />
        <h3 id="ladder-edit-h">{L ? 'Editar la escalera' : 'Crear mi escalera'}</h3>
      </div>
      <div className="habit-hints-head ladder-tip">
        <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
        <p className="small-text"><span className="eyebrow">{guide}</span><br />
          Un escalón por semana. Pon antes lo <b>nuevo y lo que más te cuesta</b>: necesita más semanas para asentarse. Ampliar algo que ya haces (más días, más minutos) puede ir al final. Cada 3 o 4 escalones, una semana de consolidar sin nada nuevo, y una auditoría al acabar. Lo ideal es no pasar de {LADDER_RULES.maxHabits} hábitos a la vez.
        </p>
      </div>
      <ol className="ladder-edit">
        {steps.map((x, i) => i < locked ? (
          <li key={x.id} className="locked">
            <span className="ladder-dot" aria-hidden="true">{i + 1}</span>
            <span className="ladder-step-text"><b>{stepTitle(x)}</b> <span className="muted small-text">{i === locked - 1 ? 'esta semana' : 'hecho'}</span></span>
          </li>
        ) : (
          <li key={x.id}>
            <span className="ladder-dot" aria-hidden="true">{i + 1}</span>
            <div className="ladder-edit-body">
              <div className="ladder-edit-row">
                <Select id={`ladder-kind-${i}`} label="Tipo de escalón" value={x.kind} onChange={(k) => set(i, k === 'new' ? { kind: k, perWeek: x.perWeek ?? 7 } : { kind: k })}
                  options={[{ value: 'new', label: 'Hábito nuevo' }, { value: 'rest', label: 'Consolidar' }, { value: 'audit', label: 'Auditoría' }]} />
                {x.kind === 'new' && (
                  <>
                    <input value={x.name ?? ''} onChange={(e) => set(i, { name: e.target.value })} maxLength={LADDER_RULES.nameMax} placeholder="Hábito (ej. Meditar)" aria-label={`Hábito del escalón ${i + 1}`} />
                    <Select id={`ladder-freq-${i}`} label="Frecuencia" icon="repeat" value={x.perWeek ?? 7} onChange={(n) => set(i, { perWeek: n })}
                      options={[7, 6, 5, 4, 3, 2, 1].map((n) => ({ value: n, label: n === 7 ? 'Cada día' : `${n} ${n === 1 ? 'vez' : 'veces'} por semana` }))} />
                  </>
                )}
              </div>
              {x.kind === 'new' && <input className="ladder-min" value={x.minimum ?? ''} onChange={(e) => set(i, { minimum: e.target.value })} maxLength={MINIMUM_MAX} placeholder="Mínimo para un día malo (ej. 5 minutos)" aria-label={`Mínimo del escalón ${i + 1}`} />}
            </div>
            <span className="ladder-edit-tools">
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i - 1 < locked} aria-label="Subir escalón" title="Antes"><Icon name="chevron-left" /></button>
              <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i + 1 >= steps.length} aria-label="Bajar escalón" title="Después"><Icon name="chevron-right" /></button>
              <button type="button" className="icon-btn" onClick={() => setSteps(steps.filter((_, k) => k !== i))} aria-label={`Quitar escalón ${i + 1}`} title="Quitar"><Icon name="trash" /></button>
            </span>
          </li>
        ))}
      </ol>
      <div className="chips">
        <button type="button" className="pick" disabled={full} onClick={() => setSteps([...steps, newStep('new')])}><Icon name="plus" /> Hábito nuevo</button>
        <button type="button" className="pick" disabled={full} onClick={() => setSteps([...steps, newStep('rest')])}><Icon name="plus" /> Consolidar</button>
        <button type="button" className="pick" disabled={full} onClick={() => setSteps([...steps, newStep('audit')])}><Icon name="plus" /> Auditoría</button>
      </div>
      {!L && (
        <div className="ladder-start">
          <span className="small-text">Empieza</span>
          <div className="segmented" role="radiogroup" aria-label="Cuándo empieza">
            <button type="button" role="radio" aria-checked={start === thisMonday} className={start === thisMonday ? 'seg on' : 'seg'} onClick={() => setStart(thisMonday)}>Esta semana</button>
            <button type="button" role="radio" aria-checked={start === nextMonday} className={start === nextMonday ? 'seg on' : 'seg'} onClick={() => setStart(nextMonday)}>El lunes {fmt(nextMonday)}</button>
          </div>
        </div>
      )}
      <div className="habit-hint-actions">
        <button className="primary" disabled={!valid} onClick={() => onSave(steps, start)}><Icon name="save" /> {L ? 'Guardar' : 'Empezar la escalera'}</button>
        <button className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </section>
  );
}
