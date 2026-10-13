// Corregir una sesión de Deep Work que se quedó encendida: hora de fin y minutos de foco.
import { useState } from 'react';
import type { Game } from './screens';
import { deleteSession, editSession, focusForEnd, sessionEndAt, sessionMeasured } from './core';
import { XP_RULES } from './game';
import { ConfirmButton, formatMinutes } from './ui';
import { Icon } from './icons';
import { sfx } from './sfx';

const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export function SessionEdit({ game, id, onDone }: { game: Game; id: string; onDone: () => void }) {
  const x = game.state.sessions.find((y) => y.id === id);
  const [end, setEnd] = useState(() => (x ? hhmm(x.endedAt) : ''));
  const [mins, setMins] = useState(() => x?.minutes ?? 0);
  if (!x) return null;
  const measured = sessionMeasured(x);
  const endAt = end ? sessionEndAt(x, end) : NaN;
  const late = endAt > measured.endedAt;
  const max = Number.isNaN(endAt) || late ? measured.minutes : Math.min(measured.minutes, Math.max(1, Math.floor((endAt - x.startedAt) / 60_000)));
  const valid = !Number.isNaN(endAt) && !late && mins >= 1 && mins <= max;
  const changed = valid && (endAt !== x.endedAt || mins !== x.minutes);

  function pickEnd(t: string) {
    setEnd(t);
    if (!t) return;
    const at = sessionEndAt(x!, t);
    if (at <= measured.endedAt) setMins(focusForEnd(x!, at));
  }

  function save() {
    if (!changed) return onDone();
    const before = x!.minutes;
    game.act((s) => {
      const next = editSession(s, id, { endedAt: endAt, minutes: mins });
      const after = next.sessions.find((y) => y.id === id)?.minutes ?? before;
      return { state: next, xp: (after - before) * XP_RULES.deepWorkPerMinute };
    });
    onDone();
  }

  return (
    <div className="session-edit">
      <p className="muted small-text">
        Empezó a las <b className="mono">{hhmm(x.startedAt)}</b> y el reloj se paró a las <b className="mono">{hhmm(measured.endedAt)}</b>.
        Si se te olvidó pararlo, pon cuándo terminaste de verdad. Solo se puede quitar tiempo, no añadirlo.
      </p>
      <div className="session-edit-fields">
        <label>
          <span>Terminé a las</span>
          <input id="session-end" type="time" value={end} onChange={(e) => pickEnd(e.target.value)} />
        </label>
        <label>
          <span>Minutos de foco</span>
          <input id="session-minutes" type="number" inputMode="numeric" min={1} max={max} value={mins || ''}
            onChange={(e) => setMins(Math.round(Number(e.target.value)))} />
        </label>
      </div>
      {late && <p className="error-text small-text">No puede ser después de las {hhmm(measured.endedAt)}, cuando se paró el reloj.</p>}
      {!late && mins > max && <p className="error-text small-text">Como mucho {formatMinutes(max)} de foco.</p>}
      {changed && (
        <p className="mono small-text session-edit-diff">
          {formatMinutes(x.minutes)} · +{x.minutes} XP <Icon name="arrow-right" /> {formatMinutes(mins)} · +{mins} XP
        </p>
      )}
      <div className="row">
        <button className="primary" onClick={() => { sfx.tick(); save(); }} disabled={!valid}><Icon name="check" /> Guardar</button>
        <button className="ghost" onClick={onDone}>Cancelar</button>
        <ConfirmButton label="Borrar sesión" confirmLabel="Sí, borrarla"
          onConfirm={() => { game.act((s) => ({ state: deleteSession(s, id), xp: -x.minutes * XP_RULES.deepWorkPerMinute })); onDone(); }} />
      </div>
    </div>
  );
}
