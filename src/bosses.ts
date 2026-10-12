// Bosses: retos con vida y fecha límite inspirados en la mitología griega.
// El daño no se guarda: se deriva de lo que haces entre que aparece el boss y su fecha límite.
// Los de la escalera se desbloquean por nivel global y, dentro de cada saga, derrotando al anterior.
import type { AttributeId, Boss, BossSource, GameState, XPTransaction } from './types';
import type { IconName } from './icon-data';
import { dayKey, levelInfo, totalXp, uid } from './game';

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
  icon: IconName;
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
  /** Lo que le hace difícil de matar. */
  ability: BossAbility;
  /** Lo que le hiere de más en cuanto queda herido (≤ 50 % de vida). */
  weakness: BossWeakness;
}

/**
 * Habilidad de un boss:
 * - regen: cada 24 h seguidas sin recibir daño recupera `pct` % de su vida máxima.
 * - armor: los golpes de menos de `min` (minutos o XP de su fuente) rebotan.
 * - cap: no puede perder más de `pct` % de su vida en un mismo día.
 */
export type BossAbility = { name: string } & ({ kind: 'regen'; pct: number } | { kind: 'armor'; min: number } | { kind: 'cap'; pct: number });

/** Punto débil: desde que queda herido, cada unidad de `source` le hace `per` de daño extra. */
export interface BossWeakness {
  name: string;
  source: BossSource;
  per: number;
}

/** Explicación corta de la habilidad, para la interfaz. */
export function abilityText(a: BossAbility, source: BossSource): string {
  if (a.kind === 'regen') return `Cada día entero sin recibir daño recupera un ${a.pct} % de su vida.`;
  if (a.kind === 'cap') return `No puede perder más de un ${a.pct} % de su vida en un mismo día.`;
  return `Los golpes de menos de ${a.min} ${SOURCE_LABEL[source].unit} rebotan.`;
}

const WEAK_UNIT: Record<BossSource, [string, string]> = {
  xp: ['XP', 'XP'], deepwork: ['min de foco', 'min de foco'], habits: ['hábito', 'hábitos'],
  voluntad: ['XP de Voluntad', 'XP de Voluntad'], sabiduria: ['XP de Sabiduría', 'XP de Sabiduría'], maestria: ['XP de Maestría', 'XP de Maestría'],
  conexion: ['XP de Conexión', 'XP de Conexión'], creacion: ['XP de Impacto', 'XP de Impacto'],
};

