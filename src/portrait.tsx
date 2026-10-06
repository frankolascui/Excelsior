// Retrato del héroe con el aro de su avatar. Cada avatar tiene un aro más épico que el anterior,
// forjado con metales y engastado con minerales y gemas talladas (más preciosas en cada rango).
// Dentro va la inicial (o el icono del avatar); el día que haya foto de perfil, irá la foto.
import { createContext, useContext, useId, type ReactNode, type SVGProps } from 'react';
import './portrait.css';

const C = 100; // centro del lienzo 200×200

type Pt = readonly [number, number];
const n2 = (n: number) => Math.round(n * 100) / 100;
const ptsStr = (ps: readonly Pt[]) => ps.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ');
/** Punto a distancia r y ángulo deg (0 = arriba, sentido horario) desde (cx, cy). */
const polarAt = (cx: number, cy: number, r: number, deg: number): Pt => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const polar = (r: number, deg: number) => polarAt(C, C, r, deg);
const around = (n: number, fn: (deg: number, i: number) => ReactNode) => Array.from({ length: n }, (_, i) => fn((360 / n) * i, i));
/** Gira `rot` grados y lleva a (x, y) unos puntos locales («arriba» apunta hacia fuera si rot = ángulo polar). */
const place = (ps: readonly Pt[], x: number, y: number, rot: number): Pt[] => {
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ps.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c] as const);
};
/** Luz desde arriba a la izquierda: 1 = de cara a la luz, -1 = de espaldas. */
const lit = (vx: number, vy: number) => { const l = Math.hypot(vx, vy) || 1; return (-vx - vy) / (l * Math.SQRT2); };
const toneOf = (v: number) => (v > 0.5 ? 0 : v > 0.05 ? 1 : v > -0.45 ? 2 : 3);

/* ---------- Paleta de gemas y metales ---------- */

// [luz, medio, sombra, fondo]
const GEMS = {
  ruby: ['#ff8fb4', '#e0115f', '#a0083f', '#5a0321'],
  sapphire: ['#a3c8ff', '#2563eb', '#173f9e', '#0a2160'],
  emerald: ['#8af5c0', '#10b06a', '#08744a', '#033f27'],
  amethyst: ['#ecc8ff', '#a855f7', '#6b21a8', '#3b0764'],
  topaz: ['#d9faff', '#38d1f5', '#0e8fc0', '#064a6e'],
  diamond: ['#ffffff', '#e4f4ff', '#a9cbe6', '#6f94b8'],
  citrine: ['#fff6b0', '#facc15', '#c08a06', '#6b4702'],
  amber: ['#ffe9a3', '#f5a623', '#b8650a', '#5e2e03'],
  garnet: ['#ff8a7a', '#b3122e', '#760a1e', '#3d040f'],
  obsidian: ['#a7adc6', '#3a3d4f', '#1b1c26', '#07070c'],
  fireopal: ['#ffe2a6', '#ff8a1f', '#e0441a', '#7e1b06'],
  quartz: ['#ffffff', '#eef4fa', '#bfcddc', '#7e8ea3'],
} as const;
type GemName = keyof typeof GEMS;

// [brillo, claro, medio, oscuro, sombra]
const METALS = {
  stone: ['#e0dad0', '#a8a094', '#7d766c', '#4f4a44', '#25221f'],
  iron: ['#eef1f5', '#a9b0ba', '#6e757f', '#40454c', '#1e2125'],
  copper: ['#ffe2c8', '#f0a070', '#c06a38', '#7a3a18', '#3f1c09'],
  silver: ['#ffffff', '#e3e8ef', '#aeb8c6', '#6b7686', '#353d49'],
  bronze: ['#fde3b4', '#d9a35e', '#a8722f', '#6b4416', '#36210a'],
  platinum: ['#ffffff', '#eef3fa', '#c3cede', '#8794a8', '#465165'],
  gold: ['#fffbe0', '#ffe07a', '#f2b632', '#a8680c', '#4f2f03'],
  molten: ['#fffbd0', '#ffd65a', '#ff9a1f', '#d9480f', '#6e1903'],
  whitegold: ['#f2fbff', '#a9cdec', '#5f86b3', '#2c4a72', '#0f1c33'],
} as const;
type Metal = keyof typeof METALS;
const TIER_METALS: Metal[][] = [
  ['stone'], ['iron', 'copper'], ['silver'], ['bronze'], ['platinum'],
  ['gold'], ['molten', 'gold'], ['gold'], ['whitegold'], ['gold', 'platinum'],
];

const Ids = createContext('p');
const useUrl = () => { const id = useContext(Ids); return (n: string) => `url(#${id}-${n})`; };

