// Reinos: proyectos que se construyen como una ciudad. Cada construcción es una misión
// normal (con kingdomId), así que da XP y atributos igual que cualquier otra.
import type { GameState, Quest, QuestType } from './types';
import { uid } from './game';

export const BUILDINGS: Record<QuestType, { name: string; icon: string }> = {
  side: { name: 'Casa', icon: '🏠' },
  daily: { name: 'Taller', icon: '⚒️' },
  main: { name: 'Torre', icon: '🗼' },
};

export function addKingdom(s: GameState, name: string, now: number): GameState {
  return { ...s, kingdoms: [...s.kingdoms, { id: uid(), name: name.trim(), createdAt: now }] };
}

/** Borra el reino y sus construcciones pendientes; las ya construidas se conservan (su XP sigue en el historial). */
export function deleteKingdom(s: GameState, id: string): GameState {
  return {
    ...s,
    kingdoms: s.kingdoms.filter((k) => k.id !== id),
    quests: s.quests
      .filter((q) => !(q.kingdomId === id && !q.completedAt))
      .map((q) => (q.kingdomId === id ? { ...q, kingdomId: undefined } : q)),
  };
}

export function buildings(s: GameState, kingdomId: string): Quest[] {
  return s.quests.filter((q) => q.kingdomId === kingdomId);
}

const STAGES: [number, string][] = [
  [1, 'Reino completado'],
  [0.67, 'Ciudad'],
  [0.34, 'Pueblo'],
  [0.0001, 'Aldea'],
  [0, 'Solar vacío'],
];

export function kingdomProgress(s: GameState, kingdomId: string) {
  const all = buildings(s, kingdomId);
  const built = all.filter((q) => q.completedAt).length;
  const progress = all.length ? built / all.length : 0;
  const stage = all.length === 0 ? 'Solar vacío' : STAGES.find(([min]) => progress >= min)![1];
  return { built, total: all.length, progress, stage, complete: all.length > 0 && built === all.length };
}

export function kingdomName(s: GameState, id: string | undefined): string | undefined {
  return id ? s.kingdoms.find((k) => k.id === id)?.name : undefined;
}
