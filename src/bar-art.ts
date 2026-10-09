// Adornos en pixel art de la barra de vida de los jefes: un emblema en el centro y un ala a cada lado, uno por saga.
// Se dibujan con formas sencillas en un lienzo diminuto y se «pixelan»: sin transparencias a medias, cada píxel
// toma el color más cercano de la paleta y se añade el contorno oscuro. Se muestran ampliados con image-rendering: pixelated.

export type BarTheme = 'heroe' | 'inframundo' | 'ingenio' | 'odisea' | 'primordial' | 'gremio';

type Palette = Record<string, string> & { k: string };
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

export const WING = { w: 40, h: 22 } as const;
export const CREST = { w: 28, h: 24 } as const;
/** Las formas se diseñaron en 36×16 (alas) y 24×20 (emblemas); se escalan al tamaño final. */
const DESIGN = { wing: [36, 16], crest: [24, 20] } as const;

const PALETTES: Record<BarTheme, Palette> = {
  primordial: { k: '#0e0716', d: '#2a1840', m: '#6d28d9', l: '#a855f7', h: '#e4c4ff', e: '#ff3fd2', w: '#f7f0ff' },
  inframundo: { k: '#0b0910', d: '#2b2833', m: '#57525f', l: '#9a94a6', h: '#d8d3e0', e: '#8b7bff', w: '#ffffff' },
  heroe: { k: '#1a0e05', d: '#2f5a1e', g: '#6a9c3a', m: '#a8701e', l: '#e0a94a', h: '#ffe6a8', e: '#d7263d', w: '#fff8e8' },
  ingenio: { k: '#1a1206', d: '#6b4a14', m: '#c08a2c', l: '#e8c15a', h: '#fff0b0', e: '#14b8a6', w: '#fffaf0' },
  odisea: { k: '#04101a', d: '#0b3550', m: '#1d6b9a', l: '#4fb3e0', h: '#bdefff', e: '#ffd166', w: '#ffffff' },
  gremio: { k: '#0f0814', d: '#3b1f4f', m: '#7e3fb0', l: '#d6d3e0', h: '#f3e8ff', e: '#f5c04a', w: '#ffffff' },
};

/** Color de relleno de la barra (vida) en cada saga: claro arriba, medio y oscuro abajo. */
export const BAR_COLORS: Record<BarTheme, [string, string, string]> = {
  primordial: ['#ff9be9', '#e933c4', '#8f1a86'],
  inframundo: ['#b9a8ff', '#7b5cf0', '#45289e'],
  heroe: ['#ff8d99', '#e8263f', '#8e0b22'],
  ingenio: ['#fff0a6', '#f0b429', '#a3650c'],
  odisea: ['#b6f0ff', '#2fb3e8', '#0e5f8f'],
  gremio: ['#ff8d99', '#e8263f', '#8e0b22'],
};

const poly = (c: Ctx, color: string, pts: Pt[]) => {
  c.fillStyle = color; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
};
const ell = (c: Ctx, color: string, x: number, y: number, rx: number, ry = rx, rot = 0) => {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
};
const line = (c: Ctx, color: string, width: number, pts: Pt[]) => {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
};
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
/** Simetría del emblema: el mismo trazo a la derecha. */
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [DESIGN.crest[0] - x, y]);

// ---------- Alas (lado izquierdo; el derecho es el mismo volteado). Se enganchan a la barra por la derecha, a media altura. ----------

