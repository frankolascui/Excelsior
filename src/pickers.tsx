// Selectores propios de fecha, hora y duración (en lugar de los del navegador): un botón que dice lo elegido
// en palabras («Mañana», «16:00») y un desplegable con atajos, un mes en miniatura o la lista de horas.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dayKey } from './game';
import { fromMin, toMin } from './life';
import { Icon } from './icons';
import type { Impact } from './types';
import { IMPACTS } from './priorities';

const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

/** «Hoy», «Mañana», «Ayer» o «vie 16 oct». */
export function dayWords(day: string, today = dayKey(Date.now())): string {
  if (day === today) return 'Hoy';
  if (day === addDays(today, 1)) return 'Mañana';
  if (day === addDays(today, -1)) return 'Ayer';
  const d = new Date(`${day}T12:00:00`);
  const txt = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  return d.getFullYear() === new Date(`${today}T12:00:00`).getFullYear() ? txt : `${txt} ${d.getFullYear()}`;
}

/** «45 min», «1 h», «1 h 30». */
export function durationWords(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Desplegable anclado a su botón; se coloca debajo (o encima si no cabe) y se cierra al pulsar fuera o con Escape. */
function Popover({ anchor, onClose, children, className = '' }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !panel.current) return;
      const r = anchor.getBoundingClientRect();
      const w = panel.current.offsetWidth, h = panel.current.offsetHeight;
      const roomBelow = window.innerHeight - 8 - (r.bottom + 6), roomAbove = r.top - 6 - 8;
      const below = h <= roomBelow || roomBelow >= roomAbove;
      const top = below ? r.bottom + 6 : r.top - 6 - h;
      // si no cabe entero ni arriba ni abajo, se queda dentro de la pantalla (tapando un poco el botón)
      setPos({ top: Math.max(8, Math.min(top, window.innerHeight - h - 8)), left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor?.contains(t)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); anchor?.focus(); }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor]);
  return createPortal(
    <div ref={panel} className={`pop ${className}`} role="dialog" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
      {children}
    </div>,
    document.body,
  );
}

/** Un botón que abre su desplegable. */
function usePop() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const toggle = () => setOpen(!open);
  return { open, setOpen, btn, toggle };
}

/**
 * Elegir un día: atajos (hoy, mañana, el sábado, el lunes que viene), un mes en miniatura y «Quitar fecha».
 * El botón muestra la fecha en palabras; `children` sustituye su contenido.
 */
export function DatePicker({ value, onChange, clearLabel, placeholder = 'Fecha', label, className = '', children, id }: {
  value: string | null; onChange: (day: string | null) => void; clearLabel?: string; placeholder?: string; label: string;
  className?: string; children?: ReactNode; id?: string;
}) {
  const today = dayKey(Date.now());
  const { open, setOpen, btn, toggle } = usePop();
  const base = value ?? today;
  const [month, setMonth] = useState(() => base.slice(0, 7));
  useEffect(() => { if (open) setMonth((value ?? today).slice(0, 7)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (d: string | null) => { onChange(d); setOpen(false); btn.current?.focus(); };
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const cells = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => dayKey(new Date(y, m - 1, 1 - offset + i, 12).getTime()));
  const wd = (new Date(`${today}T12:00:00`).getDay() + 6) % 7; // lunes = 0
  const shortcuts: [string, string][] = [
    ['Hoy', today],
    ['Mañana', addDays(today, 1)],
    [wd < 5 ? 'Este sábado' : 'El lunes', addDays(today, wd < 5 ? 5 - wd : 7 - wd)],
    ['En una semana', addDays(today, 7)],
  ];
  const monthName = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1, 12); setMonth(dayKey(d.getTime()).slice(0, 7)); };
  return (
    <>
      <button type="button" ref={btn} id={id} className={`pick-btn${value ? ' set' : ''} ${className}`} onClick={toggle} aria-label={`${label}: ${value ? dayWords(value, today) : 'sin fecha'}`} aria-expanded={open}>
        {children ?? <><Icon name="calendar" /> {value ? dayWords(value, today) : placeholder}</>}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} className="pop-date">
          <div className="pop-quick">
            {shortcuts.map(([t, d]) => (
              <button type="button" key={t} className={`pop-chip${value === d ? ' on' : ''}`} onClick={() => pick(d)}>
                {t}<small>{new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</small>
              </button>
            ))}
          </div>
          <div className="pop-month">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior"><Icon name="chevron-left" /></button>
            <b>{monthName[0].toUpperCase() + monthName.slice(1)}</b>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente"><Icon name="chevron-right" /></button>
          </div>
          <div className="pop-grid" role="grid">
            {WD.map((w) => <span key={w} className="pop-wd">{w}</span>)}
            {days.map((d) => (
              <button type="button" key={d} role="gridcell" aria-label={d} aria-selected={d === value}
                className={['pop-day', d.slice(0, 7) !== month && 'out', d === today && 'today', d === value && 'on', d < today && 'past'].filter(Boolean).join(' ')}
                onClick={() => pick(d)}>{Number(d.slice(8))}</button>
            ))}
          </div>
          {clearLabel && value && <button type="button" className="link pop-clear" onClick={() => pick(null)}>{clearLabel}</button>}
        </Popover>
      )}
    </>
  );
}

