// Lo que una pantalla le deja dicho a otra al cambiar de pestaña (sin pasar props por toda la app).
export const HEALTH_KINGDOM = 'salud';

export const navState = {
  /** Reino abierto en la pestaña Reinos (se recuerda mientras dure la sesión). */
  kingdom: null as string | null,
  /** Panel abierto en Deep Work: el temporizador de siempre o Academy. */
  deepPanel: 'foco' as 'foco' | 'academy',
  /** Al entrar en el Reino de la Salud, abrir el formulario de la noche de hoy (botón de Hoy). */
  healthRecord: false,
};

/** Los hábitos del sistema no se marcan: te llevan al sitio donde se hacen. */
export function openSystemHabit(kind: 'health' | 'academy') {
  if (kind === 'health') {
    navState.kingdom = HEALTH_KINGDOM;
    navState.healthRecord = true;
    location.hash = '#reinos';
  } else {
    navState.deepPanel = 'academy';
    location.hash = '#academy/';
  }
}
