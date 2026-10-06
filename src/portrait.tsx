// Retrato del héroe con el aro de su avatar. Cada aro es una sola pieza esculpida (anillos biselados con un canal
// entre ellos, cresta arriba, adornos a los lados y remate abajo) y cada avatar es más épico que el anterior:
// más capas, mejor material y una silueta mayor, con pocas gemas grandes como punto focal.
// Dentro va la inicial (o el icono del avatar); el día que haya foto de perfil, irá la foto.
import { createContext, useContext, useId, type ReactNode } from 'react';
import './portrait.css';

const C = 100; // centro del lienzo 200×200

type Pt = readonly [number, number];
const n2 = (n: number) => Math.round(n * 100) / 100;
const ptsStr = (ps: readonly Pt[]) => ps.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ');
/** Punto a distancia r y ángulo deg (0 = arriba, sentido horario) desde el centro. */
const polar = (r: number, deg: number): Pt => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const around = (n: number, fn: (deg: number, i: number) => ReactNode, from = 0) =>
  Array.from({ length: n }, (_, i) => fn(from + (360 / n) * i, i));
/** Transformación para dibujar en coordenadas locales: «arriba» apunta hacia fuera en el ángulo deg. */
const at = (r: number, deg: number) => { const [x, y] = polar(r, deg); return `translate(${n2(x)} ${n2(y)}) rotate(${n2(deg)})`; };

/* ---------- Materiales ---------- */

// [brillo, claro, medio, oscuro, sombra]
const MATS = {
  wood: ['#f0d3a8', '#c08d5a', '#8c5b33', '#5a3519', '#28160a'],
  stone: ['#ece7de', '#b9b2a6', '#8a8379', '#59534b', '#26221e'],
  iron: ['#f2f4f7', '#b6bcc5', '#7d848e', '#484d55', '#1a1c20'],
  silver: ['#ffffff', '#e8edf4', '#b4bfcd', '#6f7b8d', '#2b323d'],
  bronze: ['#ffe8c2', '#e0aa66', '#ad7433', '#6c4316', '#2e1c08'],
  platinum: ['#ffffff', '#eef2f8', '#c5cedb', '#8792a6', '#363f50'],
  huntgold: ['#fff0c4', '#e8bd5f', '#b5832a', '#74500f', '#342204'],
  forged: ['#a7adb7', '#646a74', '#3d4149', '#23262c', '#0b0c0f'],
  gold: ['#fffbe2', '#ffe17c', '#f0b431', '#a6670b', '#432803'],
  ice: ['#ffffff', '#d9f4ff', '#93d2f0', '#3f86b6', '#10365a'],
  rope: ['#fbeac4', '#ddbf88', '#b08f57', '#76592c', '#3a2a10'],
  ivory: ['#fffdf4', '#f3e8cc', '#d6c497', '#9f8b5c', '#55482a'],
  pearl: ['#ffffff', '#f5f8ff', '#d8def2', '#9099bb', '#3a4262'],
} as const;
type Mat = keyof typeof MATS;

// Cabujones: [luz, medio, sombra, fondo]
const GEMS = {
  sapphire: ['#c4dcff', '#3b7bff', '#1a3fae', '#08174d'],
  emerald: ['#b4ffd8', '#1fc77a', '#0a7444', '#02311b'],
  amethyst: ['#f1d6ff', '#b46cff', '#6a23b0', '#2a0752'],
  ruby: ['#ffc2d6', '#f0226d', '#9c0838', '#43021a'],
  fireopal: ['#fff0b8', '#ff9a26', '#e04612', '#6e1704'],
  topaz: ['#e6fcff', '#4fdcff', '#0f8fc8', '#053e63'],
  star: ['#ffffff', '#eef6ff', 'color-mix(in srgb, var(--c2) 45%, #8fd3ff)', 'var(--c3)'],
  theme: ['#ffe3f6', 'var(--c1)', 'var(--c2)', 'var(--c3)'],
} as const;
type GemName = keyof typeof GEMS;

const TIER_MATS: Mat[][] = [
  ['wood', 'stone', 'rope'], ['iron'], ['silver'], ['bronze'], ['platinum'],
  ['huntgold', 'iron', 'wood', 'ivory'], ['forged'], ['gold', 'ivory'], ['ice'], ['gold', 'pearl'],
];
const TIER_GEMS: GemName[][] = [[], [], ['sapphire'], ['emerald'], ['amethyst'], ['ruby'], ['fireopal'], ['ruby'], ['topaz'], ['star', 'theme']];

