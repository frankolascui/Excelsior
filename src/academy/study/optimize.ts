// Ajustar FSRS a tu memoria (fase E). Lógica pura: convierte tu historial al formato del optimizador.
// El optimizador oficial (fsrs-rs, el mismo de Anki) corre en el navegador con la librería fsrs-browser,
// dentro de un Worker (optimizer.worker.ts) para no congelar la pantalla.

export interface RawReview { card_id: string; rating: number; state: number; reviewed_at: string }

/** Por debajo de esta cifra no dejo ajustar: con pocos datos los parámetros salen poco fiables (criterio conservador). */
export const MIN_REVIEWS = 1000;

/**
 * Historial → «revlog» al estilo de Anki, que es lo que entiende `computeParametersAnki`:
 * - cids: un número por tarjeta (en la base de datos son textos uuid);
 * - ids: la hora de cada respuesta en milisegundos (en Anki el id del revlog es esa hora);
 * - eases: la nota (1 a 4);
 * - types: 0 aprendiendo, 1 repaso, 2 reaprendiendo (según el estado ANTES de responder).
 */
export function toAnkiRevlog(reviews: readonly RawReview[]) {
  const num = new Map<string, number>();
  const sorted = [...reviews].sort((a, b) => a.card_id.localeCompare(b.card_id) || a.reviewed_at.localeCompare(b.reviewed_at));
  const cids: bigint[] = []; const ids: bigint[] = []; const eases: number[] = []; const types: number[] = [];
  const used = new Set<number>();
  for (const r of sorted) {
    if (!num.has(r.card_id)) num.set(r.card_id, num.size + 1);
    let t = new Date(r.reviewed_at).getTime();
    while (used.has(t)) t++; // los ids de Anki no se repiten (1 ms de diferencia no cambia nada)
    used.add(t);
    cids.push(BigInt(num.get(r.card_id)!));
    ids.push(BigInt(t));
    eases.push(Math.min(4, Math.max(1, r.rating)));
    types.push(r.state === 2 ? 1 : r.state === 3 ? 2 : 0);
  }
  return { cids, ids, eases, types, cards: num.size };
}

/** Minutos de diferencia con la hora UTC; para la web el día empieza a medianoche (Anki: «next day starts at» = 0). */
export const minuteOffset = (d = new Date()) => -d.getTimezoneOffset();

/** ¿Son 21 números válidos (FSRS-6)? Si no, se ignoran y se usan los de por defecto. */
export function validParams(w: unknown): w is number[] {
  return Array.isArray(w) && w.length === 21 && w.every((x) => typeof x === 'number' && Number.isFinite(x));
}
