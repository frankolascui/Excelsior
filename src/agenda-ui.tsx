// Agenda: recordatorios (cosas pequeñas), el formulario para añadir al calendario, la vista por horas (día o semana)
// y los avisos cuando llega la hora.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import type { CalendarEvent, EventKind, EventRepeat, GameState, Reminder } from './types';
import { dayKey } from './game';
import {
  addEvent, addReminder, deleteEvent, deleteReminder, dueAlerts, EVENT_KINDS, eventIcon, eventSpan, eventsOn, fromMin,
  laterReminders, layoutLanes, remindersOn, REPEAT_NAMES, skipEventDay, todayReminders, toggleReminder, toMin,
} from './life';
import { relDay } from './life-ui';
import { shortDate } from './ui';

export const WEEKDAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Día `n` días después de `day` (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

/** Lunes de la semana de `day`. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return addDays(day, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

const minutesNow = (now: number) => { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); };

// ---------- Recordatorios ----------

function remWhen(r: Reminder, now: number): string {
  if (!r.day) return 'Cuando puedas';
  const today = dayKey(now);
  if (r.day < today) return `Atrasado · ${shortDate(r.day)}`;
  return `${r.day === today ? 'Hoy' : relDay(r.day, now)}${r.time ? ` · ${r.time}` : ''}`;
}

export function ReminderRow({ r, now, game }: { r: Reminder; now: number; game: Game }) {
  const late = !r.doneAt && !!r.day && (r.day < dayKey(now) || (r.day === dayKey(now) && !!r.time && toMin(r.time) <= minutesNow(now)));
  return (
    <li className={`item rem-item${r.doneAt ? ' done' : ''}${late ? ' late' : ''}`}>
      <button
        className={`check${r.doneAt ? ' checked' : ''}`} onClick={() => game.act((s) => toggleReminder(s, r.id, Date.now()))}
        aria-label={r.doneAt ? `Desmarcar ${r.title}` : `Hecho: ${r.title}`} aria-pressed={!!r.doneAt}
      >{r.doneAt ? '✓' : ''}</button>
      <div className="item-body">
        <span className="item-title">{r.title}</span>
        <span className="muted small-text">🔔 {remWhen(r, now)}</span>
      </div>
      <button className="icon-btn" onClick={() => game.act((s) => deleteReminder(s, r.id))} aria-label={`Borrar recordatorio ${r.title}`}>×</button>
    </li>
  );
}

type When = 'none' | 'today' | 'tomorrow' | 'date';

/** Añadir un recordatorio rápido: qué y, si quieres, cuándo. */
export function ReminderForm({ game, now, day }: { game: Game; now: number; day?: string }) {
  const today = dayKey(now);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>(day ? 'date' : 'today');
  const [date, setDate] = useState(day ?? today);
  const [time, setTime] = useState('');
  const pickedDay = when === 'none' ? undefined : when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : date;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    game.act((s) => addReminder(s, { title, day: pickedDay, time: time || undefined }, Date.now()));
    setTitle('');
    setTime('');
  }
  return (
    <form className="rem-form" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recordatorio (ej. Comprar la cena)" maxLength={80} aria-label="Recordatorio" className="rem-title" />
      {!day && (
        <select className="freq-select" value={when} onChange={(e) => setWhen(e.target.value as When)} aria-label="Cuándo">
          <option value="today">Hoy</option>
          <option value="tomorrow">Mañana</option>
          <option value="date">Otro día</option>
          <option value="none">Sin fecha</option>
        </select>
      )}
      {!day && when === 'date' && <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Día" />}
      {when !== 'none' && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora del aviso (opcional)" />}
      <button type="submit" className="secondary" disabled={!title.trim()}>+ Recordar</button>
    </form>
  );
}

function NotifyButton() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState(() => (supported ? Notification.permission : 'denied'));
  if (!supported || perm !== 'default') return null;
  return (
    <button className="link" onClick={() => Notification.requestPermission().then(setPerm, () => setPerm('denied'))}>🔔 Activar avisos</button>
  );
}

/** Panel de Hoy: lo que tienes que tener presente (atrasado, hoy y sin fecha) y lo de más adelante plegado. */
export function RemindersPanel({ game, now }: { game: Game; now: number }) {
  const list = todayReminders(game.state, now);
  const later = laterReminders(game.state, now);
  const open = list.filter((r) => !r.doneAt).length;
  return (
    <section className="panel reminders" aria-labelledby="rem-h">
      <header className="panel-head">
        <h3 id="rem-h">Recordatorios</h3>
        <span className="count mono">{open}</span>
        <NotifyButton />
      </header>
      {list.length === 0 && later.length === 0 && <p className="hint">Cosas pequeñas que no quieres olvidar: comprar la cena, llevarte el cuaderno a casa… Si les pones hora, te aviso.</p>}
      {list.length > 0 && <ul className="list">{list.map((r) => <ReminderRow key={r.id} r={r} now={now} game={game} />)}</ul>}
      {later.length > 0 && (
        <details className="rem-later">
          <summary>Más adelante ({later.length})</summary>
          <ul className="list">{later.map((r) => <ReminderRow key={r.id} r={r} now={now} game={game} />)}</ul>
        </details>
      )}
      <ReminderForm game={game} now={now} />
    </section>
  );
}

// ---------- Añadir al calendario ----------

type Kind = EventKind | 'recordatorio';

/** Formulario para añadir al calendario: un evento, un bloque de tiempo (con fin y repetición) o un recordatorio. */
export function AgendaForm({ game, day, time, onDone, compact }: { game: Game; day: string; time?: string; onDone?: () => void; compact?: boolean }) {
  const [kind, setKind] = useState<Kind>(time ? 'bloque' : 'examen');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(day);
  const [start, setStart] = useState(time ?? '');
  const [end, setEnd] = useState(time ? fromMin(Math.min(toMin(time) + 60, 23 * 60 + 59)) : '');
  const [repeat, setRepeat] = useState<EventRepeat | ''>('');
  useEffect(() => setDate(day), [day]);
  const isRem = kind === 'recordatorio';
  function pickStart(v: string) {
    if (v && (!end || end <= v)) setEnd(fromMin(Math.min(toMin(v) + 60, 23 * 60 + 59)));
    setStart(v);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const when = date || day;
    if (isRem) game.act((s) => addReminder(s, { title, day: when, time: start || undefined }, Date.now()));
    else game.act((s) => addEvent(s, { title, day: when, kind: kind as EventKind, time: start || undefined, end: start ? end || undefined : undefined, repeat: repeat || undefined }, Date.now()));
    setTitle('');
    onDone?.();
  }
  const placeholder = isRem ? 'Recordatorio (ej. Llevarme el cuaderno)' : kind === 'bloque' ? 'Qué vas a hacer (ej. Estudiar física)' : 'Evento (ej. Examen de cálculo)';
  return (
    <form className={`ev-form${compact ? ' compact' : ''}`} onSubmit={submit}>
      <select className="freq-select" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
        {EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.name}</option>)}
        <option value="recordatorio">🔔 Recordatorio</option>
      </select>
      <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} maxLength={80} aria-label="Nombre" autoFocus={compact} />
      {compact && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" />}
      <span className="ev-times">
        <input id="ev-time" type="time" value={start} onChange={(e) => pickStart(e.target.value)} aria-label={isRem ? 'Hora del aviso (opcional)' : 'Empieza (opcional)'} />
        {!isRem && start && <>
          <span className="muted" aria-hidden="true">–</span>
          <input id="ev-end" type="time" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-label="Termina" />
        </>}
      </span>
      {!isRem && (
        <select className="freq-select" value={repeat} onChange={(e) => setRepeat(e.target.value as EventRepeat | '')} aria-label="Repetir">
          <option value="">No se repite</option>
          {(Object.keys(REPEAT_NAMES) as EventRepeat[]).map((r) => <option key={r} value={r}>{REPEAT_NAMES[r]}</option>)}
        </select>
      )}
      <button type="submit" className={compact ? 'primary' : 'secondary'} disabled={!title.trim()}>+ Añadir</button>
    </form>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="sheet-bg" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet panel">
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="Cerrar">×</button>
        {children}
      </div>
    </div>
  );
}

