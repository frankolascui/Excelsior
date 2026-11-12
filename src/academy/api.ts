// Todo lo que el archivador lee y escribe en Supabase.
// No hace falta enviar user_id: la base de datos lo pone sola (default auth.uid())
// y las reglas por fila impiden tocar filas de otro alumno.
import { cloudClient as sb } from '../cloud';
import type { CardRow, Exam, ExamDate, Page, Subject, Topic } from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/**
 * Supabase devuelve como mucho 1000 filas por consulta (ajuste «Max rows» del proyecto).
 * Para listas largas (historial, todas las tarjetas) se piden de 1000 en 1000 con range().
 * La consulta debe tener un orden fijo para que las páginas no se solapen.
 */
async function paged(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }, max = 100_000) {
  const out: unknown[] = [];
  for (let from = 0; from < max; from += 1000) {
    const res = await make().range(from, from + 999);
    if (res.error) return { data: null, error: res.error };
    const rows = (res.data ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return { data: out, error: null };
}

// ---------- Asignaturas ----------
const SUBJECT_COLS = 'id, name, color, position, level';
export async function listSubjects(): Promise<Subject[]> {
  const res = await sb().from('study_subjects').select(SUBJECT_COLS).order('position');
  // Si aún no se ha ejecutado 03-niveles.sql, la columna «level» no existe: seguimos con el nivel por defecto.
  if (res.error && /level/.test(res.error.message)) {
    const old = check(await sb().from('study_subjects').select('id, name, color, position').order('position')) as Omit<Subject, 'level'>[];
    return old.map((x) => ({ ...x, level: 'equilibrado' as const }));
  }
  return check(res);
}
export async function createSubject(s: Omit<Subject, 'id' | 'level'>): Promise<Subject> {
  return check(await sb().from('study_subjects').insert(s).select(SUBJECT_COLS).single());
}
export async function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>) {
  check(await sb().from('study_subjects').update(patch).eq('id', id));
}
export async function deleteSubject(id: string) {
  check(await sb().from('study_subjects').delete().eq('id', id));
}

// ---------- Temas (separadores) ----------
const TOPIC_COLS = 'id, subject_id, title, position, exam_date';
export async function listTopics(subjectId: string): Promise<Topic[]> {
  return check(await sb().from('study_topics').select(TOPIC_COLS).eq('subject_id', subjectId).order('position'));
}
export async function createTopic(t: Omit<Topic, 'id'>): Promise<Topic> {
  return check(await sb().from('study_topics').insert(t).select(TOPIC_COLS).single());
}
export async function updateTopic(id: string, patch: Partial<Omit<Topic, 'id' | 'subject_id'>>) {
  check(await sb().from('study_topics').update(patch).eq('id', id));
}
export async function deleteTopic(id: string) {
  check(await sb().from('study_topics').delete().eq('id', id));
}

// ---------- Hojas ----------
// En la lista no se descarga el contenido (puede ser largo); solo al abrir la hoja.
export type PageSummary = Omit<Page, 'content'>;
export async function listPages(topicId: string): Promise<PageSummary[]> {
  return check(await sb().from('study_pages').select('id, topic_id, title, position, updated_at').eq('topic_id', topicId).order('position'));
}
export async function getPage(id: string): Promise<Page> {
  return check(await sb().from('study_pages').select('id, topic_id, title, content, position, updated_at').eq('id', id).single());
}
export async function createPage(p: Pick<Page, 'topic_id' | 'title' | 'content' | 'position'>): Promise<PageSummary> {
  return check(await sb().from('study_pages').insert(p).select('id, topic_id, title, position, updated_at').single());
}
export async function updatePage(id: string, patch: Partial<Pick<Page, 'title' | 'content' | 'position'>>) {
  check(await sb().from('study_pages').update(patch).eq('id', id));
}
export async function deletePage(id: string) {
  check(await sb().from('study_pages').delete().eq('id', id));
}

/** Guarda varias posiciones nuevas (al mover arriba o abajo). */
export async function savePositions(table: 'study_subjects' | 'study_topics' | 'study_pages', moves: { id: string; position: number }[]) {
  await Promise.all(moves.map((m) => sb().from(table).update({ position: m.position }).eq('id', m.id).then(check)));
}

// ---------- Flashcards ----------
const BASE_CARD_COLS = 'id, topic_id, front, back, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, created_at';
// Columnas de 06-repaso.sql. Si aún no lo has ejecutado, la web sigue funcionando sin ellas (sin apartar ni hermanas).
let phaseA = true;
export const hasCardExtras = () => phaseA;
const missingExtras = (msg: string) => /suspended|note_key/.test(msg);

/** Pide tarjetas con las columnas nuevas; si la tabla aún no las tiene, repite sin ellas. */
async function selectCards(build: (cols: string, extras: boolean) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<CardRow[]> {
  let res = await build(phaseA ? `${BASE_CARD_COLS}, suspended, note_key` : BASE_CARD_COLS, phaseA);
  if (res.error && phaseA && missingExtras(res.error.message)) {
    phaseA = false;
    res = await build(BASE_CARD_COLS, false);
  }
  return (check(res) as CardRow[]).map((c) => ({ suspended: false, note_key: null, ...c }));
}

export async function listAllTopics(): Promise<Topic[]> {
  return check(await sb().from('study_topics').select(TOPIC_COLS));
}
export async function listCards(topicId: string): Promise<CardRow[]> {
  return selectCards((cols) => sb().from('study_cards').select(cols).eq('topic_id', topicId).order('created_at'));
}
export type NewCard = { topic_id: string; front: string; back: string } & Partial<Omit<CardRow, 'id' | 'topic_id' | 'front' | 'back' | 'created_at'>>;
/** Crea tarjetas en tandas de 500 (un mazo grande puede tener miles). `onProgress` recibe cuántas van. */
export async function createCards(cards: NewCard[], onProgress?: (done: number) => void): Promise<void> {
  for (let i = 0; i < cards.length; i += 500) {
    // defaultToNull: false → si a una tarjeta le falta una columna (p. ej. las nuevas no traen «due»), se usa el valor por defecto de la tabla.
    const batch = phaseA ? cards.slice(i, i + 500) : cards.slice(i, i + 500).map(stripExtras);
    const res = await sb().from('study_cards').insert(batch, { defaultToNull: false });
    if (res.error && phaseA && missingExtras(res.error.message)) {
      phaseA = false;
      check(await sb().from('study_cards').insert(batch.map(stripExtras), { defaultToNull: false }));
    } else check(res);
    onProgress?.(Math.min(i + 500, cards.length));
  }
}
const stripExtras = <T extends object>(c: T) => { const { suspended: _s, note_key: _n, ...rest } = c as T & { suspended?: unknown; note_key?: unknown }; return rest; };

export async function updateCard(id: string, patch: Partial<Omit<CardRow, 'id' | 'created_at'>>) {
  if (!phaseA) {
    if ('suspended' in patch && patch.suspended) throw new Error('Para apartar tarjetas, ejecuta antes supabase/06-repaso.sql en el SQL Editor de Supabase.');
    patch = stripExtras(patch);
  }
  check(await sb().from('study_cards').update(patch).eq('id', id));
}
export async function deleteCard(id: string) {
  check(await sb().from('study_cards').delete().eq('id', id));
}

/** Medianoche de hoy en tu hora local: el «día» de estudio empieza ahí. */
export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Tema de cada tarjeta NUEVA que has empezado hoy (para el límite diario de cada asignatura). */
export async function newTopicsToday(): Promise<string[]> {
  // study_cards(topic_id) trae el tema de la tarjeta de cada repaso, en la misma consulta.
  const rows = check(await sb().from('study_reviews').select('card_id, study_cards(topic_id)')
    .eq('state', 0).gte('reviewed_at', startOfToday().toISOString())) as unknown as { study_cards: { topic_id: string } | null }[];
  return rows.map((r) => r.study_cards?.topic_id).filter((t): t is string => !!t);
}

/** Tarjetas ya empezadas que tocan ahora. topicIds = null → de todas tus asignaturas. */
export async function loadDue(topicIds: string[] | null, now = new Date()): Promise<CardRow[]> {
  return selectCards((cols, extras) => {
    let q = sb().from('study_cards').select(cols).neq('state', 0).lte('due', now.toISOString()).order('due').limit(1000);
    if (extras) q = q.eq('suspended', false);
    if (topicIds) q = q.in('topic_id', topicIds);
    return q;
  });
}

/** Las `limit` tarjetas nuevas más antiguas de esos temas. */
export async function loadNew(topicIds: string[], limit: number): Promise<CardRow[]> {
  if (limit <= 0 || topicIds.length === 0) return [];
  return selectCards((cols, extras) => {
    const q = sb().from('study_cards').select(cols).eq('state', 0).in('topic_id', topicIds);
    return (extras ? q.eq('suspended', false) : q).order('created_at').limit(limit);
  });
}

/** Guarda una respuesta: el nuevo estado de la tarjeta y una línea en el historial. Devuelve el id de esa línea (para deshacer). */
export async function saveReview(
  cardId: string,
  update: Partial<CardRow>,
  log: { rating: number; state: number; scheduled_days: number; duration_ms: number },
): Promise<string> {
  const [, review] = await Promise.all([
    updateCard(cardId, update),
    sb().from('study_reviews').insert({ card_id: cardId, ...log }).select('id').single().then(check) as Promise<{ id: string }>,
  ]);
  return review.id;
}

/** Deshacer: la tarjeta vuelve a como estaba y se borra la línea del historial. */
export async function undoReview(cardId: string, before: Partial<CardRow>, reviewId: string) {
  await Promise.all([
    updateCard(cardId, before),
    sb().from('study_reviews').delete().eq('id', reviewId).then(check),
  ]);
}

// ---------- Simulacros ----------
// En la lista no se descargan enunciado, respuestas ni corrección (pueden ser largos).
export type ExamSummary = Omit<Exam, 'statement' | 'answers' | 'correction'>;
const EXAM_SUMMARY = 'id, subject_id, title, topic_ids, time_limit_min, started_at, finished_at, duration_sec, grade, created_at';
export async function listExams(subjectId: string): Promise<ExamSummary[]> {
  return check(await sb().from('study_exams').select(EXAM_SUMMARY).eq('subject_id', subjectId).order('created_at', { ascending: false }));
}
export async function getExam(id: string): Promise<Exam> {
  return check(await sb().from('study_exams').select('*').eq('id', id).single());
}
export async function createExam(e: Pick<Exam, 'subject_id' | 'title' | 'statement' | 'topic_ids' | 'time_limit_min'>): Promise<ExamSummary> {
  return check(await sb().from('study_exams').insert(e).select(EXAM_SUMMARY).single());
}
export async function updateExam(id: string, patch: Partial<Omit<Exam, 'id' | 'subject_id' | 'created_at'>>) {
  check(await sb().from('study_exams').update(patch).eq('id', id));
}
export async function deleteExam(id: string) {
  check(await sb().from('study_exams').delete().eq('id', id));
}

// ---------- Fechas de examen ----------
const DATE_COLS = 'id, subject_id, title, date, topic_ids, created_at';
export async function listExamDates(): Promise<ExamDate[]> {
  return check(await sb().from('study_exam_dates').select(DATE_COLS).order('date'));
}
export async function createExamDate(e: Pick<ExamDate, 'subject_id' | 'title' | 'date' | 'topic_ids'>) {
  check(await sb().from('study_exam_dates').insert(e));
}
export async function updateExamDate(id: string, patch: Partial<Pick<ExamDate, 'title' | 'date' | 'topic_ids'>>) {
  check(await sb().from('study_exam_dates').update(patch).eq('id', id));
}
export async function deleteExamDate(id: string) {
  check(await sb().from('study_exam_dates').delete().eq('id', id));
}

/** Cuántas tarjetas nuevas (sin empezar) quedan en cada tema. */
export async function countNew(topicIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!topicIds.length) return out;
  const rows = (await selectCards((_c, extras) => paged(() => {
    const q = sb().from('study_cards').select('id, topic_id').eq('state', 0).in('topic_id', topicIds);
    return (extras ? q.eq('suspended', false) : q).order('id');
  }))) as unknown as { topic_id: string }[];
  for (const r of rows) out.set(r.topic_id, (out.get(r.topic_id) ?? 0) + 1);
  return out;
}

/** Tarjetas ya empezadas de esos temas (para el repaso final antes de un examen). */
export async function loadStarted(topicIds: string[]): Promise<CardRow[]> {
  if (!topicIds.length) return [];
  return selectCards((cols, extras) => {
    const q = () => { const b = sb().from('study_cards').select(cols).neq('state', 0).in('topic_id', topicIds); return (extras ? b.eq('suspended', false) : b).order('id'); };
    return paged(q, 5000);
  });
}

// ---------- Estadísticas ----------
/** Tus respuestas de los últimos `days` días, con el tema de cada tarjeta. */
export async function listReviewsSince(days: number): Promise<import('./stats').ReviewLog[]> {
  const since = new Date(startOfToday().getTime() - (days - 1) * 86_400_000).toISOString();
  const rows = check(await paged(() => sb().from('study_reviews').select('rating, state, reviewed_at, duration_ms, study_cards(topic_id)')
    .gte('reviewed_at', since).order('reviewed_at').order('id'))) as unknown as { rating: number; state: number; reviewed_at: string; duration_ms: number | null; study_cards: { topic_id: string } | null }[];
  return rows.map(({ study_cards, ...r }) => ({ ...r, topic_id: study_cards?.topic_id ?? null }));
}

/** Lo justo de cada tarjeta para las estadísticas (sin pregunta ni respuesta). */
export async function listCardStats(): Promise<import('./stats').CardStat[]> {
  const rows = await selectCards((_c, extras) => paged(() => sb().from('study_cards')
    .select(`id, topic_id, state, due, stability, lapses${extras ? ', suspended' : ''}`).order('id')));
  return rows as unknown as import('./stats').CardStat[];
}

// ---------- Ajustes (07-ajuste-fsrs.sql) ----------
export interface Settings { fsrs_params: number[] | null; params_reviews: number | null; optimized_at: string | null }
/** Tus ajustes, o null si aún no hay fila (o aún no existe la tabla). */
export async function getSettings(): Promise<Settings | null> {
  const res = await sb().from('study_settings').select('fsrs_params, params_reviews, optimized_at').maybeSingle();
  if (res.error) return null;
  return res.data as Settings | null;
}
export async function saveFsrsParams(params: number[] | null, reviews: number | null) {
  check(await sb().from('study_settings').upsert({ fsrs_params: params, params_reviews: reviews, optimized_at: params ? new Date().toISOString() : null, updated_at: new Date().toISOString() }));
}
/** Cuántas respuestas hay en tu historial. */
export async function countReviews(): Promise<number> {
  const res = await sb().from('study_reviews').select('id', { count: 'exact', head: true });
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
/** Todo tu historial (para el optimizador). */
export async function listAllReviews(): Promise<import('./optimize').RawReview[]> {
  return check(await paged(() => sb().from('study_reviews').select('card_id, rating, state, reviewed_at').order('reviewed_at').order('id'), 200_000)) as import('./optimize').RawReview[];
}
