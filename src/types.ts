// Modelo de datos del MVP 1 (subconjunto de la Fase 3 del spec).

export type QuestType = 'daily' | 'main' | 'side';

export type AttributeId = 'voluntad' | 'sabiduria' | 'maestria' | 'conexion' | 'creacion';

/** XP que una acción da a cada atributo (los que no aparecen reciben 0). */
export type AttributeRewards = Partial<Record<AttributeId, number>>;

/** Tipo de sesión: se deduce de lo que vas a hacer. 'programacion' y 'edicion' vienen de versiones anteriores (= práctica). */
export type DeepWorkArea = 'estudio' | 'practica' | 'general' | 'programacion' | 'edicion';

export interface Profile {
  name: string;
  createdAt: number;
  bio?: string; // (V2) biografía pública, máx. 280
  photo?: string; // (V2) foto de perfil pequeña (data URL JPEG)
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
  deadline?: string; // fecha límite (YYYY-MM-DD local)
}

export interface Habit {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly';
  perWeek?: number; // solo semanales: veces por semana (1–6)
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
  pomodoros?: number; // pomodoros completados en la sesión
}

export type XPSource = 'quest' | 'habit' | 'deepwork' | 'admin' | 'guild';

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
  /** Lo que dijiste que ibas a hacer (opcional); da nombre a la sesión si no hay misión. */
  intent?: string;
  /** Pomodoro: minutos de foco y de descanso de cada bloque. */
  pomodoro?: { focus: number; rest: number };
  pomoDone?: number;
  /** Duración del descanso automático en curso (ms); sin él, el descanso es manual. */
  restMs?: number;
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
  deadline?: number; // objetivos con fecha (p. ej. los de 3 meses del Ritual del Iniciado)
  metricId?: string; // si sigue una medida (peso, dinero…), su valor actual sale de ella
}

/** Recompensa de la tienda: algo que te das a ti mismo pagando monedas. */
export interface Reward {
  id: string;
  name: string;
  icon: string;
  cost: number;
  createdAt: number;
  /** Categoría de la tienda ('descanso', 'ocio', 'caprichos', 'grandes'). Sin ella se deduce del nombre y el precio. */
  category?: string;
}

export interface Purchase {
  id: string;
  rewardId: string;
  name: string;
  icon: string;
  cost: number;
  at: number;
  /** Cuándo lo usaste. null = guardado en el cofre sin usar; sin el campo (canjes antiguos) cuenta como usado. */
  usedAt?: number | null;
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
  /** Plantilla de la escalera de bosses (hidra, medusa…). Sin ella (partidas antiguas o bosses propios) se busca por nombre. */
  templateId?: string;
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
  /** Tutoriales ya vistos ('intro', 'reinos', 'arena', 'gremios'). Viaja con la partida, no con el dispositivo. */
  tours?: string[];
  /** Avatares a los que ya has ascendido con su ritual. Sin el campo (partidas antiguas) se calculan como antes. */
  ascended?: string[];
  /** Respuestas que diste a Hiperión en cada ritual de ascensión. */
  rituals?: Ritual[];
  /** Revisiones de Hiperión de los objetivos con fecha (días 30, 60, 90…). */
  reviews?: GoalReview[];
  /** Versión del equilibrio de atributos con que se calcularon (ver rebalance). */
  balance?: number;
  /** Medidas de tu vida real (dinero, peso…) y sus valores por día. */
  metrics?: Metric[];
  metricEntries?: MetricEntry[];
  /** Cierre del día: energía, ánimo, sueño y nota. */
  dayLogs?: DayLog[];
  /** Eventos del calendario: exámenes, lanzamientos, llamadas, bloques de tiempo… */
  events?: CalendarEvent[];
  /** Recordatorios: cosas pequeñas (comprar la cena, llevarme el cuaderno) con día y hora opcionales. */
  reminders?: Reminder[];
  /** Logros conseguidos y cuándo (una vez conseguido, no se pierde). */
  achievements?: { id: string; at: number }[];
  /** (V2) Retos de gremio cuya recompensa ya cobraste. */
  guildClaims?: string[];
}

export interface Metric {
  id: string;
  name: string;
  unit: string;
  createdAt: number;
}

export interface MetricEntry {
  id: string;
  metricId: string;
  day: string; // YYYY-MM-DD; uno por día (el último manda)
  value: number;
  at: number;
}

export interface DayLog {
  day: string;
  at: number;
  energy?: number; // 1–5
  mood?: number; // 1–5
  sleep?: number; // horas
  note?: string;
}

export type EventKind = 'bloque' | 'examen' | 'lanzamiento' | 'llamada' | 'reunion' | 'otro';

/** Repetición de un evento: cada día, de lunes a viernes o cada semana (mismo día de la semana). */
export type EventRepeat = 'daily' | 'weekdays' | 'weekly';

export interface CalendarEvent {
  id: string;
  title: string;
  day: string; // YYYY-MM-DD (primer día si se repite)
  time?: string; // HH:MM
  end?: string; // HH:MM; sin ella dura una hora
  kind: EventKind;
  repeat?: EventRepeat;
  /** Días en que no se repite (se borró o se movió solo ese día). */
  skip?: string[];
  /** Color elegido (id de EVENT_COLORS); sin él, el del tipo. */
  color?: string;
  createdAt: number;
}

export interface Reminder {
  id: string;
  title: string;
  day?: string; // YYYY-MM-DD; sin día = «cuando puedas»
  time?: string; // HH:MM
  doneAt?: number;
  createdAt: number;
}

export interface GoalReview {
  batch: number; // createdAt de los objetivos revisados (los que se juraron juntos)
  day: number; // día de la revisión desde que se juraron
  at: number;
  note: string;
}

export interface RitualAnswer {
  q: string;
  a: string;
}

export interface Ritual {
  avatarId: string;
  at: number;
  answers: RitualAnswer[];
  oath: string;
}
