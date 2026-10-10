// Adornos en pixel art de la barra de vida de los jefes: un emblema en el centro y un ala a cada lado, uno por saga.
// Se dibujan con formas en un lienzo pequeño y se «pixelan»: cada píxel toma el color más cercano de la paleta,
// se sombrea por volúmenes (borde de arriba con luz, el de abajo en sombra, más oscuro hacia abajo) y se añade el contorno.

export type BarTheme = 'heroe' | 'inframundo' | 'ingenio' | 'odisea' | 'primordial' | 'gremio';

type Palette = Record<string, string> & { k: string };
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** Tamaño en píxeles de arte (sin el margen de 1 px para el contorno). Se muestran a 1:1. */
export const WING = { w: 72, h: 36 } as const;
export const CREST = { w: 52, h: 44 } as const;

const PALETTES: Record<BarTheme, Palette> = {
  primordial: { k: '#0c0614', d: '#2a1840', m: '#6d28d9', l: '#a855f7', h: '#e4c4ff', e: '#ff3fd2', w: '#f7f0ff' },
  inframundo: { k: '#09080d', d: '#2b2833', m: '#57525f', l: '#9a94a6', h: '#d8d3e0', e: '#8b7bff', w: '#ffffff' },
  heroe: { k: '#170c04', d: '#2f5a1e', g: '#6a9c3a', D: '#5c3a12', m: '#a8701e', l: '#e0a94a', h: '#ffe6a8', e: '#c81d3a', r: '#7a0f22', w: '#fff8e8' },
  ingenio: { k: '#171005', d: '#6b4a14', m: '#c08a2c', l: '#e8c15a', h: '#fff0b0', e: '#14b8a6', w: '#fffaf0' },
  odisea: { k: '#04101a', d: '#0b3550', m: '#1d6b9a', l: '#4fb3e0', h: '#bdefff', e: '#ffc94a', b: '#7a4a22', B: '#b9773a', w: '#ffffff' },
  gremio: { k: '#0d0712', d: '#3b1f4f', m: '#7e3fb0', l: '#c9c6d6', h: '#f3e8ff', e: '#f0b93a', r: '#a3122f', w: '#ffffff' },
};
/** Colores que no se sombrean (brillos, ojos, chispas, huecos negros). */
const FLAT = new Set(['e', 'w', 'k']);

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
/** Curva suave que pasa por los puntos (para ramas, bordes de olas, penachos). */
const curve = (c: Ctx, color: string, width: number, pts: Pt[]) => {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(...pts[0]);
  for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  c.lineTo(...pts[pts.length - 1]); c.stroke();
};
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
/** Hoja o pluma en forma de huso: de la base (x, y) hacia el ángulo `a`, con largo y ancho. */
const leaf = (c: Ctx, color: string, x: number, y: number, len: number, a: number, w: number) => {
  const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  const mx = (x + tx) / 2, my = (y + ty) / 2;
  c.fillStyle = color; c.beginPath(); c.moveTo(x, y);
  c.quadraticCurveTo(mx + nx, my + ny, tx, ty); c.quadraticCurveTo(mx - nx, my - ny, x, y); c.fill();
};
const tri = (c: Ctx, color: string, a: Pt, b: Pt, d: Pt) => poly(c, color, [a, b, d]);
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [CREST.w - x, y]);

// ---------- Alas (lado izquierdo; el derecho es el mismo volteado). Se enganchan a la barra por la derecha, a media altura (y = 18). ----------

