// Minutos al día para Academy: lógica pura (se prueba en budget.test.ts).
// Todo son ESTIMACIONES con tu tiempo real por tarjeta; los repasos que tocan nunca se esconden.

/**
 * Una tarjeta nueva cuesta hoy más que un repaso: la ves, vuelve a los 10 min y a veces otra vez.
 * Se cuenta como 3 respuestas (estimación; se recalibra sola porque el tiempo por respuesta es el tuyo).
 */
export const NEW_CARD_COST = 3;
/** Opciones del selector de minutos (null = sin límite). */
export const BUDGET_OPTIONS = [10, 15, 20, 30, 45, 60, 90] as const;

export interface DailyBudget {
  budgetMin: number;
  /** Minutos que ya has repasado hoy. */
  doneMin: number;
  /** Minutos estimados de los repasos que tocan hoy (incluido el repaso final de exámenes). */
  dueMin: number;
  /** Cuántas nuevas caben aún hoy en tu tiempo. */
  newCap: number;
  /** Minutos que faltan para hacer solo los repasos (0 si caben). */
  deficitMin: number;
  secPerCard: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Cuánto te queda hoy y cuántas nuevas caben. Sin presupuesto (null) devuelve null: sin límite. */
export function dailyBudget(o: { budgetMin: number | null; dueCards: number; secPerCard: number; doneSec: number }): DailyBudget | null {
  if (!o.budgetMin || o.budgetMin <= 0) return null;
  const doneMin = o.doneSec / 60;
  const dueMin = (o.dueCards * o.secPerCard) / 60;
  const left = o.budgetMin - doneMin - dueMin;
  return {
    budgetMin: o.budgetMin,
    doneMin: round1(doneMin),
    dueMin: round1(dueMin),
    newCap: left > 0 ? Math.floor((left * 60) / (o.secPerCard * NEW_CARD_COST)) : 0,
    deficitMin: left < 0 ? Math.ceil(-left) : 0,
    secPerCard: o.secPerCard,
  };
}

/** Minutos estimados de una cola: repasos + nuevas (cada nueva cuenta NEW_CARD_COST respuestas). */
export const estimateMinutes = (reviews: number, fresh: number, secPerCard: number) =>
  Math.round(((reviews + fresh * NEW_CARD_COST) * secPerCard) / 60);

/**
 * Reparte el cupo de nuevas entre asignaturas, en el orden dado (las de examen más cercano primero).
 * Cada una recibe como mucho lo que quiere. Sin cupo (Infinity) cada una recibe lo suyo.
 */
export function allocateNew<K>(wants: readonly { key: K; want: number }[], cap: number): Map<K, number> {
  const out = new Map<K, number>();
  let left = cap;
  for (const { key, want } of wants) {
    const n = Math.max(0, Math.min(want, left));
    out.set(key, n);
    left -= n;
  }
  return out;
}