const WINGS: Record<BarTheme, (c: Ctx, p: Palette) => void> = {
  primordial(c, p) { // ala de murciélago
    poly(c, p.l, [[36, 6.5], [22, 3], [3, 1], [1, 4], [3, 14], [8, 10.5], [12, 12.5], [17, 9.5], [22, 11.5], [27, 8.5], [31, 10.5], [36, 9.5]]);
    poly(c, p.m, [[36, 8.5], [27, 8.5], [22, 11.5], [17, 9.5], [12, 12.5], [8, 10.5], [3, 14], [4, 9], [12, 9], [20, 8], [30, 7.5]]);
    line(c, p.d, 1.1, [[12, 2.6], [8, 10.5]]);
    line(c, p.d, 1.1, [[12, 2.6], [3.5, 13]]);
    line(c, p.d, 1.1, [[22, 3.4], [17, 9.5]]);
    line(c, p.d, 1.1, [[22, 3.4], [22, 11]]);
    line(c, p.d, 2, [[36, 7.5], [22, 3.2], [3, 1.6]]);
    for (const x of [7, 15, 27]) poly(c, p.w, [[x - 1, 3 - (x - 7) * 0.12 + (x > 22 ? 1.3 : 0)], [x, 0.2 + (x > 22 ? 1.6 : 0)], [x + 1.2, 3 - (x - 7) * 0.12 + (x > 22 ? 1.3 : 0)]]);
  },
  inframundo(c, p) { // rama de espinos con astas que se enroscan
    line(c, p.d, 2.2, [[36, 8], [26, 7], [16, 8.6], [7, 7.2], [2.5, 5], [1.5, 2.6]]);
    line(c, p.d, 1.4, [[26, 7], [24.5, 2.5], [22, 1], [20.5, 2]]);
    line(c, p.d, 1.4, [[16, 8.6], [14.5, 13], [12, 14.6], [10.6, 13.6]]);
    line(c, p.d, 1.4, [[9, 7.6], [8, 2.5], [10, 1], [11.2, 2]]);
    line(c, p.d, 1.2, [[31, 7.6], [31.5, 12], [33.4, 13.6]]);
    line(c, p.d, 1.2, [[20, 8], [19, 3.6], [17, 2.6]]);
    for (const [x, y, dx, dy] of [[33, 7.8, 0.6, -2.4], [28, 7.2, -0.5, 2.4], [23, 7.6, 0.5, 2.4], [18.5, 8.3, 0.4, -2.4], [13, 8, -0.4, 2.4], [5, 6.4, -0.8, 2.2], [24.8, 4, 1.6, -0.4], [14.8, 11.6, -1.8, 0.2]] as number[][])
      line(c, p.m, 0.9, [[x, y], [x + dx, y + dy]]);
    for (const [x, y] of [[20.5, 2], [10.6, 13.6], [11.2, 2], [33.4, 13.6], [17, 2.6], [1.5, 2.6]] as Pt[]) ell(c, p.l, x, y, 0.9, 0.8);
    ell(c, p.e, 29.5, 10.6, 0.8); ell(c, p.e, 21.6, 5, 0.8); ell(c, p.e, 6.4, 4.2, 0.8); ell(c, p.e, 12.6, 11.4, 0.7);
  },
  heroe(c, p) { // rama de laurel
    line(c, p.d, 1.3, [[36, 8], [20, 7.6], [4, 6.2]]);
    for (let i = 0; i < 9; i++) {
      const x = 33 - i * 3.5, y = 7.9 - (33 - x) * 0.05;
      ell(c, i % 2 ? p.g : p.d, x - 1.2, y - 2.4, 3, 1.3, 0.5);
      ell(c, i % 2 ? p.d : p.g, x - 2.6, y + 2.4, 3, 1.3, -0.5);
    }
    ell(c, p.g, 2.6, 5.4, 2.6, 1.1, 0.25);
    for (const [x, y] of [[29, 10.6], [21, 4.8], [13, 10], [7, 3.8]] as Pt[]) ell(c, p.l, x, y, 0.75);
  },
  ingenio(c, p) { // ala de plumas doradas
    for (let i = 0; i < 7; i++) {
      const x = 4 + i * 4.4, top = 2.2 + i * 0.75, len = 11.5 - i * 1.15;
      poly(c, i % 2 ? p.l : p.h, [[x - 1.6, top], [x + 2.6, top], [x + 1.6, top + len], [x - 0.6, top + len + 0.8]]);
      line(c, p.m, 0.7, [[x + 0.4, top + 0.5], [x + 0.6, top + len - 0.5]]);
    }
    line(c, p.m, 2, [[36, 7.6], [20, 4.2], [2, 2]]);
    line(c, p.h, 0.7, [[34, 6.9], [20, 3.6], [4, 1.8]]);
    ell(c, p.e, 2.2, 2, 1.2);
  },
  odisea(c, p) { // ola que rompe
    poly(c, p.m, [[36, 6.5], [28, 5.8], [20, 7.2], [12, 6.2], [7, 6.8], [3.5, 10], [6.5, 12.5], [14, 11.2], [22, 12.4], [30, 10.4], [36, 10.2]]);
    ell(c, p.l, 5.2, 5.6, 3.5, 3.2);
    ell(c, p.m, 5.9, 6.1, 1.7, 1.5);
    ell(c, p.l, 13, 7.6, 2.6, 1); ell(c, p.l, 21, 8.4, 2.6, 1); ell(c, p.l, 29, 7.4, 2.6, 1);
    ell(c, p.h, 4.2, 3, 1.6, 0.9); ell(c, p.h, 12, 6.6, 1.4, 0.6); ell(c, p.h, 20, 7.4, 1.4, 0.6); ell(c, p.h, 28, 6.4, 1.4, 0.6);
    ell(c, p.w, 9.6, 1.6, 0.7); ell(c, p.w, 1.6, 1.4, 0.6); ell(c, p.h, 15, 3.2, 0.6);
  },
  gremio(c, p) { // estandarte con ribete de oro
    poly(c, p.e, [[36, 5], [6, 4.4], [1, 8], [6, 11.6], [36, 11]]);
    poly(c, p.m, [[36, 6.2], [6.8, 5.6], [2.8, 8], [6.8, 10.4], [36, 9.8]]);
    line(c, p.d, 0.8, [[34, 8], [8, 8]]);
    for (const x of [28, 20, 12]) ell(c, p.e, x, 8, 0.8);
  },
};

