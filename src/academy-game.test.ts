import { describe, expect, it } from 'vitest';
import { emptyState, FOCUS_HABIT_ID, habitsInOrder, migrate, setFocusHabit, startTimer, stopTimer } from './game';
import { ACADEMY_HABIT_ID, foundAcademy, recordExam, recordStudy } from './academy-game';
import type { GameState } from './types';

const NOW = new Date('2026-11-17T20:00:00').getTime();
const run = (cards: number) => ({ startedAt: NOW - cards * 20_000, durations: Array(cards).fill(20_000), cleared: false });

describe('hábito «Estudiar»', () => {
  it('una ronda de 8 tarjetas lo marca y baja con los hechos', () => {
    let s = foundAcademy({ ...emptyState(), profile: { name: 'N', createdAt: NOW } } as GameState, NOW);
    s = { ...s, habits: [s.habits.find((h) => h.id === ACADEMY_HABIT_ID)!, { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: NOW, rewards: {} }] };
    expect(recordStudy(s, run(7), NOW).state.habitCompletions).toHaveLength(0);
    const r = recordStudy(s, run(8), NOW);
    expect(r.state.habitCompletions.map((c) => c.habitId)).toEqual([ACADEMY_HABIT_ID]);
    expect(habitsInOrder(r.state, NOW).map((h) => h.id)).toEqual(['h1', ACADEMY_HABIT_ID]);
  });
});

describe('simulacros y racha de Academy', () => {
  const base = () => foundAcademy({ ...emptyState(), profile: { name: 'N', createdAt: NOW } } as GameState, NOW);
  it('entregar un simulacro marca «Estudiar» y su tiempo es Deep Work de estudio', () => {
    const r = recordExam(base(), { label: 'Mates · Simulacro 1', startedAt: NOW - 45 * 60_000, seconds: 45 * 60 }, NOW);
    expect(r.state.habitCompletions.map((c) => c.habitId)).toEqual([ACADEMY_HABIT_ID]);
    expect(r.state.sessions).toHaveLength(1);
    expect(r.state.sessions[0]).toMatchObject({ area: 'estudio', minutes: 45, label: 'Simulacro · Mates · Simulacro 1' });
    expect(r.xp).toBeGreaterThan(45);
  });
  it('en papel marca el hábito sin inventar minutos, y no marca dos veces el mismo día', () => {
    const r = recordExam(base(), { label: 'Física', startedAt: NOW, seconds: null }, NOW);
    expect(r.state.sessions).toHaveLength(0);
    expect(r.state.habitCompletions).toHaveLength(1);
    expect(recordExam(r.state, { label: 'Física 2', startedAt: NOW, seconds: null }, NOW + 1000).state.habitCompletions).toHaveLength(1);
  });
  it('las partidas viejas pasan de «Repasar las tarjetas» a «Estudiar»', () => {
    const old = { ...base(), habits: base().habits.map((h) => ({ ...h, name: 'Repasar las tarjetas' })) };
    expect(migrate(old as unknown as Parameters<typeof migrate>[0]).habits.find((h) => h.id === ACADEMY_HABIT_ID)?.name).toBe('Estudiar');
  });
});

describe('hábito de Deep Work', () => {
  const base = { ...emptyState(), profile: { name: 'N', createdAt: NOW } } as GameState;
  it('se marca solo al sumar los minutos del día, entre sesiones', () => {
    let s = setFocusHabit(base, 60, NOW).state;
    expect(s.habits.find((h) => h.id === FOCUS_HABIT_ID)).toMatchObject({ system: 'deepwork', focusMin: 60 });
    s = startTimer(s, null, 0, NOW - 40 * 60_000);
    s = stopTimer(s, NOW - 5 * 60_000).state;
    expect(s.habitCompletions).toHaveLength(0);
    s = recordStudy(s, { startedAt: NOW - 30 * 60_000, durations: Array(20).fill(90_000), cleared: false }, NOW).state; // 30 min de repaso
    expect(s.habitCompletions.map((c) => c.habitId)).toContain(FOCUS_HABIT_ID);
  });
  it('bajar los minutos lo marca si hoy ya llegas', () => {
    let s = setFocusHabit(base, 120, NOW).state;
    s = startTimer(s, null, 0, NOW - 50 * 60_000);
    s = stopTimer(s, NOW).state;
    expect(s.habitCompletions).toHaveLength(0);
    expect(setFocusHabit(s, 45, NOW).state.habitCompletions.map((c) => c.habitId)).toEqual([FOCUS_HABIT_ID]);
  });
});
