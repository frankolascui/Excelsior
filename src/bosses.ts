// Bosses: retos con vida y fecha límite inspirados en la mitología griega.
// El daño no se guarda: se deriva de lo que haces entre que aparece el boss y su fecha límite.
// Los de la escalera se desbloquean por nivel global y, dentro de cada saga, derrotando al anterior.
import type { AttributeId, Boss, BossSource, GameState } from './types';
import { levelInfo, totalXp, uid } from './game';

const DAY = 86_400_000;
export const MAX_ACTIVE_BOSSES = 2;

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

// Cuánto «XP equivalente» vale un punto de daño de cada fuente (para calcular el botín de los bosses propios).
const XP_EQUIVALENT: Record<BossSource, number> = {
  xp: 1, deepwork: 1, habits: 10, voluntad: 3, sabiduria: 3, maestria: 3, conexion: 3, creacion: 3,
};

/** Botín en monedas de un boss propio: un extra sobre lo que ya ganarías (1 moneda / 5 XP), según la dificultad. */
export function bossReward(source: BossSource, hp: number): number {
  return Math.max(5, Math.round((hp * XP_EQUIVALENT[source]) / 8));
}

/** Rango de dificultad: 1 Bestia, 2 Heroico, 3 Legendario, 4 Titánico. */
export type BossTier = 1 | 2 | 3 | 4;
export const TIERS: Record<BossTier, { name: string; roman: string }> = {
  1: { name: 'Bestia', roman: 'I' },
  2: { name: 'Heroico', roman: 'II' },
  3: { name: 'Legendario', roman: 'III' },
  4: { name: 'Titánico', roman: 'IV' },
};

export interface Saga {
  id: string;
  name: string;
  blurb: string;
}

export const SAGAS: Saga[] = [
  { id: 'heroe', name: 'Saga del Héroe', blurb: 'Las tres bestias que todo héroe debe vencer antes de que le canten.' },
  { id: 'inframundo', name: 'Saga del Inframundo', blurb: 'Baja al reino de las sombras y vuelve con algo que el resto no tiene.' },
  { id: 'ingenio', name: 'Saga del Ingenio', blurb: 'Enigmas, fuego y bronce: aquí no basta la fuerza.' },
  { id: 'odisea', name: 'Saga de la Odisea', blurb: 'El largo viaje de vuelta a casa, entre cíclopes y cantos.' },
  { id: 'primordial', name: 'Saga Primordial', blurb: 'Antes de los dioses hubo Caos, Titanes y monstruos. Este es el final.' },
];

export interface BossTemplate {
  id: string;
  /** Cómo se le nombra en los avisos: «Derrota a la Hidra». */
  short: string;
  name: string;
  icon: string;
  source: BossSource;
  hp: number;
  days: number;
  lore: string;
  saga: string;
  tier: BossTier;
  /** Nivel global mínimo para invocarlo. */
  level: number;
  /** Boss de la saga al que hay que haber derrotado antes. */
  requires?: string;
  /** Monedas al derrotarlo. */
  reward: number;
  /** Sobrenombre épico que se lee sobre su nombre en el combate: «La de las nueve cabezas». */
  epithet?: string;
}

/**
 * Nombre partido para el combate: el título grande y lo que le sigue («Hidra» · «de la Procrastinación»,
 * «Hades» · «señor de las Sombras»). Si no hay por dónde partirlo, todo es título.
 */
export function splitBossName(name: string): { title: string; rest: string } {
  const n = name.trim();
  const comma = n.indexOf(', ');
  if (comma > 0) return { title: n.slice(0, comma), rest: n.slice(comma + 2) };
  const m = n.match(/^(.+?)\s+((?:del?|el|la|los|las)\s.+|primordial)$/i);
  return m ? { title: m[1], rest: m[2] } : { title: n, rest: '' };
}

