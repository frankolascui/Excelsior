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