const Ids = createContext('p');
const useUrl = () => { const id = useContext(Ids); return (n: string) => `url(#${id}-${n})`; };

/* ---------- Piezas ---------- */

/** Anillo biselado: canto oscuro, cuerpo con degradado de metal, brillo arriba y reflejo abajo. */
function Ring({ r, w, mat }: { r: number; w: number; mat: Mat }) {
  const url = useUrl();
  const m = MATS[mat];
  return (
    <g>
      <circle cx={C} cy={C} r={r} fill="none" stroke={m[4]} strokeWidth={w + 2} />
      <circle cx={C} cy={C} r={r} fill="none" stroke={url(`m-${mat}`)} strokeWidth={w} />
      <circle cx={C} cy={C} r={n2(r + w * 0.24)} fill="none" stroke={url('hi-top')} strokeWidth={n2(w * 0.3)} />
      <circle cx={C} cy={C} r={n2(r - w * 0.28)} fill="none" stroke={url('hi-bot')} strokeWidth={n2(w * 0.22)} />
    </g>
  );
}

/** Canal hundido entre dos anillos. */
function Channel({ r, w, fill = '#0d0e13', className, filter }: { r: number; w: number; fill?: string; className?: string; filter?: string }) {
  return <circle className={className} filter={filter} cx={C} cy={C} r={r} fill="none" stroke={fill} strokeWidth={w} />;
}

/** Pieza maciza con el degradado del material y canto oscuro. */
function Solid({ d, points, mat, sw = 1.3 }: { d?: string; points?: string; mat: Mat; sw?: number }) {
  const url = useUrl();
  const p = { fill: url(`m-${mat}`), stroke: MATS[mat][4], strokeWidth: sw, strokeLinejoin: 'round' as const };
  return d ? <path d={d} {...p} /> : <polygon points={points} {...p} />;
}

/** Cartela inferior (vacía), con marco del material y fondo hundido. */
function Plaque({ y = 175, w = 60, h = 16, mat, inset = '#101118', glow }: { y?: number; w?: number; h?: number; mat: Mat; inset?: string; glow?: string }) {
  const hex = (hw: number, hh: number) => ptsStr([[C - hw, y], [C - hw + hh, y - hh], [C + hw - hh, y - hh], [C + hw, y], [C + hw - hh, y + hh], [C - hw + hh, y + hh]]);
  return (
    <g>
      <Solid points={hex(w / 2, h / 2)} mat={mat} sw={1.5} />
      <polygon points={hex(w / 2 - 4, h / 2 - 3.2)} fill={inset} stroke={glow ?? MATS[mat][0]} strokeWidth={1} strokeOpacity={glow ? 1 : 0.55} />
    </g>
  );
}

/** Cabujón pulido en su bisel: el punto focal de cada aro. */
function Cabochon({ x, y, r, gem, mat }: { x: number; y: number; r: number; gem: GemName; mat: Mat }) {
  const url = useUrl();
  const m = MATS[mat];
  return (
    <g>
      <circle cx={x} cy={y} r={n2(r + 3)} fill={url(`m-${mat}`)} stroke={m[4]} strokeWidth={1.2} />
      <circle cx={x} cy={y} r={n2(r + 3)} fill="none" stroke={url('hi-top')} strokeWidth={1} />
      <circle cx={x} cy={y} r={r} fill={url(`g-${gem}`)} stroke={GEMS[gem][3]} strokeWidth={0.8} />
      <ellipse cx={n2(x - r * 0.32)} cy={n2(y - r * 0.4)} rx={n2(r * 0.38)} ry={n2(r * 0.2)} fill="#fff" opacity={0.85}
        transform={`rotate(-30 ${n2(x - r * 0.32)} ${n2(y - r * 0.4)})`} />
      <circle cx={n2(x + r * 0.38)} cy={n2(y + r * 0.42)} r={n2(r * 0.13)} fill="#fff" opacity={0.45} />
    </g>
  );
}

