// Atributos y avatar. Recompensas hardcodeadas (sin editor todavía); el XP, el nivel
// y el historial de cada atributo se derivan de las transacciones de XP.
import type { AttributeId, AttributeRewards, DeepWorkArea, GameState, Goal, QuestType, RitualAnswer } from './types';
import { dayKey, habitStreakDays, totalXp, uid, xpForLevel } from './game';
import { defeatedBosses } from './bosses';
import { kingdomProgress } from './kingdoms';

export interface AttributeDef {
  id: AttributeId;
  name: string;
  icon: string;
  desc: string;
  examples: string;
  /** Nivel global en el que se despierta (antes cuenta igual, pero no se muestra). */
  unlockLevel?: number;
}

// Definiciones de Nicolas (2026-10-06). El id 'creacion' se conserva para no romper partidas: hoy se llama Impacto.
export const ATTRIBUTES: AttributeDef[] = [
  {
    id: 'voluntad', name: 'Voluntad', icon: '⚔️',
    desc: 'Disciplina: hacer lo que no te apetece y salir de tu zona de confort.',
    examples: 'Entrenar sin ganas, madrugar, cumplir la misión del día, aguantar la racha.',
  },
  {
    id: 'sabiduria', name: 'Sabiduría', icon: '🧠',
    desc: 'Lo teórico: entender y saber. En mates, conocer las fórmulas y cuándo se usan.',
    examples: 'Leer, estudiar, hacer apuntes, ver un curso, Deep Work de Estudio.',
  },
  {
    id: 'maestria', name: 'Maestría', icon: '🔨',
    desc: 'Lo práctico: aplicar lo que sabes para sacar un resultado. Usar las fórmulas para resolver un problema concreto.',
    examples: 'Resolver ejercicios, programar, editar, terminar un proyecto, Deep Work práctico.',
  },
  {
    id: 'conexion', name: 'Conexión', icon: '❤️',
    desc: 'Tus relaciones: familia, amigos, pareja y atreverte a hablar con desconocidos.',
    examples: 'Llamar a tu familia, quedar con amigos, hablar con alguien nuevo.',
  },
  {
    id: 'creacion', name: 'Impacto', icon: '🌍', unlockLevel: 10,
    desc: 'El atributo avanzado: impactar y ayudar a la gente con lo que creas.',
    examples: 'Lanzar una app que usan otros, publicar, enseñar, ayudar, voluntariado.',
  },
];

export function attributeDef(id: AttributeId): AttributeDef {
  return ATTRIBUTES.find((a) => a.id === id)!;
}

// Qué sube una sesión de Deep Work según lo que vas a hacer: la práctica (resolver, crear) sube Maestría
// y la teoría (estudiar, leer, repasar) sube Sabiduría. Si no se sabe, un poco de las dos.
const PRACTICA_RE = /(program|codig|\bapp\b|proyecto|ejercicio|problema|practic|edit|disen|escrib|constru|grab|video|dibuj|compon|montaj|desarroll|implement|debug|arregl|examen de prueba|simulacro)/;
const ESTUDIO_RE = /(estudi|leer|lectura|repas|teori|apunte|memori|aprend|curso|clase|tema|libro|resum|flashcard|formula|investig|document|ver la leccion)/;

export function inferDeepWorkArea(text: string | undefined): DeepWorkArea {
  if (!text) return 'general';
  const n = normalize(text);
  if (PRACTICA_RE.test(n)) return 'practica';
  if (ESTUDIO_RE.test(n)) return 'estudio';
  return 'general';
}

export const DEEP_WORK_AREA_HINT: Record<DeepWorkArea, string> = {
  estudio: '🧠 Sabiduría (teoría)', practica: '🔨 Maestría (práctica)', programacion: '🔨 Maestría (práctica)', edicion: '🔨 Maestría (práctica)', general: '🧠 Sabiduría y 🔨 Maestría',
};

// ---------- Recompensas ----------

const QUEST_REWARDS: Record<QuestType, AttributeRewards> = {
  main: { voluntad: 5, maestria: 5 },
  side: { voluntad: 3 },
  daily: { voluntad: 3 }, // sin regla en el brief: igual que Secundaria
};

