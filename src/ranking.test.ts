import { describe, expect, it } from 'vitest';
import { createProfile, emptyState } from './game';
import { publicFields, type PublicProfile } from './social';
import type { GameState, XPSource } from './types';
import { addWeeks, lastWeekChampion, rankRows, statsFor, weekEndsIn, weekKey, weekStart, weekStats } from './ranking';

const NOW = new Date(2026, 9, 7, 10, 0).getTime(); // miércoles 7 de octubre
const MON = new Date(2026, 9, 5).getTime();
const LAST = new Date(2026, 8, 28, 12).getTime(); // la semana anterior

const xp = (at: number, amount: number, source: XPSource = 'quest') => ({ id: `x${at}${amount}`, at, amount, source, sourceId: 'q', label: 'x' });

function played(): GameState {
  const s = createProfile(emptyState(), 'Nicolas', [], NOW);
  return {
    ...s,
    xp: [xp(NOW - 3600_000, 50), xp(NOW, 1000, 'admin'), xp(MON + 1, 20, 'habit'), xp(LAST, 30)],
    sessions: [{ id: 's1', questId: null, label: 'Foco', area: 'general', startedAt: NOW - 3000_000, endedAt: NOW, minutes: 45 }],
    habitCompletions: [{ id: 'h1', habitId: 'h', day: '2026-10-06', at: MON + 86_400_000 }, { id: 'h2', habitId: 'h', day: '2026-09-29', at: LAST }],
  };
}

function person(id: string, name: string, week: number | null, prev = 0, total = 0): PublicProfile {
  const stats = week === null ? {} : {
    week: { key: '2026-10-05', xp: week, deep: 0, habits: 0 },
    prev: { key: '2026-09-28', xp: prev, deep: 0, habits: 0 },
  };
  return { user_id: id, tag: `${name}#0001`, name, bio: '', photo: null, level: 1, xp: total, avatar_index: 0, avatar_name: 'Aprendiz', stats };
}

describe('semanas de lunes a domingo', () => {
  it('empiezan el lunes a las 00:00', () => {
    expect(weekStart(NOW)).toBe(MON);
    expect(weekStart(new Date(2026, 9, 11, 23, 59).getTime())).toBe(MON);
    expect(weekStart(new Date(2026, 9, 12).getTime())).toBe(new Date(2026, 9, 12).getTime());
    expect(weekKey(NOW)).toBe('2026-10-05');
    expect(weekKey(addWeeks(weekStart(NOW), -1))).toBe('2026-09-28');
  });

  it('cuenta lo que queda para el lunes', () => {
    expect(weekEndsIn(NOW)).toBe('Termina en 4 d 14 h');
    expect(weekEndsIn(new Date(2026, 9, 11, 22, 30).getTime())).toBe('Termina en 2 h');
  });
});

describe('lo que se publica de cada semana', () => {
  it('XP sin el del modo admin, minutos de foco y hábitos', () => {
    expect(weekStats(played(), MON)).toEqual({ key: '2026-10-05', xp: 70, deep: 45, habits: 1 });
    expect(weekStats(played(), addWeeks(MON, -1))).toEqual({ key: '2026-09-28', xp: 30, deep: 0, habits: 1 });
  });

  it('va en el perfil público', () => {
    const f = publicFields(played(), NOW);
    expect(f.stats.week).toMatchObject({ key: '2026-10-05', xp: 70 });
    expect(f.stats.prev).toMatchObject({ key: '2026-09-28', xp: 30 });
  });

  it('quien no ha entrado esta semana cuenta 0', () => {
    expect(statsFor(person('a', 'Ana', 80, 10), '2026-10-05').xp).toBe(80);
    expect(statsFor(person('a', 'Ana', 80, 10), '2026-09-28').xp).toBe(10);
    expect(statsFor(person('a', 'Ana', 80, 10), '2026-10-12')).toEqual({ key: '2026-10-12', xp: 0, deep: 0, habits: 0 });
    expect(statsFor(person('b', 'Bea', null), '2026-10-05').xp).toBe(0);
  });
});

describe('clasificación', () => {
  const people = [person('c', 'Carla', 40, 90, 500), person('b', 'Bruno', 100, 20, 300), person('a', 'Ana', 100, 90, 900), person('d', 'Dani', null, 0, 50)];

  it('los empates comparten puesto y se ordenan por nombre', () => {
    const rows = rankRows(people, 'week', NOW);
    expect(rows.map((r) => [r.p.name, r.place, r.value])).toEqual([['Ana', 1, 100], ['Bruno', 1, 100], ['Carla', 3, 40], ['Dani', 4, 0]]);
  });

  it('semana pasada y siempre', () => {
    expect(rankRows(people, 'last', NOW).map((r) => r.p.name)).toEqual(['Ana', 'Carla', 'Bruno', 'Dani']);
    const all = rankRows(people, 'all', NOW);
    expect(all.map((r) => r.p.name)).toEqual(['Ana', 'Carla', 'Bruno', 'Dani']);
    expect(all[0].week).toBeNull();
  });

  it('la corona es para quien ganó solo la semana pasada', () => {
    expect(lastWeekChampion(people, NOW)).toBeNull(); // Ana y Carla empataron
    expect(lastWeekChampion([person('a', 'Ana', 0, 90), person('b', 'Bruno', 0, 20)], NOW)).toBe('a');
    expect(lastWeekChampion([person('a', 'Ana', 50, 0), person('b', 'Bruno', 0, 0)], NOW)).toBeNull();
    expect(lastWeekChampion([], NOW)).toBeNull();
  });
});
