// Tu vida real en pantalla: medidas (Personaje), cierre del día y próximos eventos (Hoy), eventos del calendario.
import { useState, type FormEvent } from 'react';
import type { Game } from './screens';
import type { EventKind, GameState, Metric } from './types';
import { dayKey, daysUntil } from './game';
import { formatAttrXp } from './attributes';
import {
  addEvent, addMetric, dailyReport, dayLog, deleteEvent, deleteMetric, EVENT_KINDS, eventIcon, eventsOn, logMetric, METRIC_PRESETS,
  metricHistory, saveDayLog, upcomingEvents,
} from './life';
import { saveFile } from './download';
import { shortDate } from './ui';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const validNum = (v: string) => { const n = num(v); return n !== null && !Number.isNaN(n); };

/** «hoy», «mañana», «en 3 días» o la fecha. */
export function relDay(day: string, now: number): string {
  const d = daysUntil(day, now)!;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d > 1 && d < 7) return `en ${d} días`;
  return shortDate(day);
}

// ---------- Medidas ----------

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120, h = 32;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--c1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricRow({ game, metric }: { game: Game; metric: Metric }) {
  const { state, act } = game;
  const hist = metricHistory(state, metric.id);
  const last = hist.at(-1);
  const first = hist[0];
  const [value, setValue] = useState('');
  const delta = last && first && hist.length > 1 ? last.value - first.value : null;
  const linked = state.goals.filter((g) => g.metricId === metric.id);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validNum(value)) return;
    act((s) => logMetric(s, metric.id, num(value)!, Date.now()));
    setValue('');
  }
  return (
    <li className="item metric">
      <div className="item-body">
        <span className="item-title">{metric.name}</span>
        <span className="metric-value mono">{last ? `${formatAttrXp(last.value)} ${metric.unit}` : '—'}</span>
        <span className="muted small-text">
          {last ? `Último: ${shortDate(last.day)}` : 'Sin datos todavía'}
          {delta !== null && ` · ${delta >= 0 ? '+' : '−'}${formatAttrXp(Math.abs(delta))} ${metric.unit} desde ${shortDate(first.day)}`}
          {linked.length > 0 && ` · mueve: ${linked.map((g) => g.name).join(', ')}`}
        </span>
      </div>
      <Sparkline values={hist.slice(-30).map((e) => e.value)} />
      <form className="item-actions metric-log" onSubmit={submit}>
        <input type="text" inputMode="decimal" className="goal-input" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={last ? formatAttrXp(last.value) : 'Hoy'} aria-label={`Valor de hoy de ${metric.name}`} />
        <button type="submit" className="ghost small" disabled={!validNum(value)}>Apuntar</button>
        <button type="button" className="icon-btn" onClick={() => act((s) => deleteMetric(s, metric.id))} aria-label={`Borrar ${metric.name}`}>×</button>
      </form>
    </li>
  );
}

export function MetricsPanel({ game }: { game: Game }) {
  const { state, act } = game;
  const metrics = state.metrics ?? [];
  const [form, setForm] = useState({ name: '', unit: '' });
  const presets = METRIC_PRESETS.filter((p) => !metrics.some((m) => m.name.toLowerCase() === p.name.toLowerCase()));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    act((s) => addMetric(s, form.name, form.unit, Date.now()));
    setForm({ name: '', unit: '' });
  }
  return (
    <section className="panel" aria-labelledby="metrics-h">
      <header className="panel-head"><h3 id="metrics-h">Tu estado actual</h3><span className="count mono">{metrics.length}</span></header>
      <p className="hint">Lo que mides de tu vida real. Apunta el valor cuando cambie: queda la evolución y las metas que siguen esa medida se mueven solas.</p>
      {metrics.length > 0 && <ul className="list">{metrics.map((m) => <MetricRow key={m.id} game={game} metric={m} />)}</ul>}
      <div className="row metric-presets">
        {presets.map((p) => (
          <button key={p.name} className="secondary small" onClick={() => act((s) => addMetric(s, p.name, p.unit, Date.now()))}>+ {p.name} ({p.unit})</button>
        ))}
      </div>
      <form className="metric-form" onSubmit={submit}>
        <input id="metric-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Otra medida (ej. Ahorro, Pasos)" maxLength={30} aria-label="Nombre de la medida" />
        <input id="metric-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unidad" maxLength={10} aria-label="Unidad de la medida" />
        <button type="submit" className="primary" disabled={!form.name.trim()}>Añadir</button>
      </form>
    </section>
  );
}

// ---------- Cierre del día ----------

function Scale({ label, value, onChange, icons }: { label: string; value?: number; onChange: (n: number) => void; icons: string[] }) {
  return (
    <div className="scale">
      <span className="scale-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {icons.map((ic, i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i + 1} aria-label={`${label} ${i + 1} de 5`}
            className={value === i + 1 ? 'seg on' : 'seg'} onClick={() => onChange(i + 1)}>{ic}</button>
        ))}
      </div>
    </div>
  );
}

const ENERGY = ['🪫', '😮‍💨', '🙂', '⚡', '🔥'];
const MOOD = ['😞', '😕', '😐', '😊', '😄'];

