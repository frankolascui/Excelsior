// Bandeja de revisión: lo que importas o pegas entra como BORRADOR y no llega al repaso (ni a FSRS)
// hasta que lo apruebas. Lógica pura + guardado en este navegador. Se prueba en drafts.test.ts.
import { plainPreview } from './format';

export interface Draft {
  id: string;
  front: string;
  back: string;
  /** De dónde vino («pegado», nombre del archivo…), para saber qué revisar. */
  source: string;
  at: number;
}

export type DraftFlag = 'duplicada' | 'parecida' | 'larga' | 'sin-respuesta';
export const FLAG_LABEL: Record<DraftFlag, string> = {
  duplicada: 'ya existe',
  parecida: 'muy parecida a otra',
  larga: 'respuesta larga',
  'sin-respuesta': 'sin respuesta',
};
export const FLAG_HINT: Record<DraftFlag, string> = {
  duplicada: 'Hay otra tarjeta (o borrador) con la misma pregunta.',
  parecida: 'Casi las mismas palabras que otra pregunta: puede ser la misma idea dos veces.',
  larga: 'Una tarjeta debería preguntar una sola idea: si la respuesta es larga, pártela en varias.',
  'sin-respuesta': 'Sin respuesta no se puede comprobar si la sabías.',
};
/** Más de esto (sin formato) suele ser varias ideas en una tarjeta. */
export const LONG_ANSWER = 280;

/** Pregunta comparable: sin formato, sin tildes ni signos, en minúsculas. */
export function normalize(text: string): string {
  return plainPreview(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const words = (t: string) => new Set(normalize(t).split(' ').filter((w) => w.length > 2));
/** Parecido entre dos preguntas (0 a 1): palabras en común entre todas las palabras (Jaccard). */
export function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / (A.size + B.size - common);
}

/** Avisos de cada borrador frente a las tarjetas del tema y a los demás borradores. */
export function draftFlags(drafts: readonly Draft[], existing: readonly { front: string }[]): Map<string, DraftFlag[]> {
  const out = new Map<string, DraftFlag[]>();
  const existingNorm = existing.map((c) => normalize(c.front));
  const existingSet = new Set(existingNorm);
  drafts.forEach((d, i) => {
    const flags: DraftFlag[] = [];
    const n = normalize(d.front);
    const earlier = drafts.slice(0, i);
    if (existingSet.has(n) || earlier.some((o) => normalize(o.front) === n)) flags.push('duplicada');
    else if (existing.some((c) => similarity(c.front, d.front) >= 0.75) || earlier.some((o) => similarity(o.front, d.front) >= 0.75)) flags.push('parecida');
    if (!plainPreview(d.back).trim()) flags.push('sin-respuesta');
    else if (plainPreview(d.back).length > LONG_ANSWER) flags.push('larga');
    out.set(d.id, flags);
  });
  return out;
}

const KEY = (topicId: string) => `excelsior:acad-drafts:${topicId}`;
export function loadDrafts(topicId: string): Draft[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(topicId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((d) => d && typeof d.front === 'string' && typeof d.back === 'string') : [];
  } catch {
    return [];
  }
}
export function saveDrafts(topicId: string, drafts: readonly Draft[]) {
  try {
    if (drafts.length) localStorage.setItem(KEY(topicId), JSON.stringify(drafts));
    else localStorage.removeItem(KEY(topicId));
  } catch {
    /* sin almacenamiento: los borradores viven mientras la página esté abierta */
  }
}
/** Añade tarjetas pegadas o importadas a la bandeja del tema. */
export function addDrafts(topicId: string, cards: readonly { front: string; back: string }[], source: string, now = Date.now()): Draft[] {
  const next = [...loadDrafts(topicId), ...cards.map((c) => ({ id: crypto.randomUUID(), front: c.front, back: c.back, source, at: now }))];
  saveDrafts(topicId, next);
  return next;
}
