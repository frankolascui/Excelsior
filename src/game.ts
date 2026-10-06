// Reglas del juego: funciones puras sobre GameState. Toda la lógica de XP,
// niveles, rachas y límites anti-farmeo vive aquí para poder probarla.
import type {
  ActiveTimer, AttributeId, AttributeRewards, GameState, Habit, Quest, QuestType, XPSource, XPTransaction, DeepWorkSession, DeepWorkArea, FocusPhase,
} from './types';
import { deepWorkRewards, habitRewards, inferDeepWorkArea, questRewards } from './attributes';
import { defaultRewards } from './economy';
import { ADMIN } from './admin';

// Valores iniciales; el spec (§7) pide balancearlos durante el testing.
export const XP_RULES = {
  quest: { side: 15, daily: 20, main: 50 } as Record<QuestType, number>,
  habit: 10,
  deepWorkPerMinute: 1,
  // Anti-farmeo: tope diario de XP por misiones y por hábitos.
  // El Deep Work no tiene tope diario porque está limitado por tiempo real.
  dailyCap: { quest: 200, habit: 100 },
  capPerLevel: { quest: 25, habit: 10 }, // cada nivel sube el tope diario
  maxSessionMinutes: 240,
  minSessionMinutes: 1,
};

export const QUEST_LABEL: Record<QuestType, string> = {
  daily: 'Diaria',
  main: 'Principal',
  side: 'Secundaria',
};

const TITLES: [number, string][] = [
  [50, 'Maestro'],
  [20, 'Experto'],
  [10, 'Competente'],
  [5, 'Aprendiz'],
  [1, 'Novato'],
];

export function emptyState(): GameState {
  return {
    version: 5,
    profile: null,
    quests: [],
    habits: [],
    habitCompletions: [],
    sessions: [],
    xp: [],
    activeTimer: null,
    kingdoms: [],
    goals: [],
    rewards: [],
    purchases: [],
    bosses: [],
  };
}

/**
 * Migra datos de versiones anteriores: (re)calcula las recompensas de atributo de hábitos y
 * el XP de atributo de cada acción pasada con las reglas actuales (v1 no tenía atributos;
 * v2 no daba Conexión/Creación y redondeaba la Voluntad del Deep Work).
 */
export function migrate(raw: { version: number } & Record<string, unknown>): GameState {
  const s = migrateToV4(raw);
  // v4 → v5: aparecen monedas, tienda de recompensas y bosses.
  if (raw.version < 5) return { ...s, rewards: defaultRewards(Date.now()), purchases: [], bosses: [] };
  return s;
}

function migrateToV4(raw: { version: number } & Record<string, unknown>): GameState {
  const base = { ...emptyState(), ...raw, version: 5 } as GameState;
  // v3 → v4: los reinos pasan a tener construcciones (misiones) y aparecen las metas; no hay nada que recalcular.
  if (raw.version >= 3) return { ...base, kingdoms: base.kingdoms.map(({ id, name, createdAt }) => ({ id, name, createdAt: createdAt ?? Date.now() })) };
  const habits = base.habits.map((h) => ({ ...h, rewards: habitRewards(h.name) }));
  const sessions = base.sessions.map((x) => ({ ...x, area: x.area ?? ('general' as const) }));
  const xp = base.xp.map((t) => {
    if (t.source === 'quest') {
      const q = base.quests.find((x) => x.id === t.sourceId);
      return q ? { ...t, attributes: questRewards(q.type, q.title) } : t;
    }
    if (t.source === 'habit') {
      const c = base.habitCompletions.find((x) => x.id === t.sourceId);
      const h = c && habits.find((x) => x.id === c.habitId);
      return h ? { ...t, attributes: h.rewards } : t;
    }
    const session = sessions.find((x) => x.id === t.sourceId);
    return session ? { ...t, attributes: deepWorkRewards(session.minutes, session.area) } : t;
  });
  return { ...base, habits, sessions, xp };
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shiftDay(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

// ---------- Niveles ----------

/** XP acumulado necesario para alcanzar el nivel L: 50·L·(L−1). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function titleFor(level: number): string {
  return TITLES.find(([min]) => level >= min)![1];
}

export function nextTitle(level: number): { level: number; title: string } | null {
  const next = [...TITLES].reverse().find(([min]) => min > level);
  return next ? { level: next[0], title: next[1] } : null;
}

export function levelInfo(totalXp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const base = xpForLevel(level);
  const needed = xpForLevel(level + 1) - base;
  const current = totalXp - base;
  return { level, title: titleFor(level), current, needed, progress: current / needed };
}

// ---------- Consultas ----------

export function totalXp(s: GameState): number {
  return s.xp.reduce((sum, t) => sum + t.amount, 0);
}

export function xpOnDay(s: GameState, day: string, source?: XPSource): number {
  return s.xp
    .filter((t) => dayKey(t.at) === day && (!source || t.source === source))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function deepWorkMinutesOnDay(s: GameState, day: string): number {
  return s.sessions.filter((x) => dayKey(x.endedAt) === day).reduce((n, x) => n + x.minutes, 0);
}

export function isHabitDone(s: GameState, habitId: string, day: string): boolean {
  return s.habitCompletions.some((c) => c.habitId === habitId && c.day === day);
}

/** Lunes (YYYY-MM-DD) de la semana de `ts`. */
export function weekStart(ts: number): string {
  const d = new Date(ts);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12).getTime());
}

