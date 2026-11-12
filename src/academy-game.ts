// Academy dentro del juego (V3): repasar tarjetas cuenta como Deep Work de estudio y es un hábito.
// - Cada sesión de repaso se guarda como una sesión de Deep Work (área «estudio»): da 1 XP por minuto
//   de repaso real, como cualquier foco, y sube Sabiduría. El tiempo se mide por tarjeta (máximo 2 min cada una)
//   para que dejar la pantalla abierta no cuente.
// - El hábito del sistema «Repasar las tarjetas» se marca solo el día que vacías la cola o repasas 20 tarjetas.
// - Vaciar la cola del día da un pequeño bonus (una vez al día).
import type { DeepWorkSession, GameState, Habit } from './types';
import { dayKey, toggleHabit, uid, XP_RULES, type ActionResult } from './game';
import { deepWorkRewards } from './attributes';

export const ACADEMY_HABIT_ID = 'sys-academy';
export const ACADEMY_HABIT_NAME = 'Repasar las tarjetas';
export const STUDY_RULES = {
  /** Tarjetas que bastan para dar el hábito por hecho aunque la cola no se vacíe. */
  habitCards: 20,
  /** Tiempo máximo que cuenta por tarjeta. */
  maxMsPerCard: 120_000,
  /** XP por vaciar la cola del día (una vez al día). */
  clearBonus: 10,
};

export const academyFounded = (s: GameState) => s.habits.some((h) => h.id === ACADEMY_HABIT_ID);

export function foundAcademy(s: GameState, now: number): GameState {
  if (academyFounded(s)) return s;
  const habit: Habit = { id: ACADEMY_HABIT_ID, name: ACADEMY_HABIT_NAME, frequency: 'daily', createdAt: now, rewards: { sabiduria: 1 }, system: 'academy' };
  return { ...s, habits: [...s.habits, habit] };
}

export interface StudyRun {
  startedAt: number;
  /** Tiempo de cada respuesta, en ms (lo que tardaste en contestar cada tarjeta). */
  durations: number[];
  /** La cola de hoy quedó vacía. */
  cleared: boolean;
  /** «Mates · Derivadas» (para el historial). */
  label?: string;
}

/** Minutos de repaso real de una sesión. */
export const studyMinutes = (r: Pick<StudyRun, 'durations'>) =>
  Math.floor(r.durations.reduce((n, d) => n + Math.min(Math.max(d, 0), STUDY_RULES.maxMsPerCard), 0) / 60_000);

/** Cartas repasadas hoy (sumando las sesiones de Academy de hoy). */
export function cardsToday(s: GameState, now: number): number {
  const today = dayKey(now);
  return s.sessions.filter((x) => x.study && dayKey(x.endedAt) === today).reduce((n, x) => n + (x.study?.cards ?? 0), 0);
}

/**
 * Cierra una sesión de repaso: la guarda como Deep Work de estudio (si llegó al minuto), marca el hábito
 * cuando toca y da el bonus de cola vacía. Devuelve el XP total ganado.
 */
export function recordStudy(s: GameState, run: StudyRun, now: number): ActionResult {
  if (!run.durations.length) return { state: s, xp: 0 };
  let state = foundAcademy(s, now);
  let xp = 0;
  let capped = false;
  const minutes = Math.min(studyMinutes(run), XP_RULES.maxSessionMinutes);
  const session: DeepWorkSession = {
    id: uid(), questId: null, label: run.label ? `Repaso · ${run.label}` : 'Repaso de tarjetas', area: 'estudio',
    startedAt: run.startedAt, endedAt: now, minutes, focusPct: 100,
    study: { cards: run.durations.length, cleared: run.cleared },
  };
  state = { ...state, sessions: [...state.sessions, session] };
  if (minutes >= XP_RULES.minSessionMinutes) {
    const amount = minutes * XP_RULES.deepWorkPerMinute;
    state = { ...state, xp: [...state.xp, { id: uid(), at: now, amount, source: 'deepwork', sourceId: session.id, label: session.label, attributes: deepWorkRewards(minutes, 'estudio') }] };
    xp += amount;
  }
  const today = dayKey(now);
  const bonusId = `study-clear:${today}`;
  if (run.cleared && !state.xp.some((t) => t.sourceId === bonusId)) {
    state = { ...state, xp: [...state.xp, { id: uid(), at: now, amount: STUDY_RULES.clearBonus, source: 'deepwork', sourceId: bonusId, label: 'Cola de repaso vacía', attributes: { sabiduria: 1, voluntad: 1 } }] };
    xp += STUDY_RULES.clearBonus;
  }
  const done = state.habitCompletions.some((c) => c.habitId === ACADEMY_HABIT_ID && c.day === today);
  if (!done && (run.cleared || cardsToday(state, now) >= STUDY_RULES.habitCards)) {
    const r = toggleHabit(state, ACADEMY_HABIT_ID, now, today, true);
    state = r.state;
    xp += r.xp;
    capped = !!r.capped;
  }
  return { state, xp, capped };
}