const WINGS: Record<BarTheme, (c: Ctx, p: Palette) => void> = {
  primordial(c, p) { // ala de dragón-murciélago: brazo con púas, cuatro dedos y membrana festoneada entre ellos
    const wrist: Pt = [46, 7];
    const tips: Pt[] = [[2, 3], [5, 29], [21, 34], [37, 30]];
    c.fillStyle = p.m; c.beginPath(); c.moveTo(...wrist); c.lineTo(...tips[0]);
    c.quadraticCurveTo(15, 15, ...tips[1]); c.quadraticCurveTo(15, 24, ...tips[2]); c.quadraticCurveTo(31, 23, ...tips[3]);
    c.quadraticCurveTo(50, 20, 72, 21); c.lineTo(72, 14); c.closePath(); c.fill();
    // la membrana se aclara junto al brazo y entre los dos primeros dedos
    poly(c, p.l, [wrist, [2, 3.4], [10, 9], [20, 11], [34, 11], [52, 13], [72, 15], [72, 14]]);
    for (const [a, b] of [[[38, 9], [10, 22]], [[40, 12], [24, 27]], [[44, 13], [36, 25]], [[56, 13], [52, 20]], [[22, 7], [8, 14]]] as Pt[][])
      curve(c, p.h, 0.7, [a, [(a[0] + b[0]) / 2 + 1.5, (a[1] + b[1]) / 2 + 1], b]);
    for (const t of tips) { line(c, p.d, 2.4, [wrist, [(wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2]]); line(c, p.d, 1.5, [[(wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2], t]); }
    for (const t of tips) ell(c, p.d, (wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2, 1.6);
    for (const t of tips.slice(1)) tri(c, p.w, [t[0] - 1.4, t[1] - 0.6], [t[0] - 1.6, t[1] + 3.2], [t[0] + 1.4, t[1]]);
    tri(c, p.w, [1, 1.6], [-0.4, 5.6], [4, 4]);
    line(c, p.d, 5, [[72, 17], [58, 11], wrist]);
    line(c, p.l, 1, [[71, 15], [58, 9.2], [47, 5.4]]);
    for (const x of [52, 58, 64, 70]) { const y = 7.6 + (x - 46) * 0.36; tri(c, p.w, [x - 1.6, y], [x - 1, y - 4.4], [x + 1.4, y]); }
    tri(c, p.w, [43, 6], [41, 0.4], [47, 4.6]); // garra del pulgar
    ell(c, p.e, 46, 7.4, 2); ell(c, p.w, 45.4, 6.8, 0.6);
  },
  inframundo(c, p) { // ala descarnada: huesos de los dedos, membrana negra hecha jirones, calavera en la muñeca y almas
    const wrist: Pt = [48, 9];
    const tips: Pt[] = [[2, 4], [4, 24], [16, 33], [32, 32]];
    c.fillStyle = p.d; c.beginPath(); c.moveTo(...wrist); c.lineTo(...tips[0]);
    // borde roto: dientes entre cada par de dedos
    const torn = (a: Pt, b: Pt, n: number, depth: number) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n, mx = a[0] + (b[0] - a[0]) * (t - 0.5 / n), my = a[1] + (b[1] - a[1]) * (t - 0.5 / n);
        const nx = wrist[0] - mx, ny = wrist[1] - my, l = Math.hypot(nx, ny);
        c.lineTo(mx + (nx / l) * depth * (i % 2 ? 1 : 0.5), my + (ny / l) * depth * (i % 2 ? 1 : 0.5));
        c.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      }
    };
    torn(tips[0], tips[1], 4, 6); torn(tips[1], tips[2], 3, 5); torn(tips[2], tips[3], 3, 5); torn(tips[3], [56, 22], 3, 4);
    c.lineTo(72, 21); c.lineTo(72, 14); c.closePath(); c.fill();
    poly(c, p.m, [wrist, [3, 4.6], [12, 9], [26, 11], [40, 13], [56, 14.6], [72, 16], [72, 14]]); // membrana más clara junto al brazo
    for (const [x, y, r] of [[22, 20, 2], [12, 15, 1.4], [38, 22, 1.6]] as number[][]) ell(c, p.k, x, y, r * 1.2, r); // agujeros
    for (const t of tips) { // falanges: hueso, nudillo y hueso
      const mx = (wrist[0] + t[0]) / 2, my = (wrist[1] + t[1]) / 2;
      line(c, p.l, 1.8, [wrist, [mx, my]]); line(c, p.l, 1.3, [[mx, my], t]);
      ell(c, p.h, mx, my, 1.5); ell(c, p.h, t[0], t[1], 1.2);
    }
    line(c, p.l, 3.4, [[72, 18], [60, 13], wrist]); // húmero
    line(c, p.h, 0.9, [[71, 16.6], [60, 11.6], [49, 7.8]]);
    ell(c, p.h, 60, 12.6, 2.2, 2);
    // calavera en la muñeca
    ell(c, p.h, 48, 8, 4.6, 4.2); rect(c, p.h, 45.4, 10.4, 5.2, 3);
    ell(c, p.k, 46.2, 8.4, 1.4, 1.5); ell(c, p.k, 49.8, 8.4, 1.4, 1.5);
    rect(c, p.e, 46, 8.2, 0.8, 0.8); rect(c, p.e, 49.6, 8.2, 0.8, 0.8);
    for (const x of [46.4, 48, 49.6]) rect(c, p.k, x, 12, 0.6, 1.4);
    for (const [x, y, r] of [[30, 3, 1.6], [62, 27, 1.4], [10, 30, 1.2], [44, 30, 1.2], [20, 1.6, 1]] as number[][]) { // almas
      ell(c, p.e, x, y, r); ell(c, p.w, x - 0.3, y - 0.3, r * 0.45);
      curve(c, p.e, 0.6, [[x, y + r], [x + 1, y + r + 2], [x, y + r + 3.4]]);
    }
  },
  heroe(c, p) { // rama de laurel con hojas anchas en dos tonos, bayas de oro y lazo rojo con dos cintas
    curve(c, p.D, 2.6, [[72, 18], [54, 17], [36, 14.6], [18, 11], [4, 6]]);
    for (let i = 0; i < 8; i++) {
      const t = i / 7, x = 64 - t * 56, y = 16.8 - t * 9 + Math.sin(t * 3) * 0.5, len = 12 - t * 3.4, w = 3.8 - t * 0.9;
      leaf(c, p.d, x, y - 0.6, len, Math.PI + 0.85 - t * 0.25, w);
      leaf(c, p.g, x - 3, y + 0.6, len, Math.PI - 0.62 + t * 0.12, w);
      // nervio central claro de cada hoja
      line(c, p.h, 0.6, [[x - 1, y - 1.4], [x - 1 + Math.cos(Math.PI + 0.85 - t * 0.25) * len * 0.62, y - 1.4 + Math.sin(Math.PI + 0.85 - t * 0.25) * len * 0.62]]);
      line(c, p.h, 0.6, [[x - 4, y + 1.2], [x - 4 + Math.cos(Math.PI - 0.62 + t * 0.12) * len * 0.6, y + 1.2 + Math.sin(Math.PI - 0.62 + t * 0.12) * len * 0.6]]);
    }
    leaf(c, p.g, 7, 7.4, 7, Math.PI + 0.35, 2.6);
    for (const [x, y] of [[56, 24], [46, 9], [38, 23], [27, 6.6], [19, 19], [11, 3]] as Pt[]) { ell(c, p.l, x, y, 1.8); rect(c, p.w, x - 1, y - 1, 1, 1); }
    curve(c, p.e, 3.2, [[64, 20], [58, 26], [54, 32], [50, 34]]);
    curve(c, p.e, 3, [[66, 21], [66, 28], [62, 34], [60, 35.4]]);
    tri(c, p.e, [48, 33], [50, 36], [53, 34]); tri(c, p.e, [58, 35], [60, 37], [62, 35]);
    poly(c, p.e, [[72, 13], [66, 12], [60, 15], [62, 18.6], [66, 18], [72, 23]]);
    ell(c, p.e, 64.4, 18, 3, 3.6);
    curve(c, p.r, 1, [[61, 25], [56, 31], [52, 33.4]]); curve(c, p.r, 1, [[64.6, 23], [64, 30], [61.4, 34]]);
    ell(c, p.r, 64.4, 18.6, 1.2, 1.8);
  },
  ingenio(c, p) { // ala de esfinge dorada: remeras anchas que se solapan, cobertoras en escamas y una gema
    const edge = (x: number) => 2 + (x - 4) * 0.2; // borde de ataque, de la punta (izquierda) al hombro
    const feathers = (n: number, scale: number, cols: string[], quill: boolean) => {
      for (let i = n - 1; i >= 0; i--) { // del hombro a la punta: las de fuera quedan encima
        const t = i / (n - 1), bx = 9 + t * 58, by = edge(bx) + 2.4;
        const ex = 1 + t * 54, ey = 12 + 22 * (1 - (1 - t) ** 2); // borde de salida curvo
        const len = Math.hypot(ex - bx, ey - by) * scale, a = Math.atan2(ey - by, ex - bx);
        leaf(c, cols[i % cols.length], bx, by, len, a, 4.4 + len * 0.16);
        if (quill) line(c, p.d, 0.6, [[bx, by], [bx + Math.cos(a) * len * 0.82, by + Math.sin(a) * len * 0.82]]);
      }
    };
    feathers(13, 1, [p.m, p.l], true);
    feathers(11, 0.55, [p.h, p.l], false);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) { // cobertoras en escamas
      const x = 10 + i * 5.2 + r * 2.6, y = edge(x) + 2.6 + r * 3;
      ell(c, r ? p.l : p.h, x, y, 2.8, 2.2);
      rect(c, p.m, x - 0.6, y + 0.8, 1.2, 1);
    }
    curve(c, p.d, 4.4, [[72, 17], [56, edge(56)], [30, edge(30)], [4, 2]]);
    curve(c, p.h, 1, [[70, 15.2], [56, edge(56) - 1.6], [30, edge(30) - 1.4], [6, 0.8]]);
    tri(c, p.h, [0, 2], [5, -0.2], [5.4, 4]);
    ell(c, p.e, 54, edge(54) + 0.4, 2.8, 2.4); ell(c, p.w, 53.2, edge(54) - 0.4, 0.8);
  },
  odisea(c, p) { // ola que rompe con capas, espuma rizada y salpicaduras
    poly(c, p.d, [[72, 13], [58, 12], [44, 15], [30, 13], [18, 14], [10, 19], [8, 26], [16, 30], [30, 27], [44, 30], [58, 26], [72, 24]]);
    poly(c, p.m, [[72, 14], [58, 13], [44, 16], [30, 14], [18, 15], [12, 19], [14, 24], [24, 23], [36, 21], [50, 22], [62, 19], [72, 19]]);
    ell(c, p.m, 11, 12, 8, 7.4);
    ell(c, p.l, 11, 11, 6.6, 6);
    ell(c, p.d, 12.6, 12.6, 3.6, 3.2);
    ell(c, p.m, 13, 13, 2, 1.8);
    curve(c, p.l, 2.2, [[72, 15], [60, 14], [48, 17], [36, 15], [24, 16]]);
    for (const [x, y] of [[66, 14], [54, 15.4], [42, 16], [30, 15], [20, 15.6]] as Pt[]) { ell(c, p.h, x, y - 1.2, 3, 1.4); ell(c, p.w, x - 0.6, y - 1.6, 1.2, 0.6); }
    curve(c, p.h, 1.8, [[5, 9], [6, 5], [11, 3.6], [16, 5.4]]);
    for (const [x, y, r] of [[3, 3, 1.3], [8, 0.8, 0.9], [18, 2, 1], [24, 8, 0.8], [60, 9, 1], [46, 10, 0.8], [34, 30, 0.9]] as number[][]) ell(c, p.h, x, y, r);
    curve(c, p.l, 1, [[60, 23], [52, 25], [44, 24]]); curve(c, p.l, 1, [[34, 24], [26, 26], [20, 25]]);
  },
  gremio(c, p) { // estandarte de gremio en su asta, con ribete de oro, flecos y emblema
    line(c, p.B ?? p.e, 2, [[72, 17], [2, 17]]);
    tri(c, p.l, [0, 17], [5, 13.6], [5, 20.4]);
    poly(c, p.e, [[64, 9], [20, 9], [12, 15], [12, 30], [26, 26], [40, 31], [54, 26], [64, 30]]);
    poly(c, p.m, [[62, 11], [21, 11], [14.4, 16], [14.4, 27], [26, 23.6], [40, 28.4], [54, 23.6], [62, 27]]);
    poly(c, p.d, [[62, 11], [42, 11], [42, 26.2], [54, 23.6], [62, 27]]);
    for (const x of [16, 22, 28, 34, 40, 46, 52, 58]) line(c, p.e, 0.8, [[x, 28 + Math.sin(x) * 1.2], [x, 32 + Math.sin(x) * 1.2]]);
    poly(c, p.h, [[38, 13.6], [39.6, 17.4], [43.6, 17.6], [40.6, 20], [41.6, 24], [38, 21.8], [34.4, 24], [35.4, 20], [32.4, 17.6], [36.4, 17.4]]);
    for (const x of [20, 30, 48, 58]) ell(c, p.e, x, 10, 1);
  },
};