/** Veces que se hizo el hábito en la semana (lunes a domingo) de `ts`. */
export function habitWeekCount(s: GameState, habitId: string, ts: number): number {
  const start = weekStart(ts);
  const end = dayKey(shiftDay(new Date(`${start}T12:00:00`).getTime(), 6));
  return s.habitCompletions.filter((c) => c.habitId === habitId && c.day >= start && c.day <= end).length;
}

/** ¿Ya cumplió su objetivo de la semana? (los diarios: ¿está hecho hoy?) */
export function habitSatisfied(s: GameState, h: Habit, now: number): boolean {
  return h.frequency === 'weekly' ? habitWeekCount(s, h.id, now) >= (h.perWeek ?? 1) : isHabitDone(s, h.id, dayKey(now));
}

/**
 * Racha: días seguidos para los diarios; semanas seguidas cumpliendo el objetivo para los semanales
 * (la semana en curso cuenta solo si ya está cumplida).
 */
export function habitStreak(s: GameState, habitId: string, now: number): number {
  const habit = s.habits.find((h) => h.id === habitId);
  if (habit?.frequency === 'weekly') {
    const need = habit.perWeek ?? 1;
    let cursor = habitWeekCount(s, habitId, now) >= need ? now : shiftDay(now, -7);
    let weeks = 0;
    while (habitWeekCount(s, habitId, cursor) >= need) {
      weeks++;
      cursor = shiftDay(cursor, -7);
    }
    return weeks;
  }
  return dailyStreak(s, habitId, now);
}

/** Racha en días equivalentes (una semana cumplida = 7 días), para los requisitos de avatar. */
export function habitStreakDays(s: GameState, habitId: string, now: number): number {
  const habit = s.habits.find((h) => h.id === habitId);
  const n = habitStreak(s, habitId, now);
  return habit?.frequency === 'weekly' ? n * 7 : n;
}

function dailyStreak(s: GameState, habitId: string, now: number): number {
  const days = new Set(s.habitCompletions.filter((c) => c.habitId === habitId).map((c) => c.day));
  let cursor = days.has(dayKey(now)) ? now : shiftDay(now, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Tope diario de XP: crece con el nivel con el que empezaste el día (más nivel, más margen). */
export function dailyCap(s: GameState, source: 'quest' | 'habit', now: number): number {
  const level = levelInfo(totalXp(s) - xpOnDay(s, dayKey(now))).level;
  return XP_RULES.dailyCap[source] + XP_RULES.capPerLevel[source] * (level - 1);
}

function cappedAmount(s: GameState, source: 'quest' | 'habit', base: number, now: number): number {
  if (ADMIN) return base; // la partida de pruebas no tiene topes
  const left = dailyCap(s, source, now) - xpOnDay(s, dayKey(now), source);
  return Math.max(0, Math.min(base, left));
}

function withXp(s: GameState, tx: Omit<XPTransaction, 'id'>): GameState {
  if (tx.amount <= 0) return s;
  return { ...s, xp: [...s.xp, { ...tx, id: uid() }] };
}

export interface ActionResult {
  state: GameState;
  xp: number;
  capped?: boolean;
}

// ---------- Personaje ----------

export function createProfile(s: GameState, name: string, habitNames: string[], now: number): GameState {
  return {
    ...s,
    profile: { name: name.trim(), createdAt: now },
    habits: habitNames.map((n) => ({ id: uid(), name: n, frequency: 'daily' as const, createdAt: now, rewards: habitRewards(n) })),
    rewards: s.rewards.length ? s.rewards : defaultRewards(now),
    balance: 2, // equilibrio de atributos actual
    ascended: [], // se asciende de avatar con los rituales de Hiperión
  };
}

// ---------- Misiones ----------

/** Límites de lo personalizable: los topes diarios siguen protegiendo del farmeo. */
export const CUSTOM_LIMITS = { questXp: 100, habitXp: 50, attribute: 20 };

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n * 10) / 10));

