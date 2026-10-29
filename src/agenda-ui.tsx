// Agenda: recordatorios (cosas pequeñas), el formulario para añadir al calendario, la vista por horas (día o semana)
// con eventos que se arrastran y se alargan como en Google Calendar, y los avisos cuando llega la hora.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import type { CalendarEvent, EventKind, EventRepeat, GameState, Reminder, RepeatRule } from './types';
import { completeQuest, dayKey, pendingQuests, toggleHabit, uid, undoQuest } from './game';
import {
  addEvent, addReminder, deleteEvent, deleteReminder, dueAlerts, EVENT_COLORS, EVENT_KINDS, eventColor, eventIcon, eventSpan, eventsOn, fromMin,
  addBlockTask, blockItems, removeBlockTask, type BlockItem,
  cleanRule, laterReminders, layoutLanes, editOccurrence, isKeyEvent, moveEvent, REPEAT_NAMES, skipEventDay, todayReminders, toggleReminder, toMin, updateEvent,
} from './life';
import { relDay } from './life-ui';
import { DatePicker, DurationChips, TimePicker, durationWords } from './pickers';
import { sfx } from './sfx';
import { Icon, plain } from './icons';
import { shortDate } from './ui';
import { SessionEdit } from './session-ui';

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
const LAST = 23 * 60 + 59;
/** Hora de fin por defecto: una hora después (sin pasar de las 23:59). */
const plusHour = (t: string) => fromMin(Math.min(toMin(t) + 60, LAST));
/** Color propio del evento como variable CSS (si no tiene, manda el del tipo). */
const evStyle = (e: { color?: string }): CSSProperties => (eventColor(e) ? ({ '--ev': eventColor(e) } as CSSProperties) : {});

// ---------- Recordatorios ----------

function remWhen(r: Reminder, now: number): string {
  if (!r.day) return 'Cuando puedas';
  const today = dayKey(now);
  if (r.day < today) return `Atrasado · ${shortDate(r.day)}`;
  return `${r.day === today ? 'Hoy' : relDay(r.day, now)}${r.time ? ` · ${r.time}` : ''}`;
}

function toggleRem(game: Game, r: Reminder) {
  if (r.doneAt) sfx.uncheck(); else sfx.check();
  game.act((s) => toggleReminder(s, r.id, Date.now()));
}

export function ReminderRow({ r, now, game }: { r: Reminder; now: number; game: Game }) {
  const late = !r.doneAt && !!r.day && (r.day < dayKey(now) || (r.day === dayKey(now) && !!r.time && toMin(r.time) <= minutesNow(now)));
  return (
    <li className={`item rem-item${r.doneAt ? ' done' : ''}${late ? ' late' : ''}`}>
      <button className={`check${r.doneAt ? ' checked' : ''}`} onClick={() => toggleRem(game, r)}
        aria-label={r.doneAt ? `Desmarcar ${r.title}` : `Hecho: ${r.title}`} aria-pressed={!!r.doneAt}>✓</button>
      <div className="item-body">
        <span className="item-title">{r.title}</span>
        <span className="muted small-text"><Icon name="bell" /> {remWhen(r, now)}</span>
      </div>
      <button className="icon-btn" onClick={() => { sfx.remove(); game.act((s) => deleteReminder(s, r.id)); }} aria-label={`Borrar recordatorio ${r.title}`} title="Borrar"><Icon name="trash" /></button>
    </li>
  );
}

/** Añadir un recordatorio rápido: qué y, si quieres, cuándo (día y hora con los selectores propios). */
export function ReminderForm({ game, now, day }: { game: Game; now: number; day?: string }) {
  const today = dayKey(now);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | null>(day ?? today);
  const [time, setTime] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    game.act((s) => addReminder(s, { title, day: date ?? undefined, time: date ? time ?? undefined : undefined }, Date.now()));
    sfx.place();
    setTitle('');
    setTime(null);
  }
  return (
    <form className="rem-form" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recordatorio (ej. Comprar la cena)" maxLength={80} aria-label="Recordatorio" className="rem-title" />
      <div className="rem-when">
        {!day && <DatePicker value={date} onChange={setDate} label="Día del recordatorio" clearLabel="Sin fecha (cuando puedas)" placeholder="Cuando puedas" />}
        {date && <TimePicker value={time} onChange={setTime} label="Hora del aviso" clearLabel="Sin hora" placeholder="Sin hora" />}
        <button type="submit" className="secondary" disabled={!title.trim()}><Icon name="plus" /> Recordar</button>
      </div>
    </form>
  );
}

