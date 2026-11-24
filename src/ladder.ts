// Escalera de hábitos: un plan por semanas. Cada escalón añade un hábito nuevo (con su mínimo) o es una
// semana de consolidar o de auditoría, sin nada nuevo. Regla del 80 %: si al acabar la semana algún hábito
// queda por debajo, no se sube y la semana se repite; el calendario se corre solo en vez de hundirse.
import type { GameState, Habit, HabitLadder, LadderStep } from './types';
import { addHabit, dayKey, studyPausedOn, habitDayCount, isHabitDone, MINIMUM_MAX, shiftDay, uid, weekStart } from './game';

export const LADDER_RULES = {
  pct: 0.8, // mínimo de cada hábito en la semana para subir
  maxHabits: 7, // con 7 o más, un escalón de hábito nuevo espera a que retires uno consolidado
  maxSteps: 26, // medio año
  nameMax: 60,
};

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const nextMonday = (monday: string) => weekStart(shiftDay(noon(monday), 7));

/** Id del hábito que crea un escalón: fijo, para que dos dispositivos que suben a la vez no lo dupliquen. */
export const ladderHabitId = (step: LadderStep) => `ladder-${step.id}`;

export function newStep(kind: LadderStep['kind'], name = '', perWeek = 7, minimum = ''): LadderStep {
  const step: LadderStep = { id: uid(), kind };
  if (kind === 'new') { step.name = name; step.perWeek = perWeek; if (minimum) step.minimum = minimum; }
  return step;
}

function cleanStep(x: LadderStep): LadderStep | null {
  if (x.kind !== 'new') return { id: x.id, kind: x.kind === 'audit' ? 'audit' : 'rest' };
  const name = (x.name ?? '').trim().slice(0, LADDER_RULES.nameMax);
  if (!name) return null;
  const step: LadderStep = { id: x.id, kind: 'new', name, perWeek: Math.max(1, Math.min(7, Math.round(x.perWeek ?? 7))) };
  const m = x.minimum?.trim().slice(0, MINIMUM_MAX);
  if (m) step.minimum = m;
  return step;
}

/** Crea (o rehace) la escalera. `start` es el lunes de la semana 1. Si empieza ya, entra el primer escalón. */
export function createLadder(s: GameState, steps: LadderStep[], start: string, now: number): GameState {
  const clean = steps.map(cleanStep).filter((x): x is LadderStep => !!x).slice(0, LADDER_RULES.maxSteps);
  if (clean.length === 0) return s;
  const ladder: HabitLadder = { steps: clean, startedOn: weekStart(noon(start)), createdOn: dayKey(now), current: -1, log: [] };
  return advanceLadder({ ...s, ladder }, now);
}

/** Cambia los escalones que aún no han llegado (los pasados y el de esta semana se quedan como están). */
export function updateLadderSteps(s: GameState, steps: LadderStep[]): GameState {
  const L = s.ladder;
  if (!L) return s;
  const fixed = L.steps.slice(0, L.current + 1);
  const rest = steps.slice(fixed.length).map(cleanStep).filter((x): x is LadderStep => !!x);
  const all = [...fixed, ...rest].slice(0, LADDER_RULES.maxSteps);
  const done = L.finishedOn && all.length > L.steps.length;
  const ladder: HabitLadder = { ...L, steps: all };
  if (done) delete ladder.finishedOn; // añadir escalones a una escalera acabada la reabre
  return { ...s, ladder };
}

export function deleteLadder(s: GameState): GameState {
  const next = { ...s };
  delete next.ladder;
  return next;
}

/** Mete el hábito de un escalón (si no existe ya uno con ese id o con ese nombre). */
function enterStep(s: GameState, step: LadderStep, now: number): GameState {
  if (step.kind !== 'new' || !step.name) return s;
  const id = ladderHabitId(step);
  const all = [...s.habits, ...(s.retiredHabits ?? [])];
  if (all.some((h) => h.id === id || h.name.trim().toLowerCase() === step.name!.trim().toLowerCase())) return s;
  const next = addHabit(s, step.name, now, { perWeek: step.perWeek, minimum: step.minimum });
  return { ...next, habits: next.habits.map((h, i) => (i === next.habits.length - 1 ? { ...h, id } : h)) };
}

/**
 * Cuánto cumpliste cada hábito en la semana que empieza en `monday` (hasta `until`, sin incluir ese día,
 * para medir la semana en curso). Diarios: días hechos / días; semanales: veces / meta (proporcional si
 * el hábito nació a mitad de semana). Se saltan los que nacieron el viernes o después: aún no cuentan.
 * `from`: la semana en que creaste la escalera solo cuenta desde ese día. Los días de vacaciones de las
 * tarjetas no cuentan para el hábito de Academy (ni suman ni fallan).
 */
