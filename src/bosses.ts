// Bosses: retos con vida y fecha límite inspirados en la mitología griega.
// El daño no se guarda: se deriva de lo que haces entre que aparece el boss y su fecha límite.
import type { AttributeId, Boss, BossSource, GameState } from './types';
import { uid } from './game';

const DAY = 86_400_000;
export const MAX_ACTIVE_BOSSES = 3;

export const SOURCE_LABEL: Record<BossSource, { name: string; unit: string; hint: string }> = {
  xp: { name: 'Cualquier XP', unit: 'XP', hint: 'cada XP que ganes es un tajo' },
  deepwork: { name: 'Deep Work', unit: 'min de foco', hint: 'solo le hiere tu foco real' },
  habits: { name: 'Hábitos', unit: 'hábitos', hint: 'cada hábito completado es un golpe' },
  voluntad: { name: 'Voluntad', unit: 'XP de Voluntad', hint: 'solo le hiere la Voluntad' },
  sabiduria: { name: 'Sabiduría', unit: 'XP de Sabiduría', hint: 'solo le hiere la Sabiduría' },
  maestria: { name: 'Maestría', unit: 'XP de Maestría', hint: 'solo le hiere la Maestría' },
  conexion: { name: 'Conexión', unit: 'XP de Conexión', hint: 'solo le hiere la Conexión' },
  creacion: { name: 'Impacto', unit: 'XP de Impacto', hint: 'solo le hiere el Impacto' },
};

// Cuánto «XP equivalente» vale un punto de daño de cada fuente (para calcular el botín).
const XP_EQUIVALENT: Record<BossSource, number> = {
  xp: 1, deepwork: 1, habits: 10, voluntad: 3, sabiduria: 3, maestria: 3, conexion: 3, creacion: 3,
};

/** Botín en monedas: un extra sobre lo que ya ganarías (1 moneda / 5 XP), según la dificultad. */
export function bossReward(source: BossSource, hp: number): number {
  return Math.max(5, Math.round((hp * XP_EQUIVALENT[source]) / 8));
}

export interface BossTemplate {
  id: string;
  name: string;
  icon: string;
  source: BossSource;
  hp: number;
  days: number;
  lore: string;
}

export const BOSS_TEMPLATES: BossTemplate[] = [
  { id: 'hidra', name: 'Hidra de la Procrastinación', icon: '🐉', source: 'xp', hp: 700, days: 7, lore: 'Por cada tarea que aplazas le crecen dos cabezas.' },
  { id: 'medusa', name: 'Medusa de la Distracción', icon: '🐍', source: 'deepwork', hp: 300, days: 7, lore: 'Quien mira el móvil se queda de piedra.' },
  { id: 'minotauro', name: 'Minotauro de la Rutina', icon: '🐂', source: 'habits', hp: 20, days: 7, lore: 'Vive en el laberinto de los días iguales.' },
  { id: 'cerbero', name: 'Cerbero de la Pereza', icon: '🐺', source: 'voluntad', hp: 150, days: 7, lore: 'Tres cabezas: «luego», «mañana» y «total, para qué».' },
  { id: 'esfinge', name: 'Esfinge de la Ignorancia', icon: '🦁', source: 'sabiduria', hp: 60, days: 7, lore: 'Solo deja pasar a quien aprende algo cada día.' },
  { id: 'polifemo', name: 'Polifemo el Solitario', icon: '👁️', source: 'conexion', hp: 40, days: 7, lore: 'Un solo ojo y ningún amigo. No acabes como él.' },
  { id: 'caos', name: 'Caos primordial', icon: '🌀', source: 'creacion', hp: 40, days: 7, lore: 'Antes del mundo solo había Caos. Vence creando algo.' },
  { id: 'tifon', name: 'Tifón, padre de monstruos', icon: '🌪️', source: 'xp', hp: 4000, days: 30, lore: 'El jefe final del mes. Hasta Zeus le temió.' },
];

export function addBoss(
  s: GameState, b: { name: string; icon: string; source: BossSource; hp: number; days: number }, now: number,
): GameState {
  const hp = Math.max(1, Math.round(b.hp));
  const boss: Boss = {
    id: uid(), name: b.name.trim(), icon: b.icon, source: b.source, hp,
    createdAt: now, deadline: now + Math.max(1, Math.round(b.days)) * DAY, reward: bossReward(b.source, hp),
  };
  return { ...s, bosses: [...s.bosses, boss] };
}

export function summonTemplate(s: GameState, templateId: string, now: number): GameState {
  const t = BOSS_TEMPLATES.find((x) => x.id === templateId);
  return t ? addBoss(s, t, now) : s;
}

export function deleteBoss(s: GameState, id: string): GameState {
  return { ...s, bosses: s.bosses.filter((b) => b.id !== id) };
}

/** Golpes (momento y daño) que ha recibido el boss dentro de su ventana, en orden. */
function hits(s: GameState, b: Boss): { at: number; dmg: number }[] {
  const inWindow = (at: number) => at >= b.createdAt && at <= b.deadline;
  let out: { at: number; dmg: number }[];
  if (b.source === 'deepwork') out = s.sessions.filter((x) => inWindow(x.endedAt)).map((x) => ({ at: x.endedAt, dmg: x.minutes }));
  else if (b.source === 'habits') out = s.xp.filter((t) => t.source === 'habit' && inWindow(t.at)).map((t) => ({ at: t.at, dmg: 1 }));
  else if (b.source === 'xp') out = s.xp.filter((t) => inWindow(t.at)).map((t) => ({ at: t.at, dmg: t.amount }));
  else {
    const id = b.source as AttributeId;
    out = s.xp.filter((t) => inWindow(t.at) && (t.attributes?.[id] ?? 0) > 0).map((t) => ({ at: t.at, dmg: t.attributes![id]! }));
  }
  return out.sort((a, c) => a.at - c.at);
}

export function bossStatus(s: GameState, b: Boss, now: number) {
  let damage = 0;
  let defeatedAt: number | null = null;
  for (const h of hits(s, b)) {
    damage += h.dmg;
    if (defeatedAt === null && damage >= b.hp) defeatedAt = h.at;
  }
  const defeated = defeatedAt !== null;
  const expired = !defeated && now > b.deadline;
  return {
    damage: Math.min(damage, b.hp),
    hpLeft: Math.max(0, b.hp - damage),
    progress: Math.min(1, damage / b.hp),
    defeated,
    defeatedAt,
    expired,
    active: !defeated && !expired,
    msLeft: Math.max(0, b.deadline - now),
  };
}

export function activeBosses(s: GameState, now: number) {
  return s.bosses.filter((b) => bossStatus(s, b, now).active);
}

export function defeatedBosses(s: GameState, now: number) {
  return s.bosses.filter((b) => bossStatus(s, b, now).defeated);
}
