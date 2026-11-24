import { describe, expect, it } from 'vitest';
import { addHabit, createProfile, dayKey, emptyState, shiftDay, toggleHabit } from './game';
import { advanceLadder, climbNow, createLadder, ladderHabitId, newStep, stepDates, updateLadderSteps, weekPcts, weeksOnStep } from './ladder';
import { mergeStates } from './merge';
import type { GameState } from './types';

const at = (d: string) => new Date(`${d}T12:00:00`).getTime();
const MON = '2026-11-23'; // lunes

function base(): GameState {
  const s = createProfile(emptyState(), 'N', [], at('2026-11-01'));
  return addHabit(s, 'Leer', at('2026-11-01'));
}
/** Marca un hábito los días [from, from + n). */
function mark(s: GameState, name: string, from: string, n: number): GameState {
  const h = s.habits.find((x) => x.name === name)!;
  for (let i = 0; i < n; i++) { const d = shiftDay(at(from), i); s = toggleHabit(s, h.id, d, dayKey(d)).state; }
  return s;
}
const plan = () => [newStep('new', 'Meditar', 7, '5 min'), newStep('rest'), newStep('new', 'Correr', 3), newStep('audit')];

describe('escalera de hábitos', () => {
  it('al empezar entra el primer hábito, con su mínimo y un id fijo', () => {
    const steps = plan();
    const s = createLadder(base(), steps, MON, at(MON));
    expect(s.ladder!.current).toBe(0);
    const h = s.habits.find((x) => x.name === 'Meditar')!;
    expect(h.id).toBe(ladderHabitId(steps[0]));
    expect(h.minimum).toBe('5 min');
    expect(h.frequency).toBe('daily');
  });

  it('si empieza el lunes que viene, no hace nada hasta entonces', () => {
    const s = createLadder(base(), plan(), '2026-11-30', at(MON));
    expect(s.ladder!.current).toBe(-1);
    expect(s.habits).toHaveLength(1);
    const later = advanceLadder(s, at('2026-11-30'));
    expect(later.ladder!.current).toBe(0);
    expect(later.habits).toHaveLength(2);
  });

  it('todo al 80 % → sube; algo por debajo → repite la semana', () => {
    let s = createLadder(base(), plan(), MON, at(MON));
    s = mark(s, 'Leer', MON, 6);
    s = mark(s, 'Meditar', MON, 5); // 5/7 = 71 %
    const rep = advanceLadder(s, at('2026-11-30'));
    expect(rep.ladder!.current).toBe(0);
    expect(rep.ladder!.log.at(-1)).toMatchObject({ result: 'repeat', below: ['Meditar'] });
    expect(weeksOnStep(rep.ladder!)).toBe(2);
    // segunda semana bien: sube a «consolidar» (no entra ningún hábito)
    let ok = mark(rep, 'Leer', '2026-11-30', 7);
    ok = mark(ok, 'Meditar', '2026-11-30', 6);
    const up = advanceLadder(ok, at('2026-12-07'));
    expect(up.ladder!.current).toBe(1);
    expect(up.habits).toHaveLength(2);
    expect(up.ladder!.log.at(-1)!.result).toBe('up');
  });

  it('se pone al día de varias semanas sin abrir la app y repite si no marcaste nada', () => {
    const s = createLadder(base(), plan(), MON, at(MON));
    const later = advanceLadder(s, at('2026-12-14'));
    expect(later.ladder!.log.map((x) => x.result)).toEqual(['repeat', 'repeat', 'repeat']);
    expect(later.ladder!.current).toBe(0);
    expect(advanceLadder(later, at('2026-12-15'))).toBe(later);
  });

  it('con 7 hábitos, el escalón de hábito nuevo espera', () => {
    let s = base();
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) s = addHabit(s, n, at('2026-11-01'));
    s = createLadder(s, [newStep('rest'), newStep('new', 'Correr')], MON, at(MON));
    for (const h of s.habits) s = mark(s, h.name, MON, 7);
    const next = advanceLadder(s, at('2026-11-30'));
    expect(next.ladder!.log.at(-1)!.result).toBe('full');
    expect(next.ladder!.current).toBe(0);
  });

  it('la última semana bien termina la escalera; «Subir ya» salta sin esperar', () => {
    let s = createLadder(base(), [newStep('rest')], MON, at(MON));
    s = mark(s, 'Leer', MON, 7);
    expect(advanceLadder(s, at('2026-11-30')).ladder!.finishedOn).toBe('2026-11-30');
    const c = climbNow(createLadder(base(), plan(), MON, at(MON)), at('2026-11-25'));
    expect(c.ladder!.current).toBe(1);
    expect(c.ladder!.log.at(-1)!.result).toBe('manual');
  });

  it('editar solo cambia los escalones que aún no han llegado', () => {
    const s = createLadder(base(), plan(), MON, at(MON));
    const steps = s.ladder!.steps.map((x, i) => (i === 0 ? { ...x, name: 'Otra cosa' } : x)).slice(0, 2);
    const e = updateLadderSteps(s, steps);
    expect(e.ladder!.steps.map((x) => x.name ?? x.kind)).toEqual(['Meditar', 'rest']);
  });

  it('fechas previstas: una semana por escalón desde la actual', () => {
    const s = createLadder(base(), plan(), MON, at(MON));
    expect(stepDates(s.ladder!)).toEqual(['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14']);
  });

  it('semanales: veces / meta; los nacidos a mitad de semana cuentan en proporción y los del viernes no', () => {
    let s = addHabit(base(), 'Gym', at('2026-11-01'), { perWeek: 3 });
    s = mark(s, 'Gym', MON, 2);
    s = addHabit(s, 'Tarde', at('2026-11-27'));
    const p = weekPcts(s, MON);
    expect(p.find((x) => x.habit.name === 'Gym')).toMatchObject({ done: 2, need: 3 });
    expect(p.some((x) => x.habit.name === 'Tarde')).toBe(false);
  });

  it('dos dispositivos que suben a la vez no duplican el hábito al unir partidas', () => {
    let s = createLadder(base(), [newStep('rest'), newStep('new', 'Correr')], MON, at(MON));
    s = mark(s, 'Leer', MON, 7);
    const a = advanceLadder(s, at('2026-11-30'));
    const b = advanceLadder(s, at('2026-11-30') + 3600e3);
    const { state, conflicts } = mergeStates(s, a, b);
    expect(state.habits.filter((h) => h.name === 'Correr')).toHaveLength(1);
    expect(state.ladder!.log).toHaveLength(1);
    expect(conflicts.filter((c) => c.startsWith('ladder'))).toEqual([]);
  });
  it('la semana en que la creas solo cuenta desde ese día', () => {
    let s = createLadder(base(), [newStep('rest'), newStep('rest')], MON, at('2026-11-26')); // jueves
    s = mark(s, 'Leer', '2026-11-26', 4); // jueves a domingo; lunes a miércoles sin marcar
    const next = advanceLadder(s, at('2026-11-30'));
    expect(next.ladder!.log.at(-1)!.result).toBe('up');
    // las semanas siguientes cuentan enteras
    const later = advanceLadder(mark(next, 'Leer', '2026-12-03', 4), at('2026-12-07'));
    expect(later.ladder!.finishedOn).toBeUndefined();
    expect(later.ladder!.log.at(-1)).toMatchObject({ result: 'repeat', below: ['Leer'] });
  });

  it('los días de vacaciones de las tarjetas no cuentan como fallo del hábito de Academy', () => {
    let s = addHabit(base(), 'Estudiar', at('2026-11-01'));
    s = { ...s, habits: s.habits.map((h) => (h.name === 'Estudiar' ? { ...h, system: 'academy' as const } : h)) };
    s = createLadder(s, [newStep('rest'), newStep('rest')], MON, at(MON));
    s = mark(s, 'Leer', MON, 7);
    s = { ...s, habitCompletions: [...s.habitCompletions, { id: 'e1', habitId: s.habits.find((h) => h.name === 'Estudiar')!.id, day: MON, at: at(MON) }] };
    const noPause = advanceLadder(s, at('2026-11-30'));
    expect(noPause.ladder!.log.at(-1)).toMatchObject({ result: 'repeat', below: ['Estudiar'] });
    const paused = advanceLadder({ ...s, studyPauses: [{ id: 'p', from: '2026-11-24', until: '2026-11-29' }] }, at('2026-11-30'));
    expect(paused.ladder!.log.at(-1)!.result).toBe('up');
  });
});
