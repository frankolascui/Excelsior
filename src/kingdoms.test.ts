import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, createProfile, emptyState, migrate, totalXp } from './game';
import { addKingdom, buildings, deleteKingdom, kingdomProgress, realmProgress } from './kingdoms';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();

describe('reinos', () => {
  it('cada construcción es una misión y el reino avanza al completarlas', () => {
    let s = addKingdom(createProfile(emptyState(), 'Nico', [], NOW), 'Reino de la Programación', NOW);
    const k = s.kingdoms[0].id;
    expect(kingdomProgress(s, k)).toMatchObject({ total: 0, stage: 'Tierras baldías' });
    s = addQuest(s, 'Terminar una calculadora', 'main', NOW, { kingdomId: k });
    s = addQuest(s, 'Aprender Git', 'side', NOW, { kingdomId: k });
    s = addQuest(s, 'Misión suelta', 'daily', NOW);
    expect(buildings(s, k)).toHaveLength(2);
    expect(kingdomProgress(s, k)).toMatchObject({ stage: 'Campamento', icon: '⛺' });
    s = completeQuest(s, buildings(s, k)[0].id, NOW).state;
    expect(totalXp(s)).toBe(50);
    expect(kingdomProgress(s, k)).toMatchObject({ built: 1, total: 2, progress: 0.5, stage: 'Aldea', complete: false });
    expect(realmProgress(s)).toEqual({ built: 1, total: 2, progress: 0.5 });
    s = completeQuest(s, buildings(s, k)[1].id, NOW).state;
    expect(kingdomProgress(s, k)).toMatchObject({ stage: 'Aldea', complete: true });
  });

  it('borrar un reino quita lo pendiente y conserva lo construido', () => {
    let s = addKingdom(emptyState(), 'R', NOW);
    const k = s.kingdoms[0].id;
    s = addQuest(addQuest(s, 'A', 'main', NOW, { kingdomId: k }), 'B', 'side', NOW, { kingdomId: k });
    s = completeQuest(s, s.quests[0].id, NOW).state;
    s = deleteKingdom(s, k);
    expect(s.quests.map((q) => q.title)).toEqual(['A']);
    expect(s.quests[0].kingdomId).toBeUndefined();
    expect(totalXp(s)).toBe(50);
  });

  it('migra reinos v3 (con progress) a v5', () => {
    const m = migrate({ ...emptyState(), version: 3, kingdoms: [{ id: 'k', name: 'X', progress: 0.2 }] } as never);
    expect(m.version).toBe(5);
    expect(m.goals).toEqual([]);
    expect(Object.keys(m.kingdoms[0]).sort()).toEqual(['createdAt', 'id', 'name']);
  });
});

describe('etapa del reino por número de construcciones', () => {
  it('1 Aldea, 3 Villa, 6 Ciudad amurallada, 10 Reino glorioso', async () => {
    const { nextStage } = await import('./kingdoms');
    expect(nextStage(0)).toMatchObject({ name: 'Aldea', missing: 1 });
    expect(nextStage(4)).toMatchObject({ name: 'Ciudad amurallada', missing: 2 });
    expect(nextStage(10)).toBeNull();
  });
});