/** Limpia unas recompensas a medida: sin negativos, sin ceros y con tope por atributo. */
export function cleanRewards(r: AttributeRewards): AttributeRewards {
  const out: AttributeRewards = {};
  for (const [id, n] of Object.entries(r)) {
    const v = clamp(Number(n) || 0, CUSTOM_LIMITS.attribute);
    if (v > 0) out[id as AttributeId] = v;
  }
  return out;
}

export interface QuestOptions {
  kingdomId?: string;
  focus?: AttributeId;
  xp?: number;
  rewards?: AttributeRewards;
  deadline?: string;
}

export function questXp(q: Quest): number {
  return q.xp ?? XP_RULES.quest[q.type];
}

export function questAttributeRewards(q: Quest): AttributeRewards {
  return q.rewards ?? questRewards(q.type, q.title, q.focus);
}

export function addQuest(s: GameState, title: string, type: QuestType, now: number, opts: QuestOptions = {}): GameState {
  const quest: Quest = { id: uid(), title: title.trim(), type, createdAt: now, completedAt: null };
  if (opts.kingdomId) quest.kingdomId = opts.kingdomId;
  if (opts.focus) quest.focus = opts.focus;
  if (opts.xp !== undefined) quest.xp = Math.round(clamp(opts.xp, CUSTOM_LIMITS.questXp));
  if (opts.rewards) quest.rewards = cleanRewards(opts.rewards);
  if (opts.deadline) quest.deadline = opts.deadline;
  return { ...s, quests: [...s.quests, quest] };
}

/** Pone o quita (null) la fecha límite de una misión. */
export function setQuestDeadline(s: GameState, id: string, day: string | null): GameState {
  return {
    ...s,
    quests: s.quests.map((q) => {
      if (q.id !== id) return q;
      const next = { ...q };
      if (day) next.deadline = day;
      else delete next.deadline;
      return next;
    }),
  };
}

/** Días que faltan hasta la fecha límite (0 = hoy, negativo = vencida), o null si no tiene. */
export function daysUntil(day: string | undefined, now: number): number | null {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const today = new Date(now);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
}

/** Edita una misión. `xp`/`rewards` a undefined vuelven al valor automático. Lo ya ganado no cambia. */
export function updateQuest(
  s: GameState, id: string, patch: { title?: string; type?: QuestType; xp?: number; rewards?: AttributeRewards },
): GameState {
  return {
    ...s,
    quests: s.quests.map((q) => {
      if (q.id !== id) return q;
      const next: Quest = { ...q, title: patch.title?.trim() || q.title, type: patch.type ?? q.type };
      delete next.xp;
      delete next.rewards;
      delete next.focus;
      if (patch.xp !== undefined) next.xp = Math.round(clamp(patch.xp, CUSTOM_LIMITS.questXp));
      if (patch.rewards) next.rewards = cleanRewards(patch.rewards);
      return next;
    }),
  };
}

export function completeQuest(s: GameState, id: string, now: number): ActionResult {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.completedAt) return { state: s, xp: 0 };
  const base = questXp(q);
  const amount = cappedAmount(s, 'quest', base, now);
  let state: GameState = { ...s, quests: s.quests.map((x) => (x.id === id ? { ...x, completedAt: now } : x)) };
  state = withXp(state, { at: now, amount, source: 'quest', sourceId: id, label: q.title, attributes: questAttributeRewards(q) });
  return { state, xp: amount, capped: amount < base };
}

/** Deshacer devuelve la misión a pendiente y retira su XP (evita farmear marcando/desmarcando). */
export function undoQuest(s: GameState, id: string): GameState {
  return {
    ...s,
    quests: s.quests.map((x) => (x.id === id ? { ...x, completedAt: null } : x)),
    xp: s.xp.filter((t) => !(t.source === 'quest' && t.sourceId === id)),
  };
}

export function deleteQuest(s: GameState, id: string): GameState {
  return { ...s, quests: s.quests.filter((x) => x.id !== id) };
}

// ---------- Hábitos ----------

export function habitXp(h: Habit): number {
  return h.xp ?? XP_RULES.habit;
}

