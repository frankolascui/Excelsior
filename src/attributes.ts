// Atributos y avatar. Recompensas hardcodeadas (sin editor todavía); el XP, el nivel
// y el historial de cada atributo se derivan de las transacciones de XP.
import type { AttributeId, AttributeRewards, GameState, QuestType } from './types';
import { dayKey, habitStreak, totalXp, uid, xpForLevel } from './game';
import { defeatedBosses } from './bosses';
import { kingdomProgress } from './kingdoms';

export const ATTRIBUTES: { id: AttributeId; name: string; icon: string }[] = [
  { id: 'voluntad', name: 'Voluntad', icon: '⚔️' },
  { id: 'sabiduria', name: 'Sabiduría', icon: '🧠' },
  { id: 'maestria', name: 'Maestría', icon: '🔨' },
  { id: 'conexion', name: 'Conexión', icon: '❤️' },
  { id: 'creacion', name: 'Creación', icon: '🌍' },
];

export const DEEP_WORK_AREAS = [
  { id: 'programacion', name: 'Programación' },
  { id: 'edicion', name: 'Edición' },
  { id: 'estudio', name: 'Estudio' },
  { id: 'general', name: 'General' },
] as const;

// ---------- Recompensas ----------

const QUEST_REWARDS: Record<QuestType, AttributeRewards> = {
  main: { voluntad: 5, maestria: 5 },
  side: { voluntad: 3 },
  daily: { voluntad: 3 }, // sin regla en el brief: igual que Secundaria
};

// Palabras clave (sin tildes) que llevan XP a Conexión y Creación.
const CONEXION_RE = /llamar|llamada|famili|amig|pareja|quedar|reunion|ayudar|mentor|agradec|visitar|cena con/;
const CREACION_RE = /crear|escribir|dibuj|pint|disen|grabar|video|publicar|componer|musica|lanzar|construir/;
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

/** Deep Work (cualquier área): +1 Maestría y +0,5 Voluntad por minuto (con decimales). */
export function deepWorkRewards(minutes: number): AttributeRewards {
  return { maestria: minutes, voluntad: minutes * 0.5 };
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
      const best = s.habits.reduce((m, h) => Math.max(m, habitStreak(s, h.id, now)), 0);
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

/**
 * Avatar actual: el último desbloqueado en orden (no se salta ninguno).
 * Progreso hacia el siguiente: media del progreso de sus requisitos.
 */
export function avatarInfo(s: GameState, now: number) {
  let i = 0;
  while (i + 1 < AVATARS.length && isAvatarUnlocked(s, AVATARS[i + 1], now)) i++;
  const current = AVATARS[i];
  const next = AVATARS[i + 1] ?? null;
  const requirements = next ? avatarRequirements(s, next).map((r) => requirementStatus(s, r, now)) : [];
  const progress = !next ? 1 : requirements.length ? requirements.reduce((n, r) => n + r.progress, 0) / requirements.length : 1;
  return { index: i, current, next, progress, requirements, met: requirements.filter((r) => r.met).length };
}

// ---------- Metas ----------

export function addGoal(
  s: GameState, g: { name: string; unit: string; start: number; target: number; avatarId: string }, now: number,
): GameState {
  return { ...s, goals: [...s.goals, { ...g, name: g.name.trim(), unit: g.unit.trim(), current: g.start, id: uid(), createdAt: now }] };
}

export function updateGoal(s: GameState, id: string, current: number): GameState {
  return { ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, current } : g)) };
}

export function deleteGoal(s: GameState, id: string): GameState {
  return { ...s, goals: s.goals.filter((g) => g.id !== id) };
}