// La escalera. Los nombres de los ocho originales no cambian: las partidas antiguas los reconocen por nombre.
export const BOSS_TEMPLATES: BossTemplate[] = [
  // Saga del Héroe
  { id: 'hidra', short: 'la Hidra', name: 'Hidra de la Procrastinación', icon: '🐉', source: 'xp', hp: 700, days: 7, saga: 'heroe', tier: 1, level: 5, reward: 90,
    epithet: 'La de las nueve cabezas',
    lore: 'Por cada tarea que aplazas le crecen dos cabezas.' },
  { id: 'medusa', short: 'Medusa', name: 'Medusa de la Distracción', icon: '🐍', source: 'deepwork', hp: 300, days: 7, saga: 'heroe', tier: 2, level: 8, requires: 'hidra', reward: 140,
    epithet: 'La mirada que petrifica',
    lore: 'Quien mira el móvil se queda de piedra.' },
  { id: 'minotauro', short: 'el Minotauro', name: 'Minotauro de la Rutina', icon: '🐂', source: 'habits', hp: 30, days: 10, saga: 'heroe', tier: 2, level: 12, requires: 'medusa', reward: 180,
    epithet: 'Señor del Laberinto',
    lore: 'Vive en el laberinto de los días iguales. Tu hilo de Ariadna: un hábito cada día.' },
  // Saga del Inframundo
  { id: 'cerbero', short: 'Cerbero', name: 'Cerbero de la Pereza', icon: '🐺', source: 'voluntad', hp: 150, days: 7, saga: 'inframundo', tier: 1, level: 5, reward: 80,
    epithet: 'Guardián de las puertas del Hades',
    lore: 'Tres cabezas: «luego», «mañana» y «total, para qué».' },
  { id: 'caronte', short: 'Caronte', name: 'Caronte el Barquero', icon: '⛵', source: 'xp', hp: 1400, days: 10, saga: 'inframundo', tier: 2, level: 10, requires: 'cerbero', reward: 150,
    epithet: 'El que cruza la laguna Estigia',
    lore: 'Cobra en XP el paso de la laguna Estigia. Sin óbolo, te quedas en la orilla.' },
  { id: 'hades', short: 'Hades', name: 'Hades, señor de las Sombras', icon: '💀', source: 'deepwork', hp: 900, days: 14, saga: 'inframundo', tier: 3, level: 18, requires: 'caronte', reward: 320,
    epithet: 'Rey del Inframundo',
    lore: 'Reina sobre todos los que se fueron «un ratito» a las redes y nunca volvieron.' },
  // Saga del Ingenio
  { id: 'esfinge', short: 'la Esfinge', name: 'Esfinge de la Ignorancia', icon: '🦁', source: 'sabiduria', hp: 80, days: 7, saga: 'ingenio', tier: 1, level: 5, reward: 75,
    epithet: 'Guardiana de los enigmas',
    lore: 'Solo deja pasar a quien aprende algo cada día.' },
  { id: 'quimera', short: 'la Quimera', name: 'Quimera del Perfeccionismo', icon: '🔥', source: 'creacion', hp: 80, days: 10, saga: 'ingenio', tier: 2, level: 11, requires: 'esfinge', reward: 150,
    epithet: 'Aliento de fuego, tres bestias en una',
    lore: 'León del miedo, cabra de la duda, serpiente del «aún no está listo». Vence publicando.' },
  { id: 'talos', short: 'Talos', name: 'Talos, el gigante de bronce', icon: '🗿', source: 'maestria', hp: 250, days: 14, saga: 'ingenio', tier: 3, level: 16, requires: 'quimera', reward: 300,
    epithet: 'Coloso forjado por Hefesto',
    lore: 'Forjado por Hefesto. Solo cae ante la técnica pulida golpe a golpe.' },
  // Saga de la Odisea
  { id: 'polifemo', short: 'Polifemo', name: 'Polifemo el Solitario', icon: '👁️', source: 'conexion', hp: 40, days: 7, saga: 'odisea', tier: 1, level: 5, reward: 75,
    epithet: 'El cíclope de la cueva',
    lore: 'Un solo ojo y ningún amigo. No acabes como él.' },
  { id: 'sirenas', short: 'las Sirenas', name: 'Las Sirenas del Scroll', icon: '🧜', source: 'voluntad', hp: 220, days: 10, saga: 'odisea', tier: 2, level: 13, requires: 'polifemo', reward: 150,
    epithet: 'El canto que hunde barcos',
    lore: 'Su canto es una notificación infinita. Átate al mástil como Ulises.' },
  { id: 'escila', short: 'Escila y Caribdis', name: 'Escila y Caribdis', icon: '🌊', source: 'habits', hp: 45, days: 14, saga: 'odisea', tier: 3, level: 20, requires: 'sirenas', reward: 320,
    epithet: 'Entre el monstruo y el remolino',
    lore: 'A un lado, el exceso que te quema; al otro, el remolino de no hacer nada. Pasa por el medio: constancia.' },
  // Saga Primordial
  { id: 'caos', short: 'Caos', name: 'Caos primordial', icon: '🌀', source: 'creacion', hp: 60, days: 7, saga: 'primordial', tier: 2, level: 15, reward: 200,
    epithet: 'El vacío antes de todo',
    lore: 'Antes del mundo solo había Caos. Vence creando algo.' },
  { id: 'cronos', short: 'Cronos', name: 'Cronos, devorador del tiempo', icon: '⏳', source: 'deepwork', hp: 1500, days: 21, saga: 'primordial', tier: 4, level: 24, requires: 'caos', reward: 550,
    epithet: 'Rey de los Titanes',
    lore: 'Hermano de Hiperión. Devora cada hora que no proteges.' },
  { id: 'tifon', short: 'Tifón', name: 'Tifón, padre de monstruos', icon: '🌪️', source: 'xp', hp: 6000, days: 30, saga: 'primordial', tier: 4, level: 30, requires: 'cronos', reward: 1000,
    epithet: 'Terror de los dioses',
    lore: 'El jefe final. Hasta Zeus le temió.' },
];

export function templateById(id: string | undefined): BossTemplate | undefined {
  return id ? BOSS_TEMPLATES.find((t) => t.id === id) : undefined;
}

