import { describe, expect, it } from 'vitest';
import { addHabit, emptyState, toggleHabit, addQuest } from './game';
import { deepEq, mergeStates } from './merge';
import type { GameState } from './types';

const NOW = new Date('2026-11-16T10:00:00').getTime();
const base0 = (): GameState => {
  let s = { ...emptyState(), profile: { name: 'N', createdAt: NOW } } as GameState;
  s = addHabit(s, 'Leer', NOW);
  s = addHabit(s, 'Meditar', NOW);
  return s;
};

describe('unir partidas de dos dispositivos', () => {
  it('lo hecho en cada lado se suma sin preguntar', () => {
    const base = base0();
    const local = toggleHabit(base, base.habits[0].id, NOW).state; // aquí: Leer
    const remote = toggleHabit(base, base.habits[1].id, NOW).state; // en el móvil: Meditar
    const { state, conflicts } = mergeStates(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(state.habitCompletions.map((c) => c.habitId).sort()).toEqual([base.habits[0].id, base.habits[1].id].sort());
    expect(state.xp).toHaveLength(2);
  });

  it('lo que la app marca sola en los dos lados no se duplica (ni su XP)', () => {
    const base = base0();
    const id = base.habits[0].id;
    const local = toggleHabit(base, id, NOW).state;
    const remote = toggleHabit(base, id, NOW + 1000).state; // mismo día, id distinto
    const { state, conflicts } = mergeStates(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(state.habitCompletions).toHaveLength(1);
    expect(state.xp).toHaveLength(1);
    expect(state.xp[0].sourceId).toBe(state.habitCompletions[0].id);
  });

  it('un borrado en un lado se respeta; un cambio no se pierde', () => {
    const base = addQuest(base0(), 'Tarea', 'side', NOW);
    const q = base.quests[0];
    const local = { ...base, quests: [] };
    const remote = { ...base, profile: { ...base.profile!, name: 'Nico' } };
    const r = mergeStates(base, local, remote);
    expect(r.state.quests).toHaveLength(0);
    expect(r.state.profile!.name).toBe('Nico');
    const edited = { ...base, quests: [{ ...q, title: 'Tarea cambiada' }] };
    expect(mergeStates(base, local, edited).state.quests[0].title).toBe('Tarea cambiada');
  });

  it('el orden de las claves que devuelve la base de datos no cuenta como cambio', () => {
    const base = base0();
    const rev = (x: unknown): unknown => Array.isArray(x) ? x.map(rev) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, rev(v)])) : x;
    const shuffled = rev(JSON.parse(JSON.stringify(base))) as GameState;
    expect(deepEq(base, shuffled)).toBe(true);
    const local = { ...base, tours: ['intro'] };
    const { state, conflicts } = mergeStates(base, local, shuffled);
    expect(conflicts).toEqual([]);
    expect(state.tours).toEqual(['intro']);
  });

  it('reordenar hábitos aquí se mantiene aunque la nube añada uno', () => {
    const base = base0();
    const local = { ...base, habits: [base.habits[1], base.habits[0]] };
    const remote = addHabit(base, 'Correr', NOW);
    const { state } = mergeStates(base, local, remote);
    expect(state.habits.map((h) => h.name)).toEqual(['Meditar', 'Leer', 'Correr']);
  });

  it('solo pregunta si el mismo dato cambió distinto en los dos lados', () => {
    const base = base0();
    const local = { ...base, profile: { ...base.profile!, name: 'A' } };
    const remote = { ...base, profile: { ...base.profile!, name: 'B' } };
    expect(mergeStates(base, local, remote).conflicts).toEqual(['profile.name']);
    // las novedades vistas solo crecen: gana la mayor
    const a = mergeStates({ ...base, newsSeen: '3.0' }, { ...base, newsSeen: '3.1' }, { ...base, newsSeen: '3.0.1' });
    expect(a.conflicts).toEqual([]);
    expect(a.state.newsSeen).toBe('3.1');
  });
});
