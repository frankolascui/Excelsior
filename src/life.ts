// Tu vida real dentro de Excelsior: medidas (dinero, peso…), cierre del día y eventos del calendario.
// Funciones puras sobre GameState, como el resto de reglas.
import type { CalendarEvent, DayLog, EventKind, GameState, Metric } from './types';
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
  { id: 'examen', name: 'Examen', icon: '📝' },
  { id: 'lanzamiento', name: 'Lanzamiento', icon: '🚀' },
  { id: 'llamada', name: 'Llamada', icon: '📞' },
  { id: 'reunion', name: 'Reunión', icon: '🤝' },
  { id: 'otro', name: 'Otro', icon: '📌' },
];

export const eventIcon = (k: EventKind) => EVENT_KINDS.find((x) => x.id === k)?.icon ?? '📌';

export function addEvent(s: GameState, e: { title: string; day: string; time?: string; kind: EventKind }, now: number): GameState {
  const ev: CalendarEvent = { id: uid(), title: e.title.trim(), day: e.day, kind: e.kind, createdAt: now };
  if (e.time) ev.time = e.time;
  return { ...s, events: [...(s.events ?? []), ev] };
}

export function deleteEvent(s: GameState, id: string): GameState {
  return { ...s, events: (s.events ?? []).filter((e) => e.id !== id) };
}

export function eventsOn(s: GameState, day: string): CalendarEvent[] {
  return (s.events ?? []).filter((e) => e.day === day).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
}

/** Eventos de hoy en adelante, dentro de `days` días. */
export function upcomingEvents(s: GameState, now: number, days: number): CalendarEvent[] {
  const from = dayKey(now);
  const to = dayKey(now + days * 86_400_000);
  return (s.events ?? [])
    .filter((e) => e.day >= from && e.day <= to)
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99'));
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
