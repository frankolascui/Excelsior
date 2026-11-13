// Estadísticas: lógica pura a partir del historial (study_reviews) y de las tarjetas. Se prueba en stats.test.ts.

export interface ReviewLog { rating: number; state: number; reviewed_at: string; duration_ms: number | null; topic_id: string | null }
export interface CardStat { topic_id: string; state: number; due: string; stability: number; lapses: number; suspended?: boolean }

/** Una tarjeta está «dominada» cuando FSRS calcula que tardarías 3 semanas o más en olvidarla. */
export const MASTERED_DAYS = 21;
/** A partir de estos minutos diarios de tarjetas, la web te avisa de que vas cargado. */
export const LOAD_WARN_MIN = 30;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Respuestas por día de los últimos `days` días (el último es hoy). */
export function dailyCounts(reviews: readonly ReviewLog[], days: number, today = new Date()) {
  const counts = new Map<string, { n: number; again: number }>();
  for (const r of reviews) {
    const k = dayKey(new Date(r.reviewed_at));
    const c = counts.get(k) ?? { n: 0, again: 0 };
    c.n++; if (r.rating === 1) c.again++;
    counts.set(k, c);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(startOfDay(today), i - days + 1);
    return { date, ...(counts.get(dayKey(date)) ?? { n: 0, again: 0 }) };
  });
}

/** Tarjetas que tocarán cada uno de los próximos `days` días (las atrasadas cuentan para hoy). */
export function forecast(cards: readonly CardStat[], days: number, now = new Date()) {
  const start = startOfDay(now).getTime();
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(startOfDay(now), i), n: 0 }));
  for (const c of cards) {
    if (c.state === 0 || c.suspended) continue;
    const i = Math.max(0, Math.floor((startOfDay(new Date(c.due)).getTime() - start) / 86_400_000));
    if (i < days) out[i].n++;
  }
  return out;
}

/**
 * Retención real: de las tarjetas que ya estaban en repaso (state 2 antes de responder),
 * qué porcentaje recordaste (todo menos «Otra vez»). Compárala con el objetivo de tu nivel.
 */
export function trueRetention(reviews: readonly ReviewLog[]) {
  const rs = reviews.filter((r) => r.state === 2);
  return { n: rs.length, pct: rs.length ? Math.round((rs.filter((r) => r.rating > 1).length / rs.length) * 100) : null };
}

/** Por tema: cuántas tarjetas son nuevas, están aprendiéndose o ya están dominadas. Las apartadas no cuentan. */
export function mastery(cards: readonly CardStat[]) {
  const out = new Map<string, { nuevas: number; aprendiendo: number; dominadas: number }>();
  for (const c of cards) {
    if (c.suspended) continue;
    const m = out.get(c.topic_id) ?? { nuevas: 0, aprendiendo: 0, dominadas: 0 };
    if (c.state === 0) m.nuevas++;
    else if (c.state === 2 && c.stability >= MASTERED_DAYS) m.dominadas++;
    else m.aprendiendo++;
    out.set(c.topic_id, m);
  }
  return out;
}

/**
 * Puntos débiles: temas donde más fallas («Otra vez») en tarjetas ya empezadas.
 * Solo cuenta temas con al menos `min` respuestas, para que 1 fallo de 2 no parezca un desastre.
 */
export function weakTopics(reviews: readonly ReviewLog[], min = 10, top = 5) {
  const by = new Map<string, { n: number; again: number }>();
  for (const r of reviews) {
    if (r.state === 0 || !r.topic_id) continue;
    const t = by.get(r.topic_id) ?? { n: 0, again: 0 };
    t.n++; if (r.rating === 1) t.again++;
    by.set(r.topic_id, t);
  }
  return [...by]
    .filter(([, t]) => t.n >= min && t.again > 0)
    .map(([topicId, t]) => ({ topicId, n: t.n, failPct: Math.round((t.again / t.n) * 100) }))
    .sort((a, b) => b.failPct - a.failPct)
    .slice(0, top);
}

/** Segundos que tardas de media por tarjeta (de tu historial; 10 s si aún no hay datos). */
export function secondsPerCard(reviews: readonly ReviewLog[]) {
  const ds = reviews.map((r) => r.duration_ms).filter((d): d is number => typeof d === 'number' && d > 0 && d < 120_000);
  return ds.length >= 20 ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length / 1000) : 10;
}

/** Aviso de carga: minutos de media que te esperan los próximos 7 días (sin contar las nuevas). */
export function loadWarning(next: readonly { n: number }[], secPerCard: number) {
  const week = next.slice(0, 7);
  const avg = week.reduce((a, d) => a + d.n, 0) / Math.max(1, week.length);
  const minutes = Math.round((avg * secPerCard) / 60);
  const peak = Math.max(0, ...week.map((d) => d.n));
  return { avgCards: Math.round(avg), minutes, peak, heavy: minutes >= LOAD_WARN_MIN };
}

/** Racha: días seguidos con al menos una respuesta, contando hasta hoy (o hasta ayer si hoy aún no has repasado). */
export function streak(reviews: readonly ReviewLog[], today = new Date()) {
  const days = new Set(reviews.map((r) => dayKey(new Date(r.reviewed_at))));
  let d = startOfDay(today);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}