/** «Cada 10 min de foco le quita 1 extra», «Cada hábito le quita 5 extra». */
export function weaknessText(w: BossWeakness): string {
  const [one, many] = WEAK_UNIT[w.source];
  if (w.per >= 1) return `Cada ${one} le quita ${fmt(w.per)} de vida extra.`;
  const every = Math.round(1 / w.per);
  return `Cada ${every} ${many} le quitan 1 de vida extra.`;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Golpe crítico: daño doble. */
export const CRIT_MULTIPLIER = 2;
export const CRIT_RULES = 'Crítico (daño doble): sesiones de Deep Work de 90 min o más, misiones principales y hábitos en racha de 3 días o más.';

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
  { id: 'hidra', short: 'la Hidra', name: 'Hidra de la Procrastinación', icon: 'hydra', source: 'xp', hp: 700, days: 7, saga: 'heroe', tier: 1, level: 5, reward: 90,
    epithet: 'La de las nueve cabezas',
    ability: { kind: 'regen', pct: 6, name: 'Cabezas que rebrotan' }, weakness: { source: 'voluntad', per: 2, name: 'Fuego de Yolao' },
    lore: 'Por cada tarea que aplazas le crecen dos cabezas.' },
  { id: 'medusa', short: 'Medusa', name: 'Medusa de la Distracción', icon: 'medusa', source: 'deepwork', hp: 300, days: 7, saga: 'heroe', tier: 2, level: 8, requires: 'hidra', reward: 140,
    epithet: 'La mirada que petrifica',
    ability: { kind: 'armor', min: 25, name: 'Mirada pétrea' }, weakness: { source: 'habits', per: 5, name: 'Escudo-espejo' },
    lore: 'Quien mira el móvil se queda de piedra.' },
  { id: 'minotauro', short: 'el Minotauro', name: 'Minotauro de la Rutina', icon: 'minotaur', source: 'habits', hp: 30, days: 10, saga: 'heroe', tier: 2, level: 12, requires: 'medusa', reward: 180,
    epithet: 'Señor del Laberinto',
    ability: { kind: 'regen', pct: 5, name: 'Laberinto sin salida' }, weakness: { source: 'deepwork', per: 1 / 30, name: 'Hilo de Ariadna' },
    lore: 'Vive en el laberinto de los días iguales. Tu hilo de Ariadna: un hábito cada día.' },
  // Saga del Inframundo
  { id: 'cerbero', short: 'Cerbero', name: 'Cerbero de la Pereza', icon: 'wolf', source: 'voluntad', hp: 150, days: 7, saga: 'inframundo', tier: 1, level: 5, reward: 80,
    epithet: 'Guardián de las puertas del Hades',
    ability: { kind: 'cap', pct: 34, name: 'Tres cabezas' }, weakness: { source: 'habits', per: 5, name: 'Torta de miel' },
    lore: 'Tres cabezas: «luego», «mañana» y «total, para qué».' },
  { id: 'caronte', short: 'Caronte', name: 'Caronte el Barquero', icon: 'boat', source: 'xp', hp: 1400, days: 10, saga: 'inframundo', tier: 2, level: 10, requires: 'cerbero', reward: 150,
    epithet: 'El que cruza la laguna Estigia',
    ability: { kind: 'cap', pct: 20, name: 'Peaje diario' }, weakness: { source: 'conexion', per: 4, name: 'Rama dorada' },
    lore: 'Cobra en XP el paso de la laguna Estigia. Sin óbolo, te quedas en la orilla.' },
  { id: 'hades', short: 'Hades', name: 'Hades, señor de las Sombras', icon: 'skull', source: 'deepwork', hp: 900, days: 14, saga: 'inframundo', tier: 3, level: 18, requires: 'caronte', reward: 320,
    epithet: 'Rey del Inframundo',
    ability: { kind: 'regen', pct: 4, name: 'Reino de las sombras' }, weakness: { source: 'voluntad', per: 2, name: 'Lira de Orfeo' },
    lore: 'Reina sobre todos los que se fueron «un ratito» a las redes y nunca volvieron.' },
  // Saga del Ingenio
  { id: 'esfinge', short: 'la Esfinge', name: 'Esfinge de la Ignorancia', icon: 'sphinx', source: 'sabiduria', hp: 80, days: 7, saga: 'ingenio', tier: 1, level: 5, reward: 75,
    epithet: 'Guardiana de los enigmas',
    ability: { kind: 'cap', pct: 34, name: 'Un enigma al día' }, weakness: { source: 'deepwork', per: 1 / 10, name: 'Respuesta de Edipo' },
    lore: 'Solo deja pasar a quien aprende algo cada día.' },
  { id: 'quimera', short: 'la Quimera', name: 'Quimera del Perfeccionismo', icon: 'fire-breath', source: 'creacion', hp: 80, days: 10, saga: 'ingenio', tier: 2, level: 11, requires: 'esfinge', reward: 150,
    epithet: 'Aliento de fuego, tres bestias en una',
    ability: { kind: 'regen', pct: 8, name: 'Fuego que se reaviva' }, weakness: { source: 'maestria', per: 1, name: 'Lanza de plomo' },
    lore: 'León del miedo, cabra de la duda, serpiente del «aún no está listo». Vence publicando.' },
  { id: 'talos', short: 'Talos', name: 'Talos, el gigante de bronce', icon: 'golem', source: 'maestria', hp: 250, days: 14, saga: 'ingenio', tier: 3, level: 16, requires: 'quimera', reward: 300,
    epithet: 'Coloso forjado por Hefesto',
    ability: { kind: 'armor', min: 2, name: 'Coraza de bronce' }, weakness: { source: 'sabiduria', per: 1, name: 'El clavo del tobillo' },
    lore: 'Forjado por Hefesto. Solo cae ante la técnica pulida golpe a golpe.' },
  // Saga de la Odisea
  { id: 'polifemo', short: 'Polifemo', name: 'Polifemo el Solitario', icon: 'cyclops', source: 'conexion', hp: 40, days: 7, saga: 'odisea', tier: 1, level: 5, reward: 75,
    epithet: 'El cíclope de la cueva',
    ability: { kind: 'regen', pct: 10, name: 'Cueva cerrada' }, weakness: { source: 'habits', per: 2, name: 'Vino de Ulises' },
    lore: 'Un solo ojo y ningún amigo. No acabes como él.' },
  { id: 'sirenas', short: 'las Sirenas', name: 'Las Sirenas del Scroll', icon: 'mermaid', source: 'voluntad', hp: 220, days: 10, saga: 'odisea', tier: 2, level: 13, requires: 'polifemo', reward: 150,
    epithet: 'El canto que hunde barcos',
    ability: { kind: 'regen', pct: 6, name: 'Canto que vuelve' }, weakness: { source: 'deepwork', per: 1 / 10, name: 'Cera en los oídos' },
    lore: 'Su canto es una notificación infinita. Átate al mástil como Ulises.' },
  { id: 'escila', short: 'Escila y Caribdis', name: 'Escila y Caribdis', icon: 'whirlpool', source: 'habits', hp: 45, days: 14, saga: 'odisea', tier: 3, level: 20, requires: 'sirenas', reward: 320,
    epithet: 'Entre el monstruo y el remolino',
    ability: { kind: 'cap', pct: 15, name: 'Dos peligros' }, weakness: { source: 'voluntad', per: 1 / 5, name: 'Mástil de Ulises' },
    lore: 'A un lado, el exceso que te quema; al otro, el remolino de no hacer nada. Pasa por el medio: constancia.' },
  // Saga Primordial
  { id: 'caos', short: 'Caos', name: 'Caos primordial', icon: 'vortex', source: 'creacion', hp: 60, days: 7, saga: 'primordial', tier: 2, level: 15, reward: 200,
    epithet: 'El vacío antes de todo',
    ability: { kind: 'regen', pct: 8, name: 'Vacío que todo lo traga' }, weakness: { source: 'maestria', per: 1, name: 'La primera forma' },
    lore: 'Antes del mundo solo había Caos. Vence creando algo.' },
  { id: 'cronos', short: 'Cronos', name: 'Cronos, devorador del tiempo', icon: 'hourglass', source: 'deepwork', hp: 1500, days: 21, saga: 'primordial', tier: 4, level: 24, requires: 'caos', reward: 550,
    epithet: 'Rey de los Titanes',
    ability: { kind: 'armor', min: 30, name: 'Hoz del tiempo' }, weakness: { source: 'habits', per: 15, name: 'Piedra de Rea' },
    lore: 'Hermano de Hiperión. Devora cada hora que no proteges.' },
  { id: 'tifon', short: 'Tifón', name: 'Tifón, padre de monstruos', icon: 'tornado', source: 'xp', hp: 6000, days: 30, saga: 'primordial', tier: 4, level: 30, requires: 'cronos', reward: 1000,
    epithet: 'Terror de los dioses',
    ability: { kind: 'regen', pct: 3, name: 'Furia volcánica' }, weakness: { source: 'deepwork', per: 1, name: 'Rayos de Zeus' },
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
  boss.rules = 2;
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

/** Lo que pasó en el combate, en orden: golpes (normales, críticos, al punto débil), golpes que rebotan o se topan con el tope del día, y curaciones. */
export interface CombatEvent {
  at: number;
  kind: 'hit' | 'blocked' | 'capped' | 'regen';
  /** Daño hecho (o vida recuperada en 'regen'), ya con críticos y topes. */
  amount: number;
  label: string;
  crit?: boolean;
  weak?: boolean;
}

interface RawHit {
  at: number;
  dmg: number;
  label: string;
  crit: boolean;
  weak: boolean;
}

const CRIT_SESSION_MIN = 90;
const CRIT_HABIT_STREAK = 3;

/** ¿Este hábito llevaba racha de 3 días o más al completarse? (solo hábitos diarios) */
function habitInStreak(s: GameState, completionId: string): boolean {
  const c = s.habitCompletions.find((x) => x.id === completionId);
  if (!c || s.habits.find((h) => h.id === c.habitId)?.frequency === 'weekly') return false;
  const days = new Set(s.habitCompletions.filter((x) => x.habitId === c.habitId).map((x) => x.day));
  let at = new Date(`${c.day}T12:00:00`).getTime();
  for (let i = 1; i < CRIT_HABIT_STREAK; i++) {
    at -= DAY;
    if (!days.has(dayKey(at))) return false;
  }
  return true;
}

function txCrit(s: GameState, t: XPTransaction): boolean {
  if (t.source === 'deepwork') return (s.sessions.find((x) => x.id === t.sourceId)?.minutes ?? 0) >= CRIT_SESSION_MIN;
  if (t.source === 'quest') return s.quests.find((q) => q.id === t.sourceId)?.type === 'main';
  if (t.source === 'habit') return habitInStreak(s, t.sourceId);
  return false;
}

/** Golpes en bruto de una fuente dentro de la ventana del boss. */
function sourceHits(s: GameState, source: BossSource, b: Boss, crits: boolean, weak: boolean, per = 1): RawHit[] {
  const inWindow = (at: number) => at >= b.createdAt && at <= b.deadline;
  const mk = (at: number, units: number, label: string, crit: boolean): RawHit => ({ at, dmg: units * per, label, crit: crits && crit, weak });
  if (source === 'deepwork') {
    return s.sessions.filter((x) => inWindow(x.endedAt)).map((x) => mk(x.endedAt, x.minutes, `Deep Work · ${x.minutes} min`, x.minutes >= CRIT_SESSION_MIN));
  }
  if (source === 'habits') {
    return s.xp.filter((t) => t.source === 'habit' && inWindow(t.at)).map((t) => mk(t.at, 1, t.label || 'Hábito', crits && txCrit(s, t)));
  }
  if (source === 'xp') return s.xp.filter((t) => inWindow(t.at) && t.amount > 0).map((t) => mk(t.at, t.amount, t.label || 'XP', crits && txCrit(s, t)));
  const id = source as AttributeId;
  return s.xp
    .filter((t) => inWindow(t.at) && (t.attributes?.[id] ?? 0) > 0)
    .map((t) => mk(t.at, t.attributes![id]!, t.label || SOURCE_LABEL[source].name, crits && txCrit(s, t)));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Simula el combate con las reglas del boss. Los bosses antiguos (sin `rules`) solo suman daño, como antes,
 * para no cambiar victorias ni botines ya ganados.
 */
export function combat(s: GameState, b: Boss, now: number) {
  const rules = b.rules === 2;
  const t = rules ? templateOf(b) : undefined;
  const ability = t?.ability;
  const weakness = t?.weakness;
  const raw = [
    ...sourceHits(s, b.source, b, rules, false),
    ...(weakness ? sourceHits(s, weakness.source, b, rules, true, weakness.per) : []),
  ].sort((x, y) => x.at - y.at || Number(x.weak) - Number(y.weak));

  const events: CombatEvent[] = [];
  let damage = 0;
  let defeatedAt: number | null = null;
  let lastDamageAt = b.createdAt;
  const perDay = new Map<string, number>();

  const regenUntil = (until: number) => {
    if (ability?.kind !== 'regen') return;
    while (lastDamageAt + DAY <= until) {
      lastDamageAt += DAY;
      const heal = round1(Math.min(damage, (b.hp * ability.pct) / 100));
      if (heal > 0) {
        damage = round1(damage - heal);
        events.push({ at: lastDamageAt, kind: 'regen', amount: heal, label: ability.name });
      }
    }
  };

  for (const h of raw) {
    if (defeatedAt !== null) break;
    regenUntil(h.at);
    if (h.weak && b.hp - damage > b.hp / 2) continue; // el punto débil solo se ve cuando ya está herido
    if (!h.weak && ability?.kind === 'armor' && h.dmg < ability.min) {
      events.push({ at: h.at, kind: 'blocked', amount: 0, label: h.label });
      continue;
    }
    let dmg = h.dmg * (h.crit ? CRIT_MULTIPLIER : 1);
    let capped = false;
    if (ability?.kind === 'cap') {
      const day = dayKey(h.at);
      const room = Math.max(0, (b.hp * ability.pct) / 100 - (perDay.get(day) ?? 0));
      if (dmg > room) {
        dmg = room;
        capped = true;
      }
      perDay.set(day, (perDay.get(day) ?? 0) + dmg);
    }
    dmg = round1(Math.min(dmg, b.hp - damage));
    if (dmg <= 0) {
      if (capped) events.push({ at: h.at, kind: 'capped', amount: 0, label: h.label });
      continue;
    }
    damage = round1(damage + dmg);
    lastDamageAt = h.at;
    events.push({ at: h.at, kind: capped ? 'capped' : 'hit', amount: dmg, label: h.label, ...(h.crit ? { crit: true } : {}), ...(h.weak ? { weak: true } : {}) });
    if (damage >= b.hp) defeatedAt = h.at;
  }
  if (defeatedAt === null) regenUntil(Math.min(now, b.deadline));
  return { events, damage: Math.min(damage, b.hp), defeatedAt };
}

export function bossStatus(s: GameState, b: Boss, now: number) {
  const { damage, defeatedAt } = combat(s, b, now);
  const defeated = defeatedAt !== null;
  const expired = !defeated && now > b.deadline;
  return {
    damage,
    hpLeft: Math.max(0, round1(b.hp - damage)),
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