function Rivet({ x, y, r, mat }: { x: number; y: number; r: number; mat: Mat }) {
  const url = useUrl();
  return (
    <g>
      <circle cx={n2(x)} cy={n2(y)} r={r} fill={url(`m-${mat}`)} stroke={MATS[mat][4]} strokeWidth={0.8} />
      <circle cx={n2(x - r * 0.3)} cy={n2(y - r * 0.32)} r={n2(r * 0.34)} fill="#fff" opacity={0.7} />
    </g>
  );
}

/** Llama con núcleo claro; parpadea suave. */
function Flame({ x, y, h, rot = 0, delay = 0 }: { x: number; y: number; h: number; rot?: number; delay?: number }) {
  const url = useUrl();
  const shape = (k: number) => { const s = h * k; return `M0 ${n2(s * 0.22)} C ${n2(-s * 0.44)} 0, ${n2(-s * 0.2)} ${n2(-s * 0.55)}, 0 ${n2(-s)} C ${n2(s * 0.2)} ${n2(-s * 0.55)}, ${n2(s * 0.44)} 0, 0 ${n2(s * 0.22)} Z`; };
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${rot})`}>
      <g className="ring-flame" style={{ animationDelay: `${delay}s` }}>
        <path d={shape(1)} fill={url('fire')} />
        <path d={shape(0.55)} fill="#fff4c4" opacity={0.9} />
      </g>
    </g>
  );
}

/** Trenza / cuerda: cápsulas inclinadas a lo largo del canal. */
function Braid({ r, n, len, w, tilt, mat }: { r: number; n: number; len: number; w: number; tilt: number; mat: Mat }) {
  const url = useUrl();
  return (
    <g>
      {around(n, (d) => (
        <g key={d} transform={at(r, d)}>
          <rect x={n2(-len / 2)} y={n2(-w / 2)} width={len} height={w} rx={n2(w / 2)} transform={`rotate(${tilt})`}
            fill={url(`m-${mat}`)} stroke={MATS[mat][4]} strokeWidth={0.8} />
        </g>
      ))}
    </g>
  );
}

/** Filigrana: dos ondas entrelazadas dentro del canal. */
function Filigree({ r, a, k, stroke, width = 1.6 }: { r: number; a: number; k: number; stroke: string; width?: number }) {
  const wave = (phase: number) => Array.from({ length: 121 }, (_, i) => {
    const deg = i * 3;
    const [x, y] = polar(r + a * Math.sin((k * deg * Math.PI) / 180 + phase), deg);
    return `${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`;
  }).join('') + 'Z';
  return <g fill="none" stroke={stroke} strokeWidth={width}><path d={wave(0)} /><path d={wave(Math.PI)} /></g>;
}

/** Punta de rosa de los vientos: dos caras, una a la luz y otra en sombra. */
function CompassPoint({ deg, r, len, w, mat }: { deg: number; r: number; len: number; w: number; mat: Mat }) {
  const m = MATS[mat];
  const lit = deg > 180 || deg === 0;
  return (
    <g transform={at(r, deg)}>
      <polygon points={`0,${-len} ${-w},0 0,${w * 0.7}`} fill={lit ? m[1] : m[2]} />
      <polygon points={`0,${-len} ${w},0 0,${w * 0.7}`} fill={lit ? m[3] : m[3]} />
      <polygon points={`0,${-len} ${-w},0 0,${w * 0.7} ${w},0`} fill="none" stroke={m[4]} strokeWidth={1.1} strokeLinejoin="round" />
    </g>
  );
}

/** Esquirla de cristal facetada (hielo), en coordenadas locales que apuntan hacia «arriba». */
function Shard({ x, y, h, w, rot, mat = 'ice' }: { x: number; y: number; h: number; w: number; rot: number; mat?: Mat }) {
  const m = MATS[mat];
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) rotate(${rot})`}>
      <polygon points={`${-w / 2},0 ${n2(-w * 0.42)},${n2(-h * 0.62)} 0,${-h} 0,0`} fill={m[1]} />
      <polygon points={`0,0 0,${-h} ${n2(w * 0.42)},${n2(-h * 0.58)} ${w / 2},0`} fill={m[3]} />
      <polygon points={`${n2(-w * 0.16)},0 0,${n2(-h * 0.92)} ${n2(w * 0.14)},0`} fill={m[0]} opacity={0.75} />
      <polygon points={`${-w / 2},0 ${n2(-w * 0.42)},${n2(-h * 0.62)} 0,${-h} ${n2(w * 0.42)},${n2(-h * 0.58)} ${w / 2},0`}
        fill="none" stroke={m[4]} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/** Rayo con núcleo blanco y filo eléctrico. */