function MetalGrad({ id, metal }: { id: string; metal: Metal }) {
  const m = METALS[metal];
  return (
    <linearGradient id={`${id}-m-${metal}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={m[0]} /><stop offset="22%" stopColor={m[1]} /><stop offset="46%" stopColor={m[2]} />
      <stop offset="60%" stopColor={m[1]} /><stop offset="84%" stopColor={m[3]} /><stop offset="100%" stopColor={m[4]} />
    </linearGradient>
  );
}

/* ---------- Piezas: brillos, gemas, metal ---------- */

/** Destello de 4 puntas que titila. */
function Sparkle({ x, y, s, delay }: { x: number; y: number; s: number; delay?: number }) {
  const d = delay ?? ((Math.abs(x * 37 + y * 17) % 29) / 10);
  const k = s * 0.2;
  return (
    <path className="gem-sparkle" style={{ animationDelay: `${n2(d)}s` }} fill="#fff"
      d={`M${n2(x)} ${n2(y - s)}L${n2(x + k)} ${n2(y - k)}L${n2(x + s)} ${n2(y)}L${n2(x + k)} ${n2(y + k)}L${n2(x)} ${n2(y + s)}L${n2(x - k)} ${n2(y + k)}L${n2(x - s)} ${n2(y)}L${n2(x - k)} ${n2(y - k)}Z`} />
  );
}

type Cut = 'brilliant' | 'emerald' | 'marquise' | 'trillion' | 'princess' | 'cabochon' | 'oval';

const lens = (w: number, h: number, n = 7): Pt[] => {
  const right = Array.from({ length: n + 1 }, (_, i) => { const s = i / n; return [w * Math.sin(Math.PI * s), -h + 2 * h * s] as const; });
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as const);
  return [...right, ...left];
};
const OUTLINES: Partial<Record<Cut, (r: number) => Pt[]>> = {
  emerald: (r) => { const w = r * 0.7, h = r, c = w * 0.38; return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]]; },
  marquise: (r) => lens(r * 0.44, r),
  trillion: (r) => Array.from({ length: 6 }, (_, i) => { const a = (i * 60 * Math.PI) / 180; const k = i % 2 ? r * 0.6 : r; return [k * Math.sin(a), -k * Math.cos(a)] as const; }),
  princess: (r) => { const w = r * 0.74; return [[-w, -w], [w, -w], [w, w], [-w, w]]; },
};

/** Gema tallada: facetas en 3–4 tonos con luz de arriba a la izquierda, reflejo blanco y engaste opcional. */
function Gem({ x, y, r, gem, cut = 'brilliant', rot = 0, set, sparkle = true, prongs }: {
  x: number; y: number; r: number; gem: GemName; cut?: Cut; rot?: number; set?: Metal; sparkle?: boolean | number; prongs?: boolean;
}) {
  const url = useUrl();
  const tone = GEMS[gem];
  const metal = set ? url(`m-${set}`) : undefined;
  const edge = Math.max(0.6, r * 0.07);
  const spark = sparkle === false ? null
    : <Sparkle x={x - r * 0.32} y={y - r * 0.36} s={Math.max(3, r * 0.64)} delay={typeof sparkle === 'number' ? sparkle : undefined} />;
  const shine = <ellipse cx={n2(x - r * 0.24)} cy={n2(y - r * 0.26)} rx={n2(r * 0.22)} ry={n2(r * 0.1)} fill="#fff" opacity={0.75} transform={`rotate(-45 ${n2(x - r * 0.24)} ${n2(y - r * 0.26)})`} />;

  if (cut === 'cabochon' || cut === 'oval') {
    const rx = cut === 'oval' ? r * 0.78 : r, ry = r;
    const tr = `rotate(${rot} ${n2(x)} ${n2(y)})`;
    return (
      <g>
        {metal && <ellipse cx={x} cy={y} rx={n2(rx + r * 0.22)} ry={n2(ry + r * 0.22)} fill={metal} transform={tr} />}
        <g transform={tr}>
          <ellipse cx={x} cy={y} rx={n2(rx)} ry={n2(ry)} fill={tone[3]} />
          <ellipse cx={n2(x - rx * 0.06)} cy={n2(y - ry * 0.06)} rx={n2(rx * 0.86)} ry={n2(ry * 0.86)} fill={tone[2]} />
          <ellipse cx={n2(x - rx * 0.12)} cy={n2(y - ry * 0.1)} rx={n2(rx * 0.66)} ry={n2(ry * 0.66)} fill={tone[1]} />
          <ellipse cx={n2(x - rx * 0.2)} cy={n2(y - ry * 0.22)} rx={n2(rx * 0.36)} ry={n2(ry * 0.32)} fill={tone[0]} opacity={0.85} />
        </g>
        {gem === 'fireopal' && (
          <g opacity={0.9}>
            <circle cx={n2(x + rx * 0.3)} cy={n2(y + ry * 0.1)} r={n2(r * 0.14)} fill="#6dffb0" />
            <circle cx={n2(x - rx * 0.1)} cy={n2(y + ry * 0.42)} r={n2(r * 0.11)} fill="#7ad7ff" />
            <circle cx={n2(x + rx * 0.05)} cy={n2(y - ry * 0.35)} r={n2(r * 0.1)} fill="#fff27a" />
          </g>
        )}
        <ellipse cx={n2(x - rx * 0.3)} cy={n2(y - ry * 0.42)} rx={n2(rx * 0.24)} ry={n2(ry * 0.12)} fill="#fff" opacity={0.9}
          transform={`rotate(-35 ${n2(x - rx * 0.3)} ${n2(y - ry * 0.42)})`} />
        {spark}
      </g>
    );
  }

  if (cut === 'brilliant') {
    const P = Array.from({ length: 8 }, (_, i) => polarAt(x, y, r, rot + i * 45));
    const T = Array.from({ length: 8 }, (_, i) => polarAt(x, y, r * 0.56, rot + i * 45 + 22.5));
    const facets: ReactNode[] = [];
    for (let i = 0; i < 8; i++) {
      const [sx, sy] = polarAt(0, 0, 1, rot + i * 45);
      const [gx, gy] = polarAt(0, 0, 1, rot + i * 45 + 22.5);
      facets.push(<polygon key={`s${i}`} points={ptsStr([T[(i + 7) % 8], P[i], T[i]])} fill={tone[toneOf(lit(sx, sy) + 0.12)]} />);
      facets.push(<polygon key={`g${i}`} points={ptsStr([P[i], T[i], P[(i + 1) % 8]])} fill={tone[toneOf(-lit(gx, gy) * 0.9 - 0.12)]} />);
    }
    return (
      <g>
        {metal && <circle cx={n2(x)} cy={n2(y)} r={n2(r * 1.22)} fill={metal} />}
        {metal && <circle cx={n2(x)} cy={n2(y)} r={n2(r * 1.22)} fill="none" stroke={METALS[set!][4]} strokeWidth={edge} opacity={0.6} />}
        <polygon points={ptsStr(P)} fill={tone[2]} />
        {facets}
        <polygon points={ptsStr(T)} fill={tone[1]} />
        <polygon points={ptsStr(P)} fill="none" stroke={tone[3]} strokeWidth={edge} strokeLinejoin="round" />
        {shine}
        {metal && prongs && [45, 135, 225, 315].map((a) => { const [px, py] = polarAt(x, y, r * 1.02, a); return <circle key={a} cx={n2(px)} cy={n2(py)} r={n2(Math.max(1, r * 0.17))} fill={METALS[set!][0]} stroke={METALS[set!][3]} strokeWidth={0.5} />; })}
        {spark}
      </g>
    );
  }

  // Tallas escalonadas (esmeralda, marquesa, trillón, princesa): anillos de facetas hacia la mesa
  const base = OUTLINES[cut]!(r);
  const rings = [1, 0.74, 0.48].map((k) => place(base.map(([a, b]) => [a * k, b * k] as const), x, y, rot));
  const facets: ReactNode[] = [];
  for (let j = 0; j < 2; j++) {
    const A = rings[j], B = rings[j + 1];
    for (let i = 0; i < A.length; i++) {
      const i2 = (i + 1) % A.length;
      const mx = (A[i][0] + A[i2][0]) / 2 - x, my = (A[i][1] + A[i2][1]) / 2 - y;
      const v = j === 0 ? lit(mx, my) + 0.1 : -lit(mx, my) * 0.8 - 0.1;
      facets.push(<polygon key={`${j}-${i}`} points={ptsStr([A[i], A[i2], B[i2], B[i]])} fill={tone[toneOf(v)]} />);
    }
  }
  return (
    <g>
      {metal && <polygon points={ptsStr(rings[0])} fill={metal} stroke={metal} strokeWidth={n2(Math.max(2.4, r * 0.42))} strokeLinejoin="round" />}
      {facets}
      <polygon points={ptsStr(rings[2])} fill={tone[1]} />
      <polygon points={ptsStr(rings[0])} fill="none" stroke={tone[3]} strokeWidth={edge} strokeLinejoin="round" />
      {shine}
      {spark}
    </g>
  );
}

/** Cristal en bruto: prisma hexagonal con punta (cuarzo, esquirlas). */
function Crystal({ x, y, w, h, rot, gem }: { x: number; y: number; w: number; h: number; rot: number; gem: GemName }) {
  const tone = GEMS[gem];
  const s = -h + w * 1.3, b = h * 0.55;
  const faces: [Pt[], number][] = [
    [[[-w, b], [-w, s], [0, -h], [-w * 0.3, s], [-w * 0.3, b]], -90],
    [[[-w * 0.3, b], [-w * 0.3, s], [0, -h], [w * 0.3, s], [w * 0.3, b]], 999],
    [[[w * 0.3, b], [w * 0.3, s], [0, -h], [w, s], [w, b]], 90],
  ];
  const outline = place([[-w, b], [-w, s], [0, -h], [w, s], [w, b]], x, y, rot);
  return (
    <g>
      {faces.map(([ps, n], i) => {
        const [vx, vy] = polarAt(0, 0, 1, rot + n);
        const t = n === 999 ? 1 : toneOf(lit(vx, vy) + 0.1);
        return <polygon key={i} points={ptsStr(place(ps, x, y, rot))} fill={tone[t]} />;
      })}
      <polygon points={ptsStr(outline)} fill="none" stroke={tone[3]} strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

/** Aro de metal con bisel: canto interior claro y canto exterior oscuro. */
function Band({ r, w, metal, filter }: { r: number; w: number; metal: Metal; filter?: string }) {
  const url = useUrl();
  const m = METALS[metal];
  return (
    <g filter={filter}>
      <circle cx={C} cy={C} r={r} fill="none" stroke={url(`m-${metal}`)} strokeWidth={w} />
      <circle cx={C} cy={C} r={n2(r - w / 2 + 0.7)} fill="none" stroke={m[0]} strokeWidth={1.4} opacity={0.85} />
      <circle cx={C} cy={C} r={n2(r + w / 2 - 0.7)} fill="none" stroke={m[4]} strokeWidth={1.4} />
    </g>
  );
}

/** Roca en bruto, con cara iluminada y cara en sombra. */
const ROCK_J = [1, 0.78, 0.96, 0.7, 0.92, 0.8, 1.06, 0.74];
function Rock({ deg, r, s, seed }: { deg: number; r: number; s: number; seed: number }) {
  const [x, y] = polar(r, deg);
  const shades = [['#8a847a', '#b9b2a6', '#4a4641'], ['#77716a', '#a69f94', '#3d3a36'], ['#958d80', '#c7bfb1', '#57524b']][seed % 3];
  const pts = Array.from({ length: 7 }, (_, i) => polarAt(x, y, s * ROCK_J[(i + seed) % ROCK_J.length], i * (360 / 7) + seed * 23));
  const inner = pts.map(([px, py]) => [x + (px - x) * 0.62 - s * 0.12, y + (py - y) * 0.62 - s * 0.14] as const);
  return (
    <g>
      <polygon points={ptsStr(pts)} fill={shades[2]} />
      <polygon points={ptsStr(pts.map(([px, py]) => [x + (px - x) * 0.9 - s * 0.06, y + (py - y) * 0.9 - s * 0.07] as const))} fill={shades[0]} />
      <polygon points={ptsStr(inner)} fill={shades[1]} />
    </g>
  );
}

/** Llama pequeña apuntando hacia fuera en el ángulo `deg`. */
function Flame({ deg, r, h, fill, delay = 0 }: { deg: number; r: number; h: number; fill: string; delay?: number }) {
  const [x, y] = polar(r, deg);
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${deg})`}>
      <path className="ring-flame" style={{ animationDelay: `${n2(delay)}s` }} fill={fill}
        d={`M0 ${h * 0.25} C ${-h * 0.42} 0, ${-h * 0.18} ${-h * 0.55}, 0 ${-h} C ${h * 0.18} ${-h * 0.55}, ${h * 0.42} 0, 0 ${h * 0.25} Z`} />
    </g>
  );
}