// Palabras clave (sin tildes) que llevan XP a Conexión e Impacto.
const CONEXION_RE = /llamar|llamada|famili|amig|pareja|novi[ao]|padre|madre|herman|abuel|quedar|reunion|agradec|visitar|cena con|desconocid|hablar con|conocer gente|cita/;
const CREACION_RE = /ayudar|voluntari|ensenar|mentor|publicar|lanzar|app\b|aplicacion|usuarios|clientes|donar|crear|escribir|dibuj|pint|disen|grabar|video|componer|musica|construir/;
const QUEST_KEYWORD_BONUS = 3;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function add(a: AttributeRewards, b: AttributeRewards): AttributeRewards {
  const out = { ...a };
  for (const [id, n] of Object.entries(b)) out[id as AttributeId] = (out[id as AttributeId] ?? 0) + (n ?? 0);
  return out;
}

/**
 * Recompensa por tipo de misión + bonus de atributo: el elegido a mano (`focus`)
 * o, si no hay, Conexión/Creación cuando el título lo indica.
 */
export function questRewards(type: QuestType, title = '', focus?: AttributeId): AttributeRewards {
  if (focus) return add(QUEST_REWARDS[type], { [focus]: QUEST_KEYWORD_BONUS });
  const t = normalize(title);
  let r = QUEST_REWARDS[type];
  if (CONEXION_RE.test(t)) r = add(r, { conexion: QUEST_KEYWORD_BONUS });
  if (CREACION_RE.test(t)) r = add(r, { creacion: QUEST_KEYWORD_BONUS });
  return r;
}

// El primer patrón que coincide con el nombre del hábito decide sus recompensas.
const HABIT_RULES: [RegExp, AttributeRewards][] = [
  [/medit/, { voluntad: 3, sabiduria: 2 }],
  [/entren|gym|gimnas|ejercicio|correr/, { voluntad: 5 }],
  [/journal|diario/, { sabiduria: 4 }],
  [/leer|lectura|estudi/, { sabiduria: 3 }],
  [CONEXION_RE, { conexion: 4 }],
  [CREACION_RE, { creacion: 4 }],
];
const HABIT_DEFAULT: AttributeRewards = { voluntad: 2 };

const HABIT_FOCUS_XP = 4;

/** Atributo elegido a mano (`focus`) o deducido del nombre del hábito. */
export function habitRewards(name: string, focus?: AttributeId): AttributeRewards {
  if (focus) return { [focus]: HABIT_FOCUS_XP };
  const n = normalize(name);
  return HABIT_RULES.find(([re]) => re.test(n))?.[1] ?? HABIT_DEFAULT;
}

/**
 * Deep Work por minuto (equilibrado el 2026-10-06; antes +1 Maestría y +0,5 Voluntad en cualquier área):
 * teoría (estudio) → +0,5 Sabiduría; práctica → +0,5 Maestría; sin saberlo → +0,25 de cada una.
 * Siempre +0,25 Voluntad.
 */
export function deepWorkRewards(minutes: number, area: DeepWorkArea = 'general'): AttributeRewards {
  const r = (n: number) => Math.round(n * minutes * 10) / 10;
  const base: AttributeRewards = { voluntad: r(0.25) };
  if (area === 'estudio') return { ...base, sabiduria: r(0.5) };
  if (area === 'practica' || area === 'programacion' || area === 'edicion') return { ...base, maestria: r(0.5) };
  return { ...base, maestria: r(0.25), sabiduria: r(0.25) };
}

/** Versión del equilibrio de atributos guardada en la partida. */
export const BALANCE_VERSION = 2;

/** Recalcula el XP de atributo de las sesiones de Deep Work pasadas con el equilibrio actual (una sola vez). */
export function rebalance(s: GameState): GameState {
  if ((s.balance ?? 1) >= BALANCE_VERSION) return s;
  const xp = s.xp.map((t) => {
    if (t.source !== 'deepwork') return t;
    const session = s.sessions.find((x) => x.id === t.sourceId);
    return session ? { ...t, attributes: deepWorkRewards(session.minutes, session.area) } : t;
  });
  return { ...s, xp, balance: BALANCE_VERSION };
}

