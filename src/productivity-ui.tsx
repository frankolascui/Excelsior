// Valorar una sesión de Deep Work al terminarla: dos filas de 5 puntos y las horas productivas que salen.
import { useState } from 'react';
import type { Game } from './screens';
import { formatHours, MINDSET_LABELS, PERFORMANCE_LABELS, rateSession, senseOf, sessionProductivity } from './productivity';
import { InfoTip } from './infotip';
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

export function SessionRating({ game, id }: { game: Game; id: string }) {
  const x = game.state.sessions.find((y) => y.id === id);
  const [perf, setPerf] = useState(x?.rating?.performance ?? 0);
  const [mind, setMind] = useState(x?.rating?.mindset ?? 0);
  if (!x) return null;
  function pick(p: number, m: number) {
    setPerf(p);
    setMind(m);
    if (p && m) {
      if (!x!.rating) sfx.saved();
      game.act((s) => rateSession(s, id, p, m));
    }
  }
  const prod = sessionProductivity(x);
  const sense = senseOf(x);
  return (
    <div className="session-rating">
      <Dots label="Rendimiento" labels={PERFORMANCE_LABELS} value={perf} onPick={(n) => pick(n, mind)} />
      <Dots label="Mentalidad" labels={MINDSET_LABELS} value={mind} onPick={(n) => pick(perf, n)} />
      <p className="rate-result">
        {prod === null
          ? <span className="muted">Valora la sesión para ver tus horas productivas.</span>
          : <><b className="mono">{formatHours(prod)}</b> productivas de {formatHours(x.minutes / 60)} de foco</>}
        <InfoTip label="Cómo se calcula la productividad">
          <p>Horas productivas = Tiempo real × (Rendimiento × Sentido) ^ (3 ÷ Mentalidad).</p>
          <p>Tiempo real: horas de foco, ya sin descansos ni distracciones. Rendimiento: cuánto y con qué calidad produjiste (5 = 1). Sentido: 1 con una misión vinculada, 0,8 con una intención escrita y 0,6 en sesión libre. Esta va con {SENSE_TEXT[String(sense)]}.</p>
          <p>El tiempo va fuera de la potencia para que las sesiones largas no se disparen. La mentalidad amplifica: con 3 no cambia nada, con 5 el resultado sube y con 1 baja. Nunca pasa de las horas de foco.</p>
          <p>No da XP: es para que te veas con honestidad, no para inflar notas.</p>
        </InfoTip>
      </p>
    </div>
  );
}