// ---------- Emblemas del centro ----------

const CRESTS: Record<BarTheme, (c: Ctx, p: Palette) => void> = {
  primordial(c, p) { // ojo con cuernos y colmillos
    const horn: Pt[] = [[9, 8.5], [5, 6.5], [1.2, 0.6], [2.6, 5.8], [6.6, 10.4]];
    poly(c, p.d, horn); poly(c, p.d, mirror(horn));
    ell(c, p.d, 12, 11, 9.4, 6.8);
    for (const x of [8.5, 14.5]) poly(c, p.w, [[x, 15.5], [x + 1, 19.4], [x + 2, 15.5]]);
    poly(c, p.w, [[11.2, 16.4], [12, 19.6], [12.8, 16.4]]);
    ell(c, p.k, 12, 11, 7.2, 4.6);
    ell(c, p.l, 12, 11, 6.3, 3.8);
    ell(c, p.e, 12, 11, 3.6, 3.4);
    rect(c, p.k, 11.4, 8, 1.3, 6);
    rect(c, p.w, 9.6, 9, 1, 1);
  },
  inframundo(c, p) { // calavera con otras dos detrás
    for (const x of [3.6, 20.4]) { ell(c, p.m, x, 11.5, 3.6, 3.8); ell(c, p.k, x, 12, 1.2, 1.1); }
    ell(c, p.l, 12, 8.4, 8.6, 7.4);
    poly(c, p.l, [[6.2, 12], [17.8, 12], [16.8, 17.6], [7.2, 17.6]]);
    ell(c, p.h, 9.6, 4.2, 3.8, 1.8);
    ell(c, p.k, 8.4, 10.2, 2.4, 2.2); ell(c, p.k, 15.6, 10.2, 2.4, 2.2);
    rect(c, p.e, 7.6, 9.4, 1.8, 1.8); rect(c, p.e, 14.8, 9.4, 1.8, 1.8);
    rect(c, p.w, 8, 9.6, 1, 1); rect(c, p.w, 15.2, 9.6, 1, 1);
    poly(c, p.k, [[11, 13.8], [12, 12], [13, 13.8]]);
    line(c, p.k, 0.8, [[7.6, 15.3], [16.4, 15.3]]);
    for (const x of [9.5, 11.5, 13.5]) line(c, p.k, 0.6, [[x, 15.3], [x, 17.4]]);
  },
  heroe(c, p) { // yelmo corintio con penacho
    poly(c, p.e, [[3, 7], [4.6, 2.6], [8.6, 0.6], [15.4, 0.6], [19.4, 2.6], [21, 7], [12, 5.4]]);
    ell(c, p.m, 12, 10.4, 7.6, 7);
    poly(c, p.m, [[4.6, 10], [19.4, 10], [18.4, 18.4], [14.4, 19.4], [13.4, 15], [10.6, 15], [9.6, 19.4], [5.6, 18.4]]);
    rect(c, p.l, 5, 8.6, 14, 1.3);
    ell(c, p.h, 9, 6.4, 2.6, 1.4);
    poly(c, p.k, [[7, 11.2], [17, 11.2], [17, 12.8], [13.2, 12.8], [13.2, 17.2], [10.8, 17.2], [10.8, 12.8], [7, 12.8]]);
  },
  ingenio(c, p) { // pirámide con el ojo
    poly(c, p.m, [[12, 0.6], [23.4, 18.6], [0.6, 18.6]]);
    poly(c, p.d, [[12, 0.6], [23.4, 18.6], [12, 18.6]]);
    poly(c, p.h, [[12, 0.6], [15, 5.4], [9, 5.4]]);
    line(c, p.d, 0.7, [[3.5, 15.2], [20.5, 15.2]]);
    ell(c, p.w, 12, 11.2, 4.8, 2.5);
    ell(c, p.e, 12, 11.2, 1.9);
    ell(c, p.k, 12, 11.2, 0.85);
  },
  odisea(c, p) { // timón con el tridente de Poseidón
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(c, p.m, 1.1, [[12, 12], [12 + Math.cos(a) * 8.4, 12 + Math.sin(a) * 7.4]]);
      ell(c, p.l, 12 + Math.cos(a) * 8.6, 12 + Math.sin(a) * 7.6, 1);
    }
    ell(c, p.m, 12, 12, 6.6, 6); ell(c, p.d, 12, 12, 5, 4.5); ell(c, p.l, 12, 12, 1.7);
    line(c, p.e, 1.4, [[12, 1], [12, 19.4]]);
    line(c, p.e, 1.2, [[7.6, 4.6], [16.4, 4.6]]);
    line(c, p.e, 1.1, [[7.6, 4.6], [7.6, 1.6]]); line(c, p.e, 1.1, [[16.4, 4.6], [16.4, 1.6]]);
    for (const x of [7.6, 12, 16.4]) poly(c, p.h, [[x - 1.1, 1.8], [x, -0.2], [x + 1.1, 1.8]]);
  },
  gremio(c, p) { // escudo sobre dos espadas cruzadas
    line(c, p.l, 1.4, [[2, 1.5], [21, 18.5]]); line(c, p.l, 1.4, [[22, 1.5], [3, 18.5]]);
    line(c, p.e, 1.2, [[2.6, 15.4], [6.4, 19.2]]); line(c, p.e, 1.2, [[21.4, 15.4], [17.6, 19.2]]);
    poly(c, p.e, [[4.4, 2.4], [19.6, 2.4], [19.6, 10.4], [12, 18.6], [4.4, 10.4]]);
    poly(c, p.m, [[5.8, 3.8], [18.2, 3.8], [18.2, 10], [12, 16.8], [5.8, 10]]);
    poly(c, p.h, [[12, 6], [13, 8.6], [15.6, 8.8], [13.6, 10.4], [14.4, 13], [12, 11.6], [9.6, 13], [10.4, 10.4], [8.4, 8.8], [11, 8.6]]);
  },
};

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Dibuja a tamaño diminuto y lo deja en pixel art: colores de la paleta, sin semitransparencias y con contorno. */
function pixelize(w: number, h: number, design: readonly [number, number], pal: Palette, draw: (c: Ctx, p: Palette) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = w + 2; canvas.height = h + 2; // un píxel de margen para el contorno
  const c = canvas.getContext('2d');
  if (!c) return '';
  c.translate(1, 1);
  c.scale(w / design[0], h / design[1]);
  draw(c, pal);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const img = c.getImageData(0, 0, w + 2, h + 2);
  const d = img.data;
  const colors = Object.entries(pal).filter(([k]) => k !== 'k').map(([, v]) => hex(v));
  const solid = new Uint8Array((w + 2) * (h + 2));
  for (let i = 0; i < solid.length; i++) {
    const o = i * 4;
    if (d[o + 3] < 110) { d[o + 3] = 0; continue; }
    // el borde suavizado se mezcla con el transparente: se deshace la mezcla antes de buscar el color
    const a = d[o + 3] / 255;
    const rgb = [d[o] / a, d[o + 1] / a, d[o + 2] / a];
    let best = colors[0], bd = Infinity;
    for (const col of colors) { const dd = (col[0] - rgb[0]) ** 2 + (col[1] - rgb[1]) ** 2 + (col[2] - rgb[2]) ** 2; if (dd < bd) { bd = dd; best = col; } }
    d[o] = best[0]; d[o + 1] = best[1]; d[o + 2] = best[2]; d[o + 3] = 255; solid[i] = 1;
  }
  const k = hex(pal.k), W = w + 2;
  for (let i = 0; i < solid.length; i++) {
    if (solid[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < h + 1 && solid[i + W])) {
      const o = i * 4; d[o] = k[0]; d[o + 1] = k[1]; d[o + 2] = k[2]; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const cache = new Map<string, string>();
/** Imagen (data URL) del ala o del emblema de una saga; se genera una vez. */
export function barArt(theme: BarTheme, part: 'wing' | 'crest'): string {
  const key = `${theme}:${part}`;
  let url = cache.get(key);
  if (url === undefined) {
    try {
      url = part === 'wing' ? pixelize(WING.w, WING.h, DESIGN.wing, PALETTES[theme], WINGS[theme]) : pixelize(CREST.w, CREST.h, DESIGN.crest, PALETTES[theme], CRESTS[theme]);
    } catch {
      url = '';
    }
    cache.set(key, url);
  }
  return url;
}
