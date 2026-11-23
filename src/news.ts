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
  /** Aclaración corta junto a la fecha (p. ej. «Llegó a la web con la V3.0»). */
  note?: string;
}

/** La más nueva primero. Al publicar una versión, añade su entrada arriba y sube APP_VERSION en version.ts. */
export const NEWS: NewsEntry[] = [
  {
    version: '3.5', date: '2026-11-23', title: 'Reinos y desafío',
    groups: [
      { name: 'Reinos', items: [
        'Cada reino tiene su propio mapa con ciudades (tus proyectos) alrededor de la capital. El reino suma todo lo levantado en ellas.',
        'Los edificios dependen del atributo de cada construcción: biblioteca, templo, taberna y más. Su tamaño va según el impacto y las murallas crecen con el número de construcciones.',
        'Tributo por lo levantado desde que el reino es Villa. Un reino terminado se puede cerrar como monumento, y si un reino lleva tiempo parado te avisa.',
        'Mapas con más profundidad: sombras, tejas, sillares y la luz cálida del castillo, tanto desde arriba como de frente.',
      ] },
      { name: 'Inventario y premios', items: [
        'Inventario: ves tus congelados guardados y lo ya usado, y puedes devolver al cofre un premio en las primeras 24 horas.',
        'Trofeos de aliados con título al tener 1, 3 y 8 amigos.',
      ] },
      { name: 'Gremios', items: [
        'Encargos más justos: lo que hiciste antes de entrar en el gremio ya no cuenta, y quien entra a mitad y se va deja de sumar.',
        'Los aportes se comprueban en el servidor, así nadie puede inflar los rankings.',
      ] },
      { name: 'Arena', items: [
        'Los bosses se ajustan a tu ritmo: su vida es lo que sueles hacer en su plazo (según tus últimas 2 semanas) más un 20 %, y el botín sube con ella.',
        'El panel de invocar está siempre a la vista, con cada saga plegable y abierta la de tu siguiente boss.',
      ] },
      { name: 'Más desafío', items: [
        'Topes diarios de XP más bajos (misiones 150 y hábitos 80, y suben menos con cada nivel).',
        'Una moneda cada 7 XP desde esta versión. Lo que ganaste antes sigue contando a 5, así que no pierdes monedas.',
        'Desgaste: desde el segundo día seguido sin hacer nada, pierdes un 5 % del progreso de tu nivel cada día. Nunca bajas de nivel y el primer día sin actividad es gratis.',
        'Escudo de racha más caro (150) y con hielo: puedes guardar 2 como máximo y solo protegen el día de ayer.',
      ] },
      { name: 'Academy', items: [
        'Pausa o vacaciones de las tarjetas: elige desde y hasta qué día. Mientras dura, el hábito de repasar no rompe la racha y, al volver, las fechas de repaso se mueven esos días.',
        'El hábito de Academy ahora se llama «Estudiar»: lo marca una ronda de 8 tarjetas o entregar un simulacro (también en papel), y así suma a tu racha. El tiempo de un simulacro hecho en la app cuenta como Deep Work de estudio.',
        '«Hoy» de Academy aparece al momento, sin esperar a calcularlo.',
        'Los exámenes de Academy salen en tu calendario, en Hoy y en los avisos, con su asignatura. Desde el calendario puedes crear un examen de una asignatura, cambiarle el nombre o el día y borrarlo: se cambia también en Academy.',
      ] },
      { name: 'Hábitos y salud', items: [
        'Reino de la Salud y constancia: cada semana con el Templo del Sueño es una semana constante. A las 4, 12, 26 y 52 semanas constantes se levanta un monumento (+25, 50, 100 y 200 monedas), con tu racha de semanas seguidas.',
        'Escalera de hábitos: un plan por semanas en Hábitos, que Hiperión te explica. Cada semana entra un hábito nuevo con su mínimo; solo subes de escalón si todo va al 80 % o más, y si no, repites la semana.',
        'Hábito de Deep Work: pon tú los minutos de foco al día y se marca solo al llegar.',
        'Cada hábito muestra su meta, el siguiente escalón y cuánto te falta para subirlo.',
        'Hábitos de varias veces al día: una marca cumple el día y las veces de más son estrellas que suman XP.',
        'Arreglada la casilla del peso de la noche, que se montaba encima de lo de abajo.',
      ] },
      { name: 'En toda la app', items: [
        'Si juegas en dos dispositivos, las partidas se unen solas. Solo te pregunta si cambiaste lo mismo de forma distinta en los dos.',
        'Si una pantalla falla al dibujarse, ves un aviso con «Reintentar» en lugar de una pantalla en negro.',
        'El sonido de fondo se queda plegado en un botón pequeño y ya no tapa la pantalla. Púlsalo para ver el volumen o pararlo.',
      ] },
    ],
  },
  {
    version: '3.1', date: '2026-11-16', title: 'Afinando',
    groups: [
      { name: 'Deep Work', items: [
        'La productividad ya puede llegar a tu tiempo real entero: el Sentido es una pregunta más (viene propuesta según la sesión) y con 5 en rendimiento y sentido salen todas tus horas de foco.',
        'Ya no hay botón «Me distraje» durante la sesión: al terminar te pregunta si te distrajiste y cuánto, y esos minutos se restan del foco. Se puede cambiar después.',
      ] },
      { name: 'Academy', items: [
        'Tarjetas nuevas: «Otra vez» vuelve en 1 min y «Difícil» en 10 min, ya no salen los cuatro botones casi iguales. En repaso se usan tal cual las fechas de FSRS, que se separan más cuanto mejor te sabes la tarjeta.',
        '«Cambiar la anterior» junto a «Mostrar respuesta» (o la tecla Z): vuelve a la tarjeta que acabas de responder para elegir otra dificultad.',
        'Tarjeta de repaso más grande, con los mismos botones que el resto de la app.',
        'Minutos al día para Academy (en «Hoy» de la estantería): estima cuánto te espera con tu tiempo real por tarjeta, frena las tarjetas nuevas si no caben y avisa si ni los repasos te caben. Los repasos que tocan nunca se esconden.',
        'Bandeja de revisión: lo que pegas o importas en texto entra como borrador y no llega al repaso hasta que lo apruebas. Avisa de duplicadas, preguntas casi iguales, respuestas largas y sin respuesta. Se puede aprobar sin revisar si lo activas.',
        'Botón «Borrar tarjeta» en el repaso y al editar una tarjeta.',
        'El repaso va por tandas de 8 tarjetas: al acabar cada una, un resumen corto y sigues (espacio) o terminas ahí.',
        'Exámenes: el repaso final empieza 7 días antes y se reparte día a día, sin tope de 60 tarjetas.',
        'Estadísticas: «Retención estimada» (lo que FSRS calcula que recordarías hoy) junto a la real (lo que acertaste).',
        'Academy sigue el color del tema que elijas, como el resto de la app.',
      ] },
      { name: 'Salud', items: [
        'Al fundar el Reino de la Salud eliges tu horario de sueño y tus entrenos antes de empezar.',
        'Si borras o cambias la noche que completó una obra y deja de cumplirse, la obra se derriba (y sus monedas).',
        'El Reino de la Salud aparece en el mapa de los reinos.',
        'Nuevo reloj del sueño en Hoy: una esfera de 24 horas con tu noche marcada y la hora actual.',
        'Diario sin reloj repetido y con las 6 medidas en una sola línea.',
      ] },
      { name: 'En toda la app', items: [
        'Todo lo que borra pide confirmación antes: misiones, hábitos, metas, recordatorios, eventos, plantillas, noches, borradores y tarjetas.',
        'Índice de novedades: primero las versiones enteras y debajo sus actualizaciones (.1, .2…). Pulsa una para ver todo lo que trajo.',
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
    version: '2.2', date: '2026-11-12', title: 'Botones y revisión', announce: false, note: 'Llegó a la web con la V3.0',
    groups: [
      { name: 'Novedades', items: [
        'Un solo sistema de botones en toda la app y la versión rediseñada.',
        'Revisión: aportes del gremio que ya no se pierden, fotos de perfil más seguras y una partida más nueva de la nube que no se pisa.',
      ] },
    ],
  },
  {
    version: '2.1', date: '2026-11-08', title: 'Prioridades', announce: false, note: 'Llegó a la web con la V3.0',
    groups: [
      { name: 'Novedades', items: [
        'Impacto por misión (alto, medio o bajo), que decide su orden y su XP.',
        '«Las 3 de hoy» y, en el cierre del día, las 3 de mañana; «Pasar a mañana» sin penalización.',
        'Revisión semanal y limpieza de misiones olvidadas.',
        'Misiones dentro de misiones, sin límite de niveles, y «Repartir sesiones» hasta la fecha.',
        'Hoy más corto: una sola tarjeta para Las 3 y ¿Qué hago ahora?',
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
      { name: 'Novedades', items: [
        '55 logros con nombres épicos, de bronce a leyenda.',
        '15 bosses en 5 sagas que se desbloquean por nivel y, dentro de cada saga, tras derrotar al anterior.',
        'Tienda por categorías, recompensas propias con icono e historial de canjes.',
        'Aros de avatar animados según su material.',
        'Pomodoro 50/10 y 90/30 para entrar en flow.',
        'La versión de la app, visible en una esquina.',
      ] },
    ],
  },
  {
    version: '1.17', date: '2026-10-06', title: 'Aros esculpidos', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Cada aro de avatar es un único marco esculpido con una gema grande como foco.',
      ] },
    ],
  },
  {
    version: '1.16', date: '2026-10-06', title: 'Deep Work con intención', announce: false,
    groups: [
      { name: 'Novedades', items: [
        '«¿Qué vas a hacer?» en vez de tipos fijos: decide si la sesión sube Maestría (práctica) o Sabiduría (teoría).',
        'Pomodoro con descanso automático.',
      ] },
    ],
  },
  {
    version: '1.15', date: '2026-10-06', title: 'El castillo crece', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'El castillo de cada reino mejora con cada construcción: 12 niveles, de fortín de madera a castillo glorioso.',
      ] },
    ],
  },
  {
    version: '1.14', date: '2026-10-06', title: 'Aros con gemas', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Aros de avatar de minerales y gemas: de granito y cuarzo al aro Excelsior con todas las gemas.',
      ] },
    ],
  },
  {
    version: '1.13', date: '2026-10-06', title: 'Atributos y estado del día', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Cada atributo descrito; Creación pasa a Impacto, que se despierta en el nivel 10.',
        'Hábitos de 1 a 6 veces por semana, con racha en semanas.',
        'Estado del día con informe para copiar a una IA.',
        'Eventos en el calendario (examen, lanzamiento, llamada, reunión).',
      ] },
    ],
  },
  {
    version: '1.12', date: '2026-10-06', title: 'Reinos desde arriba', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Ciudades más detalladas y una vista nueva desde arriba, además de la frontal.',
      ] },
    ],
  },
  {
    version: '1.11', date: '2026-10-06', title: 'Calendario y camino del héroe', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Misiones con fecha límite y vista Calendario.',
        'Aro propio para cada avatar.',
        'El camino del héroe como sendero que sube la montaña.',
        'Hiperión revisa tus objetivos a 3 meses los días 30, 60 y 90.',
      ] },
    ],
  },
  {
    version: '1.10', date: '2026-10-06', title: 'Objetivos flexibles', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Los objetivos a 3 meses se pueden borrar para no bloquear el avance.',
      ] },
    ],
  },
  {
    version: '1.9', date: '2026-10-06', title: 'Rituales de ascensión', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Subir de avatar exige un ritual con Hiperión: preguntas, juramento y ceremonia.',
        'Objetivos a 3 meses en Personaje.',
        'Reinos se desbloquean en el nivel 3 y la Arena en el 5; el tope diario de XP crece con el nivel.',
      ] },
    ],
  },
  {
    version: '1.8', date: '2026-10-06', title: 'Secciones por nivel', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Secciones que se abren al subir de nivel, cada una con su tutorial.',
        'Rueda de ajustes arriba a la derecha.',
        'El tutorial visto ya no se repite en otro dispositivo, y si la nube y el dispositivo no coinciden, te pregunta con cuál quedarte.',
      ] },
    ],
  },
  {
    version: '1.7', date: '2026-10-06', title: 'Entrar con email o como invitado', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Pantalla de entrada: tu email o «Entrar como invitado».',
        'Eliges tus hábitos en el tutorial.',
        'Errores de inicio de sesión que se entienden.',
      ] },
    ],
  },
  {
    version: '1.6', date: '2026-10-06', title: 'La nube, conectada', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'La cuenta se conecta a la nube de Excelsior.',
      ] },
    ],
  },
  {
    version: '1.5', date: '2026-10-06', title: 'Cuenta por email (preparada)', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Inicio de sesión con un código por email y partida en la nube, aún desactivado.',
      ] },
    ],
  },
  {
    version: '1.4', date: '2026-10-06', title: 'Tutorial más claro', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Tutorial más corto y claro.',
        'Bosses y ciudades animados.',
      ] },
    ],
  },
  {
    version: '1.3', date: '2026-10-04', title: 'Exportar desde Claude', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Exportar la partida también funciona dentro de Claude.',
      ] },
    ],
  },
  {
    version: '1.2', date: '2026-10-04', title: 'La Arena', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Monedas, bosses griegos con vida y plazo, y tienda de recompensas propias.',
        '10 avatares, de Aprendiz a Excelsior.',
        'Crónica semanal con reto, exportar e importar partida, 6 temas y colores propios.',
        'Sonidos, confeti y sonido de fondo en Deep Work.',
        'Ciudad medieval dibujada y Hiperión como guía.',
      ] },
    ],
  },
  {
    version: '1.1', date: '2026-10-04', title: 'Reinos medievales', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Mapa del reino con tu fortaleza en el centro.',
        'Construcciones y etapas medievales, de campamento a reino glorioso.',
        'Tutorial con guía.',
        'Gráfica de XP diario y actividad en cuadraditos.',
      ] },
    ],
  },
  {
    version: '1.0', date: '2026-10-04', title: 'El comienzo', announce: false,
    groups: [
      { name: 'Novedades', items: [
        'Misiones con XP y atributos.',
        'Un avatar que sube de nivel.',
        'Deep Work con cronómetro: cada minuto de foco da XP.',
        'Hábitos con racha.',
        'Reinos para tus proyectos.',
      ] },
    ],
  },
];