export function weekPcts(s: GameState, monday: string, until?: string, from?: string): { habit: Habit; pct: number; done: number; need: number }[] {
  const start = noon(monday);
  const first = from && from > monday ? from : monday;
  const days = Array.from({ length: 7 }, (_, i) => dayKey(shiftDay(start, i))).filter((d) => d >= first && (!until || d < until));
  const out: { habit: Habit; pct: number; done: number; need: number }[] = [];
  for (const h of s.habits) {
    const born = dayKey(h.createdAt);
    if (born > dayKey(shiftDay(noon(first), 3))) continue;
    const counted = days.filter((d) => d >= born && !(h.system === 'academy' && studyPausedOn(s, d)));
    if (counted.length === 0) continue;
    if (h.frequency === 'weekly') {
      const need = Math.max(1, Math.ceil(((h.perWeek ?? 1) * counted.length) / 7));
      const done = counted.reduce((n, d) => n + habitDayCount(s, h.id, d), 0);
      out.push({ habit: h, done, need, pct: Math.min(1, done / need) });
    } else {
      const done = counted.filter((d) => isHabitDone(s, h.id, d)).length;
      out.push({ habit: h, done, need: counted.length, pct: done / counted.length });
    }
  }
  return out;
}

/**
 * Pone la escalera al día: al empezar entra el primer escalón y, por cada semana acabada, mira la regla
 * del 80 %. Todo ≥ 80 % → sube (y entra el hábito del siguiente escalón). Si no, repite la semana.
 * Si el siguiente es un hábito nuevo y ya llevas 7, espera («full») a que retires uno.
 */
export function advanceLadder(s: GameState, now: number): GameState {
  const L0 = s.ladder;
  if (!L0 || L0.finishedOn) return s;
  const monday = weekStart(now);
  if (monday < L0.startedOn) return s;
  let st = s;
  const L: HabitLadder = { ...L0, log: [...L0.log] };
  if (L.current < 0 || !L.week) {
    L.current = 0;
    L.week = L.startedOn;
    st = enterStep(st, L.steps[0], now);
  }
  while (L.week! < monday) {
    const week = L.week!;
    const pcts = weekPcts(st, week, undefined, week === L.startedOn ? L.createdOn : undefined);
    const below = pcts.filter((x) => x.pct < LADDER_RULES.pct).map((x) => x.habit.name);
    const step = L.steps[L.current];
    const next = L.steps[L.current + 1];
    let result: 'up' | 'repeat' | 'full' = below.length ? 'repeat' : 'up';
    if (result === 'up' && next?.kind === 'new' && st.habits.length >= LADDER_RULES.maxHabits) result = 'full';
    L.log.push({ id: `${week}-${step.id}`, week, step: step.id, result, ...(below.length ? { below } : {}) });
    L.week = nextMonday(week);
    if (result !== 'up') continue;
    if (!next) { L.finishedOn = L.week; break; }
    L.current += 1;
    st = enterStep(st, next, now);
  }
  if (deepSame(L, L0)) return s;
  return { ...st, ladder: L };
}

function deepSame(a: HabitLadder, b: HabitLadder) {
  return a.current === b.current && a.week === b.week && a.log.length === b.log.length && a.finishedOn === b.finishedOn;
}

/** «Subir ya»: pasa al siguiente escalón sin esperar al domingo (la semana empieza de nuevo hoy). */
export function climbNow(s: GameState, now: number): GameState {
  const L = s.ladder;
  if (!L || L.finishedOn || L.current < 0) return s;
  const step = L.steps[L.current];
  const next = L.steps[L.current + 1];
  const week = weekStart(now);
  const log = [...L.log, { id: `${week}-${step.id}-m`, week, step: step.id, result: 'manual' as const }];
  if (!next) return { ...s, ladder: { ...L, log, finishedOn: week } };
  return { ...enterStep(s, next, now), ladder: { ...L, log, current: L.current + 1, week } };
}

/** Lunes en que se espera llegar a cada escalón (si todo va al 80 %). */
export function stepDates(L: HabitLadder): string[] {
  const base = L.current < 0 ? L.startedOn : L.week ?? L.startedOn;
  const from = Math.max(0, L.current);
  return L.steps.map((_, i) => {
    if (i < from) {
      const hit = L.log.filter((x) => x.step === L.steps[i].id);
      return hit[0]?.week ?? L.startedOn;
    }
    let d = base;
    for (let k = from; k < i; k++) d = nextMonday(d);
    return d;
  });
}

/** Lo último que pasó: el resultado de la semana anterior, para contarlo arriba. */
export function lastWeekResult(L: HabitLadder, now: number) {
  const prev = weekStart(shiftDay(now, -7));
  return [...L.log].reverse().find((x) => x.week === prev && x.result !== 'manual') ?? null;
}

/** Semanas que lleva el escalón actual (1 = primera). */
export function weeksOnStep(L: HabitLadder): number {
  if (L.current < 0) return 0;
  const id = L.steps[L.current].id;
  return 1 + L.log.filter((x) => x.step === id && (x.result === 'repeat' || x.result === 'full')).length;
}
