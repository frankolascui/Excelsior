// Logros: hitos con nombre épico que se consiguen jugando. Se deducen de la partida y, una vez
// conseguidos, se guardan con su fecha para no perderlos (p. ej. si se rompe una racha).
import type { GameState } from './types';
import { attributeLevel, attributeXp, avatarInfo } from './attributes';
import { bossStatus } from './bosses';
import { kingdomBonus } from './economy';
import { dayKey, habitStreakDays, levelInfo, totalXp } from './game';

export type AchievementTier = 'bronce' | 'plata' | 'oro' | 'leyenda';

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  tier: AchievementTier;
  category: string;
  /** Valor actual y objetivo, para la barra de progreso. */
  progress: (st: Stats) => [number, number];
}

/** Números de la partida que miran los logros (se calculan una vez). */
export interface Stats {
  dwMinutes: number;
  dwBestDay: number;
  dwBestSession: number;
  pomodoros: number;
  xpBestDay: number;
  quests: number;
  mainQuests: number;
  bestStreak: number;
  level: number;
  bosses: number;
  kingdoms: number;
  activeDays: number;
  dayLogs: number;
  purchases: number;
  avatar: number;
  bestAttrLevel: number;
  minBaseAttrLevel: number;
  dawnSessions: number;
  nightSessions: number;
  perfectHour: number;
}

export function stats(s: GameState, now: number): Stats {
  const byDay = new Map<string, number>();
  const dwByDay = new Map<string, number>();
  for (const t of s.xp) byDay.set(dayKey(t.at), (byDay.get(dayKey(t.at)) ?? 0) + t.amount);
  for (const x of s.sessions) dwByDay.set(dayKey(x.endedAt), (dwByDay.get(dayKey(x.endedAt)) ?? 0) + x.minutes);
  const attrs = attributeXp(s);
  const lv = (id: keyof typeof attrs) => attributeLevel(attrs[id]).level;
  const hour = (ts: number) => new Date(ts).getHours();
  return {
    dwMinutes: s.sessions.reduce((n, x) => n + x.minutes, 0),
    dwBestDay: Math.max(0, ...dwByDay.values()),
    dwBestSession: Math.max(0, ...s.sessions.map((x) => x.minutes)),
    pomodoros: s.sessions.reduce((n, x) => n + (x.pomodoros ?? 0), 0),
    xpBestDay: Math.max(0, ...byDay.values()),
    quests: s.quests.filter((q) => q.completedAt).length,
    mainQuests: s.quests.filter((q) => q.completedAt && q.type === 'main').length,
    bestStreak: Math.max(0, ...s.habits.map((h) => habitStreakDays(s, h.id, now))),
    level: levelInfo(totalXp(s)).level,
    bosses: s.bosses.filter((b) => bossStatus(s, b, now).defeated).length,
    kingdoms: s.kingdoms.filter((k) => kingdomBonus(s, k.id) > 0).length,
    activeDays: byDay.size,
    dayLogs: (s.dayLogs ?? []).length,
    purchases: s.purchases.length,
    avatar: s.profile ? avatarInfo(s, now).index : 0,
    bestAttrLevel: Math.max(lv('voluntad'), lv('sabiduria'), lv('maestria'), lv('conexion'), lv('creacion')),
    minBaseAttrLevel: Math.min(lv('voluntad'), lv('sabiduria'), lv('maestria'), lv('conexion')),
    dawnSessions: s.sessions.filter((x) => x.minutes >= 25 && hour(x.startedAt) >= 4 && hour(x.startedAt) < 7).length,
    nightSessions: s.sessions.filter((x) => x.minutes >= 25 && (hour(x.startedAt) >= 23 || hour(x.startedAt) < 3)).length,
    perfectHour: s.sessions.filter((x) => x.minutes >= 60 && (x.focusPct ?? 100) === 100).length,
  };
}

type Def = Omit<AchievementDef, 'progress'> & { stat: keyof Stats; goal: number };