// ---------- Emblemas del centro (52 × 44) ----------

const CRESTS: Record<BarTheme, (c: Ctx, p: Palette) => void> = {
  primordial(c, p) { // ojo de dragón con cuernos anillados, escamas y colmillos
    const horn: Pt[] = [[19, 17], [11, 12], [3, 1.4], [3, 9], [6, 17], [13, 23]];
    poly(c, p.d, horn); poly(c, p.d, mirror(horn));
    for (const t of [0.25, 0.45, 0.65]) { const x = 3 + (19 - 3) * t, y = 1.4 + (17 - 1.4) * t; line(c, p.m, 1, [[x - 3, y + 2], [x + 2, y - 1.5]]); line(c, p.m, 1, [[CREST.w - x + 3, y + 2], [CREST.w - x - 2, y - 1.5]]); }
    ell(c, p.d, 26, 24, 21, 14.5);
    for (let i = 0; i < 14; i++) { const a = Math.PI * (i / 13); ell(c, p.m, 26 - Math.cos(a) * 18.5, 24 - Math.sin(a) * 12.4, 2.2, 1.6); }
    for (const [x, s2] of [[14, 1], [21, 1], [31, -1], [38, -1]] as number[][]) tri(c, p.w, [x - 2, 33], [x + s2, 39.6], [x + 2.2, 33]);
    for (const x of [17.6, 34.4]) tri(c, p.w, [x - 1.2, 33], [x, 36.4], [x + 1.2, 33]);
    ell(c, p.k, 26, 24, 15.6, 9.8);
    ell(c, p.l, 26, 24, 14, 8.4);
    ell(c, p.m, 26, 24, 8.4, 8);
    ell(c, p.e, 26, 24, 7, 6.8);
    ell(c, p.h, 24.4, 21.6, 3.4, 2.6);
    ell(c, p.e, 26, 25, 4.4, 4.2);
    rect(c, p.k, 24.8, 16.4, 2.6, 15.4);
    rect(c, p.w, 20.4, 18.6, 2, 2); rect(c, p.w, 31, 28, 1.2, 1.2);
    for (const x of [12, 40]) ell(c, p.e, x, 17, 1.4);
  },
  inframundo(c, p) { // calavera agrietada sobre huesos cruzados, con dos calaveras más detrás
    line(c, p.h, 3, [[4, 42], [48, 30]]); line(c, p.h, 3, [[48, 42], [4, 30]]);
    for (const [x, y] of [[4, 42], [48, 30], [48, 42], [4, 30]] as Pt[]) { ell(c, p.h, x - 1.4, y - 1, 2); ell(c, p.h, x + 1.4, y + 1, 2); }
    for (const x of [8, 44]) { ell(c, p.m, x, 22, 7.6, 7.2); rect(c, p.m, x - 4.6, 26, 9.2, 5); ell(c, p.k, x - 2.6, 22.4, 2, 2.2); ell(c, p.k, x + 2.6, 22.4, 2, 2.2); }
    ell(c, p.l, 26, 17, 16.6, 14.6);
    poly(c, p.l, [[13.4, 24], [38.6, 24], [36.6, 36.6], [15.4, 36.6]]);
    ell(c, p.h, 21, 8.6, 7.4, 3.6);
    ell(c, p.m, 14.4, 27.4, 3.4, 2.4); ell(c, p.m, 37.6, 27.4, 3.4, 2.4);
    ell(c, p.k, 18.8, 21, 5, 4.6); ell(c, p.k, 33.2, 21, 5, 4.6);
    ell(c, p.e, 18.8, 21.4, 2.4); ell(c, p.e, 33.2, 21.4, 2.4);
    rect(c, p.w, 18, 20.6, 1.6, 1.6); rect(c, p.w, 32.4, 20.6, 1.6, 1.6);
    poly(c, p.k, [[23.6, 29.6], [26, 25], [28.4, 29.6]]);
    rect(c, p.k, 16.4, 31.2, 19.2, 1.6);
    for (const x of [19.4, 22.8, 26.2, 29.6, 33]) rect(c, p.k, x, 31.2, 0.9, 5);
    curve(c, p.m, 0.9, [[30, 3], [31.6, 7.4], [29.6, 10.6], [31.2, 13]]);
    curve(c, p.m, 0.8, [[12, 12], [14.4, 14.6], [13.6, 17]]);
  },
  heroe(c, p) { // yelmo corintio de bronce: penacho de crin, carrilleras, abertura en T, greca y remaches
    // penacho: un arco de crin roja de delante atrás, con mechones
    c.fillStyle = p.e; c.beginPath(); c.moveTo(7, 17); c.quadraticCurveTo(5, 0, 26, 0); c.quadraticCurveTo(47, 0, 45, 17);
    c.quadraticCurveTo(40, 9, 26, 9); c.quadraticCurveTo(12, 9, 7, 17); c.fill();
    for (let i = 0; i < 13; i++) { const a = Math.PI + 0.25 + (i / 12) * (Math.PI - 0.5); line(c, p.r, 0.8, [[26 + Math.cos(a) * 19, 15 + Math.sin(a) * 14.4], [26 + Math.cos(a) * 15, 15 + Math.sin(a) * 9.6]]); }
    rect(c, p.D, 22, 6, 8, 4); rect(c, p.l, 23, 6.6, 6, 1.2); // soporte del penacho
    // cúpula y carrilleras
    ell(c, p.m, 26, 22, 15.6, 13.4);
    c.fillStyle = p.m; c.beginPath(); c.moveTo(10.4, 22); c.lineTo(41.6, 22); c.quadraticCurveTo(43, 36, 37, 42); c.lineTo(31, 41);
    c.lineTo(29.4, 31); c.lineTo(22.6, 31); c.lineTo(21, 41); c.lineTo(15, 42); c.quadraticCurveTo(9, 36, 10.4, 22); c.fill();
    ell(c, p.h, 20, 14.6, 5.6, 2.8); // brillo de la cúpula
    rect(c, p.l, 10.6, 19, 30.8, 3); // banda con greca
    for (let x = 12; x < 40; x += 4) { rect(c, p.D, x, 19.6, 2.4, 0.9); rect(c, p.D, x + 1.5, 19.6, 0.9, 1.9); }
    // abertura en T: ojos almendrados y boca, con el protector nasal
    c.fillStyle = p.k; c.beginPath(); c.moveTo(13.6, 25); c.quadraticCurveTo(19, 22.6, 24.4, 24.4); c.lineTo(24.4, 27.6); c.quadraticCurveTo(18, 28.4, 13.6, 25); c.fill();
    c.beginPath(); c.moveTo(38.4, 25); c.quadraticCurveTo(33, 22.6, 27.6, 24.4); c.lineTo(27.6, 27.6); c.quadraticCurveTo(34, 28.4, 38.4, 25); c.fill();
    poly(c, p.k, [[23.4, 30.4], [28.6, 30.4], [30, 42], [22, 42]]);
    rect(c, p.l, 24.6, 23, 2.8, 8.6); rect(c, p.h, 25, 23.4, 1, 6);
    curve(c, p.D, 0.8, [[12, 31], [16, 34], [20, 34.6]]); curve(c, p.D, 0.8, [[40, 31], [36, 34], [32, 34.6]]);
    for (const [x, y] of [[13, 29], [39, 29], [14.6, 38.4], [37.4, 38.4], [26, 11.6]] as Pt[]) { ell(c, p.D, x, y, 1.1); rect(c, p.w, x - 0.6, y - 0.6, 0.7, 0.7); }
  },
  ingenio(c, p) { // pirámide de sillares con el ojo que todo lo ve y rayos de luz
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.32; line(c, p.h, 0.9, [[26 + Math.cos(a) * 9, 9 + Math.sin(a) * 6], [26 + Math.cos(a) * 17, 9 + Math.sin(a) * 9.4]]); }
    poly(c, p.m, [[26, 3], [50, 41], [2, 41]]);
    poly(c, p.d, [[26, 3], [50, 41], [26, 41]]);
    for (let y = 16; y < 41; y += 5) {
      const half = ((y - 3) / 38) * 24;
      line(c, p.d, 0.8, [[26 - half, y], [26 + half, y]]);
      for (let x = 26 - half + ((y / 5) % 2 ? 3 : 6); x < 26 + half; x += 6) line(c, p.d, 0.8, [[x, y], [x, y + 5]]);
    }
    poly(c, p.h, [[26, 2], [32.4, 12.6], [19.6, 12.6]]);
    poly(c, p.l, [[26, 2], [32.4, 12.6], [26, 12.6]]);
    ell(c, p.w, 26, 25, 9.6, 5);
    ell(c, p.e, 26, 25, 4);
    ell(c, p.k, 26, 25, 1.8);
    rect(c, p.w, 23.6, 22.6, 1.4, 1.4);
    line(c, p.k, 1, [[16, 25], [20, 21.4], [26, 20], [32, 21.4], [36, 25]]);
  },
  odisea(c, p) { // timón de madera con cabillas y el tridente de Poseidón
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      line(c, p.B, 2.2, [[26, 24], [26 + Math.cos(a) * 18.4, 24 + Math.sin(a) * 17.4]]);
      ell(c, p.B, 26 + Math.cos(a) * 19.4, 24 + Math.sin(a) * 18.4, 2.2);
    }
    ell(c, p.b, 26, 24, 14.4, 13.6); ell(c, p.B, 26, 24, 13, 12.2); ell(c, p.k, 26, 24, 10, 9.4);
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 8; line(c, p.b, 1.6, [[26, 24], [26 + Math.cos(a) * 10, 24 + Math.sin(a) * 9.4]]); }
    ell(c, p.B, 26, 24, 3.6); ell(c, p.l, 26, 24, 1.6);
    line(c, p.e, 2.4, [[26, 3], [26, 43]]);
    curve(c, p.e, 2, [[16, 12], [16.6, 15], [26, 16], [35.4, 15], [36, 12]]);
    line(c, p.e, 1.8, [[16, 12], [16, 4]]); line(c, p.e, 1.8, [[36, 12], [36, 4]]);
    for (const x of [16, 26, 36]) { tri(c, p.h, [x - 2.4, 4.6], [x, -0.4], [x + 2.4, 4.6]); }
    tri(c, p.e, [13.6, 7], [16, 4], [16, 8.4]); tri(c, p.e, [38.4, 7], [36, 4], [36, 8.4]);
    ell(c, p.h, 24.6, 18, 0.8, 1.6);
  },
  gremio(c, p) { // escudo cuartelado con estrella, sobre dos espadas con guarda de oro
    for (const [a, b] of [[[4, 3], [46, 41]], [[48, 3], [6, 41]]] as Pt[][]) { line(c, p.l, 2.8, [a, b]); line(c, p.h, 0.8, [[a[0] + 1, a[1]], [b[0] + 1, b[1] - 1]]); }
    for (const [x, y, s] of [[10, 35.6, 1], [42, 35.6, -1]] as number[][]) {
      line(c, p.e, 2.2, [[x - 4 * s, y - 4], [x + 4 * s, y + 4]]);
      line(c, p.d, 2.2, [[x + 1.6 * s, y + 1.8], [x - 3.4 * s, y + 6]]);
      ell(c, p.e, x - 4.4 * s, y + 6.6, 1.8);
    }
    poly(c, p.e, [[9, 4], [43, 4], [43, 20], [26, 39], [9, 20]]);
    poly(c, p.m, [[11.6, 6.6], [40.4, 6.6], [40.4, 19.4], [26, 35.6], [11.6, 19.4]]);
    poly(c, p.d, [[26, 6.6], [40.4, 6.6], [40.4, 19.4], [26, 19.4]]);
    poly(c, p.d, [[11.6, 19.4], [26, 19.4], [26, 35.6]]);
    poly(c, p.h, [[26, 11.6], [28.2, 17], [34, 17.4], [29.6, 21], [31.2, 26.6], [26, 23.4], [20.8, 26.6], [22.4, 21], [18, 17.4], [23.8, 17]]);
    for (const [x, y] of [[12.6, 7.6], [39.4, 7.6], [26, 34]] as Pt[]) ell(c, p.w, x, y, 0.8);
  },
};

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Dibuja y lo deja en pixel art: colores de la paleta, volumen por formas, sin semitransparencias y con contorno. */
function pixelize(w: number, h: number, pal: Palette, draw: (c: Ctx, p: Palette) => void): string {
  const W = w + 2, H = h + 2; // un píxel de margen para el contorno
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return '';
  c.translate(1, 1);
  // se anotan los colores que usa el dibujo para no cuantizar a otros (el bronce no debe acabar en verde de laurel)
  const used = new Set<string>();
  draw(c, new Proxy(pal, { get: (t, key: string) => { used.add(key); return t[key]; } }));
  c.setTransform(1, 0, 0, 1, 0, 0);
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const keys = Object.keys(pal).filter((k) => used.has(k));
  const colors = keys.map((k) => hex(pal[k]));
  const idx = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < idx.length; i++) {
    const o = i * 4;
    if (d[o + 3] < 110) continue;
    // el borde suavizado se mezcla con el transparente: se deshace la mezcla antes de buscar el color
    const a = d[o + 3] / 255;
    const r = d[o] / a, g = d[o + 1] / a, b = d[o + 2] / a;
    let best = 0, bd = Infinity;
    colors.forEach((col, j) => { const dd = (col[0] - r) ** 2 + (col[1] - g) ** 2 + (col[2] - b) ** 2; if (dd < bd) { bd = dd; best = j; } });
    idx[i] = best;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : idx[y * W + x]);
  const k = hex(pal.k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, j = idx[i];
    if (j < 0) {
      // contorno: transparente pegado a algo pintado
      if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) { d[o] = k[0]; d[o + 1] = k[1]; d[o + 2] = k[2]; d[o + 3] = 255; }
      else d[o + 3] = 0;
      continue;
    }
    let [r, g, b] = colors[j];
    if (!FLAT.has(keys[j])) {
      // volumen: arriba (y a la izquierda) le da la luz, abajo (y a la derecha) queda en sombra; más oscuro hacia abajo
      let f = 1.06 - 0.22 * (y / H);
      if (at(x, y - 1) !== j) f += 0.3; else if (at(x, y - 2) !== j) f += 0.12;
      if (at(x, y + 1) !== j) f -= 0.28; else if (at(x, y + 2) !== j) f -= 0.1;
      if (at(x - 1, y) !== j) f += 0.08;
      if (at(x + 1, y) !== j) f -= 0.08;
      if (f > 1) { const t = Math.min(0.6, f - 1); r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
      else { r *= f; g *= f; b *= f; }
    }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
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
      url = part === 'wing' ? pixelize(WING.w, WING.h, PALETTES[theme], WINGS[theme]) : pixelize(CREST.w, CREST.h, PALETTES[theme], CRESTS[theme]);
    } catch {
      url = '';
    }
    cache.set(key, url);
  }
  return url;
}
