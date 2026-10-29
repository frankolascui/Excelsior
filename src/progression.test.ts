import { describe, expect, it } from 'vitest';
import { addHabit, dayKey, emptyState, shiftDay, toggleHabit } from './game';
import { automatedDue, constancy, habitHints, levelUp, levelUpDue, nextValue, restoreHabit, retireHabit, setProgression, snoozeHint, valueText } from './progression';
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
    const p = draftToProgression({ kind: 'time', value: '22:00', step: '15', unit: '', dir: 'earlier' }, 7)!;
    expect(p).toEqual({ kind: 'time', value: 1320, step: -15 });
    expect(valueText(p, nextValue({ ...p, since: 0 })!)).toBe('a las 21:45');
    expect(nextValue({ kind: 'time', value: 5, step: -15, since: 0 })).toBeNull();
  });

  it('veces por semana: sube hasta cada día', () => {
    let s = addHabit(emptyState(), 'Entrenar', NOW - 60 * D, { perWeek: 6 });
    const id = s.habits[0].id;
    s = setProgression(s, id, draftToProgression({ kind: 'freq', value: '', step: '', unit: '', dir: 'earlier' }, 6), NOW - 30 * D);
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
