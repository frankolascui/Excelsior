import { describe, expect, it } from 'vitest';
import { addHabit, dayKey, emptyState, shiftDay, toggleHabit } from './game';
import { progressionText, automatedDue, constancy, habitHints, levelUp, levelUpDue, nextValue, restoreHabit, retireHabit, setProgression, snoozeHint, valueText } from './progression';
import { draftToProgression } from './habits-ui';
import type { GameState } from './types';

const NOW = new Date('2026-11-20T10:00:00').getTime(); // viernes
const D = 86_400_000;

function doneDays(s: GameState, id: string, days: number[]): GameState {
  for (const i of days) s = toggleHabit(s, id, NOW, dayKey(shiftDay(NOW, -i))).state;
  return s;
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('sobrecarga progresiva', () => {
  it('propone subir tras 14 días al 80 % y sube la meta', () => {
    let s = addHabit(emptyState(), 'Meditar', NOW - 40 * D);
    const id = s.habits[0].id;
    s = setProgression(s, id, { kind: 'amount', value: 5, step: 5, unit: 'min' }, NOW - 15 * D);
    s = doneDays(s, id, range(1, 12)); // 12/14 = 86 %
    expect(levelUpDue(s, s.habits[0], NOW)).toBe(10);
    s = levelUp(s, id, NOW);
    expect(s.habits[0].progression).toMatchObject({ value: 10, since: NOW, history: [{ value: 5 }] });
    expect(levelUpDue(s, s.habits[0], NOW)).toBeNull(); // empieza de cero con la nueva meta
  });

  it('por debajo del 80 % o con «Aún no» no propone nada', () => {
    let s = addHabit(emptyState(), 'Meditar', NOW - 40 * D);
    const id = s.habits[0].id;
    s = setProgression(s, id, { kind: 'amount', value: 5, step: 5, unit: 'min' }, NOW - 15 * D);
    s = doneDays(s, id, range(1, 10)); // 10/14 = 71 %
    expect(levelUpDue(s, s.habits[0], NOW)).toBeNull();
    s = doneDays(s, id, [11, 12]);
    s = snoozeHint(s, id, 'level', NOW);
    expect(levelUpDue(s, s.habits[0], NOW)).toBeNull();
    expect(levelUpDue(s, s.habits[0], NOW + 8 * D)).toBeNull(); // ya no hay 14 días seguidos hechos
  });

  it('hora de dormir: adelanta 15 min y no sale del día', () => {
    const p = draftToProgression({ kind: 'time', value: '22:00', step: '15', unit: '', dir: 'earlier', max: '' }, 7)!;
    expect(p).toEqual({ kind: 'time', value: 1320, step: -15 });
    expect(valueText(p, nextValue({ ...p, since: 0 })!)).toBe('a las 21:45');
    expect(nextValue({ kind: 'time', value: 5, step: -15, since: 0 })).toBeNull();
  });

  it('veces por semana: sube hasta cada día', () => {
    let s = addHabit(emptyState(), 'Entrenar', NOW - 60 * D, { perWeek: 6 });
    const id = s.habits[0].id;
    s = setProgression(s, id, draftToProgression({ kind: 'freq', value: '', step: '', unit: '', dir: 'earlier', max: '' }, 6), NOW - 30 * D);
    s = levelUp(s, id, NOW);
    expect(s.habits[0]).toMatchObject({ frequency: 'daily' });
    expect(s.habits[0].perWeek).toBeUndefined();
    expect(nextValue(s.habits[0].progression!)).toBeNull();
  });

  it('constancia de un semanal por semanas completas', () => {
    let s = addHabit(emptyState(), 'Correr', NOW - 40 * D, { perWeek: 3 });
    const id = s.habits[0].id;
    // semanas anteriores (lunes 9 y lunes 2 nov): 3 y 2 veces
    for (const d of ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-03', '2026-11-05']) s = toggleHabit(s, id, NOW, d).state;
    expect(constancy(s, s.habits[0], NOW, 14)).toBeCloseTo(5 / 6);
  });
});

describe('meta final (hasta)', () => {
  it('dormir: adelanta de 15 en 15 hasta las 21:00 y ahí para', () => {
    const p = draftToProgression({ kind: 'time', value: '21:30', step: '20', unit: '', dir: 'earlier', max: '21:00' }, 7)!;
    expect(p).toEqual({ kind: 'time', value: 1290, step: -20, max: 1260 });
    expect(nextValue({ ...p, since: 0 })).toBe(1270);
    expect(nextValue({ ...p, value: 1270, since: 0 })).toBe(1260); // no se pasa
    expect(nextValue({ ...p, value: 1260, since: 0 })).toBeNull();
    // una meta hacia el lado contrario no vale
    expect(draftToProgression({ kind: 'time', value: '21:30', step: '15', unit: '', dir: 'earlier', max: '22:00' }, 7)).not.toHaveProperty('max');
  });

  it('cantidad y veces por semana con tope', () => {
    expect(nextValue({ kind: 'amount', value: 55, step: 10, max: 60, since: 0 })).toBe(60);
    expect(nextValue({ kind: 'amount', value: 60, step: 10, max: 60, since: 0 })).toBeNull();
    const f = draftToProgression({ kind: 'freq', value: '', step: '', unit: '', dir: 'earlier', max: '5' }, 3)!;
    expect(f).toEqual({ kind: 'freq', value: 3, step: 1, max: 5 });
    expect(nextValue({ ...f, value: 5, since: 0 })).toBeNull();
  });

  it('con meta final la fila enseña «ahora → meta»', () => {
    let s = addHabit(emptyState(), 'Dormir', NOW);
    s = setProgression(s, s.habits[0].id, { kind: 'time', value: 1320, step: -15, max: 1260 }, NOW);
    expect(progressionText(s.habits[0])).toBe('a las 22:00 → 21:00');
  });
});

describe('hábito automatizado', () => {
  it('con 90 % en 30 días Hiperión propone retirarlo; se retira y se recupera', () => {
    let s = addHabit(emptyState(), 'Leer', NOW - 40 * D);
    const id = s.habits[0].id;
    s = doneDays(s, id, range(1, 30).filter((i) => i !== 5 && i !== 17)); // 28/30
    expect(automatedDue(s, s.habits[0], NOW)).toBeCloseTo(28 / 30);
    expect(habitHints(s, NOW)).toMatchObject([{ kind: 'auto' }]);
    s = retireHabit(s, id, NOW);
    expect(s.habits).toHaveLength(0);
    expect(s.retiredHabits?.[0]).toMatchObject({ name: 'Leer', retiredAt: NOW });
    expect(s.habitCompletions).toHaveLength(28); // el historial se queda
    s = restoreHabit(s, id);
    expect(s.habits[0].name).toBe('Leer');
    expect(s.habits[0].retiredAt).toBeUndefined();
  });

  it('un hábito con menos de 30 días no cuenta como automatizado', () => {
    let s = addHabit(emptyState(), 'Leer', NOW - 20 * D);
    s = doneDays(s, s.habits[0].id, range(1, 19));
    expect(automatedDue(s, s.habits[0], NOW)).toBeNull();
  });
});

describe('más de una vez al día (opcional)', () => {
  it('8 entrenos: hasta 2 al día, semanal de 8, y al pulsar en el tope se quitan las del día', async () => {
    const { habitDayCount, habitWeekCount, habitSatisfied } = await import('./game');
    let s = addHabit(emptyState(), 'Entrenar', NOW - 30 * D, { perWeek: 8, perDay: 2 });
    const h = s.habits[0];
    expect(h).toMatchObject({ frequency: 'weekly', perWeek: 8, perDay: 2 });
    s = toggleHabit(s, h.id, NOW).state;
    s = toggleHabit(s, h.id, NOW).state;
    expect(habitDayCount(s, h.id, dayKey(NOW))).toBe(2);
    for (const d of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) {
      s = toggleHabit(s, h.id, NOW, d).state;
      s = toggleHabit(s, h.id, NOW, d).state;
    }
    expect(habitWeekCount(s, h.id, NOW)).toBe(10);
    expect(habitSatisfied(s, s.habits[0], NOW)).toBe(true);
    const r = toggleHabit(s, h.id, NOW); // tercera vez hoy: se quitan las dos
    expect(habitDayCount(r.state, h.id, dayKey(NOW))).toBe(0);
    expect(r.xp).toBe(-20);
  });

  it('sin perDay sigue siendo marcar y desmarcar, y no pasa de 6 veces por semana', () => {
    let s = addHabit(emptyState(), 'Leer', NOW, { perWeek: 9 });
    expect(s.habits[0].perWeek).toBe(6);
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    expect(s.habitCompletions).toHaveLength(0);
  });

  it('la sobrecarga de veces por semana puede pasar de 7 con perDay', () => {
    const p = draftToProgression({ kind: 'freq', value: '', step: '', unit: '', dir: 'earlier', max: '8' }, 5, 2)!;
    expect(p).toEqual({ kind: 'freq', value: 5, step: 1, max: 8 });
    let s = addHabit(emptyState(), 'Entrenar', NOW - 30 * D, { perWeek: 6, perDay: 2 });
    const id = s.habits[0].id;
    s = setProgression(s, id, { kind: 'freq', value: 6, step: 1, max: 8 }, NOW - 20 * D);
    s = levelUp(s, id, NOW);
    expect(s.habits[0]).toMatchObject({ frequency: 'weekly', perWeek: 7 }); // 7/sem, no «cada día»
    s = levelUp(s, id, NOW);
    expect(s.habits[0].perWeek).toBe(8);
    expect(nextValue(s.habits[0].progression!)).toBeNull();
  });
});