export function addHabit(
  s: GameState, name: string, now: number, opts: { focus?: AttributeId; xp?: number; rewards?: AttributeRewards; perWeek?: number } = {},
): GameState {
  const habit: Habit = {
    id: uid(), name: name.trim(), frequency: 'daily', createdAt: now,
    rewards: opts.rewards ? cleanRewards(opts.rewards) : habitRewards(name, opts.focus),
  };
  if (opts.perWeek && opts.perWeek < 7) {
    habit.frequency = 'weekly';
    habit.perWeek = Math.max(1, Math.min(6, Math.round(opts.perWeek)));
  }
  if (opts.xp !== undefined) habit.xp = Math.round(clamp(opts.xp, CUSTOM_LIMITS.habitXp));
  return { ...s, habits: [...s.habits, habit] };
}

/** Edita un hábito; los cambios valen para los próximos días (lo ya ganado no cambia). */
export function updateHabit(s: GameState, id: string, patch: { name?: string; xp?: number; rewards?: AttributeRewards }): GameState {
  return {
    ...s,
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const next: Habit = { ...h, name: patch.name?.trim() || h.name, rewards: patch.rewards ? cleanRewards(patch.rewards) : habitRewards(patch.name ?? h.name) };
      delete next.xp;
      if (patch.xp !== undefined) next.xp = Math.round(clamp(patch.xp, CUSTOM_LIMITS.habitXp));
      return next;
    }),
  };
}

export function deleteHabit(s: GameState, id: string): GameState {
  return { ...s, habits: s.habits.filter((h) => h.id !== id) };
}

/** Marca el hábito como hecho hoy, o lo desmarca (retirando su XP). */
export function toggleHabit(s: GameState, habitId: string, now: number): ActionResult {
  const habit = s.habits.find((h) => h.id === habitId);
  if (!habit) return { state: s, xp: 0 };
  const day = dayKey(now);
  const existing = s.habitCompletions.find((c) => c.habitId === habitId && c.day === day);
  if (existing) {
    const removed = s.xp.find((t) => t.source === 'habit' && t.sourceId === existing.id)?.amount ?? 0;
    return {
      state: {
        ...s,
        habitCompletions: s.habitCompletions.filter((c) => c.id !== existing.id),
        xp: s.xp.filter((t) => !(t.source === 'habit' && t.sourceId === existing.id)),
      },
      xp: -removed,
    };
  }
  const completion = { id: uid(), habitId, day, at: now };
  const base = habitXp(habit);
  const amount = cappedAmount(s, 'habit', base, now);
  let state: GameState = { ...s, habitCompletions: [...s.habitCompletions, completion] };
  state = withXp(state, { at: now, amount, source: 'habit', sourceId: completion.id, label: habit.name, attributes: habit.rewards });
  return { state, xp: amount, capped: amount < base };
}

// ---------- Deep Work ----------

/** `targetMinutes = 0` es una sesión libre (cronómetro); > 0 es una cuenta atrás de minutos de foco. */
export function startTimer(
  s: GameState, questId: string | null, targetMinutes: number, now: number,
  opts: { area?: DeepWorkArea; intent?: string; pomodoro?: { focus: number; rest: number } } = {},
): GameState {
  if (s.activeTimer) return s;
  const intent = opts.intent?.trim().slice(0, 80) || undefined;
  const quest = questId ? s.quests.find((q) => q.id === questId) : undefined;
  const timer: ActiveTimer = {
    startedAt: now, questId, targetMinutes, area: opts.area ?? inferDeepWorkArea(intent ?? quest?.title),
    phase: 'focus', phaseStartedAt: now, focusMs: 0, breakMs: 0, distractionMs: 0, distractions: 0,
  };
  if (intent) timer.intent = intent;
  if (opts.pomodoro) {
    timer.pomodoro = opts.pomodoro;
    timer.pomoDone = 0;
  }
  return { ...s, activeTimer: timer };
}

/** Estado del Pomodoro en curso: lo que queda de foco o de descanso. */
export function pomodoroStatus(t: ActiveTimer, now: number) {
  if (!t.pomodoro) return null;
  const totals = timerTotals(t, now);
  const done = t.pomoDone ?? 0;
  const focusLeft = Math.max(0, (done + 1) * t.pomodoro.focus * 60_000 - totals.focusMs);
  const restLeft = totals.phase === 'break' && t.restMs ? Math.max(0, t.restMs - (now - (t.phaseStartedAt ?? now))) : null;
  return { done, focusLeft, restLeft };
}