/** Hoja de laurel de jade. */
function Leaf({ deg, r, side }: { deg: number; r: number; side: 1 | -1 }) {
  const [x, y] = polar(r, deg);
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${n2(deg + 90 + side * 35)})`}>
      <ellipse rx={4.6} ry={10.5} fill="#136b3c" />
      <ellipse cx={-1.2} cy={-0.6} rx={2.6} ry={8.6} fill="#3fbf7a" />
      <ellipse cx={-1.6} cy={-3} rx={0.9} ry={4} fill="#b6f5cf" opacity={0.8} />
    </g>
  );
}

/** Rayo con núcleo blanco y filo de topacio. */
function Bolt({ deg, r }: { deg: number; r: number }) {
  const [x, y] = polar(r, deg);
  return (
    <path className="ring-bolt" fill="#fffbe0" stroke="#38d1f5" strokeWidth={1.4} strokeLinejoin="round"
      transform={`translate(${n2(x)} ${n2(y)}) rotate(${deg}) scale(0.95)`} d="M2 -14 L-6 1 L-1 1 L-3 13 L6 -3 L1 -3 Z" />
  );
}

/** Punta de flecha tallada (sílex de obsidiana o granate), con lascas en dos tonos. */
function Arrowhead({ deg, r, gem }: { deg: number; r: number; gem: GemName }) {
  const [x, y] = polar(r, deg);
  const t = GEMS[gem];
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${deg}) scale(1.15)`}>
      <path d="M0 -12 L0 3 L-8 7 Z" fill={t[1]} />
      <path d="M0 -12 L8 7 L0 3 Z" fill={t[2]} />
      <path d="M0 -12 L-2.6 -3 L0 -1 Z" fill={t[0]} />
      <path d="M-4.2 0.5 L-6.5 5.6 L-2.2 3.6 Z" fill={t[0]} opacity={0.7} />
      <path d="M0 -12 L8 7 L0 3 L-8 7 Z" fill="none" stroke={t[3]} strokeWidth={0.9} strokeLinejoin="round" />
    </g>
  );
}

