import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, dayKey, emptyState, nextRepeatDay, pendingQuests, repeatLabel, scheduledQuests, setQuestRepeat, startTimer, stopTimer, totalXp, undoQuest } from './game';
import { deleteSession, editSession, focusForEnd, sessionEndAt } from './core';

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

describe('reinos', () => {
  it('renombrar, fecha objetivo y tramo hacia la siguiente etapa', async () => {
    const { addKingdom, renameKingdom, setKingdomDeadline, nextStage } = await import('./kingdoms');
    let s = addKingdom(emptyState(), 'Reino X', MON);
    const id = s.kingdoms[0].id;
    s = renameKingdom(s, id, '  Reino de la Física ');
    expect(s.kingdoms[0].name).toBe('Reino de la Física');
    expect(renameKingdom(s, id, '   ')).toBe(s);
    s = setKingdomDeadline(s, id, '2026-12-01');
    expect(s.kingdoms[0].deadline).toBe('2026-12-01');
    expect(setKingdomDeadline(s, id, null).kingdoms[0].deadline).toBeUndefined();
    expect(nextStage(4)).toMatchObject({ name: 'Ciudad amurallada', missing: 2 });
    expect(nextStage(4)!.ratio).toBeCloseTo(1 / 3);
    expect(nextStage(10)).toBeNull();
  });
});

describe('corregir una sesión de Deep Work', () => {
  // empezó el lunes a las 22:00 y se quedó encendida hasta las 9:00 del martes
  const start = new Date('2026-10-12T22:00:00').getTime();
  const forgotten = () => stopTimer(startTimer(emptyState(), null, 0, start, { intent: 'Leer el tema 4' }), start + 11 * 60 * 60_000).state;

  it('la hora de fin se busca desde el inicio (puede ser al día siguiente)', () => {
    const x = forgotten().sessions[0];
    expect(dayKey(sessionEndAt(x, '23:30'))).toBe('2026-10-12');
    expect(dayKey(sessionEndAt(x, '01:15'))).toBe('2026-10-13');
  });

  it('al poner la hora real rehace los minutos y el XP, fechado al nuevo fin', () => {
    let s = forgotten();
    const x = s.sessions[0];
    expect(x.minutes).toBe(240); // el tope de una sesión
    const end = sessionEndAt(x, '23:30');
    expect(focusForEnd(x, end)).toBe(90);
    s = editSession(s, x.id, { endedAt: end, minutes: focusForEnd(x, end) });
    expect(s.sessions[0].minutes).toBe(90);
    expect(s.sessions[0].measured).toEqual({ minutes: 240, endedAt: x.endedAt });
    const tx = s.xp.find((t) => t.sourceId === x.id)!;
    expect(tx.amount).toBe(90);
    expect(dayKey(tx.at)).toBe('2026-10-12');
    expect(totalXp(s)).toBe(90);
  });

  it('solo quita tiempo: no pasa de lo medido ni del rato entre inicio y fin', () => {
    let s = forgotten();
    const x = s.sessions[0];
    s = editSession(s, x.id, { endedAt: x.endedAt + 60 * 60_000, minutes: 500 });
    expect(s.sessions[0].minutes).toBe(240);
    expect(s.sessions[0].endedAt).toBe(x.endedAt);
    s = editSession(s, x.id, { endedAt: sessionEndAt(x, '22:30'), minutes: 200 });
    expect(s.sessions[0].minutes).toBe(30);
    // se puede volver a subir hasta lo medido
    s = editSession(s, x.id, { endedAt: x.endedAt, minutes: 240 });
    expect(s.sessions[0].minutes).toBe(240);
  });

  it('borrar la sesión quita también su XP', () => {
    let s = forgotten();
    s = deleteSession(s, s.sessions[0].id);
    expect(s.sessions).toHaveLength(0);
    expect(totalXp(s)).toBe(0);
  });
});

describe('corregir sin tocar nada', () => {
  it('la hora de fin tal cual no recorta un minuto por los segundos', () => {
    const start = new Date('2026-10-12T09:50:10').getTime();
    const s = stopTimer(startTimer(emptyState(), null, 0, start), start + 180 * 60_000).state;
    const x = s.sessions[0];
    expect(sessionEndAt(x, '12:50')).toBe(x.endedAt);
    expect(editSession(s, x.id, { endedAt: sessionEndAt(x, '12:50'), minutes: 180 })).toBe(s);
  });
});

describe('misiones prehechas', () => {
  it('se añaden con su tipo y atributos, y las propias se guardan y borran', async () => {
    const { TEMPLATE_GROUPS, addFromTemplate, saveTemplate, deleteTemplate, hasPending } = await import('./quest-templates');
    const { questAttributeRewards } = await import('./game');
    const tpl = TEMPLATE_GROUPS.find((g) => g.id === 'personas')!.items.find((x) => x.id === 'per-nuevo')!;
    let s = addFromTemplate(emptyState(), tpl, MON);
    expect(s.quests[0]).toMatchObject({ title: 'Hablar con alguien nuevo', type: 'daily', rewards: { conexion: 4, voluntad: 2 } });
    expect(questAttributeRewards(s.quests[0]).conexion).toBe(4);
    expect(hasPending(s, ' hablar con alguien NUEVO')).toBe(true);
    s = saveTemplate(s, { title: 'Clase de violín', type: 'side', rewards: { maestria: 3 }, xp: 999 });
    expect(s.questTemplates![0]).toMatchObject({ title: 'Clase de violín', xp: 100 });
    s = deleteTemplate(s, s.questTemplates![0].id);
    expect(s.questTemplates).toEqual([]);
  });

  it('ninguna plantilla se pasa de los límites de lo personalizable', async () => {
    const { TEMPLATE_GROUPS } = await import('./quest-templates');
    const ids = new Set<string>();
    for (const tpl of TEMPLATE_GROUPS.flatMap((g) => g.items)) {
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
      for (const v of Object.values(tpl.rewards)) expect(v).toBeLessThanOrEqual(20);
    }
  });
});
