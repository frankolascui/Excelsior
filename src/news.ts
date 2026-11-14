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
    version: '3.1', date: '2026-11-14', title: 'Afinando',
    groups: [
      { name: 'Deep Work', items: [
        'La productividad ya puede llegar a tu tiempo real entero: el Sentido es una pregunta más (viene propuesta según la sesión) y con 5 en rendimiento y sentido salen todas tus horas de foco.',
        'Ya no hay botón «Me distraje» durante la sesión: al terminar te pregunta si te distrajiste y cuánto, y esos minutos se restan del foco. Se puede cambiar después.',
      ] },
      { name: 'Academy', items: [
        'Los 4 botones del repaso dan intervalos claramente distintos: «Otra vez» en 1 min, «Difícil» bastante antes que «Bien» y «Fácil» casi el doble que «Bien».',
        '«Cambiar la anterior» junto a «Mostrar respuesta» (o la tecla Z): vuelve a la tarjeta que acabas de responder para elegir otra dificultad.',
        'Botones del repaso más grandes.',
        'Academy sigue el color del tema que elijas, como el resto de la app.',
      ] },
      { name: 'Salud', items: [
        'Al fundar el Reino de la Salud eliges tu horario de sueño y tus entrenos antes de empezar.',
        'El Reino de la Salud aparece en el mapa de los reinos.',
        'Nuevo reloj del sueño en Hoy: una esfera de 24 horas con tu noche marcada y la hora actual.',
        'Diario sin reloj repetido y con las 6 medidas en una sola línea.',
      ] },
      { name: 'Novedades', items: [
        'Índice de todas las versiones: pulsa una para ver todo lo que trajo.',
      ] },
    ],
  },
  {
    version: '3.0', date: '2026-11-13', title: 'Cuerpo y mente',
    groups: [
      { name: 'Una sola app', items: [
        'Excelsior Health y Excelsior Academy viven ahora dentro de Excelsior RPG: una cuenta, una web, todo junto.',
        'Tus noches, apuntes y tarjetas son los mismos de antes: están en tu cuenta y aparecen solos al entrar.',
      ] },
      { name: 'Reino de la Salud', items: [
        'Un reino que se construye durmiendo y entrenando con constancia. Cada semana levantas obras: Templo del Sueño, Reloj de Sol, Palestra y Balanza. Dan monedas y hacen crecer el reino.',
        'El diario de sueño entero: lo esencial en menos de un minuto y «Más detalles» con fases, percepción y hábitos. Avisa si algo no cuadra.',
        'Diario: cuenta atrás para acostarte, metas del plan, esta semana frente a la anterior y el sueño de 14 días. También historial y exportar a JSON o CSV.',
        'Nuevo hábito automático «Apuntar la noche»: se marca solo al guardarla.',
      ] },
      { name: 'Academy en Deep Work', items: [
        'Pestaña Academy dentro de Deep Work: tu estantería de asignaturas, hojas de apuntes con fórmulas, tarjetas, simulacros, fechas de examen, estadísticas e importar mazos de Anki.',
        'Repaso espaciado FSRS: la tarjeta vuelve justo cuando la ibas a olvidar. Puedes ajustarlo a tu memoria con tu historial.',
        'Repasar cuenta como foco de estudio (1 XP por minuto) y vaciar la cola del día da un bonus.',
        'Nuevo hábito automático «Repasar las tarjetas»: se marca solo al vaciar la cola o al repasar 20 tarjetas.',
      ] },
      { name: 'Misiones y prioridades', items: [
        'Cada misión tiene un impacto (alto, medio o bajo) que decide su orden y su XP. Ya no hay que elegir tipo.',
        '«Las 3 de hoy»: elige tus tres prioridades; cerrar las tres da un bonus de XP. Lo que no llegues, pásalo a mañana sin penalización.',
        'Misiones dentro de misiones: parte un objetivo grande en pasos tan pequeños como quieras y reparte sesiones hasta la fecha.',
        'Cierre del día y revisión semanal en la crónica de Hiperión, y limpieza de misiones olvidadas.',
      ] },
      { name: 'Más cómodo', items: [
        'El reloj del sueño también en Hoy: cuánto falta para acostarte y qué toca ahora.',
        'Desplegables, horas y fechas propios en toda la app, en lugar de los del navegador.',
      ] },
      { name: 'Logros y arreglos', items: [
        '10 logros nuevos de Cuerpo y mente, de Guardián de Hipnos a Memoria de Mnemósine.',
        'Un enlace de invitación ya no manda la solicitud de amistad solo: primero te pregunta.',
        'Los aportes al gremio se guardan bien y una partida antigua de la nube ya no pisa la nueva.',
        'Si tu partida local se estropea, se guarda una copia de rescate antes de sustituirla.',
      ] },
    ],
  },
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
      { name: 'Más de lo que llegó en la V2', items: [
        'Gremios desde el nivel 5 (fundar uno, desde el 10), con rangos e invitaciones por enlace.',
        'Bosses con ilustración propia y barras de vida en pixel art; máximo 2 bosses activos.',
        'Actividad y XP diario en un solo panel, con calendario de actividad.',
        'Cofre para usar los premios canjeados de la tienda.',
        'Hábitos: mínimo para un día malo, aviso de no fallar dos días seguidos, escudo de racha en la tienda, compartir la semana, sobrecarga progresiva y ordenar arrastrando.',
        'Deep Work: valoración al terminar con horas productivas.',
        'Animaciones al entrar en cada pantalla, al cumplir y al subir de nivel.',
        'Interfaz más compacta y ayudas en una ⓘ junto a cada título.',
        'Historial de misiones completadas y borrar la cuenta desde Ajustes.',
        'Novedades como esta al llegar cada versión.',
      ] },
    ],
  },
  {
    version: '1.18', date: '2026-10-06', title: 'Logros y Arena', announce: false,
    groups: [
      { name: 'Logros y Arena', items: [
        '55 logros con nombres épicos, de bronce a leyenda.',
        '15 bosses en 5 sagas que se desbloquean por nivel y uno tras otro.',
        'Tienda con categorías, historial y tus propias recompensas.',
      ] },
      { name: 'Cuenta', items: [
        'Entrar con tu email (código de un solo uso) y partida guardada en la nube, o entrar como invitado.',
      ] },
      { name: 'Progresión', items: [
        'Secciones que se desbloquean por nivel (3, 5 y 7), cada una con su tutorial.',
        'Rituales de ascensión con Hiperión para los avatares.',
        'Aros de avatar con minerales y gemas, animados.',
        'Atributos descritos y Maestría equilibrada.',
      ] },
      { name: 'Planificación', items: [
        'Calendario con fechas límite y el camino del héroe en el mapa.',
        'Objetivos a 3 meses con revisiones a los 30, 60 y 90 días.',
        'Hábitos semanales y estado del día.',
      ] },
      { name: 'Deep Work y reinos', items: [
        '«¿Qué vas a hacer?» en vez de tipos fijos, y Pomodoro 50/10 y 90/30.',
        'Reinos más bonitos, vista desde arriba y un castillo que mejora con cada construcción.',
        'La versión de la app, visible en una esquina.',
      ] },
    ],
  },
  {
    version: '1.0', date: '2026-10-04', title: 'El comienzo', announce: false,
    groups: [
      { name: 'La primera versión', items: [
        'Misiones con XP, atributos y un avatar que sube de nivel.',
        'Deep Work con cronómetro: cada minuto de foco da XP.',
        'Hábitos con racha.',
        'Reinos medievales con mapa y ciudades dibujadas que crecen con tus tareas.',
        'Arena con bosses y tienda de recompensas.',
        'Tutorial con guía, gráfica de XP y actividad en cuadraditos.',
        'Temas de color, avatares, sonidos y exportar la partida.',
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