/** XP de atributo con hasta un decimal: 22,5. */
export function formatAttrXp(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

// ---------- Consultas ----------

export function attributeXp(s: GameState): Record<AttributeId, number> {
  const totals = { voluntad: 0, sabiduria: 0, maestria: 0, conexion: 0, creacion: 0 };
  for (const t of s.xp) {
    for (const [id, n] of Object.entries(t.attributes ?? {})) totals[id as AttributeId] += n ?? 0;
  }
  return totals;
}

export function totalAttributeXp(s: GameState): number {
  return Object.values(attributeXp(s)).reduce((a, b) => a + b, 0);
}

/** Nivel de atributo L requiere 25·L·(L−1) XP de ese atributo (Nv2 = 50, Nv3 = 150, Nv5 = 500). */
export function attributeLevel(xp: number) {
  const req = (l: number) => 25 * l * (l - 1);
  let level = 1;
  while (req(level + 1) <= xp) level++;
  const current = xp - req(level);
  const needed = req(level + 1) - req(level);
  return { level, current, needed, progress: current / needed };
}

export function attributeHistory(s: GameState, id: AttributeId) {
  return s.xp
    .filter((t) => (t.attributes?.[id] ?? 0) > 0)
    .map((t) => ({ at: t.at, label: t.label, amount: t.attributes![id]! }));
}

// ---------- Avatar ----------
// Para subir de avatar hay que cumplir TODOS sus requisitos. Los fijos son iguales para todo el mundo
// (nivel global, niveles de atributo y hazañas); además, cada uno puede jurar metas personales
// (dinero, peso, personas…) para su siguiente avatar. Diseño y ritmos estimados: docs/progresion-avatares.md.

export type AvatarRequirement =
  | { kind: 'globalLevel'; level: number }
  | { kind: 'attributeLevel'; id: AttributeId; level: number }
  | { kind: 'attributeXp'; min: number } // XP total de atributos
  | { kind: 'deepWorkMinutes'; min: number }
  | { kind: 'questsCompleted'; min: number; type?: QuestType }
  | { kind: 'habitStreak'; days: number } // racha activa de cualquier hábito
  | { kind: 'goal'; goalId: string } // meta personal (Goal)
  | { kind: 'bossesDefeated'; min: number }
  | { kind: 'kingdomsCompleted'; min: number } // reinos con todas sus construcciones (mín. 3)
  | { kind: 'activeDays'; min: number }; // días distintos con algo de XP

export interface AvatarDef {
  id: string;
  name: string;
  icon: string;
  motto: string;
  requirements: AvatarRequirement[];
}

const lvl = (level: number): AvatarRequirement => ({ kind: 'globalLevel', level });
const attr = (id: AttributeId, level: number): AvatarRequirement => ({ kind: 'attributeLevel', id, level });
const allAttrs = (level: number) => ATTRIBUTES.map((a) => attr(a.id, level));

const feat = {
  dw: (hours: number): AvatarRequirement => ({ kind: 'deepWorkMinutes', min: hours * 60 }),
  streak: (days: number): AvatarRequirement => ({ kind: 'habitStreak', days }),
  bosses: (min: number): AvatarRequirement => ({ kind: 'bossesDefeated', min }),
  kingdoms: (min: number): AvatarRequirement => ({ kind: 'kingdomsCompleted', min }),
  days: (min: number): AvatarRequirement => ({ kind: 'activeDays', min }),
};

// Ids antiguos conservados (las metas personales se guardan por avatarId).
export const AVATARS: AvatarDef[] = [
  { id: 'aprendiz', name: 'Aprendiz', icon: '🪓', motto: 'Todo imperio empezó con una sola piedra.', requirements: [] },
  { id: 'iniciado', name: 'Iniciado', icon: '🕯️', motto: 'Has encendido la llama.', requirements: [lvl(3), feat.days(3)] },
  { id: 'disciplinado', name: 'Disciplinado', icon: '🛡️', motto: 'La disciplina es tu escudo.', requirements: [lvl(5), attr('voluntad', 3), feat.streak(7)] },
  { id: 'artifice', name: 'Artífice', icon: '⚒️', motto: 'Tus manos ya crean cosas reales.', requirements: [lvl(8), attr('maestria', 5), feat.dw(10)] },
  { id: 'arquitecto', name: 'Arquitecto', icon: '📐', motto: 'Piensas antes de construir.', requirements: [lvl(12), attr('sabiduria', 3), feat.kingdoms(1), feat.days(30)] },
  { id: 'cazador', name: 'Cazador de Bestias', icon: '🏹', motto: 'Los monstruos ya te temen.', requirements: [lvl(16), attr('voluntad', 6), feat.bosses(3)] },
  { id: 'forjador', name: 'Forjador', icon: '🔥', motto: 'Forjas tu carácter cada día.', requirements: [lvl(20), attr('maestria', 8), attr('conexion', 3), feat.dw(50)] },
  { id: 'fundador', name: 'Fundador', icon: '🏰', motto: 'Has levantado reinos de la nada.', requirements: [lvl(25), ...allAttrs(4), feat.kingdoms(3), feat.streak(21)] },
  { id: 'titan', name: 'Titán', icon: '⚡', motto: 'Caminas entre dioses.', requirements: [lvl(32), ...allAttrs(6), feat.bosses(10), feat.streak(30)] },
  { id: 'prime', name: 'Excelsior', icon: '🌟', motto: 'Siempre más alto.', requirements: [lvl(40), ...allAttrs(8), feat.dw(200), feat.days(300)] },
];

/** Requisitos fijos del avatar + metas personales asignadas a él. */
export function avatarRequirements(s: GameState, avatar: AvatarDef): AvatarRequirement[] {
  const goals = s.goals.filter((g) => g.avatarId === avatar.id).map((g): AvatarRequirement => ({ kind: 'goal', goalId: g.id }));
  return [...avatar.requirements, ...goals];
}

/** Progreso de una meta de start a target (sirve para subir o bajar, p. ej. peso). */
export function goalProgress(g: { start: number; target: number; current: number }): number {
  if (g.target === g.start) return g.current === g.target ? 1 : 0;
  return Math.max(0, Math.min(1, (g.current - g.start) / (g.target - g.start)));
}

export interface RequirementStatus {
  met: boolean;
  progress: number; // 0..1
  label: string;
}

const attrName = (id: AttributeId) => ATTRIBUTES.find((a) => a.id === id)!.name;
const attrLevelXp = (level: number) => 25 * level * (level - 1);

export function requirementStatus(s: GameState, req: AvatarRequirement, now: number): RequirementStatus {
  const check = (value: number, min: number, label: string): RequirementStatus => ({
    met: value >= min,
    progress: min <= 0 ? 1 : Math.min(1, value / min),
    label,
  });
  switch (req.kind) {
    case 'globalLevel':
      return check(totalXp(s), xpForLevel(req.level), `Nivel global ${req.level}`);
    case 'attributeLevel':
      return check(attributeXp(s)[req.id], attrLevelXp(req.level), `${attrName(req.id)} nivel ${req.level}`);
    case 'attributeXp':
      return check(totalAttributeXp(s), req.min, `${formatAttrXp(req.min)} XP de atributos`);
    case 'deepWorkMinutes':
      return check(s.sessions.reduce((n, x) => n + x.minutes, 0), req.min, req.min % 60 ? `${req.min} min de Deep Work` : `${req.min / 60} h de Deep Work`);
    case 'questsCompleted': {
      const done = s.quests.filter((q) => q.completedAt && (!req.type || q.type === req.type)).length;
      return check(done, req.min, `${req.min} misiones completadas`);
    }
    case 'habitStreak': {
      const best = s.habits.reduce((m, h) => Math.max(m, habitStreakDays(s, h.id, now)), 0); // semanales: semanas × 7
      return check(best, req.days, `Racha de ${req.days} días en un hábito`);
    }
    case 'bossesDefeated':
      return check(defeatedBosses(s, now).length, req.min, `${req.min} ${req.min === 1 ? 'boss derrotado' : 'bosses derrotados'}`);
    case 'kingdomsCompleted': {
      const done = s.kingdoms.filter((k) => {
        const p = kingdomProgress(s, k.id);
        return p.complete && p.total >= 3;
      }).length;
      return check(done, req.min, `${req.min} ${req.min === 1 ? 'reino completado' : 'reinos completados'} (mín. 3 construcciones)`);
    }
    case 'activeDays':
      return check(new Set(s.xp.map((t) => dayKey(t.at))).size, req.min, `${req.min} días con progreso`);
    case 'goal': {
      const g = s.goals.find((x) => x.id === req.goalId);
      if (!g) return { met: true, progress: 1, label: 'Meta borrada' };
      const p = goalProgress(g);
      return { met: p >= 1, progress: p, label: `${g.name}: ${formatAttrXp(g.current)} / ${formatAttrXp(g.target)}${g.unit ? ` ${g.unit}` : ''}` };
    }
  }
}

export function isAvatarUnlocked(s: GameState, avatar: AvatarDef, now: number): boolean {
  return avatarRequirements(s, avatar).every((r) => requirementStatus(s, r, now).met);
}

/** Avatares alcanzados con la regla antigua (automática): para partidas anteriores a los rituales. */
function legacyIndex(s: GameState, now: number): number {
  let i = 0;
  while (i + 1 < AVATARS.length && isAvatarUnlocked(s, AVATARS[i + 1], now)) i++;
  return i;
}

/**
 * Avatar actual: el último al que has ascendido con su ritual (en orden, sin saltos).
 * `ready`: cumples los requisitos del siguiente y Hiperión te espera para el ritual.
 * Progreso hacia el siguiente: media del progreso de sus requisitos.
 */
export function avatarInfo(s: GameState, now: number) {
  let i = 0;
  if (s.ascended) while (i + 1 < AVATARS.length && s.ascended.includes(AVATARS[i + 1].id)) i++;
  else i = legacyIndex(s, now);
  const current = AVATARS[i];
  const next = AVATARS[i + 1] ?? null;
  const requirements = next ? avatarRequirements(s, next).map((r) => requirementStatus(s, r, now)) : [];
  const progress = !next ? 1 : requirements.length ? requirements.reduce((n, r) => n + r.progress, 0) / requirements.length : 1;
  const met = requirements.filter((r) => r.met).length;
  return { index: i, current, next, progress, requirements, met, ready: !!next && met === requirements.length };
}

/** Congela el avatar de las partidas anteriores a los rituales, para que no lo pierdan ni asciendan solas. */
export function ensureAscended(s: GameState, now: number): GameState {
  if (s.ascended || !s.profile) return s;
  return { ...s, ascended: AVATARS.slice(1, legacyIndex(s, now) + 1).map((a) => a.id) };
}

/** Termina el ritual: guarda las respuestas, asciende al avatar y añade los objetivos que hayas jurado. */
export function completeRitual(
  s: GameState, avatarId: string,
  r: { answers: RitualAnswer[]; oath: string; goals?: { name: string; unit: string; start: number; target: number; avatarId: string; deadline?: number }[] },
  now: number,
): GameState {
  let next: GameState = {
    ...s,
    ascended: [...new Set([...(ensureAscended(s, now).ascended ?? []), avatarId])],
    rituals: [...(s.rituals ?? []), { avatarId, at: now, answers: r.answers, oath: r.oath }],
  };
  for (const g of r.goals ?? []) next = addGoal(next, g, now);
  return next;
}

// ---------- Metas ----------

export function addGoal(
  s: GameState, g: { name: string; unit: string; start: number; target: number; avatarId: string; deadline?: number; metricId?: string }, now: number,
): GameState {
  const goal: Goal = { ...g, name: g.name.trim(), unit: g.unit.trim(), current: g.start, id: uid(), createdAt: now };
  if (!goal.metricId) delete goal.metricId;
  return { ...s, goals: [...s.goals, goal] };
}

export function updateGoal(s: GameState, id: string, current: number): GameState {
  return { ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, current } : g)) };
}