/** Plantilla de un boss: por su templateId o, en partidas antiguas, por el nombre. Undefined si es un boss propio. */
export function templateOf(b: Pick<Boss, 'name'> & { templateId?: string }): BossTemplate | undefined {
  return templateById(b.templateId) ?? BOSS_TEMPLATES.find((t) => t.name === b.name);
}

export function sagaOf(t: BossTemplate): Saga {
  return SAGAS.find((x) => x.id === t.saga)!;
}

/** Veces que has derrotado a un boss de la escalera. */
export function timesDefeated(s: GameState, templateId: string, now: number): number {
  return s.bosses.filter((b) => templateOf(b)?.id === templateId && bossStatus(s, b, now).defeated).length;
}

export type BossLock = { kind: 'level'; level: number; label: string } | { kind: 'requires'; id: string; label: string };

/**
 * Por qué no puedes invocar aún un boss de la escalera (null si está desbloqueado).
 * Si ya lo derrotaste alguna vez (p. ej. en una partida antigua), sigue desbloqueado.
 */
export function bossLock(s: GameState, templateId: string, now: number): BossLock | null {
  const t = templateById(templateId);
  if (!t || timesDefeated(s, t.id, now) > 0) return null;
  const level = levelInfo(totalXp(s)).level;
  if (level < t.level) return { kind: 'level', level: t.level, label: `Nivel ${t.level}` };
  const prev = templateById(t.requires);
  if (prev && timesDefeated(s, prev.id, now) === 0) return { kind: 'requires', id: prev.id, label: `Derrota a ${prev.short}` };
  return null;
}

export function isActiveTemplate(s: GameState, templateId: string, now: number): boolean {
  return s.bosses.some((b) => templateOf(b)?.id === templateId && bossStatus(s, b, now).active);
}

/** Si puedes invocar ya un boss de la escalera, y si no, el motivo (en español, para la interfaz). */
export function summonCheck(s: GameState, templateId: string, now: number): { ok: true } | { ok: false; reason: string } {
  const t = templateById(templateId);
  if (!t) return { ok: false, reason: 'Ese boss no existe' };
  const lock = bossLock(s, templateId, now);
  if (lock) return { ok: false, reason: lock.label };
  if (isActiveTemplate(s, templateId, now)) return { ok: false, reason: 'Ya está en combate' };
  if (activeBosses(s, now).length >= MAX_ACTIVE_BOSSES) return { ok: false, reason: `Máximo ${MAX_ACTIVE_BOSSES} a la vez` };
  return { ok: true };
}

export function addBoss(
  s: GameState,
  b: { name: string; icon: string; source: BossSource; hp: number; days: number; reward?: number; templateId?: string },
  now: number,
): GameState {
  const hp = Math.max(1, Math.round(b.hp));
  const boss: Boss = {
    id: uid(), name: b.name.trim(), icon: b.icon, source: b.source, hp,
    createdAt: now, deadline: now + Math.max(1, Math.round(b.days)) * DAY, reward: b.reward ?? bossReward(b.source, hp),
  };
  if (b.templateId) boss.templateId = b.templateId;
  return { ...s, bosses: [...s.bosses, boss] };
}

/**
 * Invoca un boss de la escalera sin mirar candados: lo usa el reto semanal de Hiperión, que puede abrirte
 * la puerta de un boss que aún no te toca. En la Arena se usa summonBoss, que sí respeta nivel y sagas.
 */
export function summonTemplate(s: GameState, templateId: string, now: number): GameState {
  const t = templateById(templateId);
  return t ? addBoss(s, { ...t, templateId: t.id }, now) : s;
}

/** Invoca un boss de la escalera si está desbloqueado, no está ya en combate y hay hueco. */
export function summonBoss(s: GameState, templateId: string, now: number): { state: GameState; ok: boolean; reason?: string } {
  const check = summonCheck(s, templateId, now);
  if (!check.ok) return { state: s, ok: false, reason: check.reason };
  return { state: summonTemplate(s, templateId, now), ok: true };
}

/** Bosses de la escalera que se desbloquean al derrotar a este (si además tienes el nivel). */
export function nextInSaga(templateId: string): BossTemplate[] {
  return BOSS_TEMPLATES.filter((t) => t.requires === templateId);
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

/** Fase del combate según la vida que le queda: solo cambia el aspecto (herido por debajo del 50 %, furioso del 25 %). */
export type BossPhase = 'calma' | 'herido' | 'furioso';
export function bossPhase(hpLeft: number, hp: number): BossPhase {
  const left = hp > 0 ? hpLeft / hp : 0;
  if (left <= 0.25) return 'furioso';
  if (left <= 0.5) return 'herido';
  return 'calma';
}

export function activeBosses(s: GameState, now: number) {
  return s.bosses.filter((b) => bossStatus(s, b, now).active);
}

export function defeatedBosses(s: GameState, now: number) {
  return s.bosses.filter((b) => bossStatus(s, b, now).defeated);
}
