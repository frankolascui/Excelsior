// Pausa de las tarjetas (vacaciones): eliges desde qué día y hasta cuál (o hasta que la reanudes).
// Mientras dura, el hábito «Repasar las tarjetas» ni suma ni rompe la racha, y al terminar las fechas de repaso
// se mueven los días de pausa (academy-app.tsx), así al volver no te espera una montaña de repasos atrasados.
import { useState } from 'react';
import type { Game } from './screens';
import { currentStudyPause, dayKey, endStudyPause, startStudyPause } from './game';
import { DatePicker, dayWords } from './pickers';
import { Icon } from './icons';
import { sfx } from './sfx';

export function StudyPauseControl({ game }: { game: Game }) {
  const { state, act } = game;
  const now = Date.now();
  const today = dayKey(now);
  const pause = currentStudyPause(state, now);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState<string | null>(null);

  const open = () => {
    setFrom(pause?.from && pause.from > today ? pause.from : today);
    setUntil(pause?.until ?? null);
    setEditing(true);
    sfx.tick();
  };
  const save = () => {
    act((s) => startStudyPause(s, from, until, Date.now()));
    setEditing(false);
    sfx.confirm();
  };
  const resume = () => {
    act((s) => endStudyPause(s, Date.now()));
    setEditing(false);
    sfx.done();
  };

  const running = !!pause && pause.from <= today;
  const untilWords = (d: string | null) => (d ? `hasta el ${dayWords(d, today).toLowerCase()} (incluido)` : 'hasta que la reanudes');

  return (
    <div className="study-pause" data-testid="study-pause">
      {!editing && (
        <p className="study-pause-line">
          {!pause && <button type="button" className="link" onClick={open}><Icon name="pause" /> Pausar las tarjetas (vacaciones)</button>}
          {pause && running && <>
            <span className="study-pause-on"><Icon name="palm" /> <strong>Tarjetas en pausa</strong> {untilWords(pause.until)}. No se acumulan repasos y tu racha no se rompe.</span>
            <button type="button" className="link" onClick={open}>Cambiar el final</button>
            <button type="button" className="link" onClick={resume}>Reanudar hoy</button>
          </>}
          {pause && !running && <>
            <span><Icon name="palm" /> Pausa programada desde el {dayWords(pause.from, today).toLowerCase()} {untilWords(pause.until)}.</span>
            <button type="button" className="link" onClick={open}>Cambiar</button>
            <button type="button" className="link" onClick={resume}>Quitar</button>
          </>}
        </p>
      )}
      {editing && (
        <div className="study-pause-form" role="group" aria-label="Pausar las tarjetas">
          <p className="small-text">Mientras dure la pausa no vencen repasos: al volver, las fechas de tus tarjetas se mueven los días que estuviste fuera. El hábito «Repasar las tarjetas» no cuenta como fallado.</p>
          <div className="study-pause-fields">
            <label>Desde
              {running
                ? <span className="pick-btn set"><Icon name="calendar" /> {dayWords(pause!.from, today)}</span>
                : <DatePicker label="Desde" value={from} onChange={(d) => setFrom(d && d >= today ? d : today)} />}
            </label>
            <label>Hasta
              <DatePicker label="Hasta" value={until} placeholder="Hasta que la reanude" clearLabel="Sin fecha: hasta que la reanude"
                onChange={(d) => setUntil(d && d < (running ? today : from) ? (running ? today : from) : d)} />
            </label>
          </div>
          <div className="study-pause-actions">
            <button type="button" className="primary" onClick={save}><Icon name="pause" /> {running ? 'Guardar' : from === today ? 'Pausar desde hoy' : 'Programar la pausa'}</button>
            <button type="button" className="secondary" onClick={() => { setEditing(false); sfx.tick(); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
