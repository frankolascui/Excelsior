// Sobrecarga progresiva de hábitos y hábitos automatizados: Hiperión propone subir la meta y retirar lo que ya sale solo.
import type { GameState, Habit, HabitProgression } from './types';
import { dayKey, isHabitDone, shiftDay, weekStart } from './game';

export const PROGRESSION_RULES = {
  levelDays: 14, // días con la meta actual antes de proponer subirla
  levelPct: 0.8,
  autoDays: 30, // ventana para dar un hábito por automatizado
  autoPct: 0.9,
  snoozeDays: 7, // «Aún no»
};

const pad = (n: number) => String(n).padStart(2, '0');
export function clockText(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** «20 min», «a las 22:00», «5 veces/sem». */
export function valueText(p: Pick<HabitProgression, 'kind' | 'unit'>, value: number): string {
  if (p.kind === 'time') return `a las ${clockText(value)}`;
  if (p.kind === 'freq') return value >= 7 ? 'cada día' : `${value} ${value === 1 ? 'vez' : 'veces'}/sem`;
  return `${value}${p.unit ? ` ${p.unit}` : ''}`;
}

/** «20 min» o, con meta final, «20 → 60 min». */
export function progressionText(h: Habit): string | null {
  const p = h.progression;
  if (!p) return null;
  if (p.max === undefined || atMax(p)) return valueText(p, p.value);
  if (p.kind === 'time') return `a las ${clockText(p.value)} → ${clockText(p.max)}`;
  if (p.kind === 'amount') return `${p.value} → ${valueText(p, p.max)}`;
  return `${valueText(p, p.value)} → ${valueText(p, p.max)}`;
}

/** ¿Ya llegó a la meta final (`max`)? */
export function atMax(p: Pick<HabitProgression, 'value' | 'step' | 'max' | 'kind'>): boolean {
  const max = p.kind === 'freq' ? Math.min(7, p.max ?? 7) : p.max;
  if (max === undefined) return false;
  return p.step < 0 ? p.value <= max : p.value >= max;
}

/**
 * Siguiente meta, sin pasarse de `max`; null si ya no puede subir (llegó al máximo, una hora fuera del día,
 * más de 7 veces por semana, cantidad ≤ 0).
 */
export function nextValue(p: HabitProgression): number | null {
  if (p.step === 0 || atMax(p)) return null;
  let v = p.value + p.step;
  const max = p.kind === 'freq' ? Math.min(7, p.max ?? 7) : p.max;
  if (max !== undefined) v = p.step < 0 ? Math.max(v, max) : Math.min(v, max);
  if (p.kind === 'freq') return v < 1 ? null : v;
  if (p.kind === 'time') return v < 0 || v >= 1440 ? null : v;
  return v <= 0 ? null : Math.round(v * 100) / 100;
}

/** Pone, cambia o quita (null) la sobrecarga de un hábito. */
export function setProgression(s: GameState, id: string, p: Omit<HabitProgression, 'since' | 'history'> | null, now: number): GameState {
  return {
    ...s,
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const next = { ...h };
      if (!p) { delete next.progression; return next; }
      const same = h.progression && h.progression.kind === p.kind && h.progression.value === p.value;
      next.progression = { ...p, unit: p.unit?.trim().slice(0, 20) || undefined, since: same ? h.progression!.since : now, history: h.progression?.history ?? [] };
      if (!next.progression.unit) delete next.progression.unit;
      if (p.kind === 'freq') applyFreq(next, p.value);
      return next;
    }),
  };
}

function applyFreq(h: Habit, value: number) {
  if (value >= 7) { h.frequency = 'daily'; delete h.perWeek; } else { h.frequency = 'weekly'; h.perWeek = Math.max(1, Math.round(value)); }
}

/**
 * Constancia de los últimos `days` días (sin contar hoy, que no ha acabado), desde `since`.
 * Diarios: días hechos / días. Semanales: por semanas completas, veces (hasta su meta) / meta.
 * null si aún no hay bastantes días.
 */
