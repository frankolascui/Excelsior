// Tu vida real dentro de Excelsior: medidas (dinero, peso…), cierre del día y eventos del calendario.
// Funciones puras sobre GameState, como el resto de reglas.
import type { CalendarEvent, DayLog, EventKind, EventRepeat, GameState, Metric, Reminder } from './types';
import { dayKey, deepWorkMinutesOnDay, isHabitDone, levelInfo, totalXp, uid, xpOnDay } from './game';
import { formatAttrXp } from './attributes';

// ---------- Medidas ----------

export const METRIC_PRESETS: { name: string; unit: string }[] = [
  { name: 'Dinero', unit: '€' },
  { name: 'Peso', unit: 'kg' },
];

export function addMetric(s: GameState, name: string, unit: string, now: number): GameState {
  const metric: Metric = { id: uid(), name: name.trim(), unit: unit.trim(), createdAt: now };
  return { ...s, metrics: [...(s.metrics ?? []), metric] };
}

export function deleteMetric(s: GameState, id: string): GameState {
  return {
    ...s,
    metrics: (s.metrics ?? []).filter((m) => m.id !== id),
    metricEntries: (s.metricEntries ?? []).filter((e) => e.metricId !== id),
    goals: s.goals.map((g) => (g.metricId === id ? { ...g, metricId: undefined } : g)),
  };
}

/** Apunta el valor de hoy (sustituye el de hoy si ya había) y mueve los objetivos que siguen esta medida. */
export function logMetric(s: GameState, id: string, value: number, now: number): GameState {
  const day = dayKey(now);
  const entries = (s.metricEntries ?? []).filter((e) => !(e.metricId === id && e.day === day));
  return {
    ...s,
    metricEntries: [...entries, { id: uid(), metricId: id, day, value, at: now }],
    goals: s.goals.map((g) => (g.metricId === id ? { ...g, current: value } : g)),
  };
}

export function metricHistory(s: GameState, id: string) {
  return (s.metricEntries ?? []).filter((e) => e.metricId === id).sort((a, b) => a.day.localeCompare(b.day));
}

export function latestMetric(s: GameState, id: string): number | null {
  return metricHistory(s, id).at(-1)?.value ?? null;
}

// ---------- Cierre del día ----------

export function dayLog(s: GameState, day: string): DayLog | undefined {
  return (s.dayLogs ?? []).find((l) => l.day === day);
}

export function saveDayLog(s: GameState, patch: Omit<DayLog, 'day' | 'at'>, now: number): GameState {
  const day = dayKey(now);
  const prev = dayLog(s, day);
  const next: DayLog = { ...prev, ...patch, day, at: now };
  return { ...s, dayLogs: [...(s.dayLogs ?? []).filter((l) => l.day !== day), next] };
}

// ---------- Eventos ----------

export const EVENT_KINDS: { id: EventKind; name: string; icon: string }[] = [
  { id: 'bloque', name: 'Bloque de tiempo', icon: '🕒' },
  { id: 'examen', name: 'Examen', icon: '📝' },
  { id: 'lanzamiento', name: 'Lanzamiento', icon: '🚀' },
  { id: 'llamada', name: 'Llamada', icon: '📞' },
  { id: 'reunion', name: 'Reunión', icon: '🤝' },
  { id: 'otro', name: 'Otro', icon: '📌' },
];

export const eventIcon = (k: EventKind) => EVENT_KINDS.find((x) => x.id === k)?.icon ?? '📌';

/** Colores para los eventos, como los de Google Calendar. */
export const EVENT_COLORS: { id: string; name: string; hex: string }[] = [
  { id: 'tomate', name: 'Tomate', hex: '#e5484d' },
  { id: 'flamenco', name: 'Flamenco', hex: '#e93d82' },
  { id: 'mandarina', name: 'Mandarina', hex: '#f76b15' },
  { id: 'platano', name: 'Plátano', hex: '#f5c542' },
  { id: 'albahaca', name: 'Albahaca', hex: '#30a46c' },
  { id: 'salvia', name: 'Salvia', hex: '#5bc8a0' },
  { id: 'pavo', name: 'Pavo real', hex: '#0090ff' },
  { id: 'arandano', name: 'Arándano', hex: '#3e63dd' },
  { id: 'lavanda', name: 'Lavanda', hex: '#9b9ef0' },
  { id: 'uva', name: 'Uva', hex: '#8e4ec6' },
  { id: 'grafito', name: 'Grafito', hex: '#8b8d98' },
];

export const eventColor = (e: { color?: string }) => (e.color ? EVENT_COLORS.find((c) => c.id === e.color)?.hex : undefined);

type EventFields = { title: string; day: string; time?: string; end?: string; kind: EventKind; repeat?: EventRepeat; color?: string };

