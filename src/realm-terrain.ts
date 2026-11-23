// Terreno del mapa de reinos: una isla con costa, curvas de nivel, cordilleras, bosques, un río que baja al mar
// y campos de cultivo junto a cada reino. Cada mapa tiene su semilla (el general y el de cada reino son distintos)
// y nada se dibuja encima de un reino, su nombre o su camino.

export type Pt = [number, number];
export interface Clear { x: number; y: number; r: number }
export interface Mountain { x: number; y: number; s: number }
export interface Terrain {
  coast: string;
  contours: string[];
  river: string;
  mountains: Mountain[];
  pinesL: string;
  pinesD: string;
  waves: string;
}

const f = (n: number) => n.toFixed(1);

export function seedOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483646;
  return h || 7;
}

function rng(seed: number) {
  let s = seed % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Curva cerrada y suave (Catmull-Rom) que pasa por los puntos. */
function smooth(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Puntos de un camino curvo (el mismo Q que dibuja el mapa) para no plantar nada encima. */
export function roadPoints(a: Pt, c: Pt, b: Pt, n = 10): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt;
  });
}

export function terrain(seed: number, W: number, H: number, clear: Clear[]): Terrain {
  const rnd = rng(seed);
  const cx = W / 2;
  const cy = H / 2;
  const RX = W * (W < 600 ? 0.47 : 0.455);
  const RY = H * 0.44;
  // Forma de la isla: casi un rectángulo redondeado (para que quepan los reinos de las esquinas) con costa irregular.
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const R = (a: number) => {
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const base = 1 / Math.pow(c ** 4 + s ** 4, 0.25);
    return base * (1 + 0.05 * Math.sin(3 * a + ph[0]) + 0.035 * Math.sin(5 * a + ph[1]) + 0.02 * Math.sin(11 * a + ph[2]));
  };
  const ring = (k: number) => smooth(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r = R(a) * k;
    return [cx + Math.cos(a) * r * RX, cy + Math.sin(a) * r * RY] as Pt;
  }));
  const inLand = (x: number, y: number, k = 1) => {
    const dx = (x - cx) / RX;
    const dy = (y - cy) / RY;
    return Math.hypot(dx, dy) < R(Math.atan2(dy, dx)) * k;
  };
  const free = (x: number, y: number, pad: number) => clear.every((c) => Math.hypot(x - c.x, y - c.y) > c.r + pad);
  const small = W < 600 ? 0.8 : 1;

  // Cordilleras: picos en fila, más altos en el centro de la sierra.
  const mountains: Mountain[] = [];
  for (let r = 0; r < 6; r++) {
    const ox = cx + (rnd() - 0.5) * W * 0.85;
    const oy = cy + (rnd() - 0.5) * H * 0.8;
    const ang = (rnd() - 0.5) * 1.2;
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const mid = 1 - Math.abs(i - (n - 1) / 2) / n;
      const s = (11 + 9 * mid + rnd() * 4) * small;
      const t = (i - (n - 1) / 2) * s * 1.15;
      const x = ox + Math.cos(ang) * t + (rnd() - 0.5) * 6;
      const y = oy + Math.sin(ang) * t + (rnd() - 0.5) * 8;
      if (inLand(x, y, 0.86) && free(x, y, s)) mountains.push({ x, y, s });
    }
  }
  mountains.sort((a, b) => a.y - b.y);

  // Bosques en manchas y algún pino suelto. Dos trazos (cara con luz y cara en sombra) para todo el bosque.
  let pinesL = '';
  let pinesD = '';
  const pine = (x: number, y: number, s: number) => {
    pinesL += `M${f(x - 4.5 * s)},${f(y + 5 * s)} L${f(x)},${f(y - 7 * s)} L${f(x)},${f(y + 5 * s)} Z`;
    pinesD += `M${f(x)},${f(y - 7 * s)} L${f(x + 4.5 * s)},${f(y + 5 * s)} L${f(x)},${f(y + 5 * s)} Z`;
  };
  const trees: Pt[] = [];
  for (let k = 0; k < 7; k++) {
    const fx = cx + (rnd() - 0.5) * W * 0.9;
    const fy = cy + (rnd() - 0.5) * H * 0.85;
    const n = 9 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) trees.push([fx + (rnd() + rnd() - 1) * 34 * small, fy + (rnd() + rnd() - 1) * 22 * small]);
  }
  for (let i = 0; i < 14; i++) trees.push([rnd() * W, rnd() * H]);
  trees
    .filter(([x, y]) => inLand(x, y, 0.92) && free(x, y, 6) && mountains.every((m) => Math.hypot(x - m.x, y - m.y) > m.s * 0.9))
    .sort((a, b) => a[1] - b[1])
    .forEach(([x, y]) => pine(x, y, (0.65 + rnd() * 0.5) * small));

  // Río: nace en la primera sierra (o cerca del centro) y baja serpenteando hasta el mar por el lado más cercano.
  const src: Pt = mountains.length ? [mountains[0].x, mountains[0].y + 8] : [cx + W * 0.2, cy - H * 0.3];
  const right = src[0] < cx;
  const end: Pt = [right ? W + 20 : -20, cy + (rnd() - 0.2) * H * 0.6];
  const river = `M${f(src[0])},${f(src[1])} C${f(src[0] + (end[0] - src[0]) * 0.25)},${f(src[1] + H * (0.25 + rnd() * 0.2))} ${f(src[0] + (end[0] - src[0]) * 0.6)},${f(end[1] - H * (0.3 + rnd() * 0.2))} ${f(end[0])},${f(end[1])}`;

  // Olas en el mar (solo fuera de la costa).
  let waves = '';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (inLand(x, y, 1.06)) continue;
    const w = 4 + rnd() * 3;
    waves += `M${f(x - w)},${f(y)} q${f(w / 2)},${f(-w / 2.4)} ${f(w)},0 q${f(w / 2)},${f(-w / 2.4)} ${f(w)},0 `;
  }

  return { coast: ring(1), contours: [ring(0.9), ring(0.78)], river, mountains, pinesL, pinesD, waves };
}

/** Campos de cultivo alrededor de un reino: más cuanto más avanzado (0 a 4), nunca debajo del nombre. */
export function fields(seed: number, x: number, y: number, n: number): string {
  const rnd = rng(seed);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.05 + 0.9 * ((i + 0.5 + (rnd() - 0.5) * 0.4) / 4)) - (i % 2 ? 0 : 0.1);
    const r = 40 + rnd() * 8;
    const px = x + Math.cos(a) * r * 1.15;
    const py = y + Math.sin(a) * r * 0.8;
    const w = 7 + rnd() * 3;
    const h = 4 + rnd() * 1.5;
    d += `M${f(px - w)},${f(py)} L${f(px)},${f(py - h)} L${f(px + w)},${f(py)} L${f(px)},${f(py + h)} Z`;
  }
  return d;
}