function Bolt({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <path fill="#fffbe6" stroke="#3fd4ff" strokeWidth={1.6} strokeLinejoin="round"
      transform={`translate(${n2(x)} ${n2(y)}) rotate(${rot}) scale(${s})`} d="M3 -16 L-7 1 L-1 1 L-4 15 L8 -4 L2 -4 L6 -16 Z" />
  );
}

/** Hoja de laurel esmaltada. */
function Leaf({ deg, r, side }: { deg: number; r: number; side: 1 | -1 }) {
  return (
    <g transform={`${at(r, deg)} rotate(${90 + side * 35})`}>
      <path d="M0 -11.5 C 7 -5, 7 5, 0 11.5 C -7 5, -7 -5, 0 -11.5 Z" fill="#14683b" stroke="#062a16" strokeWidth={0.9} />
      <path d="M0 -10.5 C -5.6 -4, -5.6 4, 0 10.5 Z" fill="#3cbf78" />
      <path d="M0 -10 L0 10" stroke="#ffe17c" strokeWidth={0.9} opacity={0.8} />
    </g>
  );
}

/** Ala (local: crece hacia +x y hacia arriba): plumas remeras de marfil y coberteras de oro. */
function Wing() {
  const url = useUrl();
  return (
    <g strokeLinejoin="round">
      <path d="M0 -4 C 10 -28, 28 -48, 50 -58 Q 45 -47, 55 -41 Q 46 -33, 58 -25 Q 48 -18, 55 -8 Q 44 -4, 47 7 Q 36 5, 34 16 Q 18 12, 0 10 Z"
        fill={url('m-pearl')} stroke={MATS.gold[3]} strokeWidth={1.4} />
      <path d="M14 -6 L50 -58 M16 -2 L55 -41 M17 2 L58 -25 M16 5 L55 -8 M12 8 L47 7" fill="none" stroke={MATS.gold[3]} strokeWidth={1} opacity={0.55} />
      <path d="M0 -3 C 7 -18, 18 -30, 32 -37 Q 28 -27, 36 -22 Q 28 -15, 34 -8 Q 25 -4, 27 4 Q 14 6, 0 8 Z"
        fill={url('m-gold')} stroke={MATS.gold[4]} strokeWidth={1.2} />
      <path d="M3 -4 C 9 -16, 18 -26, 29 -33" fill="none" stroke="#fffbe2" strokeWidth={1.2} opacity={0.8} />
    </g>
  );
}

function Star8({ x, y, r, inner }: { x: number; y: number; r: number; inner: number }) {
  return ptsStr(Array.from({ length: 16 }, (_, i) => {
    const a = ((i * 22.5 - 90) * Math.PI) / 180, k = i % 2 ? inner : i % 4 ? r * 0.72 : r;
    return [x + k * Math.cos(a), y + k * Math.sin(a)] as const;
  }));
}

/** Engranaje: dientes trapezoidales con un hueco central (para no tapar la cara). */
function gearPath(n: number, rIn: number, rBase: number, rTip: number) {
  const step = 360 / n;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const c = i * step;
    pts.push(polar(rBase, c - step / 2), polar(rBase, c - step * 0.3), polar(rTip, c - step * 0.19), polar(rTip, c + step * 0.19), polar(rBase, c + step * 0.3));
  }
  return `M${pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L')}Z M${C - rIn} ${C} a${rIn} ${rIn} 0 1 0 ${rIn * 2} 0 a${rIn} ${rIn} 0 1 0 ${-rIn * 2} 0Z`;
}

/* ---------- Retrato ---------- */

