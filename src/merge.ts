// Unir dos partidas que cambiaron por separado (este dispositivo y la nube) a partir de la última en la que
// coincidieron (la «base»). Lo que solo cambió en un lado se queda; lo añadido en los dos lados, también.
// Solo si el mismo dato cambió distinto en los dos lados hay conflicto de verdad, y entonces se pregunta.
import type { GameState } from './types';

type J = unknown;
type Obj = Record<string, J>;
const isObj = (x: J): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Igualdad por contenido, sin importar el orden de las claves (la base de datos lo cambia). */
export function deepEq(a: J, b: J): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as J[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Obj, bo = b as Obj;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEq(ao[k], bo[k])) return false;
  return true;
}

/** Texto estable (claves ordenadas) para usar un valor como llave. */
function canon(x: J): string {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (isObj(x)) return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
  return JSON.stringify(x) ?? 'undefined';
}

/** Campos que se cambian enteros (un temporizador a medias de cada lado no se mezcla). */
const ATOMIC = new Set(['activeTimer']);
/** Campos que solo crecen: si cambian en los dos lados, gana el mayor. */
const MONOTONIC = new Set(['version', 'balance', 'newsSeen', 'newsLatest']);

const verNum = (v: J) => (typeof v === 'number' ? [v] : String(v ?? '').split('.').map((n) => Number(n) || 0));
function bigger(a: J, b: J): J {
  const x = verNum(a), y = verNum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? a : b;
  }
  return b;
}

/** Cómo se reconoce un elemento de una lista: por id, por día, por semana o por su valor. */
function keyOf(lists: J[][]): (x: J) => string {
  const all = lists.flat();
  for (const field of ['id', 'day', 'week']) {
    if (all.length && all.every((x) => isObj(x) && typeof x[field] === 'string')) return (x) => (x as Obj)[field] as string;
  }
  return canon;
}

function mergeArrays(base: J[], local: J[], remote: J[], path: string, conflicts: string[]): J[] {
  const key = keyOf([base, local, remote]);
  const B = new Map(base.map((x) => [key(x), x]));
  const L = new Map(local.map((x) => [key(x), x]));
  const R = new Map(remote.map((x) => [key(x), x]));
  // Orden: el de la nube, salvo que aquí se reordenara y allí no (p. ej. arrastrar hábitos).
  const shared = (m: Map<string, J>) => [...m.keys()].filter((k) => B.has(k) && L.has(k) && R.has(k));
  const localReordered = !deepEq(shared(L), shared(B)) && deepEq(shared(R), shared(B));
  const first = localReordered ? L : R;
  const second = localReordered ? R : L;
  const keys = [...new Set([...first.keys(), ...second.keys()])];
  const out: J[] = [];
  for (const k of keys) {
    const b = B.get(k), l = L.get(k), r = R.get(k);
    if (l !== undefined && r !== undefined) {
      // Añadido en los dos lados con la misma llave: es lo mismo (p. ej. un hábito del sistema); manda la nube.
      out.push(b === undefined ? r : merge(b, l, r, `${path}[]`, conflicts));
    } else if (l !== undefined) {
      // Borrado en la nube: se borra salvo que aquí se cambiara (mejor conservar que perder).
      if (b === undefined || !deepEq(b, l)) out.push(l);
    } else if (r !== undefined) {
      if (b === undefined || !deepEq(b, r)) out.push(r);
    }
  }
  return out;
}

function merge(base: J, local: J, remote: J, path: string, conflicts: string[]): J {
  if (deepEq(local, remote)) return remote;
  if (deepEq(base, local)) return remote;
  if (deepEq(base, remote)) return local;
  if (Array.isArray(local) && Array.isArray(remote)) return mergeArrays(Array.isArray(base) ? base : [], local, remote, path, conflicts);
  if (isObj(local) && isObj(remote) && !ATOMIC.has(path)) {
    const b = isObj(base) ? base : {};
    const out: Obj = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const v = merge(b[k], local[k], remote[k], path ? `${path}.${k}` : k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (MONOTONIC.has(path)) return bigger(local, remote);
  conflicts.push(path);
  return remote;
}

/**
 * Lo que la app apunta sola en cada dispositivo (marcar «Apuntar la noche» al llegar las noches de la nube,
 * las obras del Reino de la Salud) puede quedar repetido con ids distintos: se deja una vez y se quita su XP.
 */
export function dedupeDerived(s: GameState): GameState {
  const habits = new Map([...s.habits, ...(s.retiredHabits ?? [])].map((h) => [h.id, h]));
  const seen = new Map<string, number>();
  const dropped = new Set<string>();
  const habitCompletions = s.habitCompletions.filter((c) => {
    const h = habits.get(c.habitId);
    if (!h) return true;
    const k = `${c.habitId}|${c.day}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > (h.perDay ?? 1)) { dropped.add(c.id); return false; }
    return true;
  });
  let next = s;
  if (dropped.size) {
    next = { ...s, habitCompletions, xp: s.xp.filter((t) => !(t.source === 'habit' && dropped.has(t.sourceId))) };
  }
  const works = next.health?.works;
  if (works) {
    const kw = new Set<string>();
    const unique = works.filter((w) => { const k = `${w.kind}|${w.week}`; if (kw.has(k)) return false; kw.add(k); return true; });
    if (unique.length !== works.length) next = { ...next, health: { ...next.health, works: unique } };
  }
  return next;
}

/** Une las dos partidas. `conflicts` lista los datos que cambiaron distinto en los dos lados (vacía = sin preguntar). */
export function mergeStates(base: GameState, local: GameState, remote: GameState): { state: GameState; conflicts: string[] } {
  const conflicts: string[] = [];
  const merged = merge(base, local, remote, '', conflicts) as GameState;
  return { state: dedupeDerived(merged), conflicts };
}
