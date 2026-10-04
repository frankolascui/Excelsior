// Copia de seguridad: exportar e importar la partida (y las preferencias) como un archivo JSON.
import type { GameState } from './types';
import { emptyState, migrate } from './game';

const APP = 'excelsior';
const PREF_KEYS = ['excelsior:tutorial', 'excelsior:theme', 'excelsior:sfx-muted', 'excelsior:ambient'];

export function exportBackup(state: GameState, now: number): string {
  const prefs: Record<string, string> = {};
  try {
    for (const k of PREF_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) prefs[k] = v;
    }
  } catch {
    /* sin almacenamiento: se exporta solo la partida */
  }
  return JSON.stringify({ app: APP, exportedAt: new Date(now).toISOString(), state, prefs }, null, 2);
}

export type ImportResult = { ok: true; state: GameState; prefs: Record<string, string> } | { ok: false; error: string };

export function parseBackup(text: string): ImportResult {
  let data: { app?: string; state?: { version?: number }; prefs?: Record<string, string> };
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (data?.app !== APP || typeof data.state?.version !== 'number') return { ok: false, error: 'No es una copia de Excelsior.' };
  if (data.state.version < 1 || data.state.version > emptyState().version) {
    return { ok: false, error: 'La copia es de una versión más nueva de Excelsior.' };
  }
  const state = migrate(data.state as { version: number } & Record<string, unknown>);
  if (!state.profile) return { ok: false, error: 'La copia no tiene personaje.' };
  const prefs = Object.fromEntries(Object.entries(data.prefs ?? {}).filter(([k, v]) => PREF_KEYS.includes(k) && typeof v === 'string'));
  return { ok: true, state, prefs };
}

export function restorePrefs(prefs: Record<string, string>) {
  try {
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
  } catch {
    /* ignorado */
  }
}