/** Versión entera de una entrada: «1.18» → «1». */
export const majorOf = (v: string) => v.split('.')[0];

/** Índice: cada versión entera (x.0) con sus actualizaciones (x.1, x.2…), de la más nueva a la más vieja. */
export function newsGroups(news = NEWS): { major: NewsEntry; updates: NewsEntry[] }[] {
  const majors = news.filter((n) => /\.0$/.test(n.version));
  return majors.map((major) => ({
    major,
    updates: news.filter((n) => n !== major && majorOf(n.version) === majorOf(major.version)),
  }));
}

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

/** La más nueva de varias versiones vistas (ignora vacías). */
export function latestVersion(...vs: (string | null | undefined)[]): string | null {
  return vs.filter((v): v is string => !!v).sort(cmpVersion).pop() ?? null;
}

/**
 * Entrada que anunciar ahora, si toca: la de la versión actual, si lo visto es más viejo.
 * Si ya viste una versión más nueva (la web de prueba va por delante), no se anuncia nada.
 */
export function newsToAnnounce(seen: string | null, version = APP_VERSION, news = NEWS): NewsEntry | null {
  const entry = news.find((n) => n.version === version);
  if (!entry || entry.announce === false || (seen && cmpVersion(seen, version) >= 0)) return null;
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
