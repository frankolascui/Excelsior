// Valorar una sesión de Deep Work al terminarla: dos filas de 5 puntos y las horas productivas que salen.
import { useState } from 'react';
import type { Game } from './screens';
import { formatHours, MINDSET_LABELS, PERFORMANCE_LABELS, rateSession, SENSE_LABELS, senseOf, sessionProductivity } from './productivity';
import { reportDistraction } from './core';
import { InfoTip } from './infotip';
import { Icon } from './icons';
import { sfx } from './sfx';
import { formatMinutes } from './ui';

function Dots({ label, labels, value, onPick }: { label: string; labels: string[]; value: number; onPick: (n: number) => void }) {
  return (
    <div className="rate-row" role="radiogroup" aria-label={label}>
      <span className="rate-name">{label}</span>
      <span className="rate-dots">
        {labels.map((t, i) => (
          <button key={t} type="button" role="radio" aria-checked={value === i + 1} aria-label={`${i + 1}: ${t}`} title={t}
            className={i < value ? 'rate-dot on' : 'rate-dot'} onClick={() => onPick(i + 1)} />
        ))}
      </span>
      <span className="rate-text muted">{value ? labels[value - 1] : ''}</span>
    </div>
  );
}

const DISTRACTION_CHIPS = [0, 5, 10, 15, 30, 45];

/** «¿Te distrajiste?»: los minutos pasan del foco a la distracción. Se puede cambiar luego. */
function DistractionPick({ game, id }: { game: Game; id: string }) {
  const x = game.state.sessions.find((y) => y.id === id);
  const current = x?.distractionReported ?? 0;
  const [custom, setCustom] = useState(() => (DISTRACTION_CHIPS.includes(current) ? '' : String(current)));
  if (!x) return null;
  const gross = x.minutes + current;
  function pick(n: number) {
    if (n === current) return;
    game.act((s) => reportDistraction(s, id, n));
    if (n > 0) sfx.distraction(); else sfx.tick();
  }
  return (
    <div className="rate-row rate-distract" role="group" aria-label="¿Te distrajiste?">
      <span className="rate-name">¿Te distrajiste?</span>
      <span className="rate-chips">
        {DISTRACTION_CHIPS.filter((n) => n < gross).map((n) => (
          <button key={n} type="button" aria-pressed={current === n} className={current === n ? 'seg on' : 'seg'} onClick={() => { setCustom(''); pick(n); }}>
            {n === 0 ? 'No' : `${n} min`}
          </button>
        ))}
        <input type="number" inputMode="numeric" min={0} max={gross - 1} placeholder="otro" aria-label="Minutos de distracción" value={custom}
          onChange={(e) => { setCustom(e.target.value); if (e.target.value !== '') pick(Number(e.target.value)); }} />
      </span>
      <span className="rate-text muted">{current ? `−${current} min de foco` : ''}</span>
    </div>
  );
}

/**
 * Al terminar la sesión aparece la pregunta (con «Omitir»); una vez valorada u omitida queda en una línea
 * con un botón pequeño para ajustarla. `start` elige cómo empieza: preguntando (la ventana de fin de sesión),
 * editando (desde «Sesiones de hoy») o en una línea (la tarjeta de sesión registrada).
 */
export function SessionRating({ game, id, start = 'closed', onDone }: { game: Game; id: string; start?: 'ask' | 'edit' | 'closed'; onDone?: () => void }) {
  const x = game.state.sessions.find((y) => y.id === id);
  const [perf, setPerf] = useState(x?.rating?.performance ?? 0);
  const [sense, setSense] = useState(x ? senseOf(x) : 3);
  const [mind, setMind] = useState(x?.rating?.mindset ?? 0);
  const [mode, setMode] = useState<'ask' | 'edit' | 'closed'>(start);
  if (!x) return null;
  function pick(p: number, se: number, m: number) {
    setPerf(p);
    setSense(se);
    setMind(m);
    if (!p || !m) return;
    if (!x!.rating) sfx.saved();
    game.act((s) => rateSession(s, id, p, m, se));
  }
  function close() {
    setMode('closed');
    onDone?.();
  }
  const prod = sessionProductivity(x);
  const info = (
    <InfoTip label="Cómo se calcula la productividad">
      <p>Horas productivas = Tiempo real × (Rendimiento × Sentido) ^ (3 ÷ Mentalidad), con cada nota de 1 a 5 (5 = 1).</p>
      <p>Tiempo real: horas de foco, ya sin descansos ni distracciones. Rendimiento: cuánto y con qué calidad produjiste. Sentido: cuánto te acerca a lo que importa (viene propuesto: 5 con una misión, 4 con una intención escrita, 3 en sesión libre; cámbialo si no encaja).</p>
      <p>La mentalidad amplifica: con 3 no cambia nada, con 5 el resultado sube y con 1 baja. Con 5 en rendimiento y en sentido sale el tiempo real entero; nunca pasa de él.</p>
      <p>No da XP: es para que te veas con honestidad, no para inflar notas.</p>
    </InfoTip>
  );
  if (mode === 'closed') {
    return (
      <p className="rate-result rate-closed">
        {prod === null
          ? <span className="muted">Sin valorar</span>
          : <><b className="mono">{formatHours(prod)}</b> productivas de {formatHours(x.minutes / 60)} de foco</>}
        <button type="button" className="link small-text" onClick={() => setMode('edit')}><Icon name="sliders" /> {prod === null ? 'Valorar' : 'Ajustar'}</button>
        {info}
      </p>
    );
  }
  const touched = !!x.rating || !!x.distractionReported;
  return (
    <div className="session-rating">
      <p className="rate-ask">{mode === 'ask' ? '¿Qué tal ha ido?' : 'Ajustar la valoración'} {info}</p>
      <DistractionPick game={game} id={id} />
      <Dots label="Rendimiento" labels={PERFORMANCE_LABELS} value={perf} onPick={(n) => pick(n, sense, mind)} />
      <Dots label="Sentido" labels={SENSE_LABELS} value={sense} onPick={(n) => pick(perf, n, mind)} />
      <Dots label="Mentalidad" labels={MINDSET_LABELS} value={mind} onPick={(n) => pick(perf, sense, n)} />
      <div className="rate-foot">
        {prod !== null && <span><b className="mono">{formatHours(prod)}</b> productivas de {formatHours(x.minutes / 60)}</span>}
        <button type="button" className={touched ? 'primary small' : 'ghost small'} onClick={close}>{mode === 'ask' && !touched ? 'Omitir' : 'Listo'}</button>
      </div>
    </div>
  );
}

/** Ventana que salta al terminar la sesión: valórala o pulsa «Omitir» (luego se puede ajustar). */
export function RateDialog({ game, id, onClose }: { game: Game; id: string; onClose: () => void }) {
  const x = game.state.sessions.find((y) => y.id === id);
  if (!x) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rate-h" onClick={onClose}>
      <div className="overlay-card rate-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Sesión terminada</p>
        <h2 id="rate-h">{formatMinutes(x.minutes)} de foco</h2>
        <p className="muted small-text">{x.label}</p>
        <SessionRating game={game} id={id} start="ask" onDone={onClose} />
      </div>
    </div>
  );
}
