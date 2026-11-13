// Preparar el navegador para el optimizador: registrar public/optimizar/coi-sw.js y recargar.
// En Excelsior RPG el optimizador vive en su propia página (/optimizar/): aislar la app entera rompería
// los vídeos de YouTube del sonido de fondo. El service worker solo controla esa carpeta.
const KEY = 'coi-intentado';

export type IsolationState = 'listo' | 'preparar' | 'no-compatible' | 'otra-pagina';

/** ¿Estamos en la página del optimizador? */
export const onOptimizerPage = () => /\/optimizar\/(index\.html)?$/.test(location.pathname);
/** Dirección de la página del optimizador desde la app. */
export const OPTIMIZER_URL = './optimizar/';

export function isolationState(): IsolationState {
  if (globalThis.crossOriginIsolated) return 'listo';
  if (!('serviceWorker' in navigator)) return 'no-compatible';
  if (!onOptimizerPage()) return 'otra-pagina';
  let tried = false;
  try { tried = sessionStorage.getItem(KEY) === '1'; } catch { /* sin almacenamiento */ }
  // Si ya lo intentamos en esta pestaña y sigue sin aislarse (p. ej. Safari), no hay nada que hacer.
  return tried && navigator.serviceWorker.controller ? 'no-compatible' : 'preparar';
}

export async function prepareIsolation(): Promise<void> {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ }
  await navigator.serviceWorker.register('./coi-sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  location.reload();
}