// Ampliable: añadir aquí. El id no debe cambiar nunca (va guardado en las partidas).
const DEFS: Def[] = [
  // Deep Work total
  { id: 'dw-1h', name: 'Primera Llama', icon: '🕯️', desc: '1 hora de Deep Work en total.', tier: 'bronce', category: 'Deep Work', stat: 'dwMinutes', goal: 60 },
  { id: 'dw-10h', name: 'Forja del Enfoque', icon: '🔥', desc: '10 horas de Deep Work en total.', tier: 'bronce', category: 'Deep Work', stat: 'dwMinutes', goal: 600 },
  { id: 'dw-25h', name: 'Templo del Silencio', icon: '🏛️', desc: '25 horas de Deep Work en total.', tier: 'plata', category: 'Deep Work', stat: 'dwMinutes', goal: 1500 },
  { id: 'dw-50h', name: 'Monje de Hierro', icon: '⛓️', desc: '50 horas de Deep Work en total.', tier: 'plata', category: 'Deep Work', stat: 'dwMinutes', goal: 3000 },
  { id: 'dw-100h', name: 'Señor del Tiempo', icon: '⏳', desc: '100 horas de Deep Work en total.', tier: 'oro', category: 'Deep Work', stat: 'dwMinutes', goal: 6000 },
  { id: 'dw-250h', name: 'Cronos Domado', icon: '🌀', desc: '250 horas de Deep Work en total.', tier: 'oro', category: 'Deep Work', stat: 'dwMinutes', goal: 15000 },
  { id: 'dw-500h', name: 'Eternidad Forjada', icon: '♾️', desc: '500 horas de Deep Work en total.', tier: 'leyenda', category: 'Deep Work', stat: 'dwMinutes', goal: 30000 },
  { id: 'dw-day-3h', name: 'Inmersión Profunda', icon: '🌊', desc: '3 horas de Deep Work en un solo día.', tier: 'bronce', category: 'Deep Work', stat: 'dwBestDay', goal: 180 },
  { id: 'dw-day-5h', name: 'Abismo del Flow', icon: '🐋', desc: '5 horas de Deep Work en un solo día.', tier: 'plata', category: 'Deep Work', stat: 'dwBestDay', goal: 300 },
  { id: 'dw-day-8h', name: 'Jornada de Titán', icon: '🗿', desc: '8 horas de Deep Work en un solo día.', tier: 'oro', category: 'Deep Work', stat: 'dwBestDay', goal: 480 },
  { id: 'dw-session-90', name: 'Flujo Ininterrumpido', icon: '🌀', desc: 'Una sesión de 90 minutos de foco.', tier: 'plata', category: 'Deep Work', stat: 'dwBestSession', goal: 90 },
  { id: 'dw-session-180', name: 'Trance de Orfeo', icon: '🎼', desc: 'Una sesión de 3 horas de foco.', tier: 'oro', category: 'Deep Work', stat: 'dwBestSession', goal: 180 },
  { id: 'dw-perfect', name: 'Mente de Diamante', icon: '💎', desc: 'Una hora o más sin distraerte ni una vez.', tier: 'plata', category: 'Deep Work', stat: 'perfectHour', goal: 1 },
  { id: 'pomo-1', name: 'Primer Bloque', icon: '🧱', desc: 'Termina tu primer pomodoro.', tier: 'bronce', category: 'Deep Work', stat: 'pomodoros', goal: 1 },
  { id: 'pomo-10', name: 'Ritmo de Guerra', icon: '🥁', desc: '10 pomodoros completados.', tier: 'plata', category: 'Deep Work', stat: 'pomodoros', goal: 10 },
  { id: 'pomo-50', name: 'Maquinaria de Hefesto', icon: '⚙️', desc: '50 pomodoros completados.', tier: 'oro', category: 'Deep Work', stat: 'pomodoros', goal: 50 },
  { id: 'dawn', name: 'Hijo de Eos', icon: '🌅', desc: 'Una sesión de foco antes de las 7 de la mañana.', tier: 'plata', category: 'Deep Work', stat: 'dawnSessions', goal: 1 },
  { id: 'night', name: 'Búho de Atenea', icon: '🦉', desc: 'Una sesión de foco pasadas las 23:00.', tier: 'bronce', category: 'Deep Work', stat: 'nightSessions', goal: 1 },

  // XP en un día
  { id: 'xp-day-100', name: 'Día de Gloria', icon: '☀️', desc: '100 XP en un solo día.', tier: 'bronce', category: 'XP', stat: 'xpBestDay', goal: 100 },
  { id: 'xp-day-250', name: 'Furia Olímpica', icon: '⚡', desc: '250 XP en un solo día.', tier: 'plata', category: 'XP', stat: 'xpBestDay', goal: 250 },
  { id: 'xp-day-500', name: 'Ira de Zeus', icon: '🌩️', desc: '500 XP en un solo día.', tier: 'oro', category: 'XP', stat: 'xpBestDay', goal: 500 },
  { id: 'xp-day-1000', name: 'Ascenso al Olimpo', icon: '🏔️', desc: '1000 XP en un solo día.', tier: 'leyenda', category: 'XP', stat: 'xpBestDay', goal: 1000 },

  // Nivel y avatar
  { id: 'lvl-5', name: 'El Despertar', icon: '👁️', desc: 'Llega al nivel global 5.', tier: 'bronce', category: 'Nivel', stat: 'level', goal: 5 },
  { id: 'lvl-10', name: 'Héroe de la Polis', icon: '🏛️', desc: 'Llega al nivel global 10.', tier: 'plata', category: 'Nivel', stat: 'level', goal: 10 },
  { id: 'lvl-20', name: 'Semidiós', icon: '🔱', desc: 'Llega al nivel global 20.', tier: 'oro', category: 'Nivel', stat: 'level', goal: 20 },
  { id: 'lvl-30', name: 'Titán Errante', icon: '🗡️', desc: 'Llega al nivel global 30.', tier: 'oro', category: 'Nivel', stat: 'level', goal: 30 },
  { id: 'lvl-50', name: 'Inmortal', icon: '👑', desc: 'Llega al nivel global 50.', tier: 'leyenda', category: 'Nivel', stat: 'level', goal: 50 },
  { id: 'avatar-3', name: 'Escudo Forjado', icon: '🛡️', desc: 'Asciende a Disciplinado.', tier: 'bronce', category: 'Nivel', stat: 'avatar', goal: 2 },
  { id: 'avatar-6', name: 'Alma de Fragua', icon: '⚒️', desc: 'Asciende a Forjador.', tier: 'oro', category: 'Nivel', stat: 'avatar', goal: 6 },
  { id: 'avatar-10', name: 'Siempre Más Alto', icon: '🌟', desc: 'Asciende a Excelsior, el último avatar.', tier: 'leyenda', category: 'Nivel', stat: 'avatar', goal: 9 },
  { id: 'attr-5', name: 'Maestro de un Arte', icon: '🎖️', desc: 'Un atributo a nivel 5.', tier: 'plata', category: 'Nivel', stat: 'bestAttrLevel', goal: 5 },
  { id: 'attr-balance', name: 'Equilibrio de Apolo', icon: '☯️', desc: 'Voluntad, Sabiduría, Maestría y Conexión a nivel 3 o más.', tier: 'oro', category: 'Nivel', stat: 'minBaseAttrLevel', goal: 3 },

  // Misiones
  { id: 'quest-1', name: 'Primer Juramento', icon: '📜', desc: 'Completa tu primera misión.', tier: 'bronce', category: 'Misiones', stat: 'quests', goal: 1 },
  { id: 'quest-10', name: 'Cazador de Gestas', icon: '🗺️', desc: '10 misiones completadas.', tier: 'bronce', category: 'Misiones', stat: 'quests', goal: 10 },
  { id: 'quest-50', name: 'Leyenda Errante', icon: '🧭', desc: '50 misiones completadas.', tier: 'plata', category: 'Misiones', stat: 'quests', goal: 50 },
  { id: 'quest-100', name: 'Centurión', icon: '⚔️', desc: '100 misiones completadas.', tier: 'oro', category: 'Misiones', stat: 'quests', goal: 100 },
  { id: 'quest-500', name: 'Mito Viviente', icon: '🐉', desc: '500 misiones completadas.', tier: 'leyenda', category: 'Misiones', stat: 'quests', goal: 500 },
  { id: 'main-10', name: 'Portador de Destinos', icon: '🎯', desc: '10 misiones principales completadas.', tier: 'plata', category: 'Misiones', stat: 'mainQuests', goal: 10 },

  // Hábitos y constancia
  { id: 'streak-7', name: 'Disciplina de Bronce', icon: '🥉', desc: 'Racha de 7 días en un hábito.', tier: 'bronce', category: 'Constancia', stat: 'bestStreak', goal: 7 },
  { id: 'streak-21', name: 'Voluntad de Acero', icon: '🔩', desc: 'Racha de 21 días en un hábito.', tier: 'plata', category: 'Constancia', stat: 'bestStreak', goal: 21 },
  { id: 'streak-30', name: 'Corazón Espartano', icon: '🛡️', desc: 'Racha de 30 días en un hábito.', tier: 'plata', category: 'Constancia', stat: 'bestStreak', goal: 30 },
  { id: 'streak-66', name: 'Hábito Inquebrantable', icon: '⛰️', desc: 'Racha de 66 días en un hábito.', tier: 'oro', category: 'Constancia', stat: 'bestStreak', goal: 66 },
  { id: 'streak-100', name: 'Centinela Eterno', icon: '🗼', desc: 'Racha de 100 días en un hábito.', tier: 'oro', category: 'Constancia', stat: 'bestStreak', goal: 100 },
  { id: 'streak-365', name: 'Ciclo de Helios', icon: '🌞', desc: 'Racha de un año entero en un hábito.', tier: 'leyenda', category: 'Constancia', stat: 'bestStreak', goal: 365 },
  { id: 'days-7', name: 'Semana Heroica', icon: '📅', desc: '7 días con progreso.', tier: 'bronce', category: 'Constancia', stat: 'activeDays', goal: 7 },
  { id: 'days-30', name: 'Mes Legendario', icon: '🗓️', desc: '30 días con progreso.', tier: 'plata', category: 'Constancia', stat: 'activeDays', goal: 30 },
  { id: 'days-100', name: 'Centenario', icon: '💯', desc: '100 días con progreso.', tier: 'oro', category: 'Constancia', stat: 'activeDays', goal: 100 },
  { id: 'log-7', name: 'Cronista', icon: '🪶', desc: 'Guarda el estado del día 7 veces.', tier: 'bronce', category: 'Constancia', stat: 'dayLogs', goal: 7 },
  { id: 'log-30', name: 'Escriba de Mnemósine', icon: '📖', desc: 'Guarda el estado del día 30 veces.', tier: 'plata', category: 'Constancia', stat: 'dayLogs', goal: 30 },

  // Arena, reinos y tienda
  { id: 'boss-1', name: 'Primera Sangre', icon: '🩸', desc: 'Derrota a tu primer boss.', tier: 'bronce', category: 'Arena y reinos', stat: 'bosses', goal: 1 },
  { id: 'boss-5', name: 'Matabestias', icon: '🏹', desc: 'Derrota a 5 bosses.', tier: 'plata', category: 'Arena y reinos', stat: 'bosses', goal: 5 },
  { id: 'boss-10', name: 'Azote de Monstruos', icon: '🪓', desc: 'Derrota a 10 bosses.', tier: 'oro', category: 'Arena y reinos', stat: 'bosses', goal: 10 },
  { id: 'kingdom-1', name: 'Fundador de Ciudades', icon: '🏰', desc: 'Termina tu primer reino.', tier: 'plata', category: 'Arena y reinos', stat: 'kingdoms', goal: 1 },
  { id: 'kingdom-3', name: 'Señor de Reinos', icon: '👑', desc: 'Termina 3 reinos.', tier: 'oro', category: 'Arena y reinos', stat: 'kingdoms', goal: 3 },
  { id: 'shop-1', name: 'Merecido Descanso', icon: '🎁', desc: 'Canjea tu primera recompensa.', tier: 'bronce', category: 'Arena y reinos', stat: 'purchases', goal: 1 },
];

export const ACHIEVEMENTS: AchievementDef[] = DEFS.map(({ stat, goal, ...d }) => ({ ...d, progress: (st) => [Math.min(st[stat], goal), goal] }));

export const TIER_LABEL: Record<AchievementTier, string> = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', leyenda: 'Leyenda' };

/** Logros que ya se cumplen pero aún no están guardados. */
export function pendingAchievements(s: GameState, now: number): AchievementDef[] {
  if (!s.profile) return [];
  const have = new Set((s.achievements ?? []).map((a) => a.id));
  const st = stats(s, now);
  return ACHIEVEMENTS.filter((a) => {
    if (have.has(a.id)) return false;
    const [v, goal] = a.progress(st);
    return v >= goal;
  });
}

export function recordAchievements(s: GameState, list: AchievementDef[], now: number): GameState {
  if (list.length === 0 && s.achievements) return s;
  return { ...s, achievements: [...(s.achievements ?? []), ...list.map((a) => ({ id: a.id, at: now }))] };
}
