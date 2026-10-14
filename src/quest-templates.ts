// Misiones prehechas: un catálogo para añadir con un toque, sin pensar en XP ni atributos,
// más las plantillas propias de cada jugador (GameState.questTemplates).
import type { GameState, QuestTemplate } from './types';
import { addQuest, CUSTOM_LIMITS, uid } from './game';

export interface TemplateGroup {
  id: string;
  name: string;
  items: QuestTemplate[];
}

const t = (id: string, title: string, type: QuestTemplate['type'], rewards: QuestTemplate['rewards']): QuestTemplate => ({ id, title, type, rewards });

/**
 * Atributos según las definiciones de Nicolas: Voluntad = disciplina y salir de la zona de confort; Sabiduría = lo teórico;
 * Maestría = lo práctico; Conexión = familia y relaciones; Impacto (`creacion`) = ayudar o crear algo para otros.
 * El XP es el de su tipo (Principal 50, Diaria 20, Secundaria 15); los atributos suman algo más que una misión normal.
 */
export const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    id: 'estudio', name: 'Estudio', items: [
      t('est-repaso', 'Repasar lo que se dio hoy en clase', 'daily', { sabiduria: 3, voluntad: 1 }),
      t('est-ejercicios', 'Hacer 10 ejercicios de un tema', 'daily', { maestria: 4, voluntad: 1 }),
      t('est-resumen', 'Hacer el resumen de un tema', 'side', { sabiduria: 3 }),
      t('est-tema', 'Dominar un tema entero para el examen', 'main', { sabiduria: 5, maestria: 3, voluntad: 3 }),
      t('est-simulacro', 'Hacer un examen de prueba cronometrado', 'main', { maestria: 6, voluntad: 4 }),
      t('est-leer', 'Leer 20 páginas de un libro', 'daily', { sabiduria: 3 }),
    ],
  },
  {
    id: 'cuerpo', name: 'Cuerpo', items: [
      t('cue-entrenar', 'Entrenar 45 minutos', 'daily', { voluntad: 4 }),
      t('cue-caminar', 'Salir a caminar 30 minutos', 'side', { voluntad: 2 }),
      t('cue-dormir', 'Acostarse antes de las 23:30', 'daily', { voluntad: 3 }),
      t('cue-cocinar', 'Cocinar una comida sana', 'side', { voluntad: 2, maestria: 1 }),
      t('cue-frio', 'Ducha fría', 'daily', { voluntad: 4 }),
      t('cue-marca', 'Batir una marca personal', 'main', { voluntad: 7, maestria: 3 }),
    ],
  },
  {
    id: 'personas', name: 'Personas', items: [
      t('per-familia', 'Llamar a alguien de la familia', 'side', { conexion: 4 }),
      t('per-amigo', 'Quedar con un amigo', 'side', { conexion: 4 }),
      t('per-nuevo', 'Hablar con alguien nuevo', 'daily', { conexion: 4, voluntad: 2 }),
      t('per-cena', 'Comer o cenar con la familia sin móvil', 'daily', { conexion: 3, voluntad: 1 }),
      t('per-ayudar', 'Ayudar a alguien con algo concreto', 'side', { creacion: 3, conexion: 2 }),
      t('per-pendiente', 'Tener esa conversación que llevas aplazando', 'main', { conexion: 6, voluntad: 5 }),
    ],
  },
  {
    id: 'proyectos', name: 'Proyectos', items: [
      t('pro-hora', 'Avanzar 1 hora en tu proyecto', 'daily', { maestria: 3, creacion: 1 }),
      t('pro-aprender', 'Aprender algo práctico con un tutorial', 'side', { maestria: 3 }),
      t('pro-publicar', 'Publicar algo que hayas creado', 'main', { creacion: 5, voluntad: 4, maestria: 2 }),
      t('pro-feedback', 'Enseñar tu trabajo y pedir opinión', 'side', { voluntad: 2, conexion: 2 }),
      t('pro-semana', 'Planificar la semana', 'side', { sabiduria: 2, voluntad: 1 }),
    ],
  },
  {
    id: 'mente', name: 'Mente y orden', items: [
      t('men-evitar', 'Hacer esa tarea que llevas días evitando', 'main', { voluntad: 8, maestria: 2 }),
      t('men-redes', 'Un día sin redes sociales', 'main', { voluntad: 9 }),
      t('men-meditar', 'Meditar 10 minutos', 'daily', { voluntad: 2, sabiduria: 1 }),
      t('men-diario', 'Escribir el diario', 'daily', { sabiduria: 2, voluntad: 1 }),
      t('men-ordenar', 'Ordenar la habitación', 'side', { voluntad: 3 }),
      t('men-bandeja', 'Dejar a cero emails y mensajes', 'side', { voluntad: 2, conexion: 1 }),
    ],
  },
];

/** Añade una misión desde una plantilla (prehecha o propia). */
export function addFromTemplate(s: GameState, tpl: QuestTemplate, now: number): GameState {
  return addQuest(s, tpl.title, tpl.type, now, { rewards: tpl.rewards, xp: tpl.xp });
}

/** ¿Ya tienes pendiente una misión con ese nombre? (para no duplicarla sin querer) */
export function hasPending(s: GameState, title: string): boolean {
  const k = title.trim().toLowerCase();
  return s.quests.some((q) => !q.completedAt && q.title.trim().toLowerCase() === k);
}

export function saveTemplate(s: GameState, tpl: Omit<QuestTemplate, 'id'>): GameState {
  const title = tpl.title.trim();
  if (!title) return s;
  const own: QuestTemplate = { id: uid(), title, type: tpl.type, rewards: tpl.rewards };
  if (tpl.xp !== undefined) own.xp = Math.max(0, Math.min(CUSTOM_LIMITS.questXp, Math.round(tpl.xp)));
  return { ...s, questTemplates: [...(s.questTemplates ?? []), own] };
}

export function deleteTemplate(s: GameState, id: string): GameState {
  return { ...s, questTemplates: (s.questTemplates ?? []).filter((x) => x.id !== id) };
}