function NotifyButton() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState(() => (supported ? Notification.permission : 'denied'));
  if (!supported || perm !== 'default') return null;
  return (
    <button className="link" onClick={() => Notification.requestPermission().then(setPerm, () => setPerm('denied'))}><Icon name="bell-ring" /> Activar avisos</button>
  );
}

/** Panel de Hoy: lo que tienes que tener presente (atrasado, hoy y sin fecha) y lo de más adelante plegado. */
export function RemindersPanel({ game, now }: { game: Game; now: number }) {
  const list = todayReminders(game.state, now);
  const later = laterReminders(game.state, now);
  const open = list.filter((r) => !r.doneAt).length;
  const [adding, setAdding] = useState(false);
  // sin recordatorios, el panel se queda en una línea para no alargar Hoy
  if (list.length === 0 && later.length === 0 && !adding) {
    return (
      <section className="panel reminders reminders-folded" aria-label="Recordatorios">
        <p><Icon name="bell" /> Sin recordatorios.</p>
        <button className="ghost small" onClick={() => setAdding(true)}><Icon name="plus" /> Recordatorio</button>
      </section>
    );
  }
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

// ---------- Añadir y editar ----------

type Kind = EventKind | 'recordatorio';

function ColorSwatches({ value, onChange }: { value?: string; onChange: (c: string | undefined) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      <button type="button" role="radio" aria-checked={!value} className={`swatch auto${value ? '' : ' on'}`} onClick={() => onChange(undefined)} title="Color del tipo" aria-label="Color del tipo" />
      {EVENT_COLORS.map((c) => (
        <button type="button" key={c.id} role="radio" aria-checked={value === c.id} className={`swatch${value === c.id ? ' on' : ''}`}
          style={{ '--sw': c.hex } as CSSProperties} onClick={() => onChange(c.id)} title={c.name} aria-label={c.name} />
      ))}
    </div>
  );
}

/** Hora de inicio, de fin y atajos de duración. Sin inicio = todo el día. */
function TimeFields({ start, end, onStart, onEnd, reminder }: {
  start: string | null; end: string | null; onStart: (t: string | null) => void; onEnd: (t: string) => void; reminder?: boolean;
}) {
  return (
    <div className="time-fields">
      <TimePicker id="ev-time" value={start} onChange={onStart} label={reminder ? 'Hora del aviso' : 'Empieza'} clearLabel={reminder ? 'Sin hora' : 'Todo el día'} placeholder={reminder ? 'Sin hora' : 'Todo el día'} />
      {!reminder && start && <>
        <Icon name="arrow-right" className="muted" />
        <TimePicker id="ev-end" value={end} onChange={(t) => t && onEnd(t)} from={start} label="Termina" />
        <span className="dur-total mono">{durationWords(toMin(end ?? plusHour(start)) - toMin(start))}</span>
      </>}
      {!reminder && start && <DurationChips start={start} end={end} onChange={onEnd} />}
    </div>
  );
}

type RepeatValue = { repeat?: EventRepeat; rule?: RepeatRule; until?: string };
const RULE_DAYS: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

/**
 * Repetición de un evento: los atajos de siempre o «Personalizado…» (cada N días, semanas con sus días, o meses),
 * y cuándo termina (nunca o un día).
 */
function RepeatEditor({ value, day, onChange }: { value: RepeatValue; day: string; onChange: (patch: RepeatValue) => void }) {
  const rule = value.repeat === 'custom' ? cleanRule(value.rule, day) : null;
  const pick = (r: string) => {
    if (!r) return onChange({ repeat: undefined, rule: undefined, until: undefined });
    onChange({ repeat: r as EventRepeat, rule: r === 'custom' ? cleanRule(value.rule, day) : undefined });
  };
  const setRule = (p: Partial<RepeatRule>) => rule && onChange({ rule: cleanRule({ ...rule, ...p }, day) });
  return (
    <div className="repeat-editor">
      <select className="freq-select" value={value.repeat ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Repetir">
        <option value="">No se repite</option>
        {(Object.keys(REPEAT_NAMES) as EventRepeat[]).map((r) => <option key={r} value={r}>{REPEAT_NAMES[r]}</option>)}
      </select>
      {rule && (
        <div className="repeat-custom">
          <span className="muted">Cada</span>
          <input type="number" min={1} max={99} className="repeat-every" value={rule.every} aria-label="Cada cuántos"
            onChange={(e) => e.target.value !== '' && setRule({ every: Number(e.target.value) })} />
          <select className="freq-select" value={rule.unit} aria-label="Unidad" onChange={(e) => setRule({ unit: e.target.value as RepeatRule['unit'] })}>
            <option value="day">{rule.every === 1 ? 'día' : 'días'}</option>
            <option value="week">{rule.every === 1 ? 'semana' : 'semanas'}</option>
            <option value="month">{rule.every === 1 ? 'mes' : 'meses'}</option>
          </select>
          {rule.unit === 'week' && (
            <span className="repeat-days" role="group" aria-label="Días de la semana">
              {RULE_DAYS.map(([d, t]) => {
                const on = rule.days!.includes(d);
                return (
                  <button type="button" key={d} aria-pressed={on} className={on ? 'rd on' : 'rd'}
                    onClick={() => { setRule({ days: on ? rule.days!.filter((x) => x !== d) : [...rule.days!, d] }); }}>{t}</button>
                );
              })}
            </span>
          )}
          {rule.unit === 'month' && <span className="muted small-text">el día {Number(day.slice(8))}</span>}
        </div>
      )}
      {value.repeat && (
        <span className="repeat-until">
          <span className="muted">Termina</span>
          <DatePicker value={value.until ?? null} onChange={(d) => onChange({ until: d ?? undefined })} label="Último día" clearLabel="Nunca" placeholder="Nunca" />
        </span>
      )}
    </div>
  );
}

/** Formulario para añadir al calendario: un evento, un bloque de tiempo (con fin, color y repetición) o un recordatorio. */
export function AgendaForm({ game, day, time, end: initialEnd, onDone, compact, onlyKey }: {
  game: Game; day: string; time?: string; end?: string; onDone?: () => void; compact?: boolean; onlyKey?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(time ? 'bloque' : 'examen');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(day);
  const [start, setStart] = useState<string | null>(time ?? null);
  const [end, setEnd] = useState<string | null>(time ? initialEnd ?? plusHour(time) : null);
  const [rep, setRep] = useState<RepeatValue>({});
  const [color, setColor] = useState<string | undefined>();
  useEffect(() => setDate(day), [day]);
  const isRem = kind === 'recordatorio';
  function pickStart(v: string | null) {
    if (v && start && end) setEnd(fromMin(Math.min(toMin(v) + toMin(end) - toMin(start), LAST))); // mantiene la duración
    else if (v) setEnd(plusHour(v));
    setStart(v);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (isRem) game.act((s) => addReminder(s, { title, day: date, time: start ?? undefined }, Date.now()));
    else game.act((s) => addEvent(s, { title, day: date, kind: kind as EventKind, time: start ?? undefined, end: start ? end ?? undefined : undefined, ...rep, color }, Date.now()));
    sfx.place();
    setTitle('');
    onDone?.();
  }
  const placeholder = isRem ? 'Recordatorio (ej. Llevarme el cuaderno)' : kind === 'bloque' ? 'Qué vas a hacer (ej. Estudiar física)' : 'Evento (ej. Examen de cálculo)';
  return (
    <form className={`ev-form${compact ? ' compact' : ''}`} onSubmit={submit} style={evStyle({ color })}>
      <div className="ev-form-top">
        <select className="freq-select" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
          {EVENT_KINDS.filter((k) => !onlyKey || isKeyEvent({ kind: k.id })).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          {!onlyKey && <option value="recordatorio">Recordatorio</option>}
        </select>
        <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} maxLength={80} aria-label="Nombre" autoFocus={compact} />
      </div>
      <div className="ev-form-when">
        {compact && <DatePicker value={date} onChange={(d) => d && setDate(d)} label="Día" />}
        <TimeFields start={start} end={end} onStart={pickStart} onEnd={setEnd} reminder={isRem} />
      </div>
      {!isRem && (
        <div className="ev-form-extra">
          <RepeatEditor value={rep} day={date} onChange={(p) => setRep({ ...rep, ...p })} />
          <ColorSwatches value={color} onChange={setColor} />
        </div>
      )}
      <button type="submit" className={compact ? 'primary' : 'secondary'} disabled={!title.trim()}><Icon name="plus" /> Añadir</button>
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
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="Cerrar" title="Cerrar"><Icon name="x" /></button>
        {children}
      </div>
    </div>
  );
}

function timeRange(e: { time?: string; end?: string }): string {
  const span = eventSpan(e);
  return span ? `${fromMin(span[0])} – ${fromMin(Math.min(span[1], LAST))}` : 'Todo el día';
}

/**
 * Lo que sale al pulsar un evento: se edita ahí mismo (nombre, color, día, horas, repetición), Deep Work para los bloques
 * y borrar. En un evento que se repite, los cambios valen para toda la serie.
 */
function EventSheet({ game, id: firstId, day, onClose, startFocus }: { game: Game; id: string; day: string; onClose: () => void; startFocus?: (label: string) => void }) {
  const [onDay, setOnDay] = useState(day);
  const [id, setId] = useState(firstId);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [detachedFrom, setDetachedFrom] = useState<string | null>(null);
  const ev = eventsOn(game.state, onDay).find((e) => e.id === id) ?? (game.state.events ?? []).find((e) => e.id === id);
  const [title, setTitle] = useState(ev?.title ?? '');
  useEffect(() => { if (!ev) onClose(); }, [ev]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ev) return null;
  const series = (game.state.events ?? []).find((e) => e.id === id) ?? ev; // ev es el de ese día; series, el guardado (con su primer día)
  const one = !!ev.repeat && scope === 'one';
  const set = (patch: Parameters<typeof updateEvent>[2]) => {
    if (!one) return game.act((s) => updateEvent(s, id, patch));
    // Solo este día: sale de la serie como evento suelto y la ficha sigue con ese.
    const newId = uid();
    game.act((s) => editOccurrence(s, id, onDay, patch, newId, Date.now()));
    setDetachedFrom(ev.title);
    setId(newId);
    if (patch.day) setOnDay(patch.day);
  };
  const saveTitle = () => { if (title.trim() && title.trim() !== ev.title) set({ title }); };
  const focusFn = ev.kind === 'bloque' ? startFocus : undefined;
  return (
    <Sheet label={ev.title} onClose={() => { saveTitle(); onClose(); }}>
      <div className="sheet-edit" style={evStyle(ev)}>
        <p className="eyebrow">
          <select className="kind-select" value={ev.kind} onChange={(e) => set({ kind: e.target.value as EventKind })} aria-label="Tipo">
            {EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </p>
        {ev.repeat && (
          <div className="segmented ev-scope" role="radiogroup" aria-label="Qué cambiar">
            <button type="button" role="radio" aria-checked={scope === 'one'} className={scope === 'one' ? 'seg on' : 'seg'} onClick={() => setScope('one')}>Solo este día</button>
            <button type="button" role="radio" aria-checked={scope === 'all'} className={scope === 'all' ? 'seg on' : 'seg'} onClick={() => setScope('all')}>Todos los días</button>
          </div>
        )}
        {detachedFrom && !ev.repeat && <p className="muted small-text ev-detached"><Icon name="info" /> Solo este día: los demás siguen como «{detachedFrom}».</p>}
        <input className="sheet-title-input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())} maxLength={80} aria-label="Nombre del evento" />
        <div className="ev-form-when">
          <DatePicker value={ev.repeat && !one ? series.day : onDay} label={ev.repeat && !one ? 'Empieza el' : 'Día'}
            onChange={(d) => { if (!d) return; if (!ev.repeat) setOnDay(d); set({ day: d }); }} />
          <TimeFields start={ev.time ?? null} end={ev.time ? fromMin(Math.min(eventSpan(ev)![1], LAST)) : null}
            onStart={(t) => {
              if (!t) return set({ time: undefined, end: undefined });
              const dur = ev.time ? eventSpan(ev)![1] - eventSpan(ev)![0] : 60;
              set({ time: t, end: fromMin(Math.min(toMin(t) + dur, LAST)) });
            }}
            onEnd={(t) => set({ end: t })} />
        </div>
        {ev.kind === 'bloque' && <BlockTasks game={game} eventId={id} ev={ev} day={onDay} />}
        <div className="ev-form-extra">
          {!one && <RepeatEditor value={series} day={series.day} onChange={(p) => set(p)} />}
          <ColorSwatches value={ev.color} onChange={(c) => set({ color: c })} />
        </div>
      </div>
      <div className="row sheet-actions">
        {focusFn && <button className="primary" onClick={() => { saveTitle(); onClose(); focusFn(title.trim() || ev.title); }}><Icon name="play" /> Empezar Deep Work</button>}
        {ev.repeat && <button className="ghost" onClick={() => { sfx.remove(); game.act((s) => skipEventDay(s, ev.id, onDay)); onClose(); }}><Icon name="x" /> Quitar solo este día</button>}
        <button className="ghost danger-text" onClick={() => { sfx.remove(); game.act((s) => deleteEvent(s, ev.id)); onClose(); }}><Icon name="trash" /> {ev.repeat ? 'Borrar la serie' : 'Borrar'}</button>
      </div>
      <p className="hint sheet-hint"><Icon name="info" /> Consejo: en la vista Día o Semana puedes arrastrar el evento para moverlo y estirar su borde de abajo para cambiar lo que dura.</p>
    </Sheet>
  );
}

/**
 * Misiones y hábitos de un bloque: se marcan ahí mismo para ese día y valen para toda la serie
 * (en una misión que se repite sale la copia que toca ese día).
 */
function BlockTasks({ game, eventId, ev, day }: { game: Game; eventId: string; ev: CalendarEvent; day: string }) {
  const { state, act } = game;
  const [adding, setAdding] = useState('');
  const today = dayKey(Date.now());
  const items = blockItems(state, ev, day);
  const inBlock = new Set((ev.tasks ?? []).map((x) => `${x.kind}:${x.id}`));
  const quests = pendingQuests(state, Date.now()).filter((q) => !inBlock.has(`quest:${q.id}`));
  const habits = state.habits.filter((h) => !inBlock.has(`habit:${h.id}`));
  const canMark = day <= today && day >= addDays(today, -6);
  function toggle(it: BlockItem) {
    if (!canMark) return;
    if (it.task.kind === 'habit') return act((s) => toggleHabit(s, it.task.id, Date.now(), day), CAP_HABIT_NOTE, { sound: 'habit' });
    const q = state.quests.find((x) => x.id === it.questId);
    if (!q) return;
    if (!q.completedAt) act((s) => completeQuest(s, q.id, Date.now()), CAP_QUEST_NOTE, { sound: q.kingdomId ? 'build' : 'reward', party: q.type === 'main' });
    else if (dayKey(q.completedAt) === today) act((s) => undoQuest(s, q.id));
  }
  function add(value: string) {
    setAdding('');
    const [kind, taskId] = value.split(':') as ['quest' | 'habit', string];
    if (!taskId) return;
    sfx.place();
    act((s) => addBlockTask(s, eventId, { kind, id: taskId }));
  }
  return (
    <div className="block-tasks">
      <p className="small-text block-tasks-h">En este bloque{items.length > 0 && <span className="mono"> · {items.filter((x) => x.done).length}/{items.length}</span>}</p>
      {items.length > 0 && (
        <ul className="list plain">
          {items.map((it) => (
            <li key={`${it.task.kind}:${it.task.id}`} className={it.done ? 'block-task done' : 'block-task'}>
              <button type="button" className={it.done ? 'check checked' : 'check'} disabled={!canMark} onClick={() => toggle(it)}
                aria-pressed={it.done} aria-label={`${it.done ? 'Desmarcar' : 'Completar'} ${it.label}`} title={canMark ? undefined : 'Solo se marca hoy o en los 7 días anteriores'}>✓</button>
              <span className="block-task-name"><Icon name={it.task.kind === 'habit' ? 'repeat' : 'scroll'} /> {it.label}</span>
              <button type="button" className="icon-btn" onClick={() => act((s) => removeBlockTask(s, eventId, it.task))} aria-label={`Sacar ${it.label} del bloque`} title="Sacar del bloque"><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      )}
      {(quests.length > 0 || habits.length > 0) && (
        <select className="freq-select" value={adding} onChange={(e) => add(e.target.value)} aria-label="Añadir una misión o un hábito al bloque">
          <option value="">+ Añadir una misión o un hábito</option>
          {habits.length > 0 && <optgroup label="Hábitos">{habits.map((h) => <option key={h.id} value={`habit:${h.id}`}>{h.name}</option>)}</optgroup>}
          {quests.length > 0 && <optgroup label="Misiones pendientes">{quests.map((q) => <option key={q.id} value={`quest:${q.id}`}>{q.title}</option>)}</optgroup>}
        </select>
      )}
    </div>
  );
}

const CAP_HABIT_NOTE = 'Tope diario de XP por hábitos alcanzado. Sube de nivel para ampliarlo.';
const CAP_QUEST_NOTE = 'Tope diario de XP por misiones alcanzado: la misión cuenta igual. Sube de nivel para ampliarlo.';

// ---------- Vista por horas ----------

/** Arrastre en curso: mover un evento, estirar su final o marcar un hueco nuevo. */
type Drag =
  | { mode: 'move' | 'resize'; ev: CalendarEvent; grab: number; day: string; start: number; end: number }
  | { mode: 'create'; day: string; from: number; start: number; end: number };

const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/**
 * Día o semana por horas, como en Google Calendar: arriba lo que dura todo el día (eventos sin hora, recordatorios sin hora
 * y misiones que vencen), debajo las horas con los eventos y bloques, los recordatorios con hora, tus sesiones de Deep Work
 * y la línea de «ahora». Los eventos se arrastran para moverlos (también a otro día en la semana) y se estiran por abajo;
 * pulsar un hueco o arrastrar sobre él añade algo a esa hora.
 */
export function TimeGrid({ game, days, now, onPickDay, startFocus }: {
  game: Game; days: string[]; now: number; onPickDay?: (day: string) => void; startFocus?: (label: string) => void;
}) {
  const { state } = game;
  const today = dayKey(now);
  const single = days.length === 1;
  const hour = single ? 52 : 44;
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef(new Map<string, HTMLDivElement>());
  const [draft, setDraft] = useState<{ day: string; time?: string; end?: string } | null>(null);
  const [open, setOpen] = useState<{ id: string; day: string } | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const moved = useRef(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const from = days.includes(today) ? Math.max(0, minutesNow(now) / 60 - 1.5) : 7;
    el.scrollTop = from * hour;
  }, [days[0], single]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Minuto del día y columna bajo el puntero. */
  function at(x: number, y: number, fallbackDay: string): { day: string; min: number } {
    let day = fallbackDay;
    let col = cols.current.get(day);
    if (!single) {
      for (const [d, el] of cols.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x < r.right) { day = d; col = el; break; }
      }
    }
    const top = col?.getBoundingClientRect().top ?? 0;
    return { day, min: ((y - top) / hour) * 60 };
  }

  function update(d: Drag) {
    dragRef.current = d;
    setDrag(d);
  }

  /** Empieza a seguir el puntero. En táctil, mover un evento pide mantener pulsado un momento (si no, se hace scroll). */
  function follow(e: ReactPointerEvent, initial: Drag, needsHold: boolean) {
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType === 'touch';
    moved.current = false;
    let active = !needsHold || !touch;
    let holdTimer = 0;
    if (!active) holdTimer = window.setTimeout(() => { active = true; moved.current = true; sfx.grab(); navigator.vibrate?.(15); update(initial); }, 320);
    const blockScroll = (ev: TouchEvent) => { if (active && dragRef.current) ev.preventDefault(); };
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { clearTimeout(holdTimer); finish(); }
        return;
      }
      if (!moved.current && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved.current && initial.mode !== 'create') sfx.grab();
      moved.current = true;
      const sc = scroller.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (ev.clientY < r.top + 28) sc.scrollTop -= 10;
        else if (ev.clientY > r.bottom - 28) sc.scrollTop += 10;
      }
      const cur = dragRef.current ?? initial;
      const p = at(ev.clientX, ev.clientY, cur.day);
      if (cur.mode === 'move') {
        const len = cur.end - cur.start;
        const start = Math.max(0, Math.min(24 * 60 - len, snap(p.min - cur.grab)));
        update({ ...cur, day: p.day, start, end: start + len });
      } else if (cur.mode === 'resize') {
        update({ ...cur, end: Math.max(cur.start + SNAP, Math.min(24 * 60, snap(p.min - cur.grab))) });
      } else if (cur.mode === 'create') {
        const m = Math.max(0, Math.min(24 * 60, snap(p.min)));
        update({ ...cur, start: Math.min(cur.from, m), end: Math.max(cur.from + SNAP, m) });
      }
    };
    const finish = () => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('touchmove', blockScroll);
      dragRef.current = null;
      setDrag(null);
    };
    const onUp = () => {
      const d = dragRef.current;
      const wasMoved = moved.current;
      finish();
      if (!d || !wasMoved) return; // un toque: lo atiende onClick
      if (d.mode === 'create') { setDraft({ day: d.day, time: fromMin(d.start), end: fromMin(Math.min(d.end, LAST)) }); return; }
      const to = { day: d.day, time: fromMin(d.start), end: fromMin(Math.min(d.end, LAST)) };
      const span = eventSpan(d.ev)!;
      if (to.day === d.ev.day && d.start === span[0] && d.end === span[1]) return;
      sfx.drop();
      game.act((s) => moveEvent(s, d.ev, to, Date.now()));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  }

  function startBlock(e: ReactPointerEvent, ev: CalendarEvent, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const [a, b] = eventSpan(ev)!;
    const p = at(e.clientX, e.clientY, ev.day);
    // grab = dónde lo cogiste: respecto al inicio al mover, respecto al final al estirar
    follow(e, { mode, ev, grab: p.min - (mode === 'move' ? a : b), day: ev.day, start: a, end: b }, mode === 'move');
  }

  function startEmpty(e: ReactPointerEvent<HTMLDivElement>, day: string) {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    if (e.pointerType === 'touch') return; // en táctil, arrastrar en un hueco es hacer scroll; un toque lo atiende onClick
    const p = at(e.clientX, e.clientY, day);
    const from = Math.max(0, Math.min(24 * 60 - SNAP, Math.floor(p.min / SNAP) * SNAP));
    follow(e, { mode: 'create', day, from, start: from, end: from + SNAP }, false);
  }

  function clickEmpty(e: ReactMouseEvent<HTMLDivElement>, day: string) {
    if (e.target !== e.currentTarget || moved.current) return;
    const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor((at(e.clientX, e.clientY, day).min / 60) * 2) * 30));
    setDraft({ day, time: fromMin(mins) });
  }

  return (
    <div className={`tg ${single ? 'tg-day' : 'tg-week'}${days.length > 1 && days.length <= 4 ? ' tg-few' : ''}${drag ? ' dragging' : ''}`} style={{ '--hour': `${hour}px`, '--cols': days.length } as CSSProperties}>
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
        {days.map((d) => <AllDay key={d} state={state} day={d} onOpen={(e) => setOpen({ id: e.id, day: d })} />)}
      </div>

      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ height: 24 * hour }}>
          <div className="tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * hour }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>)}
          </div>
          {days.map((d) => (
            <div key={d} ref={(el) => { if (el) cols.current.set(d, el); else cols.current.delete(d); }}
              className={`tg-col${d === today ? ' today' : ''}`} onPointerDown={(e) => startEmpty(e, d)} onClick={(e) => clickEmpty(e, d)} aria-label={`Horas del ${shortDate(d)}`}>
              <DayBlocks state={state} game={game} day={d} hour={hour} now={now} drag={drag}
                onOpen={(e) => !moved.current && setOpen({ id: e.id, day: d })} onGrab={startBlock} onSession={setSession} />
              {drag?.mode === 'create' && drag.day === d && (
                <span className="tg-block tg-ghost" style={{ top: (drag.start / 60) * hour, height: ((drag.end - drag.start) / 60) * hour - 2 }}>
                  <b>Nuevo</b><span className="mono">{fromMin(drag.start)} – {fromMin(Math.min(drag.end, LAST))}</span>
                </span>
              )}
              {d === today && <span className="tg-now" style={{ top: (minutesNow(now) / 60) * hour }} aria-label="Ahora" />}
            </div>
          ))}
        </div>
      </div>

      {draft && (
        <Sheet label="Añadir al calendario" onClose={() => setDraft(null)}>
          <p className="eyebrow">Nuevo · {shortDate(draft.day)}{draft.time ? ` · ${draft.time}${draft.end ? ` – ${draft.end}` : ''}` : ''}</p>
          <AgendaForm key={`${draft.day}${draft.time}${draft.end}`} game={game} day={draft.day} time={draft.time} end={draft.end} onDone={() => setDraft(null)} compact />
        </Sheet>
      )}
      {open && <EventSheet key={open.id} game={game} id={open.id} day={open.day} onClose={() => setOpen(null)} startFocus={startFocus} />}
      {session && (
        <Sheet label="Corregir sesión de Deep Work" onClose={() => setSession(null)}>
          <p className="eyebrow"><Icon name="zap" /> Deep Work · {state.sessions.find((x) => x.id === session)?.label}</p>
          <SessionEdit game={game} id={session} onDone={() => setSession(null)} />
        </Sheet>
      )}
    </div>
  );
}

