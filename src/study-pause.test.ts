import { describe, expect, it } from 'vitest';
import {
  createProfile, currentStudyPause, dayKey, emptyState, endStudyPause, habitAtRisk, habitStreak, markPauseShifted,
  pausesToShift, shiftDay, startStudyPause, studyPausedOn,
} from './game';
import { foundAcademy, ACADEMY_HABIT_ID } from './academy-game';
import { shieldableDay } from './economy';
import type { GameState } from './types';

const NOW = new Date(2026, 10, 18, 10, 0).getTime(); // 18 nov 2026
const day = (n: number) => dayKey(shiftDay(NOW, n));

function base(): GameState {
  return foundAcademy(createProfile(emptyState(), 'Nico', [], NOW - 30 * 86_400_000), NOW - 30 * 86_400_000);
}
const done = (s: GameState, days: number[]) => ({
  ...s,
  habitCompletions: [...s.habitCompletions, ...days.map((n) => ({ id: `c${n}`, habitId: ACADEMY_HABIT_ID, day: day(n), at: shiftDay(NOW, n) }))],
});

describe('pausa de las tarjetas', () => {
  it('los días de pausa ni suman ni rompen la racha', () => {
    // hecho del día -10 al -6, pausa del -5 al -1, hoy hecho
    let s = done(base(), [-10, -9, -8, -7, -6, 0]);
    s = { ...s, studyPauses: [{ id: 'p', from: day(-5), until: day(-1) }] };
    expect(habitStreak(s, ACADEMY_HABIT_ID, NOW)).toBe(6);
    // sin la pausa se habría roto
    expect(habitStreak({ ...s, studyPauses: [] }, ACADEMY_HABIT_ID, NOW)).toBe(1);
  });

  it('el día de vuelta aún no hecho no pone la racha en peligro, y al día siguiente sí', () => {
    let s = done(base(), [-8, -7, -6]);
    s = { ...s, studyPauses: [{ id: 'p', from: day(-5), until: day(-1) }] };
    const h = s.habits.find((x) => x.id === ACADEMY_HABIT_ID)!;
    expect(habitStreak(s, ACADEMY_HABIT_ID, NOW)).toBe(3);
    expect(habitAtRisk(s, h, NOW)).toBeNull();
    // mañana sin haberlo hecho hoy: hoy fue el día fallado
    const tomorrow = shiftDay(NOW, 1);
    expect(habitAtRisk(s, h, tomorrow)).toBe(day(0));
    expect(habitStreak(s, ACADEMY_HABIT_ID, tomorrow)).toBe(3); // aún se salva mañana
  });

  it('en plena pausa abierta la racha se conserva y no hay escudo que gastar', () => {
    let s = done(base(), [-4, -3]);
    s = startStudyPause(s, day(-2), null, shiftDay(NOW, -2));
    expect(studyPausedOn(s, day(0))).toBe(true);
    expect(habitStreak(s, ACADEMY_HABIT_ID, NOW)).toBe(2);
    expect(shieldableDay(s, ACADEMY_HABIT_ID, NOW)).toBeNull();
  });

  it('reanudar antes de tiempo cierra la pausa y calcula los días a mover', () => {
    let s = startStudyPause(base(), day(-4), day(5), shiftDay(NOW, -4));
    expect(currentStudyPause(s, NOW)?.until).toBe(day(5));
    s = endStudyPause(s, NOW);
    expect(currentStudyPause(s, NOW)).toBeNull();
    expect(studyPausedOn(s, day(-1))).toBe(true);
    expect(studyPausedOn(s, day(0))).toBe(false);
    // aún es hoy: se moverá mañana o ya, al abrir Academy (el último día en pausa fue ayer)
    const list = pausesToShift(s, NOW);
    expect(list.map((x) => x.days)).toEqual([4]);
    s = markPauseShifted(s, list[0].pause.id, 4);
    expect(pausesToShift(s, NOW)).toEqual([]);
  });

  it('una pausa con fecha de fin se mueve cuando pasa, con todos sus días', () => {
    const s = startStudyPause(base(), day(-7), day(-3), shiftDay(NOW, -7));
    expect(pausesToShift(s, NOW).map((x) => x.days)).toEqual([5]);
    expect(pausesToShift(s, shiftDay(NOW, -3))).toEqual([]); // el último día aún está en pausa
  });

  it('una pausa programada que no ha empezado se puede quitar sin dejar rastro', () => {
    let s = startStudyPause(base(), day(3), day(10), NOW);
    expect(studyPausedOn(s, day(0))).toBe(false);
    expect(currentStudyPause(s, NOW)?.from).toBe(day(3));
    s = endStudyPause(s, NOW);
    expect(s.studyPauses).toEqual([]);
  });

  it('solo afecta al hábito de repasar', () => {
    let s = createProfile(emptyState(), 'Nico', ['Leer'], NOW - 30 * 86_400_000);
    const id = s.habits[0].id;
    s = { ...s, habitCompletions: [-8, -7, -6].map((n) => ({ id: `c${n}`, habitId: id, day: day(n), at: shiftDay(NOW, n) })), studyPauses: [{ id: 'p', from: day(-5), until: day(-1) }] };
    expect(habitStreak(s, id, NOW)).toBe(0);
  });
});
