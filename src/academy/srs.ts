// Repetición espaciada con FSRS (el algoritmo que usa Anki), mediante la librería ts-fsrs.
// Aquí solo hay lógica pura: decide qué toca hoy y cuándo vuelve cada tarjeta. Se prueba en srs.test.ts.
import { fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { CardRow, Level } from './types';

/**
 * Ajustes del algoritmo.
 * - request_retention 0.9: busca que recuerdes el 90 % de las tarjetas cuando te las pregunta (el valor por defecto de Anki con FSRS).
 * - enable_fuzz: mueve un poco las fechas para que las tarjetas creadas juntas no vuelvan todas el mismo día.
 * - learning_steps: una tarjeta nueva vuelve a los 1 y 10 minutos antes de pasar a días.
 */
export const NEW_PER_DAY = 20;

/**
 * Niveles de exigencia. Cada asignatura tiene uno y cambia dos números:
 * - retention: probabilidad de recordar la tarjeta cuando FSRS te la pregunta. Más alta = repasos más seguidos.
 * - newPerDay: tarjetas nuevas al día de esa asignatura.
 */
export const LEVELS: Record<Level, { label: string; hint: string; retention: number; newPerDay: number }> = {
  minimo: { label: 'Mínimo', hint: 'Aprobar con el menor tiempo posible', retention: 0.8, newPerDay: 10 },
  equilibrado: { label: 'Equilibrado', hint: 'Lo importante de cada tema', retention: 0.9, newPerDay: 20 },
  detalle: { label: 'Al detalle', hint: 'Ir a por el 10, hasta el último detalle', retention: 0.95, newPerDay: 30 },
};

const schedulers = new Map<Level, ReturnType<typeof fsrs>>();
let userW: readonly number[] | null = null;
/**
 * Parámetros de FSRS ajustados a tu memoria (paso 12), o null para los de por defecto.
 * Al cambiarlos se rehacen los planificadores.
 */
export function setUserParams(w: readonly number[] | null) {
  userW = w;
  schedulers.clear();
}
export const userParams = () => userW;

/** Un planificador FSRS por nivel (solo cambia la retención objetivo; los parámetros son los tuyos si los has ajustado). */
export function schedulerFor(level: Level = 'equilibrado') {
  let s = schedulers.get(level);
  if (!s) {
    s = fsrs(generatorParameters({ request_retention: LEVELS[level].retention, enable_fuzz: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'], ...(userW ? { w: [...userW] } : {}) }));
    schedulers.set(level, s);
  }
  return s;
}

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: 'Otra vez', key: '1' },
  { grade: Rating.Hard, label: 'Difícil', key: '2' },
  { grade: Rating.Good, label: 'Bien', key: '3' },
  { grade: Rating.Easy, label: 'Fácil', key: '4' },
];

/** Fila de la base de datos → tarjeta de ts-fsrs. */
export function toCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** Tarjeta de ts-fsrs → columnas que hay que guardar. */
export function fromCard(c: Card): Omit<CardRow, 'id' | 'topic_id' | 'front' | 'back' | 'created_at'> {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: Math.round(c.elapsed_days),
    scheduled_days: Math.round(c.scheduled_days),
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardRow['state'],
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** Qué pasa con la tarjeta si respondes `grade` ahora. */
export function answer(row: CardRow, grade: Grade, now: Date, level: Level = 'equilibrado') {
  const { card } = schedulerFor(level).next(toCard(row), now, grade);
  return fromCard(card);
}

/** Intervalo de cada botón, para enseñarlo encima («10 min», «3 d»…). */
export function previewIntervals(row: CardRow, now: Date, level: Level = 'equilibrado'): Record<Grade, string> {
  const preview = schedulerFor(level).repeat(toCard(row), now);
  const out = {} as Record<Grade, string>;
  for (const { grade } of GRADES) out[grade] = formatInterval(preview[grade].card.due.getTime() - now.getTime());
  return out;
}

/** Duración legible y corta: «<1 min», «10 min», «3 h», «4 d», «2 mes», «1,5 años». */
export function formatInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return '<1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} d`;
  if (d < 365) return `${Math.round(d / 30)} mes`;
  return `${(d / 365).toFixed(1).replace('.', ',').replace(',0', '')} años`;
}

/**
 * La cola de hoy:
 * 1. las tarjetas que ya tocan (due ≤ ahora) y no son nuevas, primero las más atrasadas;
 * 2. después, tarjetas nuevas hasta completar el límite diario (en el orden en que se crearon).
 */
export function buildQueue(cards: readonly CardRow[], now: Date, newDoneToday: number, newPerDay = NEW_PER_DAY, priority?: ReadonlyMap<string, number>): CardRow[] {
  const due = cards
    .filter((c) => c.state !== State.New && new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
  const room = Math.max(0, newPerDay - newDoneToday);
  const fresh = byPriority(
    cards.filter((c) => c.state === State.New).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    priority,
  ).slice(0, room);
  return burySiblings([...byPriority(due, priority), ...fresh]);
}

/**
 * Hermanas: tarjetas de la misma nota (los huecos de una frase, o una nota de Anki con inversa).
 * Si salieran el mismo día, una te chivaría la respuesta de la otra. Solo se queda la primera;
 * las demás esperan a otro día (Anki lo llama «enterrar»).
 */
export function burySiblings<T extends { note_key?: string | null }>(queue: readonly T[]): T[] {
  const seen = new Set<string>();
  return queue.filter((c) => {
    if (!c.note_key) return true;
    if (seen.has(c.note_key)) return false;
    seen.add(c.note_key);
    return true;
  });
}

/**
 * Sanguijuela (leech, en Anki): una tarjeta que has fallado muchas veces. Repasarla más no sirve:
 * suele estar mal planteada (demasiado larga, ambigua, dos ideas en una). Se aparta para que la reescribas.
 */
export const LEECH_LAPSES = 8;
export const isLeech = (c: Pick<CardRow, 'lapses'>) => c.lapses >= LEECH_LAPSES;
/** ¿Se aparta al fallarla ahora? A los 8 fallos y, si la reactivas, otra vez cada 4 fallos más (como Anki). */
export const becomesLeech = (lapsesAfter: number) => lapsesAfter >= LEECH_LAPSES && (lapsesAfter - LEECH_LAPSES) % 4 === 0;

/**
 * Si hay exámenes cerca, primero van los temas del examen más próximo (`priority`: tema → días que faltan),
 * después los del siguiente, y al final el resto. Dentro de cada grupo se intercalan los temas.
 */
export function byPriority<T extends { topic_id: string }>(cards: readonly T[], priority?: ReadonlyMap<string, number>): T[] {
  if (!priority?.size) return interleave(cards);
  const groups = new Map<number, T[]>();
  for (const c of cards) {
    const k = priority.get(c.topic_id) ?? Infinity;
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  return [...groups.keys()].sort((a, b) => a - b).flatMap((k) => interleave(groups.get(k)!));
}

/**
 * Interleaving (práctica intercalada): en vez de hacer todas las tarjetas del tema 1 y luego las del 2,
 * se van turnando: una del tema 1, una del 2, una del 3, otra del 1… Dentro de cada tema se respeta el orden.
 * Mezclar temas obliga a tu cerebro a decidir «¿de qué va esto?» en cada tarjeta, y eso mejora el recuerdo
 * en el examen, donde las preguntas tampoco llegan ordenadas por tema.
 */
export function interleave<T extends { topic_id: string }>(cards: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of cards) {
    const g = groups.get(c.topic_id);
    if (g) g.push(c); else groups.set(c.topic_id, [c]);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < cards.length; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/** Cuenta para enseñar en pantalla: nuevas, aprendiendo y repaso que tocan hoy. */
export function countsFor(queue: readonly CardRow[]) {
  return {
    nuevas: queue.filter((c) => c.state === State.New).length,
    aprendiendo: queue.filter((c) => c.state === State.Learning || c.state === State.Relearning).length,
    repaso: queue.filter((c) => c.state === State.Review).length,
  };
}

/**
 * Tras responder, ¿vuelve en esta misma sesión? Solo si toca dentro de poco (pasos de aprendizaje
 * de minutos). Devuelve la posición donde reinsertarla o -1 si ya no vuelve hoy.
 */
export function requeueIndex(nextDue: Date, now: Date, queueLength: number, withinMinutes = 20): number {
  const mins = (nextDue.getTime() - now.getTime()) / 60_000;
  if (mins > withinMinutes) return -1;
  // Se coloca unas tarjetas más adelante para no verla dos veces seguidas.
  return Math.min(queueLength, 3);
}

/**
 * Importar tarjetas pegadas como texto: una por línea, «pregunta;respuesta»
 * (el formato de los CSV que genera la skill). También vale un tabulador.
 */
export function parseCardLines(text: string): { front: string; back: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^pregunta\s*[;\t]\s*respuesta$/i.test(l))
    .map((l) => {
      const i = l.search(/[;\t]/);
      if (i < 0) return null;
      const front = l.slice(0, i).trim().replace(/^"|"$/g, '');
      const back = l.slice(i + 1).trim().replace(/^"|"$/g, '');
      return front ? { front, back } : null;
    })
    .filter((x): x is { front: string; back: string } => x !== null);
}

/** Etiqueta corta para la lista de tarjetas: «nueva», «toca ya» o «en 3 d». */
export function dueLabel(row: Pick<CardRow, 'state' | 'due'>, now: Date): string {
  if (row.state === State.New) return 'nueva';
  const ms = new Date(row.due).getTime() - now.getTime();
  return ms <= 0 ? 'toca ya' : `en ${formatInterval(ms)}`;
}

/** Resumen de una sesión de repaso a partir de las notas dadas (1 a 4). */
export function sessionSummary(ratings: readonly number[]) {
  const total = ratings.length;
  const again = ratings.filter((r) => r === Rating.Again).length;
  return {
    total,
    again,
    // Porcentaje de aciertos: todo lo que no sea «Otra vez» cuenta como recordado (como en Anki).
    retention: total ? Math.round(((total - again) / total) * 100) : 0,
  };
}

/**
 * Cuántas nuevas quedan hoy en cada asignatura: su límite según el nivel menos las que ya has empezado hoy.
 * `doneBySubject` = nuevas estudiadas hoy por asignatura.
 */
export function newRoom(levels: ReadonlyMap<string, Level>, doneBySubject: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [subjectId, level] of levels) out.set(subjectId, Math.max(0, LEVELS[level].newPerDay - (doneBySubject.get(subjectId) ?? 0)));
  return out;
}