/** Evento limpio: sin campos vacíos, fin solo si va después del inicio. */
function cleanEvent(ev: CalendarEvent): CalendarEvent {
  const out: CalendarEvent = { id: ev.id, title: ev.title.trim(), day: ev.day, kind: ev.kind, createdAt: ev.createdAt };
  if (ev.time) out.time = ev.time;
  if (ev.time && ev.end && ev.end > ev.time) out.end = ev.end;
  if (ev.repeat) out.repeat = ev.repeat;
  if (ev.repeat && ev.skip?.length) out.skip = ev.skip;
  if (ev.color) out.color = ev.color;
  return out;
}

export function addEvent(s: GameState, e: EventFields, now: number): GameState {
  return { ...s, events: [...(s.events ?? []), cleanEvent({ ...e, id: uid(), createdAt: now })] };
}

/** Cambia un evento (la serie entera si se repite). Un campo a `undefined` se quita. */
export function updateEvent(s: GameState, id: string, patch: Partial<EventFields>): GameState {
  return { ...s, events: (s.events ?? []).map((e) => (e.id === id ? cleanEvent({ ...e, ...patch }) : e)) };
}

/**
 * Mover o alargar un evento desde la vista por horas. Si se repite, solo cambia ese día:
 * se quita de la serie y queda como evento suelto en su nuevo sitio (como «Solo este evento» en Google).
 */
export function moveEvent(s: GameState, occ: CalendarEvent, to: { day: string; time: string; end: string }, now: number): GameState {
  if (!occ.repeat) return updateEvent(s, occ.id, to);
  const moved = skipEventDay(s, occ.id, occ.day);
  return addEvent(moved, { title: occ.title, kind: occ.kind, color: occ.color, ...to }, now);
}

/** Quita un solo día de un evento que se repite (el resto de la serie sigue). */
export function skipEventDay(s: GameState, id: string, day: string): GameState {
  return { ...s, events: (s.events ?? []).map((e) => (e.id === id ? { ...e, skip: [...(e.skip ?? []), day] } : e)) };
}

/** Si el evento cae ese día (contando las repeticiones). */
export function occursOn(e: CalendarEvent, day: string): boolean {
  if (day === e.day) return !e.skip?.includes(day);
  if (!e.repeat || day < e.day || e.skip?.includes(day)) return false;
  const wd = (d: string) => new Date(`${d}T12:00:00`).getDay();
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekdays') return wd(day) >= 1 && wd(day) <= 5;
  return wd(day) === wd(e.day);
}

export const REPEAT_NAMES: Record<EventRepeat, string> = { daily: 'Cada día', weekdays: 'De lunes a viernes', weekly: 'Cada semana' };

export function deleteEvent(s: GameState, id: string): GameState {
  return { ...s, events: (s.events ?? []).filter((e) => e.id !== id) };
}

/** Eventos de ese día (las repeticiones salen con `day` cambiado a ese día), por hora. */
export function eventsOn(s: GameState, day: string): CalendarEvent[] {
  return (s.events ?? []).filter((e) => occursOn(e, day)).map((e) => (e.day === day ? e : { ...e, day }))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
}

/**
 * Eventos señalados de hoy en adelante, dentro de `days` días. Los bloques de tiempo no salen (son el plan del día),
 * y de un evento que se repite solo sale la próxima vez.
 */
export function upcomingEvents(s: GameState, now: number, days: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= days; i++) {
    const day = dayKey(now + i * 86_400_000);
    for (const e of eventsOn(s, day)) if (e.kind !== 'bloque' && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
  }
  return out;
}

// ---------- Recordatorios ----------

export function addReminder(s: GameState, r: { title: string; day?: string; time?: string }, now: number): GameState {
  const rem: Reminder = { id: uid(), title: r.title.trim(), createdAt: now };
  if (r.day) rem.day = r.day;
  if (r.day && r.time) rem.time = r.time;
  return { ...s, reminders: [...(s.reminders ?? []), rem] };
}

export function toggleReminder(s: GameState, id: string, now: number): GameState {
  return { ...s, reminders: (s.reminders ?? []).map((r) => (r.id !== id ? r : r.doneAt ? (({ doneAt: _, ...rest }) => rest)(r) : { ...r, doneAt: now })) };
}

export function deleteReminder(s: GameState, id: string): GameState {
  return { ...s, reminders: (s.reminders ?? []).filter((r) => r.id !== id) };
}

const remOrder = (a: Reminder, b: Reminder) =>
  (a.day ?? '9999').localeCompare(b.day ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99') || a.createdAt - b.createdAt;

/** Lo que tienes que tener presente hoy: lo atrasado, lo de hoy y lo que no tiene fecha (más lo tachado hoy). */
export function todayReminders(s: GameState, now: number): Reminder[] {
  const today = dayKey(now);
  return (s.reminders ?? [])
    .filter((r) => (r.doneAt ? dayKey(r.doneAt) === today : !r.day || r.day <= today))
    .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || remOrder(a, b));
}

export function remindersOn(s: GameState, day: string): Reminder[] {
  return (s.reminders ?? []).filter((r) => r.day === day).sort(remOrder);
}

