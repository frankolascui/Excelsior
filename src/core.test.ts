import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, emptyState, nextRepeatDay, pendingQuests, repeatLabel, scheduledQuests, setQuestRepeat, undoQuest } from './game';

const MON = new Date('2026-10-12T10:00:00').getTime(); // lunes
const D = 86_400_000;

describe('misiones que se repiten', () => {
  it('al completarla aparece la siguiente el próximo día que toca', () => {
    let s = addQuest(emptyState(), 'Responder emails', 'daily', MON, { repeat: [1, 2, 3, 4, 5] });
    s = completeQuest(s, s.quests[0].id, MON).state;
    expect(pendingQuests(s, MON)).toHaveLength(0);
    expect(scheduledQuests(s, MON)).toHaveLength(1);
    expect(scheduledQuests(s, MON)[0].startsOn).toBe('2026-10-13');
    expect(pendingQuests(s, MON + D).map((q) => q.title)).toEqual(['Responder emails']);
  });

  it('salta los días que no tocan (viernes → lunes)', () => {
    expect(nextRepeatDay([1, 2, 3, 4, 5], MON + 4 * D)).toBe('2026-10-19');
    expect(nextRepeatDay([0, 6], MON)).toBe('2026-10-17');
  });

  it('deshacer quita la repetición creada', () => {
    let s = addQuest(emptyState(), 'Gimnasio', 'daily', MON, { repeat: [0, 1, 2, 3, 4, 5, 6] });
    const id = s.quests[0].id;
    s = completeQuest(s, id, MON).state;
    expect(s.quests).toHaveLength(2);
    s = undoQuest(s, id);
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0].completedAt).toBeNull();
    expect(s.quests[0].spawnedId).toBeUndefined();
  });

  it('la copia no hereda la fecha límite y quitar la repetición la para', () => {
    let s = addQuest(emptyState(), 'Leer', 'daily', MON, { repeat: [1], deadline: '2026-10-12' });
    s = completeQuest(s, s.quests[0].id, MON).state;
    expect(s.quests[1].deadline).toBeUndefined();
    s = setQuestRepeat(s, s.quests[1].id, null);
    s = completeQuest(s, s.quests[1].id, MON + 7 * D).state;
    expect(s.quests).toHaveLength(2);
  });

  it('las construcciones de un reino no se repiten', () => {
    const s = addQuest(emptyState(), 'Muralla', 'main', MON, { kingdomId: 'k', repeat: [1] });
    expect(s.quests[0].repeat).toBeUndefined();
  });

  it('nombres de la repetición', () => {
    expect(repeatLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Cada día');
    expect(repeatLabel([5, 1, 2, 3, 4])).toBe('Lunes a viernes');
    expect(repeatLabel([6, 0])).toBe('Fines de semana');
    expect(repeatLabel([0, 1, 3])).toBe('L X D');
  });
});

describe('racha de días activos', () => {
  it('cuenta días seguidos con XP y no se rompe hasta que acaba hoy', async () => {
    const { activeDayStreak } = await import('./core');
    const { addQuest: aq, completeQuest: cq } = await import('./game');
    let s = emptyState();
    for (const d of [3, 2, 1]) {
      s = aq(s, `m${d}`, 'daily', MON - d * D);
      s = cq(s, s.quests.at(-1)!.id, MON - d * D).state;
    }
    expect(activeDayStreak(s, MON)).toEqual({ days: 3, today: false });
    s = aq(s, 'hoy', 'daily', MON);
    s = cq(s, s.quests.at(-1)!.id, MON).state;
    expect(activeDayStreak(s, MON)).toEqual({ days: 4, today: true });
    expect(activeDayStreak(s, MON + 2 * D).days).toBe(0);
  });
});

describe('hábitos: días pasados y escudo de racha', () => {
  it('se puede marcar un día pasado y su XP cuenta ese día', async () => {
    const { addHabit, toggleHabit, isHabitDone, xpOnDay } = await import('./game');
    let s = addHabit(emptyState(), 'Leer', MON - 5 * D);
    const id = s.habits[0].id;
    s = toggleHabit(s, id, MON, '2026-10-10').state;
    expect(isHabitDone(s, id, '2026-10-10')).toBe(true);
    expect(xpOnDay(s, '2026-10-10')).toBe(10);
    expect(xpOnDay(s, '2026-10-12')).toBe(0);
    expect(toggleHabit(s, id, MON, '2026-10-13').state).toBe(s); // el futuro no
  });

  it('un fallo por semana no rompe la racha; dos sí', async () => {
    const { addHabit, toggleHabit, habitStreak, dailyStreakInfo } = await import('./game');
    let s = addHabit(emptyState(), 'Leer', MON - 20 * D);
    const id = s.habits[0].id;
    // hecho del lun 5 al lun 12 salvo el miércoles 7
    for (const d of ['05', '06', '08', '09', '10', '11', '12']) s = toggleHabit(s, id, MON, `2026-10-${d}`).state;
    expect(dailyStreakInfo(s, id, MON)).toEqual({ streak: 7, shields: ['2026-10-07'] });
    // otro fallo la misma semana (viernes 9): el escudo salva el 9 y el 7 corta
    s = toggleHabit(s, id, MON, '2026-10-09').state;
    expect(habitStreak(s, id, MON)).toBe(4); // 12, 11, 10 y 8 (el 9 salvado; el 7 ya no)
  });

  it('ayer fallado con anteayer hecho: la racha sigue viva hoy', async () => {
    const { addHabit, toggleHabit, dailyStreakInfo } = await import('./game');
    let s = addHabit(emptyState(), 'Leer', MON - 20 * D);
    const id = s.habits[0].id;
    for (const d of ['08', '09', '10']) s = toggleHabit(s, id, MON, `2026-10-${d}`).state;
    expect(dailyStreakInfo(s, id, MON)).toEqual({ streak: 3, shields: ['2026-10-11'] });
  });
});

describe('pasos de una misión', () => {
  it('añadir, marcar y quitar pasos', async () => {
    const { addStep, toggleStep, deleteStep, stepProgress } = await import('./core');
    let s = addQuest(emptyState(), 'Examen de Física', 'main', MON);
    const id = s.quests[0].id;
    s = addStep(addStep(addStep(s, id, 'Tema 1'), id, '  '), id, 'Tema 2');
    expect(stepProgress(s.quests[0])).toEqual({ done: 0, total: 2 });
    s = toggleStep(s, id, s.quests[0].steps![0].id);
    expect(stepProgress(s.quests[0])).toEqual({ done: 1, total: 2 });
    for (const x of s.quests[0].steps!) s = deleteStep(s, id, x.id);
    expect(s.quests[0].steps).toBeUndefined();
  });

  it('una misión que se repite empieza con los pasos sin marcar', async () => {
    const { addStep, toggleStep } = await import('./core');
    let s = addQuest(emptyState(), 'Rutina', 'daily', MON, { repeat: [0, 1, 2, 3, 4, 5, 6] });
    const id = s.quests[0].id;
    s = toggleStep(addStep(s, id, 'Estirar'), id, '');
    s = toggleStep(s, id, s.quests[0].steps![0].id);
    s = completeQuest(s, id, MON).state;
    expect(s.quests[1].steps![0].done).toBe(false);
    expect(s.quests[1].steps![0].id).not.toBe(s.quests[0].steps![0].id);
  });
});
