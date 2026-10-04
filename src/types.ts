// Modelo de datos del MVP 1 (subconjunto de la Fase 3 del spec).

export type QuestType = 'daily' | 'main' | 'side';

export type AttributeId = 'voluntad' | 'sabiduria' | 'maestria' | 'conexion' | 'creacion';

/** XP que una acción da a cada atributo (los que no aparecen reciben 0). */
export type AttributeRewards = Partial<Record<AttributeId, number>>;

export type DeepWorkArea = 'programacion' | 'edicion' | 'estudio' | 'general';

export interface Profile {
  name: string;
  createdAt: number;
}

export interface Quest {
  id: string;
  title: string;
  type: QuestType;
  createdAt: number;
  completedAt: number | null;
  kingdomId?: string; // si existe, la misión es una construcción de ese reino
  focus?: AttributeId; // (v4) atributo elegido a mano; sin él se deduce del título
  xp?: number; // XP a medida; sin él, el del tipo
  rewards?: AttributeRewards; // atributos a medida (varios); sin él, se deducen
}

export interface Habit {
  id: string;
  name: string;
  frequency: 'daily';
  createdAt: number;
  rewards: AttributeRewards;
  xp?: number; // XP a medida; sin él, XP_RULES.habit
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  day: string; // YYYY-MM-DD local
  at: number;
}

export interface DeepWorkSession {
  id: string;
  questId: string | null;
  label: string;
  area: DeepWorkArea;
  startedAt: number;
  endedAt: number;
  minutes: number; // minutos de foco real (sin descansos ni distracciones)
  breakMinutes?: number;
  distractionMinutes?: number;
  distractions?: number; // veces que se marcó «Me distraje»
  focusPct?: number; // foco / (foco + distracción) × 100
}

export type XPSource = 'quest' | 'habit' | 'deepwork';

export interface XPTransaction {
  id: string;
  at: number;
  amount: number;
  source: XPSource;
  sourceId: string;
  label: string;
  /** XP de atributo ganado con esta acción. El XP, nivel e historial de cada atributo se derivan de aquí. */
  attributes?: AttributeRewards;
}

export type FocusPhase = 'focus' | 'break' | 'distraction';

export interface ActiveTimer {
  startedAt: number;
  questId: string | null;
  targetMinutes: number; // 0 = sesión libre (cronómetro)
  area?: DeepWorkArea;
  // Fases de la sesión. Opcionales para no romper un temporizador guardado por una versión anterior.
  phase?: FocusPhase;
  phaseStartedAt?: number;
  focusMs?: number;
  breakMs?: number;
  distractionMs?: number;
  distractions?: number;
}

/** Reino: un proyecto que se construye como una ciudad. Cada misión con su kingdomId es una construcción. */
export interface Kingdom {
  id: string;
  name: string;
  createdAt: number;
}

/** Meta personal medible (dinero, peso, personas…) que se exige para desbloquear un avatar. */
export interface Goal {
  id: string;
  name: string;
  unit: string;
  start: number;
  target: number; // puede ser menor que start (p. ej. bajar de peso)
  current: number;
  avatarId: string;
  createdAt: number;
}

/** Recompensa de la tienda: algo que te das a ti mismo pagando monedas. */
export interface Reward {
  id: string;
  name: string;
  icon: string;
  cost: number;
  createdAt: number;
}

export interface Purchase {
  id: string;
  rewardId: string;
  name: string;
  icon: string;
  cost: number;
  at: number;
}

/** De qué se alimenta el daño a un boss: XP global, minutos de foco, hábitos completados o XP de un atributo. */
export type BossSource = 'xp' | 'deepwork' | 'habits' | AttributeId;

/** Boss: reto con vida y fecha límite. El daño se deriva de lo que haces entre createdAt y deadline. */
export interface Boss {
  id: string;
  name: string;
  icon: string;
  source: BossSource;
  hp: number;
  createdAt: number;
  deadline: number;
  reward: number; // monedas al derrotarlo
}

export interface GameState {
  version: 5;
  profile: Profile | null;
  quests: Quest[];
  habits: Habit[];
  habitCompletions: HabitCompletion[];
  sessions: DeepWorkSession[];
  xp: XPTransaction[];
  activeTimer: ActiveTimer | null;
  kingdoms: Kingdom[];
  goals: Goal[];
  rewards: Reward[];
  purchases: Purchase[];
  bosses: Boss[];
}