function timeRange(e: CalendarEvent): string {
  const span = eventSpan(e);
  return span ? `${fromMin(span[0])} – ${fromMin(span[1] === 1440 ? 1439 : span[1])}` : 'Todo el día';
}

/** Lo que sale al pulsar un evento: detalles, Deep Work para los bloques y borrar (solo ese día o la serie). */
function EventSheet({ game, ev, onClose, startFocus }: { game: Game; ev: CalendarEvent; onClose: () => void; startFocus?: (label: string) => void }) {
  const kind = EVENT_KINDS.find((k) => k.id === ev.kind);
  return (
    <Sheet label={ev.title} onClose={onClose}>
      <p className="eyebrow">{kind?.icon} {kind?.name}</p>
      <h3 className="sheet-title">{ev.title}</h3>
      <p className="muted">{shortDate(ev.day)} · {timeRange(ev)}{ev.repeat ? ` · ${REPEAT_NAMES[ev.repeat]}` : ''}</p>
      <div className="row sheet-actions">
        {startFocus && <button className="primary" onClick={() => { onClose(); startFocus(ev.title); }}>▶ Deep Work</button>}
        {ev.repeat && <button className="ghost" onClick={() => { game.act((s) => skipEventDay(s, ev.id, ev.day)); onClose(); }}>Quitar solo este día</button>}
        <button className="ghost danger-text" onClick={() => { game.act((s) => deleteEvent(s, ev.id)); onClose(); }}>{ev.repeat ? 'Borrar la serie' : 'Borrar'}</button>
      </div>
    </Sheet>
  );
}