function DayCloseForm({ game, now }: { game: Game; now: number }) {
  const { state, act, toast } = game;
  const today = dayKey(now);
  const saved = dayLog(state, today);
  const [energy, setEnergy] = useState(saved?.energy);
  const [mood, setMood] = useState(saved?.mood);
  const [sleep, setSleep] = useState(saved?.sleep !== undefined ? formatAttrXp(saved.sleep) : '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const metrics = state.metrics ?? [];
  const todayValue = (id: string) => (state.metricEntries ?? []).find((e) => e.metricId === id && e.day === today)?.value;

  function save(): GameState {
    let next = saveDayLog(state, {
      energy, mood, note: note.trim() || undefined,
      sleep: validNum(sleep) ? Math.min(24, Math.max(0, num(sleep)!)) : undefined,
    }, Date.now());
    for (const [id, v] of Object.entries(values)) if (validNum(v)) next = logMetric(next, id, num(v)!, Date.now());
    return next;
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    act(() => save());
    setValues({});
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
    if (r === 'ok') toast('Informe descargado', 'info');
    if (r === 'error') toast('No se pudo descargar aquí', 'info');
  }

  return (
    <form className="day-close" onSubmit={submit}>
      <div className="scales">
        <Scale label="Energía" value={energy} onChange={setEnergy} icons={ENERGY} />
        <Scale label="Ánimo" value={mood} onChange={setMood} icons={MOOD} />
        <label className="scale">
          <span className="scale-label">Sueño (h)</span>
          <input id="day-sleep" type="text" inputMode="decimal" className="goal-input" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7,5" />
        </label>
      </div>
      {metrics.length > 0 && (
        <div className="day-metrics">
          {metrics.map((m) => (
            <label key={m.id} className="scale">
              <span className="scale-label">{m.name} ({m.unit})</span>
              <input type="text" inputMode="decimal" className="goal-input" value={values[m.id] ?? ''} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                placeholder={todayValue(m.id) !== undefined ? formatAttrXp(todayValue(m.id)!) : 'sin cambio'} aria-label={`${m.name} hoy`} />
            </label>
          ))}
        </div>
      )}
      <textarea id="day-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1200}
        placeholder="¿Qué ha ido bien? ¿Qué te ha frenado? ¿Qué harás distinto mañana?" aria-label="Nota del día" />
      <div className="row">
        <button type="submit" className="primary">{saved ? 'Actualizar el día' : 'Guardar el día'}</button>
        <button type="button" className="secondary" onClick={copy}>Copiar informe para la IA</button>
        <button type="button" className="ghost" onClick={download}>Descargar .md</button>
      </div>
      {saved && <p className="muted small-text">✓ Guardado a las {new Date(saved.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>}
    </form>
  );
}

export function DayClose({ game, now }: { game: Game; now: number }) {
  const today = dayKey(now);
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
  const list = upcomingEvents(state, now, 7);
  if (list.length === 0) return null;
  return (
    <section className="panel quiet upcoming" aria-labelledby="upcoming-h">
      <header className="panel-head"><h3 id="upcoming-h">Próximos eventos</h3><span className="count mono">{list.length}</span></header>
      <ul className="ev-strip">
        {list.slice(0, 6).map((e) => (
          <li key={e.id} className={`ev-chip ev-${e.kind}${e.day === dayKey(now) ? ' today' : ''}`}>
            <span aria-hidden="true">{eventIcon(e.kind)}</span> <strong>{e.title}</strong>
            <span className="muted"> · {relDay(e.day, now)}{e.time ? ` ${e.time}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DayEvents({ game, day }: { game: Game; day: string }) {
  const { state, act } = game;
  const list = eventsOn(state, day);
  const [form, setForm] = useState<{ title: string; kind: EventKind; time: string }>({ title: '', kind: 'examen', time: '' });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    act((s) => addEvent(s, { title: form.title, day, kind: form.kind, time: form.time || undefined }, Date.now()));
    setForm({ ...form, title: '', time: '' });
  }
  return (
    <div className="day-events">
      {list.length > 0 && (
        <ul className="list">
          {list.map((e) => (
            <li key={e.id} className={`item ev-item ev-${e.kind}`}>
              <span className="ev-icon" aria-hidden="true">{eventIcon(e.kind)}</span>
              <div className="item-body">
                <span className="item-title">{e.title}</span>
                <span className="muted small-text">{EVENT_KINDS.find((k) => k.id === e.kind)?.name}{e.time ? ` · ${e.time}` : ''}</span>
              </div>
              <button className="icon-btn" onClick={() => act((s) => deleteEvent(s, e.id))} aria-label={`Borrar evento ${e.title}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <form className="ev-form" onSubmit={submit}>
        <select className="freq-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EventKind })} aria-label="Tipo de evento">
          {EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.name}</option>)}
        </select>
        <input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Evento (ej. Examen de cálculo)" maxLength={60} aria-label="Nombre del evento" />
        <input id="ev-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-label="Hora (opcional)" />
        <button type="submit" className="secondary" disabled={!form.title.trim()}>+ Evento</button>
      </form>
    </div>
  );
}
