// Tu vida real dentro de Excelsior: medidas (dinero, peso…), cierre del día y eventos del calendario.
// Funciones puras sobre GameState, como el resto de reglas.
import type { CalendarEvent, DayLog, EventKind, EventRepeat, GameState, Metric, Reminder, RepeatRule } from './types';
import type { IconName } from './icon-data';
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

export const EVENT_KINDS: { id: EventKind; name: string; icon: IconName }[] = [
  { id: 'bloque', name: 'Bloque de tiempo', icon: 'ev-bloque' },
  { id: 'examen', name: 'Examen', icon: 'ev-examen' },
  { id: 'lanzamiento', name: 'Lanzamiento', icon: 'ev-lanzamiento' },
  { id: 'llamada', name: 'Llamada', icon: 'ev-llamada' },
  { id: 'reunion', name: 'Reunión', icon: 'ev-reunion' },
  { id: 'otro', name: 'Otro', icon: 'ev-otro' },
];

export const eventIcon = (k: EventKind): IconName => EVENT_KINDS.find((x) => x.id === k)?.icon ?? 'ev-otro';

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

type EventFields = { title: string; day: string; time?: string; end?: string; kind: EventKind; repeat?: EventRepeat; rule?: RepeatRule; until?: string; color?: string };

/** Evento limpio: sin campos vacíos, fin solo si va después del inicio. */
function cleanEvent(ev: CalendarEvent): CalendarEvent {
  const out: CalendarEvent = { id: ev.id, title: ev.title.trim(), day: ev.day, kind: ev.kind, createdAt: ev.createdAt };
  if (ev.time) out.time = ev.time;
  if (ev.time && ev.end && ev.end > ev.time) out.end = ev.end;
  if (ev.repeat) out.repeat = ev.repeat;
  if (ev.repeat === 'custom') out.rule = cleanRule(ev.rule, ev.day);
  if (ev.repeat && ev.until && ev.until >= ev.day) out.until = ev.until;
  if (ev.repeat && ev.skip?.length) out.skip = ev.skip;
  if (ev.color) out.color = ev.color;
  return out;
}

/** Regla personalizada válida: cada 1–99; en semanas, al menos el día de la semana en que empieza. */
export function cleanRule(rule: RepeatRule | undefined, day: string): RepeatRule {
  const unit = rule?.unit === 'day' || rule?.unit === 'month' ? rule.unit : 'week';
  const every = Math.max(1, Math.min(99, Math.round(rule?.every ?? 1) || 1));
  if (unit !== 'week') return { every, unit };
  const days = [...new Set((rule?.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return { every, unit, days: days.length ? days : [new Date(`${day}T12:00:00`).getDay()] };
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

/**
 * Cambiar solo un día de un evento que se repite: ese día sale de la serie y queda como evento suelto (con id `newId`)
 * con los cambios. Así la serie guarda lo general («Deep Work») y ese día lo concreto («Estudiar Física»).
 */
export function editOccurrence(s: GameState, id: string, day: string, patch: Partial<EventFields>, newId: string, now: number): GameState {
  const e = (s.events ?? []).find((x) => x.id === id);
  if (!e) return s;
  if (!e.repeat) return updateEvent(s, id, patch);
  const one: CalendarEvent = { id: newId, title: e.title, day, time: e.time, end: e.end, kind: e.kind, color: e.color, createdAt: now };
  const { repeat: _r, rule: _u, until: _t, ...fields } = patch;
  const skipped = skipEventDay(s, id, day);
  return { ...skipped, events: [...skipped.events!, cleanEvent({ ...one, ...fields })] };
}

/** Quita un solo día de un evento que se repite (el resto de la serie sigue). */
export function skipEventDay(s: GameState, id: string, day: string): GameState {
  return { ...s, events: (s.events ?? []).map((e) => (e.id === id ? { ...e, skip: [...(e.skip ?? []), day] } : e)) };
}

/** Si el evento cae ese día (contando las repeticiones). */
export function occursOn(e: CalendarEvent, day: string): boolean {
  if (day === e.day) return !e.skip?.includes(day);
  if (!e.repeat || day < e.day || e.skip?.includes(day) || (e.until && day > e.until)) return false;
  const wd = (d: string) => new Date(`${d}T12:00:00`).getDay();
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekdays') return wd(day) >= 1 && wd(day) <= 5;
  if (e.repeat === 'custom') {
    const r = cleanRule(e.rule, e.day);
    const at = (d: string) => new Date(`${d}T12:00:00`).getTime();
    const days = Math.round((at(day) - at(e.day)) / 86_400_000);
    if (r.unit === 'day') return days % r.every === 0;
    if (r.unit === 'month') {
      const [y0, m0, d0] = e.day.split('-').map(Number), [y, m, d] = day.split('-').map(Number);
      return d === d0 && ((y - y0) * 12 + m - m0) % r.every === 0;
    }
    // semanas contadas de lunes a lunes desde la semana en que empieza
    const monday = (d: string) => at(d) - ((wd(d) + 6) % 7) * 86_400_000;
    const weeks = Math.round((monday(day) - monday(e.day)) / (7 * 86_400_000));
    return weeks % r.every === 0 && r.days!.includes(wd(day));
  }
  return wd(day) === wd(e.day);
}

export const REPEAT_NAMES: Record<EventRepeat, string> = { daily: 'Cada día', weekdays: 'De lunes a viernes', weekly: 'Cada semana', custom: 'Personalizado…' };

const WD_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const UNIT_WORDS = { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'] } as const;

/** En palabras: «Cada 2 semanas: L, X, V · hasta el 20 dic». */
export function repeatText(e: Pick<CalendarEvent, 'repeat' | 'rule' | 'until' | 'day'>): string {
  if (!e.repeat) return '';
  let txt: string = REPEAT_NAMES[e.repeat];
  if (e.repeat === 'custom') {
    const r = cleanRule(e.rule, e.day);
    const [one, many] = UNIT_WORDS[r.unit];
    txt = r.every === 1 ? `Cada ${one}` : `Cada ${r.every} ${many}`;
    if (r.unit === 'week') txt += `: ${[1, 2, 3, 4, 5, 6, 0].filter((d) => r.days!.includes(d)).map((d) => WD_SHORT[d]).join(', ')}`;
    if (r.unit === 'month') txt += `, el día ${Number(e.day.slice(8))}`;
  }
  if (e.until) txt += ` · hasta el ${new Date(`${e.until}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}`;
  return txt;
}

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
  for (const r of s.reminders ?? []) if (!r.doneAt && r.day === today && r.time && fresh(r.time)) out.push({ key: `r:${r.id}:${today}`, text: `{i:bell} ${r.title}` });
  for (const e of eventsOn(s, today)) if (e.time && fresh(e.time)) out.push({ key: `e:${e.id}:${today}`, text: `{i:${eventIcon(e.kind)}} ${e.time} · ${e.title}` });
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
  const soon = upcomingEvents(s, now + 86_400_000, 6).map((e) => `- ${e.day}${e.time ? ` ${e.time}` : ''} · ${EVENT_KINDS.find((k) => k.id === e.kind)?.name ?? 'Evento'}: ${e.title}`);
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
