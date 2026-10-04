import { describe, expect, it } from 'vitest';
import { addHabit, addQuest, completeQuest, createProfile, emptyState, startTimer, stopTimer, toggleHabit } from './game';
import { activeDayStreak, activityByDay, bestDayStreak, heatLevel, niceTicks } from './activity';
import { attributeXp, habitRewards, questRewards } from './attributes';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();
const DAY = 86_400_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('actividad diaria', () => {
  it('agrupa XP, misiones, hábitos y Deep Work por día', () => {
    let s = addHabit(addQuest(base(), 'A', 'main', NOW), 'Meditar', NOW);
    s = completeQuest(s, s.quests[0].id, NOW - DAY).state;
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    s = stopTimer(startTimer(s, null, 0, NOW), NOW + 30 * 60_000).state;
    const days = activityByDay(s, NOW, 7);
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ day: '2026-10-04', xp: 40, habits: 1, quests: 0, deepWork: 30 });
    expect(days[5]).toMatchObject({ day: '2026-10-03', xp: 50, quests: 1 });
    expect(activeDayStreak(days)).toBe(2);
    expect(bestDayStreak(days)).toBe(2);
  });

  it('la racha de días activos no se rompe si hoy aún no hay XP', () => {
    const d = (xp: number) => ({ day: '', ts: 0, xp, quests: 0, habits: 0, deepWork: 0 });
    expect(activeDayStreak([d(5), d(0), d(3), d(4), d(0)])).toBe(2);
    expect(bestDayStreak([d(1), d(1), d(1), d(0), d(1)])).toBe(3);
  });

  it('intensidad de los cuadraditos y marcas del eje', () => {
    expect([0, 1, 25, 26, 100].map((x) => heatLevel(x, 100))).toEqual([0, 1, 1, 2, 4]);
    expect(niceTicks(50)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(230)).toEqual([0, 100, 200, 300]);
  });
});

describe('atributo elegido a mano', () => {
  it('sustituye a la deducción por el nombre', () => {
    expect(questRewards('side', 'Llamar a mi abuela', 'creacion')).toEqual({ voluntad: 3, creacion: 3 });
    expect(habitRewards('Entrenar', 'sabiduria')).toEqual({ sabiduria: 4 });
    let s = addQuest(base(), 'Algo', 'main', NOW, undefined, 'conexion');
    s = completeQuest(s, s.quests[0].id, NOW).state;
    expect(attributeXp(s)).toMatchObject({ voluntad: 5, maestria: 5, conexion: 3 });
  });
});
