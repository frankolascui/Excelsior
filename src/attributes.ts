// Atributos y avatar. Recompensas hardcodeadas (sin editor todavía); el XP, el nivel
// y el historial de cada atributo se derivan de las transacciones de XP.
import type { AttributeId, AttributeRewards, GameState, QuestType } from './types';
import { habitStreak, totalXp, uid, xpForLevel } from './game';

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

/** Recompensa por tipo de misión + bonus de Conexión/Creación si el título lo indica. */
export function questRewards(type: QuestType, title = ''): AttributeRewards {
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

export function habitRewards(name: string): AttributeRewards {
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
// Para subir de avatar hay que cumplir TODOS sus requisitos: niveles (global y de atributos)
// fijados aquí + las metas personales que el usuario asigne a ese avatar (dinero, peso, personas…).

export type AvatarRequirement =
  | { kind: 'globalLevel'; level: number }
  | { kind: 'attributeLevel'; id: AttributeId; level: number }
  | { kind: 'attributeXp'; min: number } // XP total de atributos
  | { kind: 'deepWorkMinutes'; min: number }
  | { kind: 'questsCompleted'; min: number; type?: QuestType }
  | { kind: 'habitStreak'; days: number } // racha activa de cualquier hábito
  | { kind: 'goal'; goalId: string }; // meta personal (Goal)

export interface AvatarDef {
  id: string;
  name: string;
  requirements: AvatarRequirement[];
}

const lvl = (level: number): AvatarRequirement => ({ kind: 'globalLevel', level });
const attr = (id: AttributeId, level: number): AvatarRequirement => ({ kind: 'attributeLevel', id, level });
const allAttrs = (level: number) => ATTRIBUTES.map((a) => attr(a.id, level));

export const AVATARS: AvatarDef[] = [
  { id: 'aprendiz', name: 'Aprendiz Constructor', requirements: [] },
  { id: 'disciplinado', name: 'Constructor Disciplinado', requirements: [lvl(3), attr('voluntad', 2)] },
  { id: 'artifice', name: 'Artífice', requirements: [lvl(6), attr('voluntad', 3), attr('maestria', 3)] },
  { id: 'arquitecto', name: 'Arquitecto', requirements: [lvl(10), attr('voluntad', 4), attr('maestria', 4), attr('sabiduria', 3)] },
  { id: 'fundador', name: 'Fundador', requirements: [lvl(15), ...allAttrs(4)] },
  { id: 'prime', name: 'Constructor Prime', requirements: [lvl(25), ...allAttrs(6)] },
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
      return check(s.sessions.reduce((n, x) => n + x.minutes, 0), req.min, `${req.min} min de Deep Work`);
    case 'questsCompleted': {
      const done = s.quests.filter((q) => q.completedAt && (!req.type || q.type === req.type)).length;
      return check(done, req.min, `${req.min} misiones completadas`);
    }
    case 'habitStreak': {
      const best = s.habits.reduce((m, h) => Math.max(m, habitStreak(s, h.id, now)), 0);
      return check(best, req.days, `Racha de ${req.days} días en un hábito`);
    }
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
