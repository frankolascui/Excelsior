// Academy dentro del juego (V3): repasar tarjetas cuenta como Deep Work de estudio y es un hábito.
// - Cada sesión de repaso se guarda como una sesión de Deep Work (área «estudio»): da 1 XP por minuto
//   de repaso real, como cualquier foco, y sube Sabiduría. El tiempo se mide por tarjeta (máximo 2 min cada una)
//   para que dejar la pantalla abierta no cuente.
// - El hábito del sistema «Estudiar» se marca solo el día que vacías la cola, repasas una ronda (8 tarjetas)
//   o entregas un simulacro (V3.5: antes solo contaban las tarjetas y se llamaba «Repasar las tarjetas»).
// - Vaciar la cola del día da un pequeño bonus (una vez al día).
import type { DeepWorkSession, GameState, Habit } from './types';
import { checkFocusHabit, completeQuest, dayKey, toggleHabit, uid, XP_RULES, type ActionResult } from './game';
import { deepWorkRewards } from './attributes';
import { pendingSimQuest } from './academy-exams';

export const ACADEMY_HABIT_ID = 'sys-academy';
export const ACADEMY_HABIT_NAME = 'Estudiar';
export const STUDY_RULES = {
  /** Tarjetas que bastan para dar el hábito por hecho aunque la cola no se vacíe. */
  habitCards: 8, // una ronda de repaso (BATCH en Review.tsx); antes 20 = casi 3 rondas
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
  const focus = checkFocusHabit(state, now);
  return { state: focus.state, xp: xp + focus.xp, capped: capped || !!focus.capped };
}

export interface ExamRun {
  /** Simulacro entregado: si tiene misión, se completa. */
  examId?: string;
  /** «Mates · Simulacro 1» (para el historial). */
  label: string;
  startedAt: number;
  /** Segundos que duró en la app; null si lo hiciste en papel (no se sabe el tiempo). */
  seconds: number | null;
}

/**
 * Entregar un simulacro es estudiar: marca el hábito «Estudiar» (la racha de Academy) y, si se hizo en la app,
 * su tiempo cuenta como Deep Work de estudio (1 XP por minuto, con el mismo tope que cualquier sesión).
 */
export function recordExam(s: GameState, run: ExamRun, now: number): ActionResult {
  let state = foundAcademy(s, now);
  let xp = 0;
  let capped = false;
  const minutes = run.seconds === null ? 0 : Math.min(Math.floor(run.seconds / 60), XP_RULES.maxSessionMinutes);
  if (minutes >= XP_RULES.minSessionMinutes) {
    const session: DeepWorkSession = {
      id: uid(), questId: null, label: `Simulacro · ${run.label}`, area: 'estudio',
      startedAt: run.startedAt, endedAt: now, minutes, focusPct: 100,
    };
    const amount = minutes * XP_RULES.deepWorkPerMinute;
    state = { ...state, sessions: [...state.sessions, session], xp: [...state.xp, { id: uid(), at: now, amount, source: 'deepwork', sourceId: session.id, label: session.label, attributes: deepWorkRewards(minutes, 'estudio') }] };
    xp += amount;
  }
  const today = dayKey(now);
  if (!state.habitCompletions.some((c) => c.habitId === ACADEMY_HABIT_ID && c.day === today)) {
    const r = toggleHabit(state, ACADEMY_HABIT_ID, now, today, true);
    state = r.state;
    xp += r.xp;
    capped = !!r.capped;
  }
  const quest = run.examId ? pendingSimQuest(state, run.examId) : undefined;
  if (quest) {
    const r = completeQuest(state, quest.id, now);
    state = r.state;
    xp += r.xp;
    capped = capped || !!r.capped;
  }
  const focus = checkFocusHabit(state, now);
  return { state: focus.state, xp: xp + focus.xp, capped: capped || !!focus.capped };
}
