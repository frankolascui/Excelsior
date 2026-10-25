// Tu vida real en pantalla: cierre del día y próximos eventos (Hoy), eventos del calendario.
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Game } from './screens';
import type { GameState } from './types';
import { dayKey, daysUntil } from './game';
import { dailyReport, dayLog, eventColor, eventIcon, isKeyEvent, priorityEvents, saveDayLog } from './life';
import { saveFile } from './download';
import { sfx } from './sfx';
import { shortDate } from './ui';
import { Icon, type IconName } from './icons';

/** Cuenta atrás para lo importante: «hoy», «mañana», «en 12 días». */
export function countdown(day: string, now: number): string {
  const d = daysUntil(day, now)!;
  return d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
}

/** «hoy», «mañana», «en 3 días» o la fecha. */
export function relDay(day: string, now: number): string {
  const d = daysUntil(day, now)!;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d > 1 && d < 7) return `en ${d} días`;
  return shortDate(day);
}

// ---------- Cierre del día ----------

function Scale({ label, value, onChange, icons }: { label: string; value?: number; onChange: (n: number) => void; icons: IconName[] }) {
  return (
    <div className="scale">
      <span className="scale-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {icons.map((ic, i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i + 1} aria-label={`${label} ${i + 1} de 5`}
            className={value === i + 1 ? 'seg on' : 'seg'} onClick={() => onChange(i + 1)}><Icon name={ic} /></button>
        ))}
      </div>
    </div>
  );
}

const ENERGY: IconName[] = ['energy-1', 'energy-2', 'energy-3', 'energy-4', 'energy-5'];
const MOOD: IconName[] = ['mood-1', 'mood-2', 'mood-3', 'mood-4', 'mood-5'];

function DayCloseForm({ game, now }: { game: Game; now: number }) {
  const { state, act, toast } = game;
  const today = dayKey(now);
  const saved = dayLog(state, today);
  const [energy, setEnergy] = useState(saved?.energy);
  const [mood, setMood] = useState(saved?.mood);
  const [note, setNote] = useState(saved?.note ?? '');

  function save(): GameState {
    return saveDayLog(state, { energy, mood, note: note.trim() || undefined }, Date.now());
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    act(() => save());
    sfx.saved();
    toast('Día guardado', 'info');
  }
  async function copy() {
    const next = save();
    act(() => next);
    try {
      await navigator.clipboard.writeText(dailyReport(next, Date.now()));
      toast('Informe copiado: pégalo en tu IA', 'info');
    } catch {
      toast('No se pudo copiar aquí: usa Descargar', 'info');
    }
  }
  async function download() {
    const next = save();
    act(() => next);
    const r = await saveFile(`excelsior-${today}.md`, dailyReport(next, Date.now()), 'text/markdown');
    if (r === 'ok') { sfx.confirm(); toast('Informe descargado', 'info'); }
    if (r === 'error') { sfx.error(); toast('No se pudo descargar aquí', 'info'); }
  }

  return (
    <form className="day-close" onSubmit={submit}>
      <div className="scales">
        <Scale label="Energía" value={energy} onChange={setEnergy} icons={ENERGY} />
        <Scale label="Ánimo" value={mood} onChange={setMood} icons={MOOD} />
      </div>
      <textarea id="day-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1200}
        placeholder="¿Qué ha ido bien? ¿Qué te ha frenado? ¿Qué harás distinto mañana?" aria-label="Nota del día" />
      <div className="row">
        <button type="submit" className="primary"><Icon name="save" /> {saved ? 'Actualizar el día' : 'Guardar el día'}</button>
        <button type="button" className="secondary" onClick={copy}><Icon name="copy" /> Copiar informe para la IA</button>
        <button type="button" className="ghost" onClick={download}><Icon name="download" /> Descargar .md</button>
      </div>
      {saved && <p className="muted small-text"><Icon name="check" /> Guardado a las {new Date(saved.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>}
    </form>
  );
}

export function DayClose({ game, now }: { game: Game; now: number }) {
  const today = dayKey(now);
  const [open, setOpen] = useState(false);
  // antes de las 18:00 y sin cierre guardado hoy, se queda en una línea para no alargar Hoy
  if (!open && new Date(now).getHours() < 18 && !dayLog(game.state, today)) {
    return (
      <section className="panel dayclose-folded" aria-label="Estado del día">
        <p><Icon name="moon" /> El cierre del día se abre solo a partir de las 18:00.</p>
        <button className="ghost small" onClick={() => setOpen(true)}>Hacerlo ahora</button>
      </section>
    );
  }
  return (
    <section className="panel" aria-labelledby="dayclose-h">
      <header className="panel-head"><h3 id="dayclose-h">Estado del día</h3></header>
      <p className="hint">Un minuto al final del día: cómo estás y qué ha pasado. El informe lo resume todo (XP, misiones, hábitos, estado y nota) para pedirle feedback a una IA.</p>
      <DayCloseForm key={today} game={game} now={now} />
    </section>
  );
}

// ---------- Eventos ----------

export function UpcomingEvents({ state, now }: { state: GameState; now: number }) {
  const list = priorityEvents(state, now);
  if (list.length === 0) return null;
  return (
    <section className="panel quiet upcoming" aria-labelledby="upcoming-h">
      <header className="panel-head"><h3 id="upcoming-h">Próximos eventos</h3><span className="count mono">{list.length}</span></header>
      <ul className="ev-strip">
        {list.slice(0, 6).map((e) => (
          <li key={e.id} className={`ev-chip ev-${e.kind}${e.day === dayKey(now) ? ' today' : ''}${isKeyEvent(e) ? ' key' : ''}`} style={eventColor(e) ? ({ '--ev': eventColor(e) } as CSSProperties) : undefined}>
            <Icon name={eventIcon(e.kind)} /> <strong>{e.title}</strong>
            <span className="muted"> · {isKeyEvent(e) ? countdown(e.day, now) : relDay(e.day, now)}{e.time ? ` ${e.time}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
