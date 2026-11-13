// Reino de la Salud (V3): el antiguo «Diario de Sueño» (Excelsior Health) dentro del RPG.
// Cada mañana apuntas la noche en menos de un minuto. El reino premia la constancia, nunca las cifras:
// apuntar da XP como un hábito, y cada semana se levantan obras según lo constante que hayas sido.
// Las noches NO viajan en la partida: viven en su propia tabla (health.nights, la misma que usa la web de Health)
// y en este navegador. En la partida solo quedan el hábito «Apuntar la noche» y las obras ya levantadas.
import type { GameState, Habit, Quest } from './types';
import type { IconName } from './icon-data';
import { dayKey, shiftDay, toggleHabit, uid, type ActionResult } from './game';

// ---------- Noches (mismo formato que Excelsior Health) ----------

export interface Night {
  fecha: string; // el día en que te levantas (YYYY-MM-DD)
  percibido: { cama: string | null; dormido: string | null; despertar: string | null; levantado: string | null };
  reloj: { dormido: string | null; despertar: string | null; total_dormido_min: number | null; fases_min: Record<string, number | null> };
  preguntas: Record<string, string | number | null>;
  cuerpo: { peso_kg: number | null; mismas_condiciones: boolean | null };
  actualizado?: string;
}

export interface HealthSettings {
  levantar: string; // hora objetivo de levantarse
  horas: number; // horas en cama objetivo
  entrenosPlan: number;
  entrenosMin: number;
  actualizado?: string;
}

export const DEFAULT_SETTINGS: HealthSettings = { levantar: '07:00', horas: 8.5, entrenosPlan: 4, entrenosMin: 3 };

const PHASES = ['despierto', 'rem', 'ligero', 'profundo'];
const cTime = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const toNum = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
const cNum = (v: unknown, max: number) => {
  const n = toNum(v);
  return typeof n === 'number' && isFinite(n) && n >= 0 && n <= max ? Math.round(n) : null;
};
const cScale = (v: unknown) => {
  const n = cNum(v, 5);
  return n !== null && n >= 1 ? n : null;
};
const cKg = (v: unknown) => {
  const n = toNum(v);
  return typeof n === 'number' && isFinite(n) && n >= 25 && n <= 250 ? Math.round(n * 10) / 10 : null;
};
const cOpt = (v: unknown, opts: string[]) => (typeof v === 'string' && opts.includes(v) ? v : null);

export const validDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
export const validNight = (n: unknown): n is { fecha: string } & Record<string, unknown> =>
  !!n && typeof n === 'object' && validDay((n as { fecha?: unknown }).fecha);

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Loose) : {});

/** Limpia una noche que viene de fuera (nube, otra app, almacenamiento): solo quedan valores con sentido. */
export function normalizeNight(raw: { fecha: string } & Loose): Night {
  const p = obj(raw.percibido), w = obj(raw.reloj), f = obj(w.fases_min), q = obj(raw.preguntas), b = obj(raw.cuerpo);
  const n: Night = {
    fecha: raw.fecha,
    percibido: { cama: cTime(p.cama), dormido: cTime(p.dormido), despertar: cTime(p.despertar), levantado: cTime(p.levantado) },
    reloj: {
      dormido: cTime(w.dormido), despertar: cTime(w.despertar), total_dormido_min: cNum(w.total_dormido_min, 1440),
      fases_min: Object.fromEntries(PHASES.map((k) => [k, cNum(f[k], 1440)])),
    },
    preguntas: {
      calidad: cScale(q.calidad), descanso: cScale(q.descanso), estres: cScale(q.estres),
      entrenos_ayer: cNum(q.entrenos_ayer, 4), despertares: cNum(q.despertares, 30), despierto_noche_min: cNum(q.despierto_noche_min, 600), siesta_min: cNum(q.siesta_min, 300),
      ultima_cafeina: cTime(q.ultima_cafeina), ultima_comida: cTime(q.ultima_comida),
      pantalla_ultima_hora: cOpt(q.pantalla_ultima_hora, ['no', 'poco', 'si']), ejercicio: cOpt(q.ejercicio, ['no', 'manana', 'tarde', 'noche']),
      luz_natural: cOpt(q.luz_natural, ['poca', 'algo', 'mucha']), suenos: cOpt(q.suenos, ['no', 'si', 'pesadilla']),
      notas: typeof q.notas === 'string' && q.notas.trim() ? q.notas.trim().slice(0, 2000) : null,
    },
    cuerpo: { peso_kg: cKg(b.peso_kg), mismas_condiciones: typeof b.mismas_condiciones === 'boolean' ? b.mismas_condiciones : null },
  };
  if (typeof raw.actualizado === 'string') n.actualizado = raw.actualizado;
  return n;
}