/** Lista de un día (debajo del mes o del día): eventos con su hora, recordatorios y el formulario para añadir. */
export function DayAgenda({ game, day, now, startFocus }: { game: Game; day: string; now: number; startFocus?: (label: string) => void }) {
  const evs = eventsOn(game.state, day);
  const rems = remindersOn(game.state, day);
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  return (
    <div className="day-events">
      {evs.length > 0 && (
        <ul className="list">
          {evs.map((e) => (
            <li key={e.id} className={`item ev-item ev-${e.kind}`}>
              <span className="ev-icon" aria-hidden="true">{eventIcon(e.kind)}</span>
              <button className="item-body ev-open" onClick={() => setOpen(e)} aria-label={`Abrir ${e.title}`}>
                <span className="item-title">{e.title}</span>
                <span className="muted small-text">{EVENT_KINDS.find((k) => k.id === e.kind)?.name}{e.time ? ` · ${timeRange(e)}` : ''}{e.repeat ? ` · ↻ ${REPEAT_NAMES[e.repeat]}` : ''}</span>
              </button>
              <button className="icon-btn" onClick={() => game.act((s) => (e.repeat ? skipEventDay(s, e.id, day) : deleteEvent(s, e.id)))}
                aria-label={`Borrar evento ${e.title}${e.repeat ? ' (solo este día)' : ''}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      {rems.length > 0 && <ul className="list">{rems.map((r) => <ReminderRow key={r.id} r={r} now={now} game={game} />)}</ul>}
      <AgendaForm game={game} day={day} />
      {open && <EventSheet game={game} ev={open} onClose={() => setOpen(null)} startFocus={open.kind === 'bloque' ? startFocus : undefined} />}
    </div>
  );
}

// ---------- Vista por horas ----------

/**
 * Día o semana por horas, como en Google Calendar: arriba lo que dura todo el día (eventos sin hora, recordatorios sin hora
 * y misiones que vencen), debajo las horas con los eventos y bloques, los recordatorios con hora, tus sesiones de Deep Work
 * y la línea de «ahora». Pulsar un hueco añade algo a esa hora.
 */
export function TimeGrid({ game, days, now, onPickDay, startFocus }: {
  game: Game; days: string[]; now: number; onPickDay?: (day: string) => void; startFocus?: (label: string) => void;
}) {
  const { state } = game;
  const today = dayKey(now);
  const single = days.length === 1;
  const hour = single ? 52 : 44;
  const scroller = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ day: string; time?: string } | null>(null);
  const [open, setOpen] = useState<CalendarEvent | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const from = days.includes(today) ? Math.max(0, minutesNow(now) / 60 - 1.5) : 7;
    el.scrollTop = from * hour;
  }, [days[0], single]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickSlot(day: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor((y / hour) * 2) * 30));
    setDraft({ day, time: fromMin(mins) });
  }

  return (
    <div className={`tg ${single ? 'tg-day' : 'tg-week'}`} style={{ '--hour': `${hour}px`, '--cols': days.length } as CSSProperties}>
      <div className="tg-row tg-head">
        <span className="tg-gutter" />
        {days.map((d, i) => {
          const wd = WEEKDAY_NAMES[(new Date(`${d}T12:00:00`).getDay() + 6) % 7] ?? WEEKDAY_NAMES[i];
          return (
            <button key={d} className={`tg-dayhead${d === today ? ' today' : ''}`} onClick={() => (onPickDay ? onPickDay(d) : setDraft({ day: d }))}
              aria-label={`${shortDate(d)}${onPickDay ? ': ver el día' : ': añadir'}`}>
              <span>{wd}</span><b className="mono">{Number(d.slice(8))}</b>
            </button>
          );
        })}
      </div>

      <div className="tg-row tg-allday">
        <span className="tg-gutter muted">todo el día</span>
        {days.map((d) => <AllDay key={d} state={state} game={game} day={d} now={now} onOpen={setOpen} />)}
      </div>

      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ height: 24 * hour }}>
          <div className="tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * hour }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>)}
          </div>
          {days.map((d) => (
            <div key={d} className={`tg-col${d === today ? ' today' : ''}`} onClick={(e) => pickSlot(d, e)} aria-label={`Horas del ${shortDate(d)}`}>
              <DayBlocks state={state} game={game} day={d} hour={hour} now={now} onOpen={setOpen} />
              {d === today && <span className="tg-now" style={{ top: (minutesNow(now) / 60) * hour }} aria-label="Ahora" />}
            </div>
          ))}
        </div>
      </div>

      {draft && (
        <Sheet label="Añadir al calendario" onClose={() => setDraft(null)}>
          <p className="eyebrow">Nuevo · {shortDate(draft.day)}{draft.time ? ` · ${draft.time}` : ''}</p>
          <AgendaForm key={`${draft.day}${draft.time}`} game={game} day={draft.day} time={draft.time} onDone={() => setDraft(null)} compact />
        </Sheet>
      )}
      {open && <EventSheet game={game} ev={open} onClose={() => setOpen(null)} startFocus={open.kind === 'bloque' ? startFocus : undefined} />}
    </div>
  );
}

function AllDay({ state, game, day, now, onOpen }: { state: GameState; game: Game; day: string; now: number; onOpen: (e: CalendarEvent) => void }) {
  const evs = eventsOn(state, day).filter((e) => !e.time);
  const rems = remindersOn(state, day).filter((r) => !r.time);
  const due = state.quests.filter((q) => !q.completedAt && q.deadline === day);
  return (
    <div className="tg-cell">
      {evs.map((e) => <button key={e.id} className={`tg-chip ev-${e.kind}`} onClick={() => onOpen(e)}>{eventIcon(e.kind)} {e.title}</button>)}
      {rems.map((r) => (
        <button key={r.id} className={`tg-chip tg-remchip${r.doneAt ? ' done' : ''}`} onClick={() => game.act((s) => toggleReminder(s, r.id, Date.now()))}
          aria-label={`${r.doneAt ? 'Desmarcar' : 'Hecho'}: ${r.title}`} title={remWhen(r, now)}>{r.doneAt ? '✓' : '🔔'} {r.title}</button>
      ))}
      {due.map((q) => <span key={q.id} className={`cal-q q-${q.type}`}>{q.title}</span>)}
    </div>
  );
}

function DayBlocks({ state, game, day, hour, now, onOpen }: {
  state: GameState; game: Game; day: string; hour: number; now: number; onOpen: (e: CalendarEvent) => void;
}) {
  const evs = eventsOn(state, day).filter((e) => e.time);
  const spans = evs.map((e) => eventSpan(e)!);
  const lanes = layoutLanes(spans);
  const sessions = state.sessions.filter((x) => dayKey(x.startedAt) === day);
  const rems = remindersOn(state, day).filter((r) => r.time);
  const top = (m: number) => (m / 60) * hour;
  const past = (end: number) => day < dayKey(now) || (day === dayKey(now) && end <= minutesNow(now));
  return (
    <>
      {sessions.map((x) => {
        const d = new Date(x.startedAt);
        const a = d.getHours() * 60 + d.getMinutes();
        const b = Math.min(1440, a + Math.max(15, Math.round((x.endedAt - x.startedAt) / 60_000)));
        return (
          <span key={x.id} className="tg-block tg-session" style={{ top: top(a), height: top(b - a) }} title={`Deep Work: ${x.label} · ${x.minutes} min`}>
            ⚡ {x.label} <span className="mono">{x.minutes} min</span>
          </span>
        );
      })}
      {evs.map((e, i) => {
        const [a, b] = spans[i];
        const { lane, lanes: n } = lanes[i];
        return (
          <button
            key={e.id} className={`tg-block ev-${e.kind}${past(b) ? ' past' : ''}${b - a <= 30 ? ' short' : ''}`}
            style={{ top: top(a), height: Math.max(18, top(b - a) - 2), left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
            onClick={() => onOpen(e)} aria-label={`${e.title}, ${timeRange(e)}`}
          >
            <b>{e.kind !== 'bloque' && `${eventIcon(e.kind)} `}{e.title}</b>
            <span className="mono">{timeRange(e)}{e.repeat ? ' ↻' : ''}</span>
          </button>
        );
      })}
      {rems.map((r) => (
        <button key={r.id} className={`tg-rem${r.doneAt ? ' done' : ''}`} style={{ top: top(toMin(r.time!)) }}
          onClick={() => game.act((s) => toggleReminder(s, r.id, Date.now()))} aria-label={`${r.doneAt ? 'Desmarcar' : 'Hecho'}: ${r.title} a las ${r.time}`}>
          {r.doneAt ? '✓' : '🔔'} {r.time} {r.title}
        </button>
      ))}
    </>
  );
}

// ---------- Avisos ----------

const ALERTED_KEY = 'excelsior:alerted';

/** Cuando llega la hora de un recordatorio o de un evento, lo avisa (en la app y, si diste permiso, con una notificación). */
export function useAgendaAlerts(state: GameState, toast: (text: string, tone?: 'xp' | 'info' | 'level', ms?: number) => void) {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = dueAlerts(latest.current, now);
      if (!due.length) return;
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem(ALERTED_KEY) ?? '[]');
      } catch {
        /* sin almacenamiento: puede repetirse el aviso */
      }
      const fresh = due.filter((a) => !seen.includes(a.key));
      if (!fresh.length) return;
      for (const a of fresh) {
        toast(a.text, 'level', 9000);
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Excelsior', { body: a.text, tag: a.key });
        } catch {
          /* algunos móviles solo notifican desde un service worker */
        }
      }
      const today = dayKey(now);
      try {
        localStorage.setItem(ALERTED_KEY, JSON.stringify([...seen.filter((k) => k.endsWith(today)), ...fresh.map((a) => a.key)]));
      } catch {
        /* ignorado */
      }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [toast]);
}