/**
 * Elegir una hora de una lista cada 15 minutos (como en Google Calendar). Con `from` es la hora de fin: solo salen
 * las horas posteriores, con lo que dura («17:30 · 1 h 30»).
 */
export function TimePicker({ value, onChange, from, clearLabel, placeholder = 'Hora', label, id }: {
  value: string | null; onChange: (t: string | null) => void; from?: string; clearLabel?: string; placeholder?: string; label: string; id?: string;
}) {
  const { open, setOpen, btn, toggle } = usePop();
  const list = useRef<HTMLDivElement>(null);
  const start = from ? toMin(from) + 15 : 0;
  const end = from ? Math.min(24 * 60, toMin(from) + 12 * 60) : 24 * 60 - 15;
  const times: number[] = [];
  for (let t = start; t <= end; t += 15) times.push(Math.min(t, 23 * 60 + 59));
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const target = list.current.querySelector<HTMLElement>('.on') ?? list.current.querySelector<HTMLElement>(`[data-t="${fromMin(value ? toMin(value) : 9 * 60)}"]`);
    if (target) list.current.scrollTop = target.offsetTop - list.current.clientHeight / 2 + target.offsetHeight / 2;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (t: string | null) => { onChange(t); setOpen(false); btn.current?.focus(); };
  return (
    <>
      <button type="button" ref={btn} id={id} className={`pick-btn${value ? ' set' : ''}`} onClick={toggle} aria-label={`${label}: ${value ?? 'sin hora'}`} aria-expanded={open}>
        <Icon name="clock" /> {value ?? placeholder}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} className="pop-time">
          {clearLabel && <button type="button" className={`pop-t${value ? '' : ' on'}`} onClick={() => pick(null)}>{clearLabel}</button>}
          <div className="pop-tlist" ref={list} role="listbox" aria-label={label}>
            {times.map((t) => {
              const hm = fromMin(t);
              return (
                <button type="button" key={t} role="option" aria-selected={hm === value} data-t={hm} className={`pop-t${hm === value ? ' on' : ''}${t % 60 ? '' : ' hour'}`} onClick={() => pick(hm)}>
                  <span className="mono">{hm}</span>{from && <small>{durationWords(t - toMin(from))}</small>}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/** Atajos de duración: fijan la hora de fin a partir del inicio. */
export function DurationChips({ start, end, onChange }: { start: string; end: string | null; onChange: (end: string) => void }) {
  const a = toMin(start);
  const cur = end ? toMin(end) - a : 60;
  return (
    <div className="dur-chips" role="radiogroup" aria-label="Duración">
      {DURATIONS.filter((d) => a + d <= 24 * 60).map((d) => (
        <button type="button" key={d} role="radio" aria-checked={cur === d} className={`pop-chip small${cur === d ? ' on' : ''}`}
          onClick={() => onChange(fromMin(Math.min(a + d, 23 * 60 + 59)))}>{durationWords(d)}</button>
      ))}
    </div>
  );
}

const REPEAT_PRESETS: [string, number[]][] = [['Cada día', [0, 1, 2, 3, 4, 5, 6]], ['Lunes a viernes', [1, 2, 3, 4, 5]], ['Fines de semana', [0, 6]]];
const REPEAT_DAYS: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

/**
 * Elegir los días en que se repite una misión: atajos (cada día, lunes a viernes, fines de semana) o días sueltos.
 * `value` null = no se repite. `children` sustituye el contenido del botón.
 */
export function RepeatPicker({ value, onChange, label, className = '', children, id, describe }: {
  value: number[] | null; onChange: (days: number[] | null) => void; label: string; className?: string; children?: ReactNode; id?: string;
  describe: (days: number[]) => string;
}) {
  const { open, setOpen, btn, toggle } = usePop();
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d));
  const set = (days: number[] | null, close: boolean) => {
    onChange(days && days.length ? days : null);
    if (close) { setOpen(false); btn.current?.focus(); }
  };
  const flip = (d: number) => {
    const cur = value ?? [];
    set(cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d], false);
  };
  return (
    <>
      <button type="button" ref={btn} id={id} className={`pick-btn${value ? ' set' : ''} ${className}`} onClick={toggle} aria-label={`${label}: ${value ? describe(value) : 'no se repite'}`} aria-expanded={open}>
        {children ?? <><Icon name="repeat" /> {value ? describe(value) : 'Repetir'}</>}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} className="pop-repeat">
          <div className="pop-quick one">
            <button type="button" className={`pop-chip${!value ? ' on' : ''}`} onClick={() => set(null, true)}>No se repite</button>
            {REPEAT_PRESETS.map(([t, days]) => (
              <button type="button" key={t} className={`pop-chip${value && same(value, days) ? ' on' : ''}`} onClick={() => set(days, true)}>{t}</button>
            ))}
          </div>
          <p className="pop-note">O elige los días:</p>
          <div className="pop-weekdays" role="group" aria-label="Días de la semana">
            {REPEAT_DAYS.map(([d, t]) => (
              <button type="button" key={d} aria-pressed={!!value?.includes(d)} className={`pop-day${value?.includes(d) ? ' on' : ''}`} onClick={() => flip(d)}>{t}</button>
            ))}
          </div>
          <p className="pop-note">Al completarla, la siguiente aparece sola el próximo día que toque.</p>
        </Popover>
      )}
    </>
  );
}