function Pearl({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={n2(x)} cy={n2(y)} r={r} fill="#b9aab8" />
      <circle cx={n2(x - r * 0.12)} cy={n2(y - r * 0.12)} r={n2(r * 0.84)} fill="#f6efe8" />
      <circle cx={n2(x - r * 0.34)} cy={n2(y - r * 0.36)} r={n2(r * 0.3)} fill="#fff" />
    </g>
  );
}

function StarShape({ x, y, r, inner = 0.45, ...rest }: { x: number; y: number; r: number; inner?: number } & SVGProps<SVGPolygonElement>) {
  const pts = Array.from({ length: 10 }, (_, i) => polarAt(x, y, i % 2 ? r * inner : r, i * 36));
  return <polygon points={ptsStr(pts)} {...rest} />;
}

/* ---------- Retrato ---------- */

export function AvatarPortrait({
  tier, label, size = 96, photo, dim = false, title,
}: { tier: number; label: string; size?: number; photo?: string; dim?: boolean; title?: string }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `url(#${id}-${n})`;
  const t = Math.max(0, Math.min(9, tier));
  const epic = t >= 6;
  const glow = g('glow');
  return (
    <Ids.Provider value={id}>
      <svg className={`portrait tier-${t}${dim ? ' dim' : ''}`} viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={title ?? label}>
        <defs>
          {TIER_METALS[t].map((m) => <MetalGrad key={m} id={id} metal={m} />)}
          <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff4d2e" /><stop offset="60%" stopColor="#ffb23e" /><stop offset="100%" stopColor="#fff1a8" />
          </linearGradient>
          <linearGradient id={`${id}-prism`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5f8f" /><stop offset="20%" stopColor="#ffc56b" /><stop offset="40%" stopColor="#fffbe0" />
            <stop offset="58%" stopColor="#6fe3ff" /><stop offset="78%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#ff7ad9" />
          </linearGradient>
          <radialGradient id={`${id}-face`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--c3) 55%, #1a1a24)" /><stop offset="100%" stopColor="#0c0c14" />
          </radialGradient>
          <radialGradient id={`${id}-aura`}>
            <stop offset="55%" stopColor={t === 8 ? '#38d1f5' : '#ffe07a'} stopOpacity="0.5" />
            <stop offset="78%" stopColor={t === 8 ? '#6d5cff' : 'var(--c1)'} stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--c1)" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-clip`}><circle cx={C} cy={C} r={60} /></clipPath>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>

        {/* Fondo: aura y rayos en los avatares altos */}
        {t >= 8 && <circle className="ring-aura" cx={C} cy={C} r={99} fill={g('aura')} />}
        {t >= 9 && (
          <g className="ring-spin-slow">
            {around(24, (d, i) => {
              const [x1, y1] = polar(72, d); const [x2, y2] = polar(i % 2 ? 93 : 101, d);
              return <line key={d} x1={n2(x1)} y1={n2(y1)} x2={n2(x2)} y2={n2(y2)} stroke={i % 2 ? '#fff6c8' : '#ffd25a'} strokeWidth={i % 2 ? 2 : 3.5} strokeLinecap="round" opacity={i % 2 ? 0.55 : 0.75} />;
            })}
          </g>
        )}

        {/* 0 · Aprendiz: piedra de granito con un cuarzo en bruto */}
        {t === 0 && (
          <>
            <Band r={68} w={8} metal="stone" />
            <circle cx={C} cy={C} r={68} fill="none" stroke="#efe9df" strokeWidth={1.8} strokeDasharray="0.1 7" strokeLinecap="round" opacity={0.7} />
            <circle cx={C} cy={C} r={67} fill="none" stroke="#1f1c19" strokeWidth={1.6} strokeDasharray="0.1 9" strokeDashoffset={3} strokeLinecap="round" opacity={0.8} />
            {[34, 72, 108, 145, 180, 215, 252, 288, 326].map((d, i) => <Rock key={d} deg={d} r={i % 2 ? 70 : 68.5} s={i % 3 === 0 ? 9 : 7.2} seed={i} />)}
            <Crystal x={92} y={27} w={4} h={13} rot={-26} gem="quartz" />
            <Crystal x={108} y={27} w={3.8} h={12} rot={28} gem="quartz" />
            <Crystal x={100} y={23} w={5.2} h={18} rot={0} gem="quartz" />
            <Rock deg={0} r={69} s={8} seed={4} />
            <Sparkle x={96} y={10} s={5} />
          </>
        )}

        {/* 1 · Iniciado: hierro con filete de cobre y un ámbar que sostiene la llama */}
        {t === 1 && (
          <>
            <Band r={68} w={8} metal="iron" />
            <circle cx={C} cy={C} r={68} fill="none" stroke={g('m-copper')} strokeWidth={2.6} />
            {around(8, (d) => { if (d === 0) return null; const [x, y] = polar(68, d); return (
              <g key={d}><circle cx={n2(x)} cy={n2(y)} r={3} fill={g('m-copper')} stroke="#3f1c09" strokeWidth={0.7} /><circle cx={n2(x - 0.9)} cy={n2(y - 0.9)} r={1} fill="#ffe2c8" /></g>
            ); })}
            <Flame deg={0} r={79} h={22} fill={g('fire')} />
            <Gem x={C} y={30} r={9} cut="oval" gem="amber" set="copper" />
          </>
        )}

        {/* 2 · Disciplinado: plata con cuatro escudos engastados de zafiros */}
        {t === 2 && (
          <>
            <Band r={79} w={3.5} metal="silver" />
            <Band r={68} w={8} metal="silver" />
            {around(8, (d) => { const [x, y] = polar(79, d + 22.5); return <circle key={d} cx={n2(x)} cy={n2(y)} r={2.6} fill="#e3e8ef" stroke="#3d4552" strokeWidth={0.8} />; })}
            {around(4, (d) => { const [x, y] = polar(73, d); return (
              <g key={d}>
                <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${d})`}>
                  <path d="M-12 -12 L12 -12 L12 0 C12 8 5 13 0 16 C-5 13 -12 8 -12 0 Z" fill={g('m-silver')} stroke="#353d49" strokeWidth={1.3} strokeLinejoin="round" />
                  <path d="M-9.5 -9.5 L9.5 -9.5 L9.5 0 C9.5 6.4 4 10.4 0 12.8 C-4 10.4 -9.5 6.4 -9.5 0 Z" fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.7} />
                </g>
                <Gem x={polar(74, d)[0]} y={polar(74, d)[1]} r={7.5} gem="sapphire" rot={22.5} />
              </g>
            ); })}
          </>
        )}

        {/* 3 · Artífice: engranaje de bronce con esmeraldas */}
        {t === 3 && (
          <>
            <g className="ring-spin-slow">
              {around(24, (d) => { const [x, y] = polar(77, d); return <rect key={d} x={n2(x - 4.5)} y={n2(y - 6.5)} width={9} height={13} rx={1.6} fill={g('m-bronze')} stroke="#36210a" strokeWidth={0.9} transform={`rotate(${d} ${n2(x)} ${n2(y)})`} />; })}
            </g>
            <Band r={69} w={12} metal="bronze" />
            {around(6, (d) => { const [x, y] = polar(69, d + 30); return (
              <g key={d}><polygon points={ptsStr(Array.from({ length: 6 }, (_, i) => polarAt(x, y, 3, i * 60)))} fill="#6b4416" stroke="#36210a" strokeWidth={0.6} /><circle cx={n2(x - 0.6)} cy={n2(y - 0.6)} r={1.1} fill="#fde3b4" /></g>
            ); })}
            {around(6, (d) => { const [x, y] = polar(69, d); return <Gem key={d} x={x} y={y} r={7.5} cut="emerald" gem="emerald" rot={d} set="bronze" />; })}
          </>
        )}

        {/* 4 · Arquitecto: dial de platino de precisión con amatistas talladas en los puntos cardinales */}
        {t === 4 && (
          <>
            <circle cx={C} cy={C} r={91} fill="none" stroke="#c3cede" strokeWidth={1.8} strokeDasharray="2 6" opacity={0.75} />
            {around(60, (d, i) => {
              if (i % 15 === 0) return null;
              const five = i % 5 === 0;
              const [x1, y1] = polar(72, d); const [x2, y2] = polar(five ? 81 : 77, d);
              return <line key={d} x1={n2(x1)} y1={n2(y1)} x2={n2(x2)} y2={n2(y2)} stroke={five ? '#eef3fa' : '#8794a8'} strokeWidth={five ? 2.6 : 1.6} strokeLinecap="round" />;
            })}
            <Band r={67} w={7} metal="platinum" />
            {around(4, (d) => { const [x, y] = polar(84, d + 45); return <Gem key={d} x={x} y={y} r={3.6} gem="diamond" sparkle={false} />; })}
            {around(4, (d) => { const [x, y] = polar(80, d); return <Gem key={d} x={x} y={y} r={13} cut="marquise" gem="amethyst" rot={d} set="platinum" />; })}
          </>
        )}

        {/* 5 · Cazador de Bestias: oro con puntas de flecha de obsidiana y granate, y rubíes */}
        {t === 5 && (
          <>
            <g className="ring-spin">
              <circle cx={C} cy={C} r={84} fill="none" stroke="var(--c1)" strokeWidth={1.4} opacity={0.55} />
              {around(8, (d, i) => <Arrowhead key={d} deg={d} r={85} gem={i % 2 ? 'garnet' : 'obsidian'} />)}
            </g>
            <Band r={68} w={9} metal="gold" />
            {around(4, (d) => { const [x, y] = polar(68, d); return <Pearl key={d} x={x} y={y} r={2.8} />; })}
            {around(4, (d) => { const [x, y] = polar(68, d + 45); return <Gem key={d} x={x} y={y} r={7} gem="ruby" set="gold" prongs />; })}
          </>
        )}

        {/* 6 · Forjador: oro fundido entre llamas, con grandes rubíes y ópalos de fuego */}
        {t === 6 && (
          <>
            <g filter={glow}>
              {around(14, (d, i) => <Flame key={d} deg={d} r={70} h={i % 2 ? 19 : 28} fill={g('fire')} delay={i * 0.13} />)}
            </g>
            <Band r={68} w={9} metal="molten" filter={glow} />
            <g filter={g('blur')}>
              {around(6, (d, i) => { const [x, y] = polar(68, d); return <circle key={d} className="gem-glow" style={{ animationDelay: `${i * 0.35}s` }} cx={n2(x)} cy={n2(y)} r={13} fill={i % 2 ? '#ff8a1f' : '#ff2d6f'} />; })}
            </g>
            {around(6, (d, i) => { const [x, y] = polar(68, d); return i % 2
              ? <Gem key={d} x={x} y={y} r={9.5} cut="oval" gem="fireopal" rot={d} set="molten" />
              : <Gem key={d} x={x} y={y} r={9.5} gem="ruby" set="gold" prongs />; })}
          </>
        )}

        {/* 7 · Fundador: oro real con laurel de jade, perlas y corona engastada */}
        {t === 7 && (
          <>
            {[-1, 1].map((side) => around(12, (d, i) => (i > 0 && i < 10
              ? <Leaf key={`${side}${d}`} deg={side === 1 ? 180 - d / 2.4 : 180 + d / 2.4} r={81} side={side as 1 | -1} /> : null)))}
            <Band r={68} w={11} metal="gold" />
            {around(36, (d) => (Math.abs(((d + 180) % 360) - 180) < 22 || [90, 180, 270].some((k) => Math.abs(d - k) < 12)
              ? null : <Pearl key={d} x={polar(68, d)[0]} y={polar(68, d)[1]} r={2.5} />))}
            {[90, 270].map((d) => <Gem key={d} x={polar(68, d)[0]} y={polar(68, d)[1]} r={6} gem="sapphire" set="gold" />)}
            <Gem x={C} y={168} r={7.5} gem="ruby" set="gold" prongs />
            <polygon points="72,38 67,11 79,24 85,13 93,23 100,1 107,23 115,13 121,24 133,11 128,38" fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1.4} strokeLinejoin="round" />
            <polygon points="76,35 73,19 80,28 85,20 93,28 100,10 107,28 115,20 120,28 127,19 124,35" fill="none" stroke="#fffbe0" strokeWidth={1} strokeLinejoin="round" opacity={0.6} />
            <rect x={69} y={28} width={62} height={12} rx={2.5} fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1.3} />
            {[[67, 11], [85, 13], [100, 1], [115, 13], [133, 11]].map(([x, y]) => <Pearl key={x} x={x} y={y} r={3.4} />)}
            <Gem x={82} y={34} r={4.8} gem="ruby" sparkle={false} />
            <Gem x={118} y={34} r={4.8} gem="sapphire" sparkle={false} />
            <Gem x={C} y={34} r={6.2} cut="emerald" gem="emerald" rot={90} />
          </>
        )}

        {/* 8 · Titán: oro blanco cuajado de diamantes, topacios eléctricos y rayos */}
        {t === 8 && (
          <>
            <g className="ring-dash">
              <circle cx={C} cy={C} r={79} fill="none" stroke="#38d1f5" strokeWidth={2.6} strokeDasharray="14 10" opacity={0.85} />
            </g>
            <g filter={glow}>{around(6, (d) => <Bolt key={d} deg={d + 30} r={89} />)}</g>
            <Band r={67} w={10} metal="whitegold" filter={glow} />
            {around(18, (d, i) => (i % 6 === 0 ? null : <Gem key={d} x={polar(67, d)[0]} y={polar(67, d)[1]} r={3.9} gem="diamond" sparkle={i % 3 === 0} />))}
            <g filter={g('blur')}>
              {around(3, (d, i) => <circle key={d} className="gem-glow" style={{ animationDelay: `${i * 0.5}s` }} cx={n2(polar(70, d)[0])} cy={n2(polar(70, d)[1])} r={13} fill="#38d1f5" />)}
            </g>
            {around(3, (d) => <Gem key={d} x={polar(70, d)[0]} y={polar(70, d)[1]} r={11.5} cut="trillion" gem="topaz" rot={d} set="whitegold" />)}
          </>
        )}

        {/* 9 · Excelsior: diamantes y gemas de todos los colores, esquirlas en órbita, estrella con diamante y alas */}
        {t === 9 && (
          <>
            {[-1, 1].map((side) => (
              <g key={side} transform={`translate(${C + side * 64} ${C + 10}) scale(${side} 1)`}>
                <path d="M0 0 C 14 -16, 34 -22, 50 -14 C 38 -8, 22 -3, 0 8 Z" fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1} />
                <path d="M0 6 C 14 -4, 30 -6, 45 0 C 32 4, 18 8, 0 13 Z" fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1} />
                <path d="M0 12 C 12 8, 24 9, 36 16 C 24 17, 12 17, 0 18 Z" fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1} />
                <Gem x={46} y={-13} r={3.2} gem="diamond" sparkle={false} />
                <Gem x={41} y={0} r={2.8} gem="topaz" sparkle={false} />
              </g>
            ))}
            <g className="ring-orbit">
              {around(8, (d, i) => { const [x, y] = polar(88, d + 22.5); return <Crystal key={d} x={x} y={y} w={3.6} h={9} rot={d + 22.5} gem={(['diamond', 'amethyst', 'diamond', 'topaz', 'diamond', 'ruby', 'diamond', 'emerald'] as const)[i]} />; })}
            </g>
            <Band r={80} w={3.5} metal="gold" />
            <Band r={68} w={12} metal="gold" filter={glow} />
            <circle className="ring-spin" cx={C} cy={C} r={68} fill="none" stroke={g('prism')} strokeWidth={6} opacity={0.55} />
            {around(12, (d, i) => {
              if (i === 0) return null;
              const [x, y] = polar(68, d);
              if (i % 2 === 0) return <Gem key={d} x={x} y={y} r={i === 6 ? 8 : 6} gem="diamond" set="platinum" prongs={i === 6} />;
              const k = (i - 1) / 2;
              const gem = (['ruby', 'emerald', 'sapphire', 'amethyst', 'topaz', 'citrine'] as const)[k];
              const cut = (['brilliant', 'emerald', 'brilliant', 'marquise', 'trillion', 'brilliant'] as const)[k];
              return <Gem key={d} x={x} y={y} r={cut === 'brilliant' ? 6.4 : 8} cut={cut} gem={gem} rot={d} set="gold" />;
            })}
            <StarShape x={C} y={19} r={21} fill={g('m-gold')} stroke="#4f2f03" strokeWidth={1.4} strokeLinejoin="round" filter={glow} />
            <StarShape x={C} y={19} r={14} fill="none" stroke="#fffbe0" strokeWidth={1.1} strokeLinejoin="round" opacity={0.7} />
            <Gem x={C} y={20} r={7.5} gem="diamond" set="platinum" prongs sparkle={0.2} />
            <Sparkle x={150} y={36} s={5} delay={1.1} />
            <Sparkle x={44} y={150} s={4} delay={1.9} />
          </>
        )}

        {/* Cara: foto el día que exista; mientras, la inicial o el icono */}
        <circle cx={C} cy={C} r={60} fill={g('face')} stroke={epic ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'} strokeWidth={1.5} />
        {photo
          ? <image href={photo} x={40} y={40} width={120} height={120} clipPath={`url(#${id}-clip)`} preserveAspectRatio="xMidYMid slice" />
          : <text x={C} y={C} textAnchor="middle" dominantBaseline="central" className="portrait-label" fontSize={label.length > 1 ? 50 : 64}>{label}</text>}
      </svg>
    </Ids.Provider>
  );
}

/** Inicial del nombre para el retrato. */
export function initialOf(name: string | undefined): string {
  return (name?.trim()[0] ?? '?').toUpperCase();
}