export function normalizeSettings(raw: unknown, base: HealthSettings = DEFAULT_SETTINGS): HealthSettings {
  const r = obj(raw);
  const s = { ...base };
  if (cTime(r.levantar)) s.levantar = r.levantar as string;
  if (typeof r.horas === 'number' && r.horas >= 6 && r.horas <= 11) s.horas = r.horas;
  for (const k of ['entrenosPlan', 'entrenosMin'] as const) {
    const v = r[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 21) s[k] = v;
  }
  if (typeof r.actualizado === 'string') s.actualizado = r.actualizado;
  return s;
}

// ---------- Cálculos ----------

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutos de una hora a otra, cruzando la medianoche si hace falta. */
export function span(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return (toMin(b) - toMin(a) + 1440) % 1440;
}
/** Distancia entre dos horas del reloj (0–720 min), sin importar el día. */
export function clockDistance(a: string, b: string): number {
  const d = Math.abs(toMin(a) - toMin(b)) % 1440;
  return Math.min(d, 1440 - d);
}
export function fmtMin(m: number | null | undefined): string {
  if (m == null || isNaN(m)) return '—';
  return `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;
}
/** Hora objetivo de acostarse: la de levantarse menos las horas en cama. */
export function bedtimeGoal(s: HealthSettings): string {
  const m = (toMin(s.levantar) - Math.round(s.horas * 60) + 2880) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface NightStats {
  sleepMin: number | null; // sueño real
  inBedMin: number | null;
  efficiency: number | null; // %
}
/** Sueño real: el total del reloj; si no, REM + ligero + profundo; si no, de «me dormí» a «me desperté» menos lo despierto. */
export function nightStats(n: Night): NightStats {
  const f = n.reloj.fases_min;
  const asleep = ['rem', 'ligero', 'profundo'].some((k) => f[k] != null) ? ['rem', 'ligero', 'profundo'].reduce((s, k) => s + (f[k] ?? 0), 0) : null;
  const window = span(n.reloj.dormido, n.reloj.despertar);
  const sleepMin = n.reloj.total_dormido_min || asleep || (window == null ? null : Math.max(0, window - (f.despierto ?? 0)));
  const inBedMin = span(n.percibido.cama, n.percibido.levantado);
  return { sleepMin, inBedMin, efficiency: sleepMin && inBedMin ? Math.min(100, Math.round((sleepMin / inBedMin) * 100)) : null };
}

// ---------- Semana y obras ----------

/** Lunes de la semana de ese día (YYYY-MM-DD). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return dayKey(shiftDay(d.getTime(), -((d.getDay() + 6) % 7)));
}
export const addDays = (day: string, n: number) => dayKey(shiftDay(new Date(`${day}T12:00:00`).getTime(), n));
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export type WorkKind = 'templo' | 'reloj' | 'palestra' | 'balanza';
export interface WorkDef {
  kind: WorkKind;
  name: string;
  icon: IconName;
  /** Qué hay que hacer en la semana, en una línea. */
  rule: (s: HealthSettings) => string;
  /** Tamaño de la obra en la ciudad (como las construcciones de un reino). */
  size: Quest['type'];
}
export const REGULARITY_MARGIN = 30; // minutos de margen con tu horario
export const WORK_RULES = { nights: 5, regular: 5, weighIns: 3 };
export const WORKS: WorkDef[] = [
  { kind: 'templo', name: 'Templo del Sueño', icon: 'greek-temple', size: 'main', rule: () => `Apunta ${WORK_RULES.nights} noches` },
  { kind: 'reloj', name: 'Reloj de Sol', icon: 'sundial', size: 'daily', rule: (s) => `${WORK_RULES.regular} días en tu horario (cama ${bedtimeGoal(s)}, arriba ${s.levantar}, ±${REGULARITY_MARGIN} min)` },
  { kind: 'palestra', name: 'Palestra', icon: 'weight-lifting-up', size: 'daily', rule: (s) => `${s.entrenosMin} entrenos` },
  { kind: 'balanza', name: 'Balanza', icon: 'weight-scale', size: 'side', rule: () => `Pésate ${WORK_RULES.weighIns} días` },
];
export const workDef = (k: WorkKind) => WORKS.find((w) => w.kind === k)!;
/** Monedas por cada obra levantada. */
export const WORK_COINS = 10;

export interface WorkProgress {
  kind: WorkKind;
  have: number;
  need: number;
  done: boolean;
}

/** Lo que llevas esta semana (lunes a domingo) hacia cada obra. */
export function weekProgress(nights: Night[], settings: HealthSettings, monday: string): WorkProgress[] {
  const days = new Set(weekDays(monday));
  const week = nights.filter((n) => days.has(n.fecha));
  const bed = bedtimeGoal(settings);
  const regular = week.filter((n) => n.percibido.cama && n.percibido.levantado
    && clockDistance(n.percibido.cama, bed) <= REGULARITY_MARGIN && clockDistance(n.percibido.levantado, settings.levantar) <= REGULARITY_MARGIN).length;
  // Cada noche guarda los entrenos del día anterior: los de la semana son los de las noches de martes a lunes siguiente.
  const trainingDays = new Set(weekDays(addDays(monday, 1)));
  const workouts = nights.filter((n) => trainingDays.has(n.fecha)).reduce((s, n) => s + (Number(n.preguntas.entrenos_ayer) || 0), 0);
  const weighIns = week.filter((n) => n.cuerpo.peso_kg != null).length;
  const mk = (kind: WorkKind, have: number, need: number): WorkProgress => ({ kind, have: Math.min(have, need), need, done: have >= need });
  return [
    mk('templo', week.length, WORK_RULES.nights),
    mk('reloj', regular, WORK_RULES.regular),
    mk('palestra', workouts, settings.entrenosMin),
    mk('balanza', weighIns, WORK_RULES.weighIns),
  ];
}

/** Vigor del reino: de los últimos 7 días (hasta hoy), cuántos tienen la noche apuntada. */
export function vigor(nights: Night[], today: string): { days: number; of: 7; ratio: number } {
  const last = new Set(Array.from({ length: 7 }, (_, i) => addDays(today, -i)));
  const days = nights.filter((n) => last.has(n.fecha)).length;
  return { days, of: 7, ratio: days / 7 };
}

/** Media del peso de los últimos 7 días con dato y cambio frente a los 7 anteriores. */
export function weightTrend(nights: Night[], today: string): { avg: number; change: number | null } | null {
  const avgOf = (from: number, to: number) => {
    const days = new Set(Array.from({ length: to - from }, (_, i) => addDays(today, -(from + i))));
    const xs = nights.filter((n) => days.has(n.fecha) && n.cuerpo.peso_kg != null && n.cuerpo.mismas_condiciones !== false).map((n) => n.cuerpo.peso_kg!);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const now = avgOf(0, 7), before = avgOf(7, 14);
  if (now == null) return null;
  return { avg: Math.round(now * 10) / 10, change: before == null ? null : Math.round((now - before) * 10) / 10 };
}

// ---------- En la partida: hábito del sistema y obras ----------

export const HEALTH_HABIT_ID = 'sys-salud';
export const HEALTH_HABIT_NAME = 'Apuntar la noche';

export interface HealthWork {
  id: string;
  kind: WorkKind;
  /** Lunes de la semana en que se ganó. */
  week: string;
  at: number;
}

export const healthFounded = (s: GameState) => s.habits.some((h) => h.id === HEALTH_HABIT_ID) || (s.health?.works.length ?? 0) > 0;

/** Funda el Reino de la Salud: crea el hábito «Apuntar la noche» (se marca solo al guardar la noche). */
export function foundHealth(s: GameState, now: number): GameState {
  if (s.habits.some((h) => h.id === HEALTH_HABIT_ID)) return s;
  const habit: Habit = { id: HEALTH_HABIT_ID, name: HEALTH_HABIT_NAME, frequency: 'daily', createdAt: now, rewards: { voluntad: 1 }, system: 'health' };
  return { ...s, habits: [...s.habits, habit], health: s.health ?? { works: [] } };
}

/** Deja el hábito del sistema como «hecho» o «sin hacer» en ese día, según haya noche apuntada. */
function setLogged(s: GameState, day: string, logged: boolean, now: number): ActionResult {
  const has = s.habitCompletions.some((c) => c.habitId === HEALTH_HABIT_ID && c.day === day);
  if (has === logged) return { state: s, xp: 0 };
  return toggleHabit(s, HEALTH_HABIT_ID, now, day, true);
}

/**
 * Tras guardar o borrar una noche: marca el hábito de ese día (solo hoy y los 6 días anteriores dan XP,
 * como al marcar un hábito olvidado) y levanta las obras de la semana que ya se hayan ganado.
 */
export function syncHealth(s: GameState, nights: Night[], settings: HealthSettings, now: number, changedDay?: string): ActionResult & { built: WorkKind[] } {
  let state = foundHealth(s, now);
  let xp = 0;
  let capped = false;
  const today = dayKey(now);
  const recent = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const logged = new Set(nights.map((n) => n.fecha));
  for (const day of changedDay ? [changedDay] : recent) {
    if (!recent.includes(day)) continue;
    // Sin un día concreto (noches que llegan de la nube) solo se marca, nunca se desmarca:
    // en un dispositivo nuevo las noches tardan en llegar y no deben quitar XP ya ganado.
    if (!changedDay && !logged.has(day)) continue;
    const r = setLogged(state, day, logged.has(day), now);
    state = r.state;
    xp += r.xp;
    capped ||= !!r.capped;
  }
  // Obras: las de esta semana y la anterior (por si apuntas el lunes lo del domingo).
  const built: WorkKind[] = [];
  const works = [...(state.health?.works ?? [])];
  for (const monday of [weekStart(today), addDays(weekStart(today), -7)]) {
    for (const p of weekProgress(nights, settings, monday)) {
      if (p.done && !works.some((w) => w.week === monday && w.kind === p.kind)) {
        works.push({ id: uid(), kind: p.kind, week: monday, at: now });
        if (monday === weekStart(today)) built.push(p.kind);
      }
    }
  }
  if (works.length !== (state.health?.works.length ?? 0)) state = { ...state, health: { ...state.health, works } };
  return { state, xp, capped, built };
}

/** Monedas ganadas con las obras del Reino de la Salud. */
export const healthCoins = (s: GameState) => (s.health?.works.length ?? 0) * WORK_COINS;

/** Las obras como «construcciones» para dibujar la ciudad del reino. */
export function healthBuildings(s: GameState): Quest[] {
  return (s.health?.works ?? []).map((w) => {
    const d = workDef(w.kind);
    return { id: w.id, title: d.name, type: d.size, createdAt: w.at, completedAt: w.at } as Quest;
  });
}

// ---------- Fusión con la nube (pura) ----------

export interface CloudRow {
  fecha: string;
  data: Loose | null;
  deleted: boolean;
  updated_at: string;
}

/**
 * Aplica las filas que llegan de la nube. Gana la edición más reciente: un cambio local pendiente
 * (`pend[fecha]` = cuándo se hizo) se respeta si es posterior a lo que trae la nube.
 * Devuelve las noches resultantes, los pendientes que siguen en pie y el cursor nuevo.
 */
export function mergeRemote(nights: Night[], pend: Record<string, string>, rows: CloudRow[], cursor: string | null) {
  const byDate = new Map(nights.map((n) => [n.fecha, n]));
  const left = { ...pend };
  let next = cursor;
  let changed = false;
  for (const r of rows) {
    if (!next || r.updated_at > next) next = r.updated_at;
    const data = obj(r.data);
    const remoteT = String((r.deleted ? data.borrado : data.actualizado) ?? '');
    if (left[r.fecha] && left[r.fecha] > remoteT) continue;
    delete left[r.fecha];
    if (!r.deleted && validNight(data) && data.fecha === r.fecha) byDate.set(r.fecha, normalizeNight(data));
    else byDate.delete(r.fecha);
    changed = true;
  }
  return { nights: sortNights([...byDate.values()]), pend: left, cursor: next, changed };
}

export const sortNights = (ns: Night[]) => [...ns].sort((a, b) => b.fecha.localeCompare(a.fecha));

/** Noche vacía para un día. */
export const emptyNight = (fecha: string): Night => normalizeNight({ fecha });
