// Novedades de cada versión: salen una vez al llegar una versión nueva y quedan en Ajustes.
import { APP_VERSION } from './version';

export interface NewsEntry {
  version: string;
  /** Fecha de publicación (YYYY-MM-DD). */
  date: string;
  title: string;
  groups: { name: string; items: string[] }[];
  /** false = ya publicada antes de que existiera este panel: solo sale en el historial. */
  announce?: boolean;
}

/** La más nueva primero. Al publicar una versión, añade su entrada arriba y sube APP_VERSION en version.ts. */
export const NEWS: NewsEntry[] = [
  {
    version: '2.0', date: '2026-11-03', title: 'La era social',
    groups: [
      { name: 'Social', items: [
        'Entra con tu email: tu partida se guarda en la nube y la tienes en todos tus dispositivos.',
        'Amigos: perfil con foto y bio, tu tag Nombre#1234, solicitudes y recomendados.',
        'Gremios con tus amigos: encargos y jefes en grupo, con líder y colíderes.',
        'Rankings de amigos y de gremio.',
      ] },
      { name: 'Misiones y hábitos', items: [
        'Misiones prehechas para añadir con un toque, y tus propias plantillas.',
        'Misiones que se repiten y misiones partidas en pasos, cada paso con su fecha límite.',
        'Hábitos: marca los días que se te olvidó apuntar y un escudo salva tu racha un día por semana.',
        'Arriba en Hoy, tu día de un vistazo: XP, foco, misiones, hábitos y días seguidos.',
      ] },
      { name: 'Calendario', items: [
        'Vistas por horas (Día, 4 días y Semana) con eventos que se arrastran y se estiran.',
        'Eventos que se repiten como quieras, recordatorios y avisos.',
      ] },
      { name: 'Deep Work y Arena', items: [
        'Pomodoro 50/10 y 90/30, y corregir una sesión que se quedó encendida.',
        'Sonidos de fondo con grabaciones reales (o sintetizados, sin internet).',
        'Bosses con habilidad, punto débil, golpes críticos y estrellas por rapidez.',
      ] },
      { name: 'Reinos e interfaz', items: [
        'Reinos con nombre y fecha objetivo.',
        'Símbolos propios en vez de emojis y un menú nuevo en el móvil.',
      ] },
    ],
  },
  {
    version: '1.18', date: '2026-10-06', title: 'Logros y Arena', announce: false,
    groups: [
      { name: 'Novedades', items: [
        '55 logros con nombres épicos, de bronce a leyenda.',
        '15 bosses en 5 sagas que se desbloquean por nivel y uno tras otro.',
        'Tienda con categorías, historial y tus propias recompensas.',
      ] },
    ],
  },
];

const SEEN_KEY = 'excelsior:news-seen';

/** Compara versiones «2.0», «1.18»… por partes numéricas. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Entrada que anunciar ahora, si toca: la de la versión actual, aún no vista. */
export function newsToAnnounce(seen: string | null, version = APP_VERSION, news = NEWS): NewsEntry | null {
  const entry = news.find((n) => n.version === version);
  if (!entry || entry.announce === false || seen === version) return null;
  return entry;
}

export function loadNewsSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markNewsSeen(version = APP_VERSION) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* ignorado */
  }
}
