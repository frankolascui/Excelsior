// Árbol de misiones: cualquier misión puede tener submisiones, sin límite de niveles.
// Regla única: solo las hojas (misiones sin submisiones pendientes) van a tu día. Una hoja debe caber en una sesión.
// La fecha límite se hereda hacia abajo; el impacto lo copia la submisión al crearse (y se puede cambiar).
// Una misión con submisiones no se cierra sola: cuando todas están hechas, la cierras tú o añades la siguiente.
import type { GameState, Quest } from './types';

const MAX_DEPTH = 32; // tope de seguridad por si un dato viene con un ciclo

export function childrenOf(s: GameState, id: string): Quest[] {
  return s.quests.filter((q) => q.parentId === id).sort((a, b) => a.createdAt - b.createdAt);
}

export const hasChildren = (s: GameState, id: string) => s.quests.some((q) => q.parentId === id);
export const hasOpenChildren = (s: GameState, id: string) => s.quests.some((q) => q.parentId === id && !q.completedAt);

/** Se puede hacer ya: pendiente y sin submisiones pendientes. */
export const isLeaf = (s: GameState, q: Quest) => !q.completedAt && !hasOpenChildren(s, q.id);

/** Antepasados, del padre a la raíz. */
export function ancestors(s: GameState, q: Quest): Quest[] {
  const out: Quest[] = [];
  let cur = q.parentId;
  while (cur && out.length < MAX_DEPTH) {
    const p = s.quests.find((x) => x.id === cur);
    if (!p || out.includes(p)) break;
    out.push(p);
    cur = p.parentId;
  }
  return out;
}

export const rootOf = (s: GameState, q: Quest): Quest => ancestors(s, q).at(-1) ?? q;

/** «Mates › Examen tema 4»: de la raíz al padre. Vacío si no tiene padre. */
export function pathLabel(s: GameState, q: Quest): string {
  return ancestors(s, q).reverse().map((a) => a.title).join(' › ');
}

/** La fecha límite que manda: la suya o la más cercana de sus antepasados. */
export function effectiveDeadline(s: GameState, q: Quest): string | undefined {
  return [q, ...ancestors(s, q)].map((x) => x.deadline).filter((d): d is string => !!d).sort()[0];
}

/** Todas las submisiones, a cualquier profundidad. */
export function descendants(s: GameState, id: string): Quest[] {
  const out: Quest[] = [];
  const queue = [id];
  while (queue.length && out.length < s.quests.length) {
    const cur = queue.shift()!;
    for (const c of s.quests) {
      if (c.parentId === cur && !out.includes(c)) { out.push(c); queue.push(c.id); }
    }
  }
  return out;
}

/** Progreso de una misión con submisiones: hojas hechas sobre hojas totales (a cualquier profundidad). */
export function treeProgress(s: GameState, id: string): { done: number; total: number } {
  const leaves = descendants(s, id).filter((q) => !hasChildren(s, q.id));
  return { done: leaves.filter((q) => q.completedAt).length, total: leaves.length };
}