/** Fila de «todo el día»: solo eventos sin hora (misiones y recordatorios van en su panel, debajo del calendario). */
function AllDay({ state, day, onOpen }: { state: GameState; day: string; onOpen: (e: CalendarEvent) => void }) {
  const evs = eventsOn(state, day).filter((e) => !e.time);
  return (
    <div className="tg-cell">
      {evs.map((e) => <button key={e.id} className={`tg-chip ev-${e.kind}`} style={evStyle(e)} onClick={() => onOpen(e)}><Icon name={eventIcon(e.kind)} /> {e.title}</button>)}
    </div>
  );
}

function DayBlocks({ state, day, hour, now, drag, onOpen, onGrab, onSession }: {
  state: GameState; game: Game; day: string; hour: number; now: number; drag: Drag | null;
  onOpen: (e: CalendarEvent) => void; onGrab: (e: ReactPointerEvent, ev: CalendarEvent, mode: 'move' | 'resize') => void;
  onSession?: (id: string) => void;
}) {
  const dragged = drag && drag.mode !== 'create' ? drag : null;
  // el evento que se arrastra sale donde va a quedar, aunque sea otro día
  const evs = eventsOn(state, day).filter((e) => e.time && !(dragged && dragged.ev.id === e.id && dragged.ev.day === day));
  if (dragged && dragged.day === day) evs.push({ ...dragged.ev, day, time: fromMin(dragged.start), end: fromMin(Math.min(dragged.end, 24 * 60 - 1)) });
  const spans = evs.map((e) => (dragged && e.id === dragged.ev.id && e.day === dragged.day ? [dragged.start, dragged.end] as [number, number] : eventSpan(e)!));
  const lanes = layoutLanes(spans);
  const sessions = state.sessions.filter((x) => dayKey(x.startedAt) === day);
  const top = (m: number) => (m / 60) * hour;
  const past = (end: number) => day < dayKey(now) || (day === dayKey(now) && end <= minutesNow(now));
  return (
    <>
      {sessions.map((x) => {
        const d = new Date(x.startedAt);
        const a = d.getHours() * 60 + d.getMinutes();
        const b = Math.min(1440, a + Math.max(15, Math.round((x.endedAt - x.startedAt) / 60_000)));
        return (
          <button key={x.id} type="button" className="tg-block tg-session" style={{ top: top(a), height: top(b - a) }} title={`Deep Work: ${x.label} · ${x.minutes} min`}
            onClick={() => onSession?.(x.id)} aria-label={`Deep Work: ${x.label}, ${x.minutes} min. Corregir`}>
            <Icon name="zap" /> {x.label} <span className="mono">{x.minutes} min</span>
          </button>
        );
      })}
      {evs.map((e, i) => {
        const [a, b] = spans[i];
        const { lane, lanes: n } = lanes[i];
        const isDragged = !!dragged && e.id === dragged.ev.id && e.day === dragged.day;
        return (
          <div
            key={e.id} role="button" tabIndex={0}
            className={`tg-block ev-${e.kind}${isKeyEvent(e) ? ' key' : ''}${past(b) && !isDragged ? ' past' : ''}${b - a <= 30 ? ' short' : ''}${isDragged ? ' lifted' : ''}`}
            style={{ ...evStyle(e), top: top(a), height: Math.max(16, top(b - a) - 2), left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
            onPointerDown={(ev) => onGrab(ev, e, 'move')}
            onClick={() => onOpen(e)} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onOpen(e))}
            aria-label={`${e.title}, ${timeRange({ time: fromMin(a), end: fromMin(Math.min(b, LAST)) })}`}
          >
            <b>{e.kind !== 'bloque' && <><Icon name={eventIcon(e.kind)} /> </>}{e.title}{e.tasks?.length ? <span className="tg-tasks mono"> {blockItems(state, e, e.day).filter((x) => x.done).length}/{blockItems(state, e, e.day).length}</span> : null}</b>
            <span className="mono">{fromMin(a)} – {fromMin(Math.min(b, LAST))}{isDragged ? ` · ${durationWords(b - a)}` : ''}{!isDragged && e.repeat && <> <Icon name="repeat" /></>}</span>
            <span className="tg-resize" onPointerDown={(ev) => onGrab(ev, e, 'resize')} onClick={(ev) => ev.stopPropagation()} aria-hidden="true" />
          </div>
        );
      })}
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
      sfx.bell();
      for (const a of fresh) {
        toast(a.text, 'level', 9000);
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Excelsior', { body: plain(a.text), tag: a.key });
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
