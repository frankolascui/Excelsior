import { describe, expect, it } from 'vitest';
import { emptyState, habitsInOrder } from './game';
import { ACADEMY_HABIT_ID, foundAcademy, recordStudy } from './academy-game';
import type { GameState } from './types';

const NOW = new Date('2026-11-17T20:00:00').getTime();
const run = (cards: number) => ({ startedAt: NOW - cards * 20_000, durations: Array(cards).fill(20_000), cleared: false });

describe('hábito «Repasar las tarjetas»', () => {
  it('una ronda de 8 tarjetas lo marca y baja con los hechos', () => {
    let s = foundAcademy({ ...emptyState(), profile: { name: 'N', createdAt: NOW } } as GameState, NOW);
    s = { ...s, habits: [s.habits.find((h) => h.id === ACADEMY_HABIT_ID)!, { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: NOW, rewards: {} }] };
    expect(recordStudy(s, run(7), NOW).state.habitCompletions).toHaveLength(0);
    const r = recordStudy(s, run(8), NOW);
    expect(r.state.habitCompletions.map((c) => c.habitId)).toEqual([ACADEMY_HABIT_ID]);
    expect(habitsInOrder(r.state, NOW).map((h) => h.id)).toEqual(['h1', ACADEMY_HABIT_ID]);
  });
});