/** Al acabar un pomodoro: lo cuenta y empieza el descanso. */
export function pomodoroStep(s: GameState, now: number): GameState {
  const t = s.activeTimer;
  const st = t && pomodoroStatus(t, now);
  if (!t?.pomodoro || !st || (t.phase ?? 'focus') !== 'focus' || st.focusLeft > 0) return s;
  const done = st.done + 1;
  const next = setPhase(s, 'break', now);
  return { ...next, activeTimer: { ...next.activeTimer!, pomoDone: done, restMs: t.pomodoro.rest * 60_000 } };
}

export interface TimerTotals {
  phase: FocusPhase;
  focusMs: number;
  breakMs: number;
  distractionMs: number;
  distractions: number;
}

const PHASE_KEY = { focus: 'focusMs', break: 'breakMs', distraction: 'distractionMs' } as const;

/** Tiempo acumulado por fase hasta `now`, incluida la fase en curso. */
export function timerTotals(t: ActiveTimer, now: number): TimerTotals {
  const phase = t.phase ?? 'focus';
  const totals = {
    phase,
    focusMs: t.focusMs ?? 0,
    breakMs: t.breakMs ?? 0,
    distractionMs: t.distractionMs ?? 0,
    distractions: t.distractions ?? 0,
  };
  totals[PHASE_KEY[phase]] += Math.max(0, now - (t.phaseStartedAt ?? t.startedAt));
  return totals;
}

/** % de foco real: foco / (foco + distracción) × 100. Los descansos no cuentan en contra. */
export function focusPercent(focusMs: number, distractionMs: number): number {
  const total = focusMs + distractionMs;
  return total === 0 ? 100 : Math.round((focusMs / total) * 100);
}

/** Cambia de fase (foco, descanso, distracción) guardando el tiempo de la fase anterior. */
export function setPhase(s: GameState, phase: FocusPhase, now: number): GameState {
  const t = s.activeTimer;
  if (!t || (t.phase ?? 'focus') === phase) return s;
  const totals = timerTotals(t, now);
  return {
    ...s,
    activeTimer: {
      ...t,
      phase,
      phaseStartedAt: now,
      focusMs: totals.focusMs,
      breakMs: totals.breakMs,
      distractionMs: totals.distractionMs,
      distractions: totals.distractions + (phase === 'distraction' ? 1 : 0),
      restMs: undefined,
    },
  };
}

export function cancelTimer(s: GameState): GameState {
  return { ...s, activeTimer: null };
}

export interface StopResult extends ActionResult {
  session: DeepWorkSession | null;
}

/**
 * Termina la sesión: la duración sale del reloj, el usuario no la introduce.
 * Solo el tiempo de foco da XP; en cuenta atrás, como mucho los minutos objetivo.
 */
export function stopTimer(s: GameState, now: number): StopResult {
  const t = s.activeTimer;
  if (!t) return { state: s, xp: 0, session: null };
  const totals = timerTotals(t, now);
  let elapsed = Math.floor(totals.focusMs / 60000);
  if (t.targetMinutes > 0) elapsed = Math.min(elapsed, t.targetMinutes);
  const minutes = Math.min(elapsed, XP_RULES.maxSessionMinutes);
  if (minutes < XP_RULES.minSessionMinutes) {
    return { state: { ...s, activeTimer: null }, xp: 0, session: null };
  }
  const quest = t.questId ? s.quests.find((q) => q.id === t.questId) : undefined;
  const session: DeepWorkSession = {
    id: uid(),
    questId: quest?.id ?? null,
    label: quest?.title ?? t.intent ?? 'Deep Work libre',
    area: t.area ?? 'general',
    startedAt: t.startedAt,
    endedAt: now,
    minutes,
    breakMinutes: Math.floor(totals.breakMs / 60000),
    distractionMinutes: Math.floor(totals.distractionMs / 60000),
    distractions: totals.distractions,
    focusPct: focusPercent(totals.focusMs, totals.distractionMs),
  };
  if (t.pomodoro) session.pomodoros = t.pomoDone ?? 0;
  const amount = minutes * XP_RULES.deepWorkPerMinute;
  let state: GameState = { ...s, activeTimer: null, sessions: [...s.sessions, session] };
  state = withXp(state, {
    at: now, amount, source: 'deepwork', sourceId: session.id, label: session.label, attributes: deepWorkRewards(minutes, session.area),
  });
  return { state, xp: amount, session, capped: elapsed > XP_RULES.maxSessionMinutes };
}

