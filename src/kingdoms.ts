// Reinos: proyectos que se construyen como una ciudad. Cada construcción es una misión
// normal (con kingdomId), así que da XP y atributos igual que cualquier otra.
import type { GameState, Quest, QuestType } from './types';
import type { IconName } from './icon-data';
import { uid } from './game';

// Ambientación medieval: cabañas, herrerías y torreones.
export const BUILDINGS: Record<QuestType, { name: string; icon: IconName }> = {
  side: { name: 'Cabaña', icon: 'cabin' },
  daily: { name: 'Herrería', icon: 'anvil' },
  main: { name: 'Torreón', icon: 'stone-tower' },
};

export function addKingdom(s: GameState, name: string, now: number): GameState {
  return { ...s, kingdoms: [...s.kingdoms, { id: uid(), name: name.trim(), createdAt: now }] };
}

export function renameKingdom(s: GameState, id: string, name: string): GameState {
  const n = name.trim().slice(0, 50);
  return n ? { ...s, kingdoms: s.kingdoms.map((k) => (k.id === id ? { ...k, name: n } : k)) } : s;
}

/** Pone o quita (null) la fecha objetivo de un reino. */
export function setKingdomDeadline(s: GameState, id: string, day: string | null): GameState {
  return {
    ...s,
    kingdoms: s.kingdoms.map((k) => {
      if (k.id !== id) return k;
      const next = { ...k };
      if (day) next.deadline = day;
      else delete next.deadline;
      return next;
    }),
  };
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

/** Cierra el reino como monumento: quita lo pendiente (el proyecto terminó) y conserva lo construido. */
export function closeKingdom(s: GameState, id: string, now: number): GameState {
  return {
    ...s,
    kingdoms: s.kingdoms.map((k) => (k.id === id ? { ...k, closedAt: now } : k)),
    quests: s.quests.filter((q) => !(q.kingdomId === id && !q.completedAt)),
  };
}

/** Vuelve a abrir un monumento para seguir construyendo. */
export function reopenKingdom(s: GameState, id: string): GameState {
  return {
    ...s,
    kingdoms: s.kingdoms.map((k) => {
      if (k.id !== id) return k;
      const next = { ...k };
      delete next.closedAt;
      return next;
    }),
  };
}

/** Días sin mover un reino abierto para que se considere parado. */
export const STALE_KINGDOM_DAYS = 14;

/** Días desde lo último que pasó en un reino (fundarlo, añadir o levantar una construcción). */
export function kingdomIdleDays(s: GameState, kingdomId: string, now: number): number {
  const k = s.kingdoms.find((x) => x.id === kingdomId);
  if (!k) return 0;
  const last = buildings(s, kingdomId).reduce((t, q) => Math.max(t, q.createdAt, q.completedAt ?? 0), k.createdAt);
  return Math.floor((now - last) / 86_400_000);
}

/** Reinos abiertos que llevan 14 días o más sin moverse. */
export function staleKingdoms(s: GameState, now: number) {
  return s.kingdoms.filter((k) => !k.closedAt && kingdomIdleDays(s, k.id, now) >= STALE_KINGDOM_DAYS);
}

/** Un reino «terminado»: cerrado como monumento, o con todo construido (3 o más). */
export function kingdomFinished(s: GameState, kingdomId: string): boolean {
  const k = s.kingdoms.find((x) => x.id === kingdomId);
  if (!k) return false;
  const p = kingdomProgress(s, kingdomId);
  return (!!k.closedAt && p.built > 0) || (p.complete && p.total >= 3);
}

export function buildings(s: GameState, kingdomId: string): Quest[] {
  return s.quests.filter((q) => q.kingdomId === kingdomId);
}

// Etapas según el número de construcciones levantadas (como el castillo: más estructuras, mejor reino).
const STAGES: { min: number; name: string; icon: IconName }[] = [
  { min: 10, name: 'Reino glorioso', icon: 'crown' },
  { min: 6, name: 'Ciudad amurallada', icon: 'castle' },
  { min: 3, name: 'Villa', icon: 'village' },
  { min: 1, name: 'Aldea', icon: 'hut' },
  { min: 0, name: 'Campamento', icon: 'tent' },
];
const WASTELAND = { name: 'Tierras baldías', icon: 'wheat' as IconName };

/** Etapa siguiente, cuántas construcciones faltan y cuánto llevas del tramo (0–1) (null en Reino glorioso). */
export function nextStage(built: number) {
  const next = [...STAGES].reverse().find((x) => x.min > built);
  if (!next) return null;
  const from = STAGES.find((x) => built >= x.min)!.min;
  return { name: next.name, icon: next.icon, missing: next.min - built, ratio: (built - from) / (next.min - from) };
}

/** Etapa de un reino con `built` construcciones levantadas (lo usa también el Reino de la Salud). */
export function stageFor(built: number, planned = built) {
  return planned === 0 && built === 0 ? WASTELAND : STAGES.find((x) => built >= x.min)!;
}

export function kingdomProgress(s: GameState, kingdomId: string) {
  const all = buildings(s, kingdomId);
  const built = all.filter((q) => q.completedAt).length;
  const progress = all.length ? built / all.length : 0;
  const st = all.length === 0 && built === 0 ? WASTELAND : STAGES.find((x) => built >= x.min)!;
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