export function constancy(s: GameState, h: Habit, now: number, days: number, since = h.createdAt): number | null {
  if (h.frequency === 'weekly') {
    const weeks = Math.floor(days / 7);
    const need = h.perWeek ?? 1;
    const thisMonday = new Date(`${weekStart(now)}T12:00:00`).getTime();
    let got = 0;
    for (let w = 1; w <= weeks; w++) {
      const start = shiftDay(thisMonday, -7 * w);
      if (dayKey(start) < dayKey(since)) return null;
      const n = Array.from({ length: 7 }, (_, i) => dayKey(shiftDay(start, i))).filter((d) => isHabitDone(s, h.id, d)).length;
      got += Math.min(need, n);
    }
    return weeks ? got / (need * weeks) : null;
  }
  const list = Array.from({ length: days }, (_, i) => dayKey(shiftDay(now, -1 - i)));
  if (list.at(-1)! < dayKey(since)) return null;
  return list.filter((d) => isHabitDone(s, h.id, d)).length / days;
}

const snoozed = (until: string | undefined, now: number) => !!until && until >= dayKey(now);

/** ¿Toca proponer subir la meta? Devuelve la nueva meta. */
export function levelUpDue(s: GameState, h: Habit, now: number): number | null {
  const p = h.progression;
  if (!p || snoozed(h.snooze?.level, now)) return null;
  const next = nextValue(p);
  if (next === null) return null;
  const c = constancy(s, h, now, PROGRESSION_RULES.levelDays, p.since);
  return c !== null && c >= PROGRESSION_RULES.levelPct ? next : null;
}

/** ¿Ya está automatizado (≥ 90 % en los últimos 30 días)? Devuelve la constancia. */
export function automatedDue(s: GameState, h: Habit, now: number): number | null {
  if (snoozed(h.snooze?.auto, now)) return null;
  const c = constancy(s, h, now, PROGRESSION_RULES.autoDays);
  return c !== null && c >= PROGRESSION_RULES.autoPct ? c : null;
}

/** Sube la meta (o la que se le pase). */
export function levelUp(s: GameState, id: string, now: number): GameState {
  return {
    ...s,
    habits: s.habits.map((h) => {
      const p = h.progression;
      const next = p && nextValue(p);
      if (h.id !== id || !p || next === null || next === undefined) return h;
      const out: Habit = { ...h, progression: { ...p, value: next, since: now, history: [...(p.history ?? []), { value: p.value, at: p.since }] } };
      if (p.kind === 'freq') applyFreq(out, next);
      return out;
    }),
  };
}

/** «Aún no»: Hiperión no vuelve a proponerlo en unos días (subir: 7; retirar: 30). */
export function snoozeHint(s: GameState, id: string, kind: 'level' | 'auto', now: number): GameState {
  const days = kind === 'level' ? PROGRESSION_RULES.snoozeDays : PROGRESSION_RULES.autoDays;
  const until = dayKey(shiftDay(now, days));
  return { ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, snooze: { ...h.snooze, [kind]: until } } : h)) };
}

/** Retira un hábito automatizado: sale de la lista pero guarda su historial. */
export function retireHabit(s: GameState, id: string, now: number): GameState {
  const h = s.habits.find((x) => x.id === id);
  if (!h) return s;
  return { ...s, habits: s.habits.filter((x) => x.id !== id), retiredHabits: [...(s.retiredHabits ?? []), { ...h, retiredAt: now }] };
}

/** Lo vuelve a poner en la lista. */
export function restoreHabit(s: GameState, id: string): GameState {
  const h = (s.retiredHabits ?? []).find((x) => x.id === id);
  if (!h) return s;
  const { retiredAt: _, ...back } = h;
  return { ...s, retiredHabits: (s.retiredHabits ?? []).filter((x) => x.id !== id), habits: [...s.habits, back] };
}

/** Lo que Hiperión tiene que decirte de tus hábitos ahora. */
export function habitHints(s: GameState, now: number) {
  const out: ({ kind: 'auto'; habit: Habit; pct: number } | { kind: 'level'; habit: Habit; next: number })[] = [];
  for (const h of s.habits) {
    const pct = automatedDue(s, h, now);
    if (pct !== null) { out.push({ kind: 'auto', habit: h, pct }); continue; }
    const next = levelUpDue(s, h, now);
    if (next !== null) out.push({ kind: 'level', habit: h, next });
  }
  return out;
}