export function deleteGoal(s: GameState, id: string): GameState {
  return { ...s, goals: s.goals.filter((g) => g.id !== id) };
}

// ---------- Revisiones de los objetivos con fecha ----------

const DAY = 86_400_000;

/** Días de revisión de un grupo de objetivos: cada 30 días y el último día del plazo. */
export function reviewDays(goals: Goal[]): number[] {
  const created = goals[0].createdAt;
  const total = Math.max(1, Math.round((Math.max(...goals.map((g) => g.deadline ?? created)) - created) / DAY));
  const days: number[] = [];
  for (let d = 30; d < total; d += 30) days.push(d);
  days.push(total);
  return days;
}

export interface DueReview {
  batch: number;
  day: number;
  final: boolean;
  goals: Goal[];
}

/** Revisión pendiente más antigua: la última parada alcanzada de un grupo que aún no se ha revisado. */
export function dueReview(s: GameState, now: number): DueReview | null {
  const batches = new Map<number, Goal[]>();
  for (const g of s.goals) if (g.deadline) batches.set(g.createdAt, [...(batches.get(g.createdAt) ?? []), g]);
  for (const [batch, goals] of [...batches].sort((a, b) => a[0] - b[0])) {
    const elapsed = Math.floor((now - batch) / DAY);
    const days = reviewDays(goals);
    const reached = days.filter((d) => d <= elapsed).at(-1);
    if (reached === undefined) continue;
    const done = (s.reviews ?? []).some((r) => r.batch === batch && r.day >= reached);
    if (!done) return { batch, day: reached, final: reached === days.at(-1), goals };
  }
  return null;
}

export function recordReview(s: GameState, batch: number, day: number, note: string, now: number): GameState {
  return { ...s, reviews: [...(s.reviews ?? []), { batch, day, at: now, note: note.trim() }] };
}

/** Renegociar: más plazo para un objetivo. */
export function extendGoal(s: GameState, id: string, days: number): GameState {
  return { ...s, goals: s.goals.map((g) => (g.id === id && g.deadline ? { ...g, deadline: g.deadline + days * DAY } : g)) };
}

/** Renegociar: otra meta para el mismo objetivo. */
export function setGoalTarget(s: GameState, id: string, target: number): GameState {
  return { ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, target } : g)) };
}
