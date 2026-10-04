// Reinos: proyectos que se construyen como una ciudad. Cada construcción es una misión
// normal (con kingdomId), así que da XP y atributos igual que cualquier otra.
import type { GameState, Quest, QuestType } from './types';
import { uid } from './game';

// Ambientación medieval: cabañas, herrerías y torreones.
export const BUILDINGS: Record<QuestType, { name: string; icon: string }> = {
  side: { name: 'Cabaña', icon: '🛖' },
  daily: { name: 'Herrería', icon: '⚒️' },
  main: { name: 'Torreón', icon: '🏰' },
};
export const SCAFFOLD_ICON = '🪵'; // construcción pendiente: solo cimientos

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

// Etapas según el % construido. Sin construcciones planeadas = tierras baldías.
const STAGES: { min: number; name: string; icon: string }[] = [
  { min: 1, name: 'Reino glorioso', icon: '👑' },
  { min: 0.67, name: 'Ciudad amurallada', icon: '🏰' },
  { min: 0.34, name: 'Villa', icon: '🏘️' },
  { min: 0.0001, name: 'Aldea', icon: '🛖' },
  { min: 0, name: 'Campamento', icon: '⛺' },
];
const WASTELAND = { name: 'Tierras baldías', icon: '🌾' };

export function kingdomProgress(s: GameState, kingdomId: string) {
  const all = buildings(s, kingdomId);
  const built = all.filter((q) => q.completedAt).length;
  const progress = all.length ? built / all.length : 0;
  const st = all.length === 0 ? WASTELAND : STAGES.find((x) => progress >= x.min)!;
  return { built, total: all.length, progress, stage: st.name, icon: st.icon, complete: all.length > 0 && built === all.length };
}

/** Dominio del mapa: construcciones levantadas sobre las planeadas en todos los reinos. */
export function realmProgress(s: GameState) {
  const all = s.quests.filter((q) => q.kingdomId && s.kingdoms.some((k) => k.id === q.kingdomId));
  const built = all.filter((q) => q.completedAt).length;
  return { built, total: all.length, progress: all.length ? built / all.length : 0 };
}

export function kingdomName(s: GameState, id: string | undefined): string | undefined {
  return id ? s.kingdoms.find((k) => k.id === id)?.name : undefined;
}