export function AvatarPortrait({
  tier, label, size = 96, photo, dim = false, title,
}: { tier: number; label: string; size?: number; photo?: string; dim?: boolean; title?: string }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `url(#${id}-${n})`;
  const t = Math.max(0, Math.min(9, tier));
  const shadow = g('shadow');
  const glow = g('glow');

  /* Detrás de la cara: aura, halo de rayos, alas y flechas */
  const back = (
    <>
      {t >= 8 && <circle className="frame-pulse" cx={C} cy={C} r={104} fill={g('aura')} />}
      {t === 9 && (
        <g className="ring-spin-slow" opacity={0.8}>
          {around(16, (d, i) => (
            <polygon key={d} transform={at(80, d)} points={`-2.8,0 0,${i % 2 ? -14 : -25} 2.8,0`} fill={i % 2 ? '#fff3c4' : '#ffcf4a'} />
          ), 11.25)}
        </g>
      )}
      {t === 9 && (
        <g filter={shadow}>
          {[1, -1].map((side) => (
            <g key={side} transform={side === 1 ? 'translate(158 98) rotate(-6) scale(1.18)' : 'translate(42 98) scale(-1 1) rotate(-6) scale(1.18)'}>
              <Wing />
            </g>
          ))}
        </g>
      )}
      {t === 5 && (
        <g filter={shadow}>
          {[1, -1].map((side) => (
            <g key={side} transform={side === 1 ? '' : 'translate(200 0) scale(-1 1)'}>
              <line x1={32} y1={168} x2={166} y2={34} stroke={MATS.wood[4]} strokeWidth={5.6} strokeLinecap="round" />
              <line x1={32} y1={168} x2={166} y2={34} stroke={g('m-wood')} strokeWidth={3.6} strokeLinecap="round" />
              <g transform="translate(166 34) rotate(45) scale(1.35)">
                <Solid points="0,-17 7,-1 2.2,-2.5 0,2 -2.2,-2.5 -7,-1" mat="iron" sw={1.1} />
              </g>
              <g transform="translate(34 166) rotate(45) scale(1.25)">
                <path d="M0 -12 L-7 -2 L-7 9 L0 2 Z" fill="#c8323c" stroke="#4a0c12" strokeWidth={0.9} />
                <path d="M0 -12 L7 -2 L7 9 L0 2 Z" fill="#8f1d27" stroke="#4a0c12" strokeWidth={0.9} />
              </g>
            </g>
          ))}
        </g>
      )}
    </>
  );

  /* El aro, una sola pieza con sombra */
  let frame: ReactNode = null;
  switch (t) {
    case 0: // Aprendiz: aro de madera atado con cuerda y una clave de piedra
      frame = (
        <>
          <Ring r={68.5} w={11} mat="wood" />
          <g fill="none" stroke="#4a2a12" strokeWidth={1} opacity={0.55} strokeLinecap="round">
            <circle cx={C} cy={C} r={66} strokeDasharray="40 14 22 30" />
            <circle cx={C} cy={C} r={69} strokeDasharray="18 26 50 10" strokeDashoffset={20} />
            <circle cx={C} cy={C} r={71.5} strokeDasharray="60 20 15 25" strokeDashoffset={45} />
          </g>
          {[90, 270, 180].map((d) => (
            <g key={d} transform={at(68.5, d)}>
              {[-5.2, -1.6, 2].map((x) => <rect key={x} x={x} y={-8.5} width={3.2} height={17} rx={1.4} fill={g('m-rope')} stroke={MATS.rope[4]} strokeWidth={0.7} />)}
            </g>
          ))}
          <g transform={at(68.5, 0)}><Solid points="-9,-10 9,-10 6.5,9 -6.5,9" mat="stone" sw={1.4} /><polygon points="-6.5,-7.5 6.5,-7.5 5,-4.5 -5,-4.5" fill="#fff" opacity={0.35} /></g>
        </>
      );
      break;
    case 1: // Iniciado: doble aro de hierro con un candil y su llama
      frame = (
        <>
          <Channel r={68.6} w={4} />
          <Ring r={64.6} w={4.6} mat="iron" />
          <Ring r={73.4} w={7} mat="iron" />
          {around(4, (d) => { const [x, y] = polar(73.4, d); return <Rivet key={d} x={x} y={y} r={2.6} mat="iron" />; }, 45)}
          <Flame x={C} y={13} h={27} />
          <Solid d="M86 12 L114 12 C 112 20, 106 24, 100 24 C 94 24, 88 20, 86 12 Z" mat="iron" />
          <Solid points="96,23 104,23 106,29 94,29" mat="iron" sw={1.1} />
          <g transform={at(73.4, 180)}><Solid points="0,9 -6,0 0,-5 6,0" mat="iron" /></g>
        </>
      );
      break;
    case 2: // Disciplinado: plata con escudo de zafiro en la cresta
      frame = (
        <>
          <Channel r={69.4} w={5} fill="#0c1220" />
          <Ring r={64.6} w={4.6} mat="silver" />
          <Ring r={75} w={7.4} mat="silver" />
          {[90, 270].map((d) => <g key={d} transform={at(80, d)}><Solid points="0,-9 6,0 0,5 -6,0" mat="silver" /></g>)}
          <g transform={at(79, 180)}><Solid points="0,10 -7,0 0,-5 7,0" mat="silver" /></g>
          <Solid d="M81 0 L119 0 L119 16 C119 28 109 35 100 41 C91 35 81 28 81 16 Z" mat="silver" sw={1.5} />
          <path d="M85 4 L115 4 L115 16 C115 26 107 32 100 36.5 C93 32 85 26 85 16 Z" fill="none" stroke="#ffffff" strokeWidth={1.1} opacity={0.75} />
          <Cabochon x={C} y={17} r={7.5} gem="sapphire" mat="silver" />
        </>
      );
      break;
    case 3: // Artífice: engranaje de bronce con una esmeralda engastada
      frame = (
        <>
          <path d={gearPath(16, 66, 76.5, 85)} fill={g('m-bronze')} stroke={MATS.bronze[4]} strokeWidth={1.4} strokeLinejoin="round" fillRule="evenodd" />
          <circle cx={C} cy={C} r={76.5} fill="none" stroke={g('hi-top')} strokeWidth={1.4} />
          <Channel r={71} w={3.6} />
          {around(8, (d) => { const [x, y] = polar(71, d); return <Rivet key={d} x={x} y={y} r={2} mat="bronze" />; }, 22.5)}
          <Ring r={64.6} w={5} mat="bronze" />
          <g transform={at(72, 0)}><Solid points={ptsStr(Array.from({ length: 6 }, (_, i) => { const a = (i * 60 * Math.PI) / 180; return [12 * Math.sin(a), -12 * Math.cos(a)] as const; }))} mat="bronze" sw={1.4} /></g>
          <Cabochon x={C} y={28} r={7} gem="emerald" mat="bronze" />
        </>
      );
      break;
    case 4: // Arquitecto: brújula de platino con filigrana y una amatista al norte
      frame = (
        <>
          {[45, 135, 225, 315].map((d) => <CompassPoint key={d} deg={d} r={79} len={13} w={5} mat="platinum" />)}
          {[0, 90, 270].map((d) => <CompassPoint key={d} deg={d} r={79} len={d === 0 ? 30 : 20} w={d === 0 ? 9 : 7.5} mat="platinum" />)}
          <Channel r={72.2} w={10} fill="color-mix(in srgb, var(--c3) 22%, #0b0c14)" />
          <Filigree r={72.2} a={3.4} k={8} stroke="#dfe6f0" />
          <Ring r={64.6} w={4.6} mat="platinum" />
          <Ring r={79.6} w={4.6} mat="platinum" />
          <Plaque mat="platinum" w={54} y={178} />
          <Cabochon x={C} y={28} r={6.5} gem="amethyst" mat="platinum" />
        </>
      );
      break;
    case 5: // Cazador de Bestias: oro antiguo con empuñadura de cuero, flechas cruzadas, colmillos y rubí
      frame = (
        <>
          <Channel r={70.6} w={7} fill="#2a1608" />
          <Braid r={70.6} n={40} len={7.6} w={3.6} tilt={62} mat="wood" />
          <Ring r={64.6} w={4.6} mat="huntgold" />
          <Ring r={77} w={5.6} mat="huntgold" />
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(${C + s * 30} 175) scale(${s} 1)`}>
              <path d="M0 -2 C 6 6, 7 16, 2 26 C 0 17, -3 8, -6 2 Z" fill={g('m-ivory')} stroke={MATS.ivory[4]} strokeWidth={1} strokeLinejoin="round" />
            </g>
          ))}
          <Plaque mat="huntgold" w={58} y={176} inset="#1c1006" />
          <Solid d="M84 30 L100 8 L116 30 L100 38 Z" mat="huntgold" sw={1.4} />
          <Cabochon x={C} y={25} r={7.5} gem="ruby" mat="huntgold" />
        </>
      );
      break;
    case 6: // Forjador: acero ennegrecido con canal de metal fundido, llamas y ópalo de fuego
      frame = (
        <>
          <g filter={glow}>
            {[-34, -17, 0, 17, 34].map((a, i) => (
              <Flame key={a} x={C + a * 0.4} y={20} h={[26, 36, 50, 36, 26][i]} rot={a * 1.1} delay={i * 0.17} />
            ))}
            {[90, 270].map((d, i) => { const [x, y] = polar(80, d); return <Flame key={d} x={x} y={y} h={24} rot={d} delay={0.3 + i * 0.2} />; })}
          </g>
          <Channel r={70.6} w={7} fill="#ff6a12" className="frame-pulse" filter={glow} />
          <Channel r={70.6} w={2.2} fill="#ffe28a" />
          <Ring r={64.4} w={5} mat="forged" />
          <Ring r={77.4} w={7.4} mat="forged" />
          {[35, 145, 215, 325].map((d) => (
            <g key={d} transform={at(77.4, d)}><polyline points="-1,4 1.5,1 -1.2,-1.5 1,-4.5" fill="none" stroke="#ff9a2e" strokeWidth={1.4} strokeLinecap="round" /></g>
          ))}
          <Plaque mat="forged" w={62} y={178} inset="#1a0b05" glow="#ff8a2a" />
          <Solid d="M87 18 L113 18 L118 30 L100 40 L82 30 Z" mat="forged" sw={1.4} />
          <Cabochon x={C} y={27} r={8} gem="fireopal" mat="forged" />
        </>
      );
      break;
    case 7: // Fundador: oro real trenzado, laurel esmaltado y corona con rubí
      frame = (
        <>
          {[-1, 1].map((side) => around(11, (d, i) => (i > 0
            ? <Leaf key={`${side}${d}`} deg={side === 1 ? 180 - d / 2.6 : 180 + d / 2.6} r={i % 2 ? 86 : 89} side={side as 1 | -1} /> : null)))}
          <Channel r={71.4} w={8} fill="#2a1a03" />
          <Braid r={71.4} n={60} len={10} w={4.6} tilt={56} mat="gold" />
          <Ring r={64.6} w={5} mat="gold" />
          <Ring r={78.8} w={5.6} mat="gold" />
          <Plaque mat="gold" w={64} y={179} inset="#1a1203" />
          <Solid points="74,32 66,-2 85,14 100,-10 115,14 134,-2 126,32" mat="gold" sw={1.5} />
          <polygon points="78,28 72,8 86,19 100,0 114,19 128,8 122,28" fill="none" stroke="#fffbe2" strokeWidth={1} opacity={0.6} strokeLinejoin="round" />
          <Solid d="M71 25 H129 V37 H71 Z" mat="gold" sw={1.4} />
          {[[66, -2], [100, -10], [134, -2]].map(([x, y]) => <Rivet key={x} x={x} y={y} r={4} mat="ivory" />)}
          <Cabochon x={C} y={20} r={8} gem="ruby" mat="gold" />
        </>
      );
      break;
    case 8: // Titán: acero de hielo, canal eléctrico, corona de cristales y rayos
      frame = (
        <>
          <g filter={glow}>
            {[90, 270].map((d) => { const [x, y] = polar(92, d); return <Bolt key={d} x={x} y={y} rot={d} s={1.45} />; })}
          </g>
          {[[-34, 22, 10], [34, 22, 10], [-56, 16, 9], [56, 16, 9]].map(([d, h, w]) => { const [x, y] = polar(76, d); return <Shard key={d} x={x} y={y} h={h} w={w} rot={d} />; })}
          {[[-15, 34, 12, -16], [15, 34, 12, 16], [0, 50, 15, 0]].map(([dx, h, w, rot]) => <Shard key={dx} x={C + dx} y={26} h={h} w={w} rot={rot} />)}
          {[[-13, 12], [0, 20], [13, 12]].map(([dx, h]) => <Shard key={dx} x={C + dx} y={182} h={h} w={9} rot={180} />)}
          <Channel r={71} w={6} fill="#2fb6ec" className="frame-pulse" filter={glow} />
          <Channel r={71} w={2} fill="#eafcff" />
          <Ring r={64.6} w={5} mat="ice" />
          <Ring r={78} w={7} mat="ice" />
          <Plaque mat="ice" w={62} y={178} inset="#081a2c" glow="#5fe0ff" />
          <Cabochon x={C} y={29} r={7.5} gem="topaz" mat="ice" />
        </>
      );
      break;
    case 9: // Excelsior: oro celestial con esmalte del tema, estrella de ocho puntas y diamante estelar
      frame = (
        <>
          <Channel r={71.6} w={9} fill={g('enamel')} />
          <Filigree r={71.6} a={3} k={10} stroke="#ffe17c" width={1.3} />
          <Ring r={64.6} w={5} mat="gold" />
          <Ring r={80} w={6.4} mat="gold" />
          {[90, 270].map((d) => { const [x, y] = polar(80, d); return <Cabochon key={d} x={x} y={y} r={5.5} gem="theme" mat="gold" />; })}
          <Plaque mat="gold" w={68} y={180} inset="color-mix(in srgb, var(--c3) 35%, #0b0a14)" />
          <polygon points={Star8({ x: C, y: 16, r: 31, inner: 10 })} fill={g('m-gold')} stroke={MATS.gold[4]} strokeWidth={1.5} strokeLinejoin="round" />
          <polygon points={Star8({ x: C, y: 16, r: 22, inner: 8 })} fill="none" stroke="#fffbe2" strokeWidth={1} opacity={0.7} strokeLinejoin="round" />
          <Cabochon x={C} y={16} r={9.5} gem="star" mat="gold" />
        </>
      );
      break;
  }

  return (
    <Ids.Provider value={id}>
      <svg className={`portrait tier-${t}${dim ? ' dim' : ''}`} viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={title ?? label}>
        <defs>
          {TIER_MATS[t].map((name) => {
            const m = MATS[name];
            return (
              <linearGradient key={name} id={`${id}-m-${name}`} x1="0" y1="0" x2="0.25" y2="1">
                <stop offset="0%" stopColor={m[0]} /><stop offset="22%" stopColor={m[1]} /><stop offset="52%" stopColor={m[2]} />
                <stop offset="82%" stopColor={m[3]} /><stop offset="100%" stopColor={m[2]} />
              </linearGradient>
            );
          })}
          {TIER_GEMS[t].map((name) => {
            const c = GEMS[name];
            return (
              <radialGradient key={name} id={`${id}-g-${name}`} cx="38%" cy="32%" r="75%">
                <stop offset="0%" stopColor={c[0]} /><stop offset="35%" stopColor={c[1]} /><stop offset="78%" stopColor={c[2]} /><stop offset="100%" stopColor={c[3]} />
              </radialGradient>
            );
          })}
          <linearGradient id={`${id}-hi-top`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.85" /><stop offset="45%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-hi-bot`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="55%" stopColor="#fff" stopOpacity="0" /><stop offset="100%" stopColor="#fff" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff3d1f" /><stop offset="55%" stopColor="#ffa22e" /><stop offset="100%" stopColor="#fff1a8" />
          </linearGradient>
          <linearGradient id={`${id}-enamel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--c1) 70%, #1a0b24)" /><stop offset="50%" stopColor="color-mix(in srgb, var(--c2) 60%, #120a20)" /><stop offset="100%" stopColor="color-mix(in srgb, var(--c3) 70%, #0b0716)" />
          </linearGradient>
          <radialGradient id={`${id}-aura`}>
            <stop offset="55%" stopColor={t === 8 ? '#3fd4ff' : '#ffe17c'} stopOpacity="0.45" />
            <stop offset="78%" stopColor={t === 8 ? '#5b6cff' : 'var(--c1)'} stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--c1)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-face`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--c3) 55%, #1a1a24)" /><stop offset="100%" stopColor="#0c0c14" />
          </radialGradient>
          <clipPath id={`${id}-clip`}><circle cx={C} cy={C} r={60} /></clipPath>
          <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2.4" floodColor="#000" floodOpacity="0.75" />
          </filter>
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {back}

        {/* Cara: foto el día que exista; mientras, la inicial o el icono */}
        <circle cx={C} cy={C} r={60} fill={g('face')} />
        {photo
          ? <image href={photo} x={40} y={40} width={120} height={120} clipPath={`url(#${id}-clip)`} preserveAspectRatio="xMidYMid slice" />
          : <text x={C} y={C} textAnchor="middle" dominantBaseline="central" className="portrait-label" fontSize={label.length > 1 ? 50 : 64}>{label}</text>}

        <g filter={shadow}>{frame}</g>
      </svg>
    </Ids.Provider>
  );
}

/** Inicial del nombre para el retrato. */
export function initialOf(name: string | undefined): string {
  return (name?.trim()[0] ?? '?').toUpperCase();
}
