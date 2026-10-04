// Temas: tres colores de acento (degradado) sobre fondo negro. Preferencia de este navegador.

export interface Theme {
  id: string;
  name: string;
  c1: string; // claro / principal
  c2: string; // medio
  c3: string; // profundo
}

/** Texto legible sobre el degradado: oscuro si el color medio es claro. */
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0b0b0f' : '#ffffff';
}

export const THEMES: Theme[] = [
  { id: 'excelsior', name: 'Excelsior', c1: '#ff5ccf', c2: '#c056ff', c3: '#6d3df5' },
  { id: 'olimpo', name: 'Olimpo', c1: '#ffd166', c2: '#f59e0b', c3: '#b45309' },
  { id: 'poseidon', name: 'Poseidón', c1: '#5eead4', c2: '#38bdf8', c3: '#2563eb' },
  { id: 'gaia', name: 'Gaia', c1: '#bef264', c2: '#22c55e', c3: '#0f766e' },
  { id: 'ares', name: 'Ares', c1: '#fda4af', c2: '#f43f5e', c3: '#9f1239' },
  { id: 'hades', name: 'Hades', c1: '#f5f5f5', c2: '#a3a3a3', c3: '#525252' },
];

const KEY = 'excelsior:theme';
export const CUSTOM_ID = 'custom';

export function loadTheme(): Theme {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw?.id === CUSTOM_ID && [raw.c1, raw.c2, raw.c3].every((c) => /^#[0-9a-f]{6}$/i.test(c))) {
      return { id: CUSTOM_ID, name: 'Personalizado', c1: raw.c1, c2: raw.c2, c3: raw.c3 };
    }
    return THEMES.find((t) => t.id === raw?.id) ?? THEMES[0];
  } catch {
    return THEMES[0];
  }
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t.id === CUSTOM_ID ? t : { id: t.id }));
  } catch {
    /* ignorado */
  }
}

/** Aplica el tema a las variables CSS de la raíz (todo el estilo cuelga de --c1, --c2 y --c3). */
export function applyTheme(t: Theme) {
  const root = document.documentElement.style;
  root.setProperty('--c1', t.c1);
  root.setProperty('--c2', t.c2);
  root.setProperty('--c3', t.c3);
  root.setProperty('--gold', `color-mix(in srgb, ${t.c1} 40%, #ffffff)`);
  root.setProperty('--on-accent', inkFor(t.c2));
}
