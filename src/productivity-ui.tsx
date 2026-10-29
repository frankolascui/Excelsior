// Valorar una sesión de Deep Work al terminarla: dos filas de 5 puntos y las horas productivas que salen.
import { useState } from 'react';
import type { Game } from './screens';
import { formatHours, MINDSET_LABELS, PERFORMANCE_LABELS, rateSession, senseOf, sessionProductivity } from './productivity';
import { InfoTip } from './infotip';
import { Icon } from './icons';
import { sfx } from './sfx';

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

const SENSE_TEXT: Record<string, string> = { '1': 'misión vinculada', '0.8': 'intención escrita', '0.6': 'sesión libre' };

/**
 * Al terminar la sesión aparece la pregunta (con «Omitir»); una vez valorada u omitida queda en una línea
 * con un botón pequeño para ajustarla. `start` elige cómo empieza: preguntando (la ventana de fin de sesión),
 * editando (desde «Sesiones de hoy») o en una línea (la tarjeta de sesión registrada).
 */
export function SessionRating({ game, id, start = 'closed', onDone }: { game: Game; id: string; start?: 'ask' | 'edit' | 'closed'; onDone?: () => void }) {
  const x = game.state.sessions.find((y) => y.id === id);
  const [perf, setPerf] = useState(x?.rating?.performance ?? 0);
  const [mind, setMind] = useState(x?.rating?.mindset ?? 0);
  const [mode, setMode] = useState<'ask' | 'edit' | 'closed'>(start);
  if (!x) return null;
  function save(p: number, m: number) {
    if (!p || !m) return;
    if (!x!.rating) sfx.saved();
    game.act((s) => rateSession(s, id, p, m));
  }
  function pick(p: number, m: number) {
    setPerf(p);
    setMind(m);
    save(p, m);
    if (mode === 'ask' && p && m) close();
  }
  function close() {
    setMode('closed');
    onDone?.();
  }
  const prod = sessionProductivity(x);
  const sense = senseOf(x);
  const info = (
    <InfoTip label="Cómo se calcula la productividad">
      <p>Horas productivas = Tiempo real × (Rendimiento × Sentido) ^ (3 ÷ Mentalidad).</p>
      <p>Tiempo real: horas de foco, ya sin descansos ni distracciones. Rendimiento: cuánto y con qué calidad produjiste (5 = 1). Sentido: 1 con una misión vinculada, 0,8 con una intención escrita y 0,6 en sesión libre. Esta va con {SENSE_TEXT[String(sense)]}.</p>
      <p>El tiempo va fuera de la potencia para que las sesiones largas no se disparen. La mentalidad amplifica: con 3 no cambia nada, con 5 el resultado sube y con 1 baja. Nunca pasa de las horas de foco.</p>
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
  return (
    <div className="session-rating">
      <p className="rate-ask">{mode === 'ask' ? '¿Qué tal ha ido?' : 'Ajustar la valoración'} {info}</p>
      <Dots label="Rendimiento" labels={PERFORMANCE_LABELS} value={perf} onPick={(n) => pick(n, mind)} />
      <Dots label="Mentalidad" labels={MINDSET_LABELS} value={mind} onPick={(n) => pick(perf, n)} />
      <div className="rate-foot">
        {prod !== null && <span><b className="mono">{formatHours(prod)}</b> productivas</span>}
        <button type="button" className="ghost small" onClick={close}>{mode === 'ask' ? 'Omitir' : 'Listo'}</button>
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
        <h2 id="rate-h">{formatHours(x.minutes / 60)} de foco</h2>
        <p className="muted small-text">{x.label}</p>
        <SessionRating game={game} id={id} start="ask" onDone={onClose} />
      </div>
    </div>
  );
}