// ---------- ¿Qué hago ahora? ----------

export type Suggestion =
  | { kind: 'timer' }
  | { kind: 'quest'; quest: Quest }
  | { kind: 'habit'; habitId: string; name: string }
  | { kind: 'create' }
  | { kind: 'done' };

const QUEST_PRIORITY: Record<QuestType, number> = { main: 0, daily: 1, side: 2 };

/**
 * Pendientes por urgencia: primero lo vencido o que vence en 2 días (por fecha),
 * luego por tipo (Principal → Diaria → Secundaria) y antigüedad.
 */
export function pendingQuests(s: GameState, now = Date.now()): Quest[] {
  const urgent = (q: Quest) => {
    const d = daysUntil(q.deadline, now);
    return d !== null && d <= 2 ? d : null;
  };
  return s.quests
    .filter((q) => !q.completedAt)
    .sort((a, b) => {
      const ua = urgent(a), ub = urgent(b);
      if (ua !== null || ub !== null) {
        if (ua === null) return 1;
        if (ub === null) return -1;
        if (ua !== ub) return ua - ub;
      }
      return QUEST_PRIORITY[a.type] - QUEST_PRIORITY[b.type] || a.createdAt - b.createdAt;
    });
}

export function suggest(s: GameState, now: number): Suggestion {
  if (s.activeTimer) return { kind: 'timer' };
  if (s.quests.length === 0) return { kind: 'create' };
  const quest = pendingQuests(s, now)[0];
  if (quest) return { kind: 'quest', quest };
  const day = dayKey(now);
  const habit = s.habits.find((h) => !isHabitDone(s, h.id, day) && !habitSatisfied(s, h, now));
  if (habit) return { kind: 'habit', habitId: habit.id, name: habit.name };
  return { kind: 'done' };
}

// ---------- Tutoriales vistos ----------

export function hasSeenTour(s: GameState, id: string): boolean {
  return s.tours?.includes(id) ?? false;
}

export function markTour(s: GameState, id: string): GameState {
  return hasSeenTour(s, id) ? s : { ...s, tours: [...(s.tours ?? []), id] };
}

/** Modo admin: XP de prueba repartido entre todos los atributos (solo en la partida de pruebas). */
export function grantAdminXp(s: GameState, amount: number, now: number): GameState {
  const per = Math.round((amount / 10) * 10) / 10;
  const tx: XPTransaction = {
    id: uid(), at: now, amount, source: 'admin', sourceId: 'admin', label: 'Modo admin',
    attributes: { voluntad: per, sabiduria: per, maestria: per, conexion: per, creacion: per },
  };
  return { ...s, xp: [...s.xp, tx] };
}

/** Modo admin: XP justo para llegar al nivel indicado (si ya lo tienes, no hace nada). */
export function adminToLevel(s: GameState, level: number, now: number): GameState {
  const missing = xpForLevel(Math.max(1, Math.floor(level))) - totalXp(s);
  return missing > 0 ? grantAdminXp(s, missing, now) : s;
}

/**
 * Modo admin: rellena los últimos `days` días (sin contar hoy) como si hubieras jugado:
 * todos tus hábitos hechos y una hora de Deep Work cada día. Sirve para probar rachas, días activos y avatares.
 */
export function simulatePastDays(s: GameState, days: number, now: number): GameState {
  let next = s;
  for (let d = days; d >= 1; d--) {
    const at = new Date(shiftDay(now, -d)).setHours(12, 0, 0, 0);
    const day = dayKey(at);
    for (const h of next.habits) {
      if (isHabitDone(next, h.id, day)) continue;
      const completion = { id: uid(), habitId: h.id, day, at };
      next = withXp({ ...next, habitCompletions: [...next.habitCompletions, completion] }, {
        at, amount: habitXp(h), source: 'habit', sourceId: completion.id, label: h.name, attributes: h.rewards,
      });
    }
    if (!next.sessions.some((x) => dayKey(x.endedAt) === day)) {
      const session: DeepWorkSession = {
        id: uid(), questId: null, label: 'Sesión simulada', area: 'general', startedAt: at - 3600000, endedAt: at, minutes: 60, focusPct: 100,
      };
      next = withXp({ ...next, sessions: [...next.sessions, session] }, {
        at, amount: 60 * XP_RULES.deepWorkPerMinute, source: 'deepwork', sourceId: session.id, label: session.label, attributes: deepWorkRewards(60, 'general'),
      });
    }
  }
  return next;
}