/** Elegir el impacto de una misión: alto, medio o bajo (decide el orden y el XP). */
export function ImpactPicker({ value, onChange, label, className = '', children, id }: {
  value: Impact; onChange: (v: Impact) => void; label: string; className?: string; children?: ReactNode; id?: string;
}) {
  const { open, setOpen, btn, toggle } = usePop();
  const set = (v: Impact) => { onChange(v); setOpen(false); btn.current?.focus(); };
  const cur = IMPACTS.find((x) => x.id === value)!;
  return (
    <>
      <button type="button" ref={btn} id={id} className={`pick-btn set ${className}`} onClick={toggle} aria-label={`${label}: impacto ${cur.name.toLowerCase()}`} aria-expanded={open}>
        {children ?? <><Icon name="target" /> Impacto {cur.name.toLowerCase()}</>}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} className="pop-impact">
          <p className="pop-note">¿Cuánto te acerca a lo que de verdad quieres?</p>
          <div className="pop-impacts">
            {IMPACTS.map((x) => (
              <button type="button" key={x.id} className={`pop-impact-opt imp-${x.id}${value === x.id ? ' on' : ''}`} onClick={() => set(x.id)}>
                <b>{x.name} <span className="mono">+{x.xp} XP</span></b><span>{x.hint}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

export interface SelectOption<T extends string | number> { value: T; label: ReactNode; text?: string; group?: string; hint?: string }

/**
 * Desplegable propio en lugar del <select> del navegador: un botón con lo elegido y una lista con grupos.
 * Teclado: flechas para moverse, Enter para elegir, Escape para cerrar.
 */
export function Select<T extends string | number>({ value, onChange, options, label, id, className = '', placeholder, icon }: {
  value: T; onChange: (v: T) => void; options: SelectOption<T>[]; label: string; id?: string; className?: string; placeholder?: string;
  icon?: Parameters<typeof Icon>[0]['name'];
}) {
  const { open, setOpen, btn, toggle } = usePop();
  const list = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const el = list.current.querySelector<HTMLElement>('.on') ?? list.current.querySelector<HTMLElement>('button');
    el?.focus({ preventScroll: true });
    if (el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.offsetHeight / 2;
  }, [open]);
  const pick = (v: T) => { if (v !== value) onChange(v); setOpen(false); btn.current?.focus(); };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>('button[role=option]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items[n]?.focus();
  };
  // Con el botón cerrado, las flechas abren la lista (como un select).
  const onBtnKey = (e: ReactKeyboardEvent) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); setOpen(true); } };
  let lastGroup: string | undefined;
  return (
    <>
      <button type="button" ref={btn} id={id} className={`pick-btn select-btn${cur && cur.value !== '' ? ' set' : ''} ${className}`} onClick={toggle} onKeyDown={onBtnKey}
        aria-label={`${label}: ${cur ? (cur.text ?? (typeof cur.label === 'string' ? cur.label : String(cur.value))) : placeholder ?? ''}`} aria-haspopup="listbox" aria-expanded={open} data-value={String(value)}>
        {icon && <Icon name={icon} />}<span className="select-text">{cur ? cur.label : placeholder ?? '—'}</span><Icon name="chevron-down" className="select-chev" />
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} className="pop-select">
          <div className="pop-tlist" ref={list} role="listbox" aria-label={label} onKeyDown={onKey}>
            {options.map((o) => {
              const head = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <Fragment key={String(o.value)}>
                  {head && <p className="pop-group">{head}</p>}
                  <button type="button" role="option" aria-selected={o.value === value} data-value={String(o.value)} className={`pop-t pop-opt${o.value === value ? ' on' : ''}`} onClick={() => pick(o.value)}>
                    <span>{o.label}{o.hint && <small> {o.hint}</small>}</span>{o.value === value && <Icon name="check" />}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}

const TIME_RE = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
/** «2310», «23:10» o «7:05» → «23:10» / «07:05»; si no es una hora, null. */
export function parseTime(text: string): string | null {
  const m = TIME_RE.exec(text.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/**
 * Hora exacta (al minuto) sin el control del navegador: se escribe («2310» vale) o se elige en dos columnas,
 * horas y minutos. `onChange` recibe «HH:MM» o '' si se borra.
 */
export function TimeField({ value, onChange, id, label, placeholder = '--:--', clearable = true, near }: {
  value: string; onChange: (v: string) => void; id?: string; label: string; placeholder?: string; clearable?: boolean;
  /** Hora a la que se abre la lista si aún no hay ninguna (p. ej. la de acostarte). */
  near?: string;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
  const { open, setOpen, btn, toggle } = usePop();
  const cols = useRef<HTMLDivElement>(null);
  const [hh, mm] = value ? value.split(':') : ['', ''];
  useLayoutEffect(() => {
    if (!open || !cols.current) return;
    cols.current.querySelectorAll<HTMLElement>('.pop-tcol').forEach((c) => {
      const on = c.querySelector<HTMLElement>('.on') ?? (near ? c.querySelector<HTMLElement>(`[data-v="${c.getAttribute('aria-label') === 'Hora' ? near.slice(0, 2) : '00'}"]`) : null);
      if (on) c.scrollTop = on.offsetTop - c.clientHeight / 2 + on.offsetHeight / 2;
    });
  }, [open]);
  const typed = (t: string) => {
    const clean = t.replace(/[^\d:]/g, '').slice(0, 5);
    setDraft(clean);
    if (!clean) { if (clearable) onChange(''); return; }
    const p = parseTime(clean);
    if (p && (clean.includes(':') || clean.length === 4)) onChange(p);
  };
  const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  if (mm && !mins.includes(mm)) mins.push(mm), mins.sort();
  return (
    <span ref={wrap} className={`time-field${value ? ' set' : ''}`}>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" value={draft} placeholder={placeholder} aria-label={label} maxLength={5}
        onChange={(e) => typed(e.target.value)} onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); const p = parseTime(draft); setDraft(p ?? value); if (p && p !== value) onChange(p); }} />
      <button type="button" ref={btn} className="time-field-btn" onClick={toggle} aria-label={`Elegir ${label.toLowerCase()}`} aria-expanded={open}><Icon name="clock" /></button>
      {open && (
        <Popover anchor={wrap.current} onClose={() => setOpen(false)} className="pop-clock">
          <div className="pop-tcols" ref={cols}>
            <div className="pop-tcol" role="listbox" aria-label="Hora">
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                <button type="button" key={h} data-v={h} role="option" aria-selected={h === hh} className={`pop-t${h === hh ? ' on' : ''}`} onClick={() => onChange(`${h}:${mm || '00'}`)}><span className="mono">{h}</span></button>
              ))}
            </div>
            <div className="pop-tcol" role="listbox" aria-label="Minutos">
              {mins.map((m) => (
                <button type="button" key={m} data-v={m} role="option" aria-selected={m === mm} className={`pop-t${m === mm ? ' on' : ''}`} onClick={() => { onChange(`${hh || '00'}:${m}`); setOpen(false); }}><span className="mono">:{m}</span></button>
              ))}
            </div>
          </div>
          {clearable && value && <button type="button" className="link pop-clear" onClick={() => { onChange(''); setOpen(false); }}>Borrar</button>}
        </Popover>
      )}
    </span>
  );
}
