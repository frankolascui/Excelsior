import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, createProfile, dayKey, deleteQuest, emptyState, migrate, pendingQuests, undoQuest } from './game';
import { addSubQuest, splitIntoSessions } from './tree-actions';
import { effectiveDeadline, isLeaf, pathLabel, treeProgress } from './tree';
import { priorityCandidates, setQuestImpact } from './priorities';
import type { GameState } from './types';

const NOW = new Date(2026, 10, 9, 10, 0).getTime(); // lunes
const DAY = 86_400_000;
const find = (s: GameState, t: string) => s.quests.find((q) => q.title === t)!;

/** Académico › Mates: 10 de media › Examen tema 4 (vence en 4 días) › Sesión 1..3 */
function mates(): GameState {
  let s = createProfile(emptyState(), 'Nico', [], NOW);
  s = addQuest(s, 'Mates: 10 de media', 'main', NOW, { impact: 'alto' });
  s = addSubQuest(s, find(s, 'Mates: 10 de media').id, 'Examen tema 4', NOW + 1);
  s = { ...s, quests: s.quests.map((q) => (q.title === 'Examen tema 4' ? { ...q, deadline: dayKey(NOW + 4 * DAY) } : q)) };
  return s;
}

describe('árbol de misiones', () => {
  it('las submisiones heredan impacto y fecha, y llevan su ruta', () => {
    let s = mates();
    s = addSubQuest(s, find(s, 'Examen tema 4').id, 'Derivadas: ej. 1–15', NOW + 2);
    const leaf = find(s, 'Derivadas: ej. 1–15');
    expect(leaf.impact).toBe('alto');
    expect(effectiveDeadline(s, leaf)).toBe(dayKey(NOW + 4 * DAY));
    expect(pathLabel(s, leaf)).toBe('Mates: 10 de media › Examen tema 4');
  });

  it('solo las hojas van a tu día', () => {
    let s = mates();
    s = addQuest(s, 'Leer 20 páginas', 'daily', NOW + 5, { impact: 'medio' });
    expect(pendingQuests(s, NOW).map((q) => q.title)).toEqual(['Examen tema 4', 'Leer 20 páginas']);
    s = addSubQuest(s, find(s, 'Examen tema 4').id, 'Integrales', NOW + 6);
    expect(pendingQuests(s, NOW).map((q) => q.title)).toEqual(['Integrales', 'Leer 20 páginas']);
    expect(priorityCandidates(s, dayKey(NOW)).map((q) => q.title)).toEqual(['Integrales', 'Leer 20 páginas']);
  });

  it('una sesión de un examen cercano pasa por delante aunque su impacto sea menor', () => {
    let s = mates();
    s = addQuest(s, 'Proyecto personal', 'main', NOW + 5, { impact: 'alto' });
    s = addSubQuest(s, find(s, 'Examen tema 4').id, 'Simulacro', NOW + 6);
    s = setQuestImpact(s, find(s, 'Simulacro').id, 'medio');
    expect(pendingQuests(s, NOW + 2 * DAY)[0].title).toBe('Simulacro');
  });

  it('no se cierra con hijas pendientes ni sola: cuando todas están hechas, la cierras tú', () => {
    let s = mates();
    const exam = find(s, 'Examen tema 4').id;
    s = addSubQuest(s, exam, 'A', NOW);
    expect(completeQuest(s, exam, NOW).xp).toBe(0);
    s = completeQuest(s, find(s, 'A').id, NOW).state;
    expect(find(s, 'Examen tema 4').completedAt).toBeNull();
    expect(isLeaf(s, find(s, 'Examen tema 4'))).toBe(true);
    const r = completeQuest(s, exam, NOW);
    expect(r.xp).toBe(50);
    // deshacer la hija vuelve a abrir la de arriba y le quita su XP
    const u = undoQuest(r.state, find(s, 'A').id);
    expect(find(u, 'Examen tema 4').completedAt).toBeNull();
    expect(u.xp.some((t) => t.sourceId === exam)).toBe(false);
  });

  it('borrar una misión borra sus submisiones', () => {
    let s = mates();
    s = addSubQuest(s, find(s, 'Examen tema 4').id, 'A', NOW);
    s = deleteQuest(s, find(s, 'Mates: 10 de media').id);
    expect(s.quests).toHaveLength(0);
  });

  it('progreso cuenta las hojas a cualquier profundidad', () => {
    let s = mates();
    const exam = find(s, 'Examen tema 4').id;
    s = addSubQuest(s, exam, 'A', NOW);
    s = addSubQuest(s, exam, 'B', NOW + 1);
    s = completeQuest(s, find(s, 'A').id, NOW).state;
    expect(treeProgress(s, find(s, 'Mates: 10 de media').id)).toEqual({ done: 1, total: 2 });
  });

  it('repartir sesiones las reparte hasta el día antes de la fecha', () => {
    let s = mates();
    s = splitIntoSessions(s, find(s, 'Examen tema 4').id, 4, NOW);
    const ses = s.quests.filter((q) => q.title.startsWith('Sesión'));
    expect(ses.map((q) => q.title)).toEqual(['Sesión 1', 'Sesión 2', 'Sesión 3', 'Sesión 4']);
    expect(ses.map((q) => q.startsOn ?? dayKey(NOW))).toEqual([0, 1, 2, 3].map((d) => dayKey(NOW + d * DAY)));
    expect(pendingQuests(s, NOW).map((q) => q.title)).toEqual(['Sesión 1']);
    // la numeración sigue
    s = splitIntoSessions(s, find(s, 'Examen tema 4').id, 1, NOW);
    expect(s.quests.at(-1)!.title).toBe('Sesión 5');
  });

  it('los pasos antiguos pasan a ser submisiones al cargar', () => {
    const old = mates();
    const q = { ...find(old, 'Examen tema 4'), steps: [{ id: 's1', title: 'Tema 1', done: true }, { id: 's2', title: 'Tema 2', done: false, deadline: '2026-11-11' }] };
    const s = migrate({ ...old, quests: old.quests.map((x) => (x.id === q.id ? q : x)) } as never);
    expect(find(s, 'Examen tema 4').steps).toBeUndefined();
    expect(find(s, 'Tema 1')).toMatchObject({ parentId: q.id });
    expect(find(s, 'Tema 1').completedAt).not.toBeNull();
    expect(find(s, 'Tema 2')).toMatchObject({ parentId: q.id, completedAt: null, deadline: '2026-11-11' });
    expect(migrate(s as never).quests).toHaveLength(s.quests.length);
  });
});