/** Recordatorios pendientes de días posteriores a hoy. */
export function laterReminders(s: GameState, now: number): Reminder[] {
  const today = dayKey(now);
  return (s.reminders ?? []).filter((r) => !r.doneAt && r.day && r.day > today).sort(remOrder);
}

/** Avisos que tocan ya: recordatorios con hora y eventos con hora de hoy cuya hora llegó en la última media hora. */
export function dueAlerts(s: GameState, now: number): { key: string; text: string }[] {
  const today = dayKey(now);
  const hm = (t: string) => new Date(`${today}T${t}:00`).getTime();
  const fresh = (t: string) => hm(t) <= now && now - hm(t) < 30 * 60_000;
  const out: { key: string; text: string }[] = [];
  for (const r of s.reminders ?? []) if (!r.doneAt && r.day === today && r.time && fresh(r.time)) out.push({ key: `r:${r.id}:${today}`, text: `🔔 ${r.title}` });
  for (const e of eventsOn(s, today)) if (e.time && fresh(e.time)) out.push({ key: `e:${e.id}:${today}`, text: `${eventIcon(e.kind)} ${e.time} · ${e.title}` });
  return out;
}

// ---------- Horas ----------

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Inicio y fin en minutos de un evento con hora (una hora si no tiene fin; nunca pasa de medianoche). */
export function eventSpan(e: { time?: string; end?: string }): [number, number] | null {
  if (!e.time) return null;
  const a = toMin(e.time);
  const b = e.end ? toMin(e.end) : a + 60;
  return [a, Math.min(24 * 60, Math.max(b, a + 15))];
}

/**
 * Carriles para lo que se pisa en la vista por horas: cada bloque recibe su carril y cuántos carriles tiene su grupo
 * (bloques que se solapan entre sí, directa o indirectamente).
 */
export function layoutLanes(spans: [number, number][]): { lane: number; lanes: number }[] {
  const order = spans.map((s, i) => ({ s, i })).sort((a, b) => a.s[0] - b.s[0] || b.s[1] - a.s[1]);
  const out: { lane: number; lanes: number }[] = spans.map(() => ({ lane: 0, lanes: 1 }));
  let group: number[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const close = () => { for (const i of group) out[i].lanes = laneEnds.length; group = []; laneEnds = []; };
  for (const { s, i } of order) {
    if (s[0] >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s[0]);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(s[1]); } else laneEnds[lane] = s[1];
    out[i].lane = lane;
    group.push(i);
    groupEnd = Math.max(groupEnd, s[1]);
  }
  close();
  return out;
}

// ---------- Informe del día (para pegarlo en una IA) ----------

const stars = (n: number | undefined) => (n ? `${n}/5` : '—');

export function dailyReport(s: GameState, now: number): string {
  const day = dayKey(now);
  const log = dayLog(s, day);
  const quests = s.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === day);
  const habits = s.habits.map((h) => `${isHabitDone(s, h.id, day) ? '[x]' : '[ ]'} ${h.name}`);
  const sessions = s.sessions.filter((x) => dayKey(x.endedAt) === day);
  const metrics = (s.metrics ?? []).map((m) => {
    const today = (s.metricEntries ?? []).find((e) => e.metricId === m.id && e.day === day);
    return today ? `- ${m.name}: ${formatAttrXp(today.value)} ${m.unit}` : null;
  }).filter(Boolean);
  const soon = upcomingEvents(s, now + 86_400_000, 6).map((e) => `- ${e.day}${e.time ? ` ${e.time}` : ''} · ${eventIcon(e.kind)} ${e.title}`);
  const due = s.quests.filter((q) => !q.completedAt && q.deadline && q.deadline <= dayKey(now + 7 * 86_400_000))
    .map((q) => `- ${q.deadline} · ${q.title}`);
  const lines = [
    `# ${day} · Excelsior`,
    '',
    '## Resumen',
    `- XP del día: ${xpOnDay(s, day)} (nivel ${levelInfo(totalXp(s)).level})`,
    `- Deep Work: ${deepWorkMinutesOnDay(s, day)} min${sessions.length ? ` (${sessions.map((x) => `${x.label}, ${x.minutes} min${x.focusPct !== undefined ? `, ${x.focusPct} % foco` : ''}`).join('; ')})` : ''}`,
    `- Misiones completadas: ${quests.length ? quests.map((q) => q.title).join(', ') : 'ninguna'}`,
    '',
    '## Hábitos',
    ...(habits.length ? habits.map((h) => `- ${h}`) : ['- (sin hábitos)']),
    '',
    '## Estado',
    `- Energía: ${stars(log?.energy)} · Ánimo: ${stars(log?.mood)} · Sueño: ${log?.sleep !== undefined ? `${formatAttrXp(log.sleep)} h` : '—'}`,
    ...metrics,
    '',
    '## Nota',
    log?.note?.trim() || '(sin nota)',
  ];
  if (soon.length || due.length) lines.push('', '## Próximos días', ...soon, ...due);
  return lines.join('\n') + '\n';
}
