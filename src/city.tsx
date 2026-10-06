// Escena de la ciudad medieval de un reino, dibujada en SVG: cada misión es un edificio
// (cimientos con andamios si está pendiente) y las murallas aparecen según la etapa.
// Dos perspectivas: frontal (silueta nocturna) y desde arriba (isométrica, al estilo de los juegos de estrategia).
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { Quest, QuestType } from './types';
import { useWidth } from './charts';
import { BUILDINGS } from './kingdoms';
import './city.css';

type Hover = ({ q: Quest } | { castle: true }) & { x: number; y: number } | null;
type SetHover = (h: Hover) => void;

/** Generador pseudoaleatorio con semilla fija: la decoración no cambia entre renders. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ---------- Perspectiva elegida (compartida por todas las ciudades y recordada) ----------

type CityView = 'front' | 'top';
const VIEW_KEY = 'excelsior:city-view';
const VIEW_EVENT = 'excelsior:city-view';

function loadView(): CityView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'top' ? 'top' : 'front';
  } catch {
    return 'front';
  }
}

function useCityView() {
  const [view, setView] = useState<CityView>(loadView);
  useEffect(() => {
    const on = (e: Event) => setView((e as CustomEvent<CityView>).detail);
    window.addEventListener(VIEW_EVENT, on);
    return () => window.removeEventListener(VIEW_EVENT, on);
  }, []);
  function choose(v: CityView) {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignorado */
    }
    window.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: v }));
  }
  return [view, choose] as const;
}

/** Aviso de reino sin construcciones (en dos líneas si la escena es estrecha). */
function EmptyText({ x, y, W }: { x: number; y: number; W: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="city-empty-text">
      {W < 480 ? (
        <>
          <tspan x={x}>Tierras baldías:</tspan>
          <tspan x={x} dy="1.3em">planea tu primera construcción.</tspan>
        </>
      ) : 'Tierras baldías: planea tu primera construcción.'}
    </text>
  );
}

// =====================================================================
// El castillo del reino: mejora con cada construcción levantada
// =====================================================================

const CASTLE_MAX = 12;
/** Nombre de cada nivel del castillo: lo que añade la mejora (el 0 es el solar con el campamento). */
const CASTLE_LEVELS = [
  'Solar del castillo', 'Fortín de madera', 'Zócalo de piedra', 'Torre del homenaje', 'Torre de vigía', 'Almenas',
  'Estandartes', 'Torres gemelas', 'Puerta y puente levadizo', 'Ventanas encendidas', 'Tejados dorados y corona',
  'Agujas reales', 'Castillo glorioso',
];

/**
 * Nivel del castillo (0–12). Con hasta 12 construcciones planeadas cada una sube al menos un nivel
 * (3 de 3 ya es el castillo glorioso); con más, sube en proporción a lo construido.
 * Terminar el reino siempre lo deja en el nivel máximo.
 */
function castleTier(built: number, total: number): number {
  if (total <= 0 || built <= 0) return 0;
  if (built >= total) return CASTLE_MAX;
  return Math.min(CASTLE_MAX - 1, Math.max(1, Math.ceil((built * CASTLE_MAX) / total)));
}

/** Descripción para el pie y la ayuda: nivel actual y cuánto falta para la próxima mejora. */
function castleInfo(built: number, total: number) {
  const tier = castleTier(built, total);
  const label = `Castillo: nivel ${tier} de ${CASTLE_MAX}`;
  let next = '¡Castillo en todo su esplendor!';
  if (tier < CASTLE_MAX) {
    let d = 1;
    while (built + d < total && castleTier(built + d, total) === tier) d++;
    const name = CASTLE_LEVELS[castleTier(built + d, total)].toLowerCase();
    next = tier === 0
      ? `Levanta tu primera construcción para fundar el castillo (${name}).`
      : `Próxima mejora (${name}) ${d === 1 ? 'con la siguiente construcción' : `dentro de ${d} construcciones`}.`;
  }
  return { tier, label, name: CASTLE_LEVELS[tier], next };
}

type PartFn = (from: number, node: ReactNode, to?: number) => ReactNode;

/**
 * Cada pieza del castillo aparece en un nivel (y puede desaparecer al ser sustituida).
 * Las piezas recién ganadas saltan con un «pop»; las del nivel siguiente se esbozan en discontinua.
 */
function makePart(tier: number, prev: number): PartFn {
  return (from, node, to = CASTLE_MAX) => {
    if (tier >= from && tier <= to) return <g className={from > prev ? 'cp cp-new' : 'cp'}>{node}</g>;
    if (from === tier + 1) return <g className="cp c-ghost">{node}</g>;
    return null;
  };
}

/** Corona dorada (la base en 0,0). */
function Crown({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})`} className="c-crown">
      <path d="M-7,0 L-8,-9 L-3.6,-4.5 L0,-11 L3.6,-4.5 L8,-9 L7,0 Z" />
      <rect x={-7} y={-2.2} width={14} height={2.6} className="c-crown-band" />
      <circle cx={0} cy={-11.6} r={1.5} className="c-gem" />
      <circle cx={-8} cy={-9.4} r={1.1} className="c-gem" />
      <circle cx={8} cy={-9.4} r={1.1} className="c-gem" />
    </g>
  );
}

/** Destello de cuatro puntas (castillo glorioso). */
function Sparkle({ x, y, r, d }: { x: number; y: number; r: number; d: number }) {
  return (
    <path
      className="c-spark" style={{ animationDelay: `${d}s` }}
      d={`M${x},${y - r} Q${x + r * 0.18},${y - r * 0.18} ${x + r},${y} Q${x + r * 0.18},${y + r * 0.18} ${x},${y + r} Q${x - r * 0.18},${y + r * 0.18} ${x - r},${y} Q${x - r * 0.18},${y - r * 0.18} ${x},${y - r} Z`}
    />
  );
}

/** Celebración de la mejora: anillo, rayos dorados y «¡Nivel N!» flotando. */
function CastleBurst({ x, y, tier, s }: { x: number; y: number; tier: number; s: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})`} className="castle-burst" aria-hidden="true">
      <circle r={40} className="burst-ring" />
      <g className="burst-rays">
        {Array.from({ length: 14 }, (_, k) => {
          const a = (k * Math.PI * 2) / 14;
          return <line key={k} x1={Math.cos(a) * 18} y1={Math.sin(a) * 18} x2={Math.cos(a) * (k % 2 ? 40 : 52)} y2={Math.sin(a) * (k % 2 ? 40 : 52)} />;
        })}
      </g>
      <text y={-58} textAnchor="middle" className="burst-text">¡Nivel {tier}!</text>
    </g>
  );
}

/** Ladrillos de un muro rectangular (para dar textura a la piedra). */
function bricks(x0: number, x1: number, y0: number, y1: number, step = 12) {
  let d = '';
  let row = 0;
  for (let y = y1 - step; y > y0 + 2; y -= step, row++) {
    d += `M${x0},${y} H${x1} `;
    const off = row % 2 ? step * 0.9 : step * 0.35;
    for (let x = x0 + off; x < x1 - 2; x += step * 1.4) d += `M${x.toFixed(1)},${y} V${y + step} `;
  }
  return d;
}

/** Castillo visto de frente: la base sobre el suelo en (0,0). */
function FrontCastle({ tier, prev, glow }: { tier: number; prev: number; glow: string }) {
  const part = makePart(tier, prev);
  const B = -8; // cima de la mota
  const win = tier >= 9 ? 'c-win lit' : 'c-win';
  const roof = tier >= 10 ? 'c-roof gold' : 'c-roof';
  const ledge = tier >= 10 ? 'c-ledge gold' : 'c-ledge';
  const sp = tier >= 11;
  const keepPeak = sp ? B - 130 : B - 104;
  const towerPeak = sp ? B - 126 : B - 118;
  const crowned = tier >= 10;
  const flagBase = crowned ? keepPeak - 11 : keepPeak;

  const pennant = (x: number, y: number, len = 16) => (
    <>
      <line x1={x} y1={y} x2={x} y2={y - len} className="pole" />
      <path d={`M${x},${y - len} L${x + 13},${y - len + 4} L${x},${y - len + 8} Z`} className="banner" />
    </>
  );
  const tower = (cx: number) => (
    <>
      <rect x={cx - 10} y={B - 90} width={20} height={90} className="c-stone" />
      <rect x={cx + 4} y={B - 90} width={6} height={90} className="c-shade" />
      <path d={bricks(cx - 10, cx + 10, B - 90, B, 11)} className="c-brick" />
      <rect x={cx - 2} y={B - 74} width={4} height={9} rx={2} className={win} />
      <rect x={cx - 2} y={B - 48} width={4} height={9} rx={2} className={win} />
      {sp
        ? <path d={`M${cx - 11},${B - 90} L${cx},${towerPeak} L${cx + 11},${B - 90} Z`} className={roof} />
        : <path d={`M${cx - 13},${B - 90} L${cx},${towerPeak} L${cx + 13},${B - 90} Z`} className={roof} />}
      <path d={`M${cx},${towerPeak} L${cx + (sp ? 11 : 13)},${B - 90} L${cx},${B - 90} Z`} className="c-roof-shade" />
      {part(5, (
        <>
          <rect x={cx - 12} y={B - 94} width={24} height={5} className={ledge} />
          <path d={`M${cx - 10},${B - 89} v3 M${cx - 4},${B - 89} v3 M${cx + 2},${B - 89} v3 M${cx + 8},${B - 89} v3`} className="c-corbel" />
        </>
      ))}
      {part(6, pennant(cx, towerPeak), 11)}
      {part(12, pennant(cx, towerPeak, 20))}
    </>
  );

  return (
    <g className="castle">
      {part(9, <ellipse cx={0} cy={2} rx={78} ry={10} fill={`url(#${glow})`} className="light-pool" />)}
      {part(8, (
        <>
          <path d="M-84,2 Q0,10 84,2 L84,7 Q0,16 -84,7 Z" className="c-moat" />
          <path d="M-60,6 Q-30,9 -10,8 M14,9 Q40,9 62,6" className="c-glint" />
        </>
      ))}
      {part(1, <path d={`M-78,1 C-64,0 -58,${B} -44,${B} L44,${B} C58,${B} 64,0 78,1 Z`} className="c-mound" />)}
      {part(1, (
        <path
          className="c-fence"
          d={[-46, -41, -36, -31, -26, 26, 31, 36, 41, 46].map((x) => `M${x - 2},${B} V${B - 10} L${x},${B - 13} L${x + 2},${B - 10} V${B} Z`).join(' ')}
        />
      ), 7)}

      {/* Torre del homenaje: madera → zócalo de piedra → piedra con dos pisos */}
      {part(1, (
        <>
          <rect x={-15} y={B - 40} width={30} height={40} className="c-wood" />
          <rect x={5} y={B - 40} width={10} height={40} className="c-shade" />
          <path d={`M-15,${B - 30} H15 M-15,${B - 20} H15 M-15,${B - 10} H15`} className="c-plank" />
          <path d={`M-20,${B - 40} L0,${B - 62} L20,${B - 40} Z`} className="c-roof" />
          <path d={`M0,${B - 62} L20,${B - 40} L0,${B - 40} Z`} className="c-roof-shade" />
          <rect x={-4} y={B - 34} width={8} height={7} className={win} />
          <path d={`M-5,${B} V${B - 9} A5,5 0 0 1 5,${B - 9} V${B} Z`} className="c-door" />
        </>
      ), 1)}
      {part(2, (
        <>
          <rect x={-20} y={B - 24} width={40} height={24} className="c-stone" />
          <rect x={8} y={B - 24} width={12} height={24} className="c-shade" />
          <path d={bricks(-20, 20, B - 24, B, 8)} className="c-brick" />
          <rect x={-16} y={B - 52} width={32} height={28} className="c-wood" />
          <rect x={5} y={B - 52} width={11} height={28} className="c-shade" />
          <path d={`M-16,${B - 43} H16 M-16,${B - 34} H16`} className="c-plank" />
          <path d={`M-21,${B - 52} L0,${B - 76} L21,${B - 52} Z`} className="c-roof" />
          <path d={`M0,${B - 76} L21,${B - 52} L0,${B - 52} Z`} className="c-roof-shade" />
          <rect x={-4} y={B - 46} width={8} height={7} className={win} />
          <path d={`M-6,${B} V${B - 10} A6,6 0 0 1 6,${B - 10} V${B} Z`} className="c-door" />
        </>
      ), 2)}
      {part(3, (
        <>
          <rect x={-22} y={B - 76} width={44} height={76} className="c-stone" />
          <rect x={10} y={B - 76} width={12} height={76} className="c-shade" />
          <path d={bricks(-22, 22, B - 76, B, 12)} className="c-brick" />
          <path d={`M-22,${B - 40} H22`} className="c-course" />
          <rect x={-11} y={B - 66} width={6} height={11} rx={3} className={win} />
          <rect x={5} y={B - 66} width={6} height={11} rx={3} className={win} />
          <rect x={-11} y={B - 33} width={6} height={10} rx={3} className={win} />
          <rect x={5} y={B - 33} width={6} height={10} rx={3} className={win} />
          <path d={`M-7,${B} V${B - 13} A7,7 0 0 1 7,${B - 13} V${B} Z`} className="c-door" />
        </>
      ))}
      {part(3, (
        <>
          <path d={`M-27,${B - 76} L0,${B - 104} L27,${B - 76} Z`} className={roof} />
          <path d={`M0,${B - 104} L27,${B - 76} L0,${B - 76} Z`} className="c-roof-shade" />
        </>
      ), 4)}
      {part(5, (
        <>
          <path d={`M-17,${B - 80} L0,${B - 104} L17,${B - 80} Z`} className={roof} />
          <path d={`M0,${B - 104} L17,${B - 80} L0,${B - 80} Z`} className="c-roof-shade" />
        </>
      ), 10)}
      {part(11, (
        <>
          <path d={`M-15,${B - 80} L0,${keepPeak} L15,${B - 80} Z`} className={roof} />
          <path d={`M0,${keepPeak} L15,${B - 80} L0,${B - 80} Z`} className="c-roof-shade" />
        </>
      ))}
      {part(5, (
        <>
          <rect x={-25} y={B - 80} width={50} height={5} className={ledge} />
          {[-25, -14.5, -3, 8.5, 19].map((x) => <rect key={x} x={x} y={B - 87} width={6} height={7} className="c-stone" />)}
          <rect x={19} y={B - 87} width={6} height={7} className="c-shade" />
        </>
      ))}
      {part(11, (
        <path d={`M-25,${B - 87} L-22,${B - 102} L-19,${B - 87} Z M19,${B - 87} L22,${B - 102} L25,${B - 87} Z`} className={roof} />
      ))}
      {part(9, <circle cx={0} cy={B - 51} r={3.6} className={win} />)}
      {part(10, <Crown x={0} y={keepPeak + 2} />)}
      {part(6, pennant(0, flagBase, 18), 11)}
      {part(12, (
        <>
          <line x1={0} y1={flagBase} x2={0} y2={flagBase - 26} className="pole" />
          <path d={`M0,${flagBase - 26} L24,${flagBase - 22} L19,${flagBase - 17} L24,${flagBase - 12} L0,${flagBase - 12} Z`} className="banner c-royal" />
        </>
      ))}
      {part(6, (
        <>
          {[-19, 13].map((x) => (
            <path key={x} d={`M${x},${B - 74} h6 v22 l-3,-4 l-3,4 Z`} className="c-drape" />
          ))}
          <path d={`M-19,${B - 70} h6 M13,${B - 70} h6`} className="c-drape-band" />
        </>
      ))}

      {/* Muralla con puerta y puente levadizo */}
      {part(8, (
        <>
          <rect x={-40} y={B - 28} width={80} height={28} className="c-stone" />
          <path d={bricks(-40, 40, B - 28, B, 9)} className="c-brick" />
          {[-38, -28, 18, 28].map((x) => <rect key={x} x={x} y={B - 34} width={6} height={6} className="c-stone" />)}
          <rect x={-16} y={B - 46} width={32} height={46} className="c-stone" />
          <rect x={8} y={B - 46} width={8} height={46} className="c-shade" />
          {[-16, -8.5, -1, 6.5].map((x) => <rect key={x} x={x} y={B - 52} width={5} height={6} className="c-stone" />)}
          <rect x={13.5} y={B - 52} width={2.5} height={6} className="c-stone" />
          <rect x={-2} y={B - 40} width={4} height={8} rx={2} className={win} />
          <path d={`M-9,${B} V${B - 17} A9,9 0 0 1 9,${B - 17} V${B} Z`} className="c-gate" />
          <path d={`M-6,${B - 22} v5 M-2,${B - 25} v6 M2,${B - 25} v6 M6,${B - 22} v5 M-8,${B - 19} H8`} className="c-portcullis" />
          <path d={`M-9,${B} L9,${B} L12,8 L-12,8 Z`} className="c-bridge" />
          <path d={`M-10,${B + 4} H10 M-11,${B + 9} H11 M-11.5,${B + 13} H11.5`} className="c-plank" />
          <path d={`M-12,${B - 26} L-11.5,6 M12,${B - 26} L11.5,6`} className="c-chain" />
        </>
      ))}
      {part(4, tower(37))}
      {part(7, tower(-37))}
      {part(9, (
        <>
          <Torch x={-14} y={B - 20} glow={glow} s={0.7} />
          <Torch x={14} y={B - 20} glow={glow} s={0.7} />
        </>
      ))}
      {part(12, (
        <g className="c-sparkles">
          {[[-66, -96, 0], [62, -112, 0.7], [-38, -150, 1.4], [40, -152, 2.1], [-76, -40, 1.1], [80, -58, 1.8], [0, -184, 0.4]].map(([x, y, d]) => (
            <Sparkle key={`${x},${y}`} x={x} y={y} r={4} d={d} />
          ))}
        </g>
      ))}
    </g>
  );
}

// =====================================================================
// Vista frontal
// =====================================================================

/** Alto de la escena frontal: más alta en pantallas anchas, donde el castillo crece. */
const frontHeight = (W: number) => (W >= 560 ? 322 : 300);

// Estrellas fijas (misma semilla siempre).
const STARS = (() => {
  const rnd = seeded(11);
  return Array.from({ length: 46 }, () => ({ x: rnd(), y: rnd() * 0.5, r: 0.4 + rnd() * 1.1 }));
})();

// Cordillera lejana: [x, altura] en fracciones.
const PEAKS: [number, number][] = [
  [0, 0.45], [0.06, 0.7], [0.13, 0.5], [0.21, 0.85], [0.3, 0.55], [0.37, 0.72], [0.45, 0.42],
  [0.53, 0.66], [0.61, 0.5], [0.7, 0.92], [0.79, 0.58], [0.86, 0.74], [0.93, 0.5], [1, 0.62],
];

/** Antorcha encendida (parpadea) con su halo de luz. */
function Torch({ x, y, glow, s = 1 }: { x: number; y: number; glow: string; s?: number }) {
  return (
    <g className="torch" transform={`translate(${x},${y}) scale(${s})`}>
      <circle cy={-4} r={12} fill={`url(#${glow})`} className="torch-glow" />
      <line x1={0} y1={0} x2={0} y2={7} className="torch-stick" />
      <path d="M0,-7 C3.2,-3.5 2.4,0 0,0 C-2.4,0 -3.2,-3.5 0,-7 Z" className="torch-flame" />
    </g>
  );
}

function Cabana({ built }: { built: boolean; glow?: string }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      {built && <ellipse cx={0} cy={0} rx={25} ry={3} className="shadow" />}
      {built && <rect x={11} y={-42} width={6} height={14} className="chimney" />}
      <rect x={-19} y={-24} width={38} height={24} className="wood" />
      {built && <path d="M-19,-18 H19 M-19,-12 H19 M-19,-6 H19" className="plank" />}
      <path d="M-24,-24 L0,-44 L24,-24 Z" className="roof" />
      {built && <path d="M0,-44 L24,-24 L0,-24 Z" className="roof-shade" />}
      {built && <path d="M-25,-24 H25" className="eave" />}
      <rect x={-5} y={-13} width={10} height={13} className="door" />
      <rect x={-15} y={-19} width={7} height={6} className="window" />
      <rect x={8} y={-19} width={7} height={6} className="window" />
      {built && <path d="M-11.5,-19 V-13 M-15,-16 H-8 M11.5,-19 V-13 M8,-16 H15" className="mullion" />}
      {built && (
        <g className="smoke soft">
          <circle cx={14} cy={-47} r={2.5} />
          <circle cx={15} cy={-53} r={3.2} />
          <circle cx={13} cy={-60} r={4} />
        </g>
      )}
    </g>
  );
}

function Herreria({ built }: { built: boolean; glow?: string }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      {built && <ellipse cx={0} cy={0} rx={30} ry={3} className="shadow" />}
      <rect x={13} y={-50} width={8} height={22} className="stone" />
      <rect x={-24} y={-30} width={48} height={30} className="stone" />
      {built && <path d="M-24,-22 H24 M-24,-14 H24 M-24,-6 H24 M-16,-30 V-22 M4,-30 V-22 M18,-30 V-22 M-6,-22 V-14 M14,-22 V-14 M-18,-14 V-6 M16,-14 V-6" className="brick" />}
      <path d="M-27,-30 L-18,-42 L27,-42 L27,-30 Z" className="roof" />
      {built && <path d="M-27,-30 L27,-30 L27,-34 L-24,-34 Z" className="roof-shade" />}
      <path d="M-8,0 L-8,-12 A8,8 0 0 1 8,-12 L8,0 Z" className="forge" />
      <rect x={-20} y={-24} width={7} height={7} className="window" />
      {built && (
        <>
          <path d="M12,-7 H24 L22,-5 H19 V-2 H22 V0 H14 V-2 H17 V-5 H14 Z" className="anvil" />
          <g className="embers">
            <circle cx={-3} cy={-10} r={0.9} />
            <circle cx={2} cy={-11} r={0.8} />
            <circle cx={0} cy={-9} r={0.9} />
          </g>
          <g className="smoke">
            <circle cx={17} cy={-56} r={4} />
            <circle cx={19} cy={-64} r={5} />
            <circle cx={16} cy={-73} r={6} />
          </g>
        </>
      )}
    </g>
  );
}

function Torreon({ built, glow }: { built: boolean; glow: string }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      {built && <ellipse cx={0} cy={0} rx={20} ry={3} className="shadow" />}
      <rect x={-14} y={-78} width={28} height={78} className="stone" />
      {built && <path d="M-14,-66 H14 M-14,-52 H14 M-14,-38 H14 M-14,-24 H14 M-6,-78 V-66 M7,-66 V-52 M-7,-52 V-38 M6,-38 V-24 M-8,-24 V-12" className="brick" />}
      {built && <rect x={-16} y={-80} width={32} height={4} className="ledge" />}
      {[-14, -6, 2, 10].map((x) => <rect key={x} x={x} y={-86} width={5} height={8} className="stone" />)}
      <rect x={-4} y={-62} width={8} height={11} rx={4} className="window" />
      <rect x={-4} y={-36} width={8} height={11} rx={4} className="window" />
      <path d="M-6,0 L-6,-14 A6,6 0 0 1 6,-14 L6,0 Z" className="door" />
      <line x1={0} y1={-86} x2={0} y2={-108} className="pole" />
      {built && <path d="M0,-108 L20,-103 L0,-97 Z" className="banner" />}
      {built && <Torch x={-10} y={-16} glow={glow} s={0.75} />}
      {built && <Torch x={10} y={-16} glow={glow} s={0.75} />}
    </g>
  );
}

/** Andamio sobre unos cimientos: el edificio aún no existe. */
function Scaffold({ type }: { type: QuestType }) {
  const h = type === 'main' ? 80 : type === 'daily' ? 34 : 30;
  const w = type === 'main' ? 30 : type === 'daily' ? 50 : 40;
  return (
    <g className="scaffold">
      <rect x={-w / 2} y={-4} width={w} height={4} className="foundation" />
      {[-w / 2 + 2, 0, w / 2 - 2].map((x) => <line key={x} x1={x} y1={-4} x2={x} y2={-h} />)}
      {Array.from({ length: Math.floor(h / 14) }, (_, i) => (
        <line key={i} x1={-w / 2} y1={-10 - i * 14} x2={w / 2} y2={-10 - i * 14} />
      ))}
      <line x1={-w / 2} y1={-4} x2={w / 2} y2={-h + 6} />
      <line x1={0} y1={-h} x2={-w / 2 - 5} y2={-h} className="beam" />
      <line x1={-w / 2 - 3} y1={-h} x2={-w / 2 - 3} y2={-h + 18} className="rope" />
      <rect x={-w / 2 - 6} y={-h + 18} width={6} height={5} className="bucket" />
      <g className="materials">
        <rect x={-w / 2 - 7} y={-3} width={9} height={3} />
        <rect x={-w / 2 - 6} y={-6} width={8} height={3} />
      </g>
      <Builder x={w / 2 + 6} />
    </g>
  );
}

/** Obrero martilleando junto a una obra pendiente. */
function Builder({ x, y = 0, s = 1 }: { x: number; y?: number; s?: number }) {
  return (
    <g className="builder" transform={`translate(${x},${y}) scale(${s})`}>
      <circle cx={0} cy={-15} r={3} className="skin" />
      <path d="M-3,-17 L3,-17 L2,-20 L-2,-20 Z" className="helmet" />
      <rect x={-2.5} y={-12} width={5} height={7} rx={1} className="tunic" />
      <line x1={-1.5} y1={-5} x2={-2} y2={0} className="legs" />
      <line x1={1.5} y1={-5} x2={2} y2={0} className="legs" />
      <g className="hammer">
        <line x1={0} y1={-10} x2={-7} y2={-13} />
        <rect x={-10} y={-16} width={4} height={5} />
      </g>
      <circle cx={-10} cy={-6} r={1.2} className="spark" />
    </g>
  );
}

/** Figura de un aldeano (los pies en 0,0). */
function Person({ i }: { i: number }) {
  return (
    <g className="bob">
      <circle cx={0} cy={-11} r={2.4} className="skin" />
      <rect x={-2.2} y={-9} width={4.4} height={6} rx={1} className={`tunic t${i % 3}`} />
      <line x1={-1.2} y1={-3} x2={-1.6} y2={0} className="legs" />
      <line x1={1.2} y1={-3} x2={1.6} y2={0} className="legs" />
    </g>
  );
}

/** Aldeano que pasea por el suelo de la ciudad. */
function Villager({ i, W }: { i: number; W: number }) {
  const dur = 18 + i * 5;
  return (
    <g className="villager" style={{ animationDuration: `${dur}s`, animationDelay: `${-i * 4}s`, ['--w' as string]: `${W}px` }}>
      <Person i={i} />
    </g>
  );
}

/** Campamento: tienda y hoguera mientras no hay nada construido. */
function Camp({ x, y, glow, s = 1 }: { x: number; y: number; glow: string; s?: number }) {
  return (
    <g className="camp" transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx={8} cy={0} rx={22} ry={6} fill={`url(#${glow})`} className="fire-light" />
      <path d="M-22,0 L-12,-20 L-2,0 Z" className="tent" />
      <path d="M-12,-20 L-2,0 L-8,0 Z" className="tent-shade" />
      <path d="M-14,0 L-12,-9 L-10,0 Z" className="tent-door" />
      <path d="M3,0 L13,-3 M3,-3 L13,0" className="logs" />
      <path d="M8,-1 C12,-5 10,-10 8,-14 C6,-10 4,-5 8,-1 Z" className="fire" />
      <path d="M8,-1 C10,-4 9,-6 8,-8 C7,-6 6,-4 8,-1 Z" className="fire-core" />
    </g>
  );
}

/** Fuegos artificiales del reino glorioso. */
function Firework({ x, y, delay, hue }: { x: number; y: number; delay: number; hue: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g className="firework" style={{ animationDelay: `${delay}s`, stroke: hue }}>
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * Math.PI) / 6;
          return <line key={k} x1={Math.cos(a) * 5} y1={Math.sin(a) * 5} x2={Math.cos(a) * 15} y2={Math.sin(a) * 15} />;
        })}
      </g>
    </g>
  );
}

const SHAPE = { side: Cabana, daily: Herreria, main: Torreon };
const SLOT = { side: 54, daily: 62, main: 44 };

function FrontCity({ quests, progress, complete, stage, icon, W, fresh, setHover, castle }: SceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `${uid}${s}`;
  const glow = id('glow');
  const built = quests.filter((q) => q.completedAt).length;
  const H = frontHeight(W);
  const GROUND = H - 34;

  // Siluetas en un solo trazo: pinos, hierba y cordillera.
  const deco = useMemo(() => {
    const rnd = seeded(23);
    let pines = '';
    for (let x = -4; x < W + 10; x += 6 + rnd() * 10) {
      const h = 9 + rnd() * 16;
      const w = h * 0.38;
      const b = GROUND - 20 + rnd() * 4;
      pines += `M${(x - w).toFixed(1)},${b.toFixed(1)} L${x.toFixed(1)},${(b - h).toFixed(1)} L${(x + w).toFixed(1)},${b.toFixed(1)} Z`;
    }
    let grass = '';
    for (let x = 3; x < W; x += 5 + rnd() * 9) {
      const y = GROUND + 1;
      grass += `M${x.toFixed(1)},${y} l-1.6,-${(2 + rnd() * 2).toFixed(1)} M${x.toFixed(1)},${y} l0.3,-${(3 + rnd() * 2).toFixed(1)} M${x.toFixed(1)},${y} l1.7,-${(2 + rnd() * 2).toFixed(1)}`;
    }
    const top = GROUND - 128;
    const range = 70;
    const ridge = PEAKS.map(([fx, fh]) => `${(fx * W).toFixed(1)},${(top + (1 - fh) * range).toFixed(1)}`);
    const mountains = `M0,${GROUND} L${ridge.join(' L')} L${W},${GROUND} Z`;
    const rim = `M${ridge.join(' L')}`;
    const flies = Array.from({ length: 7 }, (_, i) => ({ x: 20 + rnd() * (W - 40), y: GROUND - 14 - rnd() * 40, d: 5 + rnd() * 6, i }));
    return { pines, grass, mountains, rim, flies };
  }, [W, GROUND]);

  // El castillo ocupa el centro; los edificios se reparten a sus dos lados (primera fila hasta llenar
  // el ancho; el resto, más pequeño y detrás). En pantallas anchas, algo más grandes.
  const k = Math.min(1.3, Math.max(1, W / 640));
  const ck = Math.max(1.12, Math.min(1.42, W / 640));
  const gap = quests.length > 0 ? 114 * ck : 0;
  const sideCap = (W - 36 - gap) / 2;
  const left: Quest[] = [];
  const right: Quest[] = [];
  const back: Quest[] = [];
  let lw = 0;
  let rw = 0;
  for (const q of quests) {
    const w = SLOT[q.type] * k;
    if (lw <= rw && lw + w <= sideCap) { left.push(q); lw += w; }
    else if (rw + w <= sideCap) { right.push(q); rw += w; }
    else if (lw + w <= sideCap) { left.push(q); lw += w; }
    else back.push(q);
  }
  // Fila de atrás (más pequeña); si no cabe sin encogerse demasiado, se reparte en dos filas escalonadas.
  const backSum = back.reduce((n, q) => n + SLOT[q.type], 0);
  const avail = W - 24 - gap * 0.85;
  const twoRows = backSum > 0 && avail / backSum < 0.5;
  const bk = backSum ? Math.min(0.7 * k, (twoRows ? 1.9 : 1) * avail / backSum) : 0.7 * k;
  const backRows: [Quest[], Quest[]][] = twoRows ? [[[], []], [[], []]] : [[[], []]];
  const widths = backRows.map(() => [0, 0]);
  back.forEach((q, i) => {
    const r = twoRows ? i % 2 : 0;
    const side = widths[r][0] <= widths[r][1] ? 0 : 1;
    backRows[r][side].push(q);
    widths[r][side] += SLOT[q.type];
  });
  /** Coloca una fila a ambos lados del castillo: la izquierda crece hacia fuera desde el centro, igual que la derecha. */
  function row(l: Quest[], r: Quest[], baseline: number, scale: number, g: number) {
    const placed: { q: Quest; cx: number }[] = [];
    let x = W / 2 - g / 2;
    for (const q of l) { const w = SLOT[q.type] * scale; placed.push({ q, cx: x - w / 2 }); x -= w; }
    x = W / 2 + g / 2;
    for (const q of r) { const w = SLOT[q.type] * scale; placed.push({ q, cx: x + w / 2 }); x += w; }
    return placed.map(({ q, cx }) => {
      const Shape = SHAPE[q.type];
      return (
        <g
          key={q.id} transform={`translate(${cx},${baseline}) scale(${scale})`}
          onPointerEnter={() => setHover({ q, x: cx, y: baseline - 60 * scale })} onPointerLeave={() => setHover(null)}
        >
          <rect x={-SLOT[q.type] / 2} y={-110} width={SLOT[q.type]} height={110} fill="transparent" />
          {q.completedAt && <ellipse cx={0} cy={2} rx={SLOT[q.type] * 0.42} ry={7} fill={`url(#${glow})`} className="light-pool" />}
          {q.completedAt ? (
            <g className={fresh.has(q.id) ? 'just-built' : undefined}>
              <Shape built glow={glow} />
              {fresh.has(q.id) && <g className="dust">{[-18, -6, 6, 18].map((dx) => <circle key={dx} cx={dx} cy={-3} r={5} />)}</g>}
            </g>
          ) : <><Shape built={false} glow={glow} /><Scaffold type={q.type} /></>}
        </g>
      );
    });
  }

  const walls = progress >= 0.34;
  const stoneWalls = progress >= 0.67;
  const showLabel = W >= 560;
  const gateX = W / 2;
  return (
    <svg width={W} height={H} role="img" aria-label={`Ciudad vista de frente: ${stage}, ${built} de ${quests.length} construcciones levantadas.${quests.length ? ` ${castle.label} (${castle.name}).` : ''}`}>
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 30%, #000)' }} />
          <stop offset="55%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 16%, #06050a)' }} />
          <stop offset="88%" style={{ stopColor: 'color-mix(in srgb, var(--c1) 16%, #0a0710)' }} />
        </linearGradient>
        <linearGradient id={id('earth')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d1a14" />
          <stop offset="100%" stopColor="#0b0907" />
        </linearGradient>
        <linearGradient id={id('fog')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="70%" style={{ stopColor: 'color-mix(in srgb, var(--c2) 40%, #fff)' }} stopOpacity="0.09" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('banner')} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--c1)" />
          <stop offset="100%" stopColor="var(--c2)" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor="#ffbe5c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffbe5c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('halo')}>
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c1) 30%, #fff)' }} stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('aura')}>
          <stop offset="0%" stopColor="#ffd77a" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#ffb347" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id('sky')})`} />
      {STARS.map((s, i) => <circle key={i} cx={s.x * W} cy={s.y * H} r={s.r} className={i % 5 === 0 ? 'star tw' : 'star'} style={i % 5 === 0 ? { animationDelay: `${-(i % 7) * 0.6}s` } : undefined} />)}
      <line x1={0} y1={0} x2={34} y2={10} className="shooting-star" style={{ ['--sx' as string]: `${W * 0.15}px` }} />
      <circle cx={W - 70} cy={70} r={46} fill={`url(#${id('halo')})`} />
      <circle cx={W - 70} cy={70} r={16} className="moon" />
      <circle cx={W - 75} cy={66} r={3.2} className="crater" />
      <circle cx={W - 64} cy={75} r={2.2} className="crater" />
      <circle cx={W - 66} cy={63} r={1.4} className="crater" />
      {complete && (
        <>
          <Firework x={W * 0.16} y={56} delay={0} hue="var(--c1)" />
          <Firework x={W * 0.3} y={34} delay={1.3} hue="#ffd27a" />
          <Firework x={W * 0.7} y={44} delay={2.4} hue="var(--c2)" />
        </>
      )}
      <g className="clouds">
        {[0, 1, 2].map((i) => (
          <g key={i} className="cloud" style={{ animationDuration: `${60 + i * 25}s`, animationDelay: `${-i * 22}s`, ['--w' as string]: `${W}px` }}>
            <ellipse cx={0} cy={30 + i * 22} rx={26 - i * 4} ry={7} />
            <ellipse cx={14} cy={26 + i * 22} rx={14} ry={7} />
            <ellipse cx={-12} cy={31 + i * 22} rx={10} ry={5} />
          </g>
        ))}
      </g>
      <path d={deco.mountains} className="mountains" />
      <path d={deco.rim} className="mountain-rim" />
      <path d={`M0,${GROUND - 34} Q${W * 0.2},${GROUND - 70} ${W * 0.42},${GROUND - 40} T${W * 0.8},${GROUND - 52} T${W},${GROUND - 36} L${W},${GROUND} L0,${GROUND} Z`} className="hills" />
      <path d={deco.pines} className="pines" />
      <rect x={0} y={GROUND - 44} width={W} height={50} fill={`url(#${id('fog')})`} className="fog" />
      {castle.tier >= 12 && <ellipse cx={W / 2} cy={GROUND - 70 * ck} rx={150 * ck} ry={120 * ck} fill={`url(#${id('aura')})`} className="castle-aura" />}
      {twoRows && row(backRows[1][0], backRows[1][1], GROUND - 44, bk * 0.82, gap * 0.8)}
      {row(backRows[0][0], backRows[0][1], GROUND - 24, bk, gap * 0.85)}
      <rect x={0} y={GROUND} width={W} height={H - GROUND} fill={`url(#${id('earth')})`} />
      <path d={`M0,${GROUND} H${W}`} className="ground-rim" />
      <path d={`M0,${GROUND + 6} Q${W * 0.25},${GROUND + 3} ${W * 0.5},${GROUND + 6} T${W},${GROUND + 5} L${W},${GROUND + 15} Q${W * 0.75},${GROUND + 18} ${W * 0.5},${GROUND + 15} T0,${GROUND + 16} Z`} className="city-road" />
      <path d={deco.grass} className="grass" />
      {quests.length > 0 && (
        <g
          transform={`translate(${W / 2},${GROUND}) scale(${ck})`}
          onPointerEnter={() => setHover({ castle: true, x: W / 2 + 40 * ck, y: GROUND - 90 * ck })} onPointerLeave={() => setHover(null)}
        >
          <rect x={-56} y={-150} width={112} height={156} fill="transparent" />
          <FrontCastle tier={castle.tier} prev={castle.prev} glow={glow} />
          {castle.upgraded && <CastleBurst key={built} x={0} y={-96} tier={castle.tier} s={1} />}
        </g>
      )}
      {quests.length > 0 && built === 0 && <Camp x={W / 2 + 36 * ck} y={GROUND} glow={glow} s={ck} />}
      {row(left, right, GROUND, k, gap)}
      <g transform={`translate(0,${GROUND + 13})`}>
        {Array.from({ length: Math.min(5, built) }, (_, i) => <Villager key={i} i={i} W={W} />)}
      </g>
      <g className="fireflies">
        {deco.flies.map((f) => <circle key={f.i} cx={f.x} cy={f.y} r={1.3} style={{ animationDuration: `${f.d}s`, animationDelay: `${-f.i * 1.3}s` }} />)}
      </g>
      {walls && !stoneWalls && (
        <g className="palisade">
          {Array.from({ length: Math.ceil(W / 9) }, (_, i) => i * 9)
            .filter((x) => x + 7 < gateX - 13 || x > gateX + 13)
            .map((x, i) => (
              <path key={x} className={i % 2 ? 'alt' : undefined} d={`M${x},${H} L${x},${H - 14} L${x + 3.5},${H - 19} L${x + 7},${H - 14} L${x + 7},${H} Z`} />
            ))}
          <path d={`M0,${H - 9} H${gateX - 13} M${gateX + 13},${H - 9} H${W}`} className="rope" />
          <rect x={gateX - 15} y={H - 27} width={5} height={27} className="post" />
          <rect x={gateX + 10} y={H - 27} width={5} height={27} className="post" />
          <rect x={gateX - 15} y={H - 29} width={30} height={4} className="post" />
          <Torch x={gateX - 12.5} y={H - 33} glow={glow} s={0.8} />
          <Torch x={gateX + 12.5} y={H - 33} glow={glow} s={0.8} />
        </g>
      )}
      {stoneWalls && (
        <g className="wall">
          <rect x={0} y={H - 18} width={W} height={18} />
          {Array.from({ length: Math.ceil(W / 16) }, (_, i) => <rect key={i} x={i * 16} y={H - 24} width={9} height={6} />)}
          <path d={`M0,${H - 9} H${W} ${Array.from({ length: Math.ceil(W / 22) }, (_, i) => `M${i * 22 + 8},${H - 18} V${H - 9} M${i * 22 + 19},${H - 9} V${H}`).join(' ')}`} className="mortar" />
          <rect x={W / 2 - 30} y={H - 36} width={60} height={36} />
          {[-30, -18, -6, 6, 18].map((dx) => <rect key={dx} x={W / 2 + dx} y={H - 42} width={8} height={6} />)}
          <path d={`M${W / 2 - 11},${H} L${W / 2 - 11},${H - 14} A11,11 0 0 1 ${W / 2 + 11},${H - 14} L${W / 2 + 11},${H} Z`} className="gate" />
          <path d={`M${W / 2 - 7},${H - 20} V${H} M${W / 2},${H - 25} V${H} M${W / 2 + 7},${H - 20} V${H} M${W / 2 - 11},${H - 10} H${W / 2 + 11} M${W / 2 - 11},${H - 4} H${W / 2 + 11}`} className="portcullis" />
          <rect x={8} y={H - 46} width={22} height={46} />
          <rect x={W - 30} y={H - 46} width={22} height={46} />
          {[8, W - 30].map((x) => [0, 8, 16].map((dx) => <rect key={`${x}-${dx}`} x={x + dx} y={H - 51} width={6} height={5} />))}
          <rect x={16.5} y={H - 38} width={5} height={8} rx={2.5} className="slit" />
          <rect x={W - 21.5} y={H - 38} width={5} height={8} rx={2.5} className="slit" />
          <Torch x={W / 2 - 20} y={H - 22} glow={glow} s={0.8} />
          <Torch x={W / 2 + 20} y={H - 22} glow={glow} s={0.8} />
          {complete && [19, W - 19].map((x) => (
            <g key={x}>
              <line x1={x} y1={H - 51} x2={x} y2={H - 71} className="pole" />
              <path d={`M${x},${H - 71} L${x + 16},${H - 66} L${x},${H - 61} Z`} className="banner" />
            </g>
          ))}
        </g>
      )}
      {showLabel && <text x={14} y={24} className="city-stage">{icon} {stage} · {Math.round(progress * 100)} %</text>}
      {quests.length === 0 && <EmptyText x={W / 2} y={GROUND - 50} W={W} />}
    </svg>
  );
}

// =====================================================================
// Vista desde arriba (isométrica)
// =====================================================================

type XY = [number, number];
/** Proyección isométrica: i hacia abajo-derecha, j hacia abajo-izquierda, z en alturas de casilla. */
type Proj = (i: number, j: number, z?: number) => XY;
type V3 = [number, number, number];

const pts = (P: Proj, list: V3[]) => list.map(([i, j, z]) => P(i, j, z).map((n) => n.toFixed(1)).join(',')).join(' ');

/** Caja isométrica: cara izquierda (l), derecha (r) y techo (t). */
function Box({ P, i0, j0, i1, j1, z0 = 0, z1, m, top = true }: { P: Proj; i0: number; j0: number; i1: number; j1: number; z0?: number; z1: number; m: string; top?: boolean }) {
  return (
    <>
      <polygon className={`${m} l`} points={pts(P, [[i0, j1, z0], [i1, j1, z0], [i1, j1, z1], [i0, j1, z1]])} />
      <polygon className={`${m} r`} points={pts(P, [[i1, j0, z0], [i1, j1, z0], [i1, j1, z1], [i1, j0, z1]])} />
      {top && <polygon className={`${m} t`} points={pts(P, [[i0, j0, z1], [i1, j0, z1], [i1, j1, z1], [i0, j1, z1]])} />}
    </>
  );
}

/** Rectángulo sobre la cara izquierda (plano j fijo) o derecha (plano i fijo). */
function FaceL({ P, j, a, b, z0, z1, cls }: { P: Proj; j: number; a: number; b: number; z0: number; z1: number; cls: string }) {
  return <polygon className={cls} points={pts(P, [[a, j, z0], [b, j, z0], [b, j, z1], [a, j, z1]])} />;
}
function FaceR({ P, i, a, b, z0, z1, cls }: { P: Proj; i: number; a: number; b: number; z0: number; z1: number; cls: string }) {
  return <polygon className={cls} points={pts(P, [[i, a, z0], [i, b, z0], [i, b, z1], [i, a, z1]])} />;
}

function Pool({ P, i, j, r, gid, cls = 'light-pool' }: { P: Proj; i: number; j: number; r: number; gid: string; cls?: string }) {
  const [x, y] = P(i, j);
  const [x1] = P(i + r, j - r);
  const rx = Math.abs(x1 - x);
  return <ellipse cx={x} cy={y} rx={rx} ry={rx / 2} fill={`url(#${gid})`} className={cls} />;
}

/** Dimensiones de cada edificio en casillas: medio ancho (a, b) y altura de muro. */
const ISO_DIM: Record<QuestType, { a: number; b: number; h: number }> = {
  side: { a: 0.72, b: 0.72, h: 1 },
  daily: { a: 0.92, b: 0.78, h: 1.1 },
  main: { a: 0.6, b: 0.6, h: 3.4 },
};

function IsoCabana({ P, smoke }: { P: Proj; smoke: boolean }) {
  const { a, b, h } = ISO_DIM.side;
  const [cx, cy] = P(0.4, -0.35, h + 1.25);
  return (
    <>
      <Box P={P} i0={-a} j0={-b} i1={a} j1={b} z1={h} m="m-wood" top={false} />
      <FaceL P={P} j={b} a={0.05} b={0.35} z0={0} z1={0.62} cls="m-door" />
      <FaceL P={P} j={b} a={-0.55} b={-0.25} z0={0.38} z1={0.66} cls="iso-win" />
      <FaceR P={P} i={a} a={-0.3} b={0.05} z0={0.38} z1={0.66} cls="iso-win" />
      <polygon className="m-roof r" points={pts(P, [[-a - 0.12, -b - 0.12, h], [a + 0.12, -b - 0.12, h], [a + 0.12, 0, h + 0.85], [-a - 0.12, 0, h + 0.85]])} />
      <Box P={P} i0={0.3} j0={-0.48} i1={0.5} j1={-0.28} z0={h} z1={h + 1.15} m="m-stone" />
      <polygon className="m-wood r" points={pts(P, [[a, -b, h], [a, b, h], [a, 0, h + 0.85]])} />
      <polygon className="m-roof l" points={pts(P, [[-a - 0.12, b + 0.12, h], [a + 0.12, b + 0.12, h], [a + 0.12, 0, h + 0.85], [-a - 0.12, 0, h + 0.85]])} />
      <polyline className="ridge" points={pts(P, [[-a - 0.12, 0, h + 0.85], [a + 0.12, 0, h + 0.85]])} />
      {smoke && (
        <g className="smoke soft" transform={`translate(${cx},${cy})`}>
          <circle cx={0} cy={-2} r={2.2} />
          <circle cx={1} cy={-7} r={2.8} />
          <circle cx={-1} cy={-13} r={3.4} />
        </g>
      )}
    </>
  );
}

function IsoHerreria({ P, gid, live }: { P: Proj; gid: string; live: boolean }) {
  const { a, b, h } = ISO_DIM.daily;
  const [sx, sy] = P(0.62, -0.52, 2.7);
  const [fx, fy] = P(0, b, 0.35);
  return (
    <>
      <Box P={P} i0={-a} j0={-b} i1={a} j1={b} z1={h} m="m-stone" top={false} />
      <FaceL P={P} j={b} a={-0.32} b={0.3} z0={0} z1={0.62} cls="iso-forge" />
      <FaceL P={P} j={b} a={-0.78} b={-0.52} z0={0.4} z1={0.68} cls="iso-win" />
      <FaceR P={P} i={a} a={-0.4} b={-0.1} z0={0.4} z1={0.68} cls="iso-win" />
      <polygon className="m-roof r" points={pts(P, [[-a - 0.1, -b - 0.1, h], [a + 0.1, -b - 0.1, h], [a + 0.1, 0, h + 0.55], [-a - 0.1, 0, h + 0.55]])} />
      <Box P={P} i0={0.45} j0={-0.7} i1={0.78} j1={-0.36} z1={h + 1.55} m="m-stone" />
      <polygon className="m-stone r" points={pts(P, [[a, -b, h], [a, b, h], [a, 0, h + 0.55]])} />
      <polygon className="m-roof l" points={pts(P, [[-a - 0.1, b + 0.1, h], [a + 0.1, b + 0.1, h], [a + 0.1, 0, h + 0.55], [-a - 0.1, 0, h + 0.55]])} />
      <polyline className="ridge" points={pts(P, [[-a - 0.1, 0, h + 0.55], [a + 0.1, 0, h + 0.55]])} />
      {live && (
        <>
          <Box P={P} i0={0.42} j0={b + 0.2} i1={0.7} j1={b + 0.36} z1={0.28} m="m-metal" />
          <g className="embers" transform={`translate(${fx},${fy})`}>
            <circle cx={-2} cy={0} r={0.9} />
            <circle cx={2} cy={-1} r={0.8} />
            <circle cx={0} cy={1} r={0.9} />
          </g>
          <g className="smoke" transform={`translate(${sx},${sy})`}>
            <circle cx={0} cy={-2} r={3} />
            <circle cx={1.5} cy={-9} r={4} />
            <circle cx={-1} cy={-17} r={5} />
          </g>
          <Pool P={P} i={0} j={b + 0.45} r={0.7} gid={gid} cls="light-pool forge-light" />
        </>
      )}
    </>
  );
}

/** Almenas sobre el borde de una plataforma cuadrada de medio ancho s a la altura z. */
function Merlons({ P, s, z, n = 3, size = 0.2, hgt = 0.28, back }: { P: Proj; s: number; z: number; n?: number; size?: number; hgt?: number; back: boolean }) {
  const out: ReactNode[] = [];
  const step = (2 * s - size) / (n - 1);
  for (let k = 0; k < n; k++) {
    const t = -s + k * step;
    if (back) {
      out.push(<Box key={`a${k}`} P={P} i0={t} j0={-s} i1={t + size} j1={-s + size} z0={z} z1={z + hgt} m="m-stone" />);
      if (k > 0) out.push(<Box key={`b${k}`} P={P} i0={-s} j0={t} i1={-s + size} j1={t + size} z0={z} z1={z + hgt} m="m-stone" />);
    } else {
      if (k < n - 1) out.push(<Box key={`c${k}`} P={P} i0={t} j0={s - size} i1={t + size} j1={s} z0={z} z1={z + hgt} m="m-stone" />);
      out.push(<Box key={`d${k}`} P={P} i0={s - size} j0={t} i1={s} j1={t + size} z0={z} z1={z + hgt} m="m-stone" />);
    }
  }
  return <>{out}</>;
}

function Flag({ P, i = 0, j = 0, z, len = 1.3, banner = 'iso-banner' }: { P: Proj; i?: number; j?: number; z: number; len?: number; banner?: string }) {
  const [x0, y0] = P(i, j, z);
  const [, y1] = P(i, j, z + len);
  const fl = (y0 - y1) * 0.55;
  return (
    <>
      <line x1={x0} y1={y0} x2={x0} y2={y1} className="pole" />
      <path d={`M${x0},${y1} L${x0 + fl},${y1 + fl * 0.22} L${x0},${y1 + fl * 0.44} Z`} className={`banner ${banner}`} />
    </>
  );
}

function IsoTorreon({ P, live }: { P: Proj; live: boolean }) {
  const { a, h } = ISO_DIM.main;
  const p = a + 0.1;
  return (
    <>
      <Box P={P} i0={-a} j0={-a} i1={a} j1={a} z1={h} m="m-stone" top={false} />
      <FaceL P={P} j={a} a={0.02} b={0.32} z0={0} z1={0.62} cls="m-door" />
      <FaceL P={P} j={a} a={-0.35} b={-0.2} z0={1.3} z1={1.75} cls="iso-win" />
      <FaceL P={P} j={a} a={-0.1} b={0.05} z0={2.4} z1={2.85} cls="iso-win" />
      <FaceR P={P} i={a} a={-0.15} b={0} z0={1.9} z1={2.35} cls="iso-win" />
      <polyline className="course" points={pts(P, [[-a, a, 1.1], [a, a, 1.1], [a, -a, 1.1]])} />
      <polyline className="course" points={pts(P, [[-a, a, 2.2], [a, a, 2.2], [a, -a, 2.2]])} />
      <Box P={P} i0={-p} j0={-p} i1={p} j1={p} z0={h} z1={h + 0.3} m="m-stone2" />
      <Merlons P={P} s={p} z={h + 0.3} back />
      {live && <Flag P={P} z={h + 0.3} len={1.5} />}
      <Merlons P={P} s={p} z={h + 0.3} back={false} />
    </>
  );
}

/** Tejado piramidal de base cuadrada (medio ancho a) entre las alturas z0 y z1. */
function Pyr({ P, a, z0, z1, m }: { P: Proj; a: number; z0: number; z1: number; m: string }) {
  return (
    <>
      <polygon className={`${m} l`} points={pts(P, [[-a, a, z0], [a, a, z0], [0, 0, z1]])} />
      <polygon className={`${m} r`} points={pts(P, [[a, -a, z0], [a, a, z0], [0, 0, z1]])} />
    </>
  );
}

function IsoTorch({ P, i, j, z, s, glow }: { P: Proj; i: number; j: number; z: number; s: number; glow: string }) {
  const [x, y] = P(i, j, z);
  return (
    <g className="torch" transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(s * 0.85).toFixed(2)})`}>
      <circle cy={-4} r={12} fill={`url(#${glow})`} className="torch-glow" />
      <line x1={0} y1={0} x2={0} y2={7} className="torch-stick" />
      <path d="M0,-7 C3.2,-3.5 2.4,0 0,0 C-2.4,0 -3.2,-3.5 0,-7 Z" className="torch-flame" />
    </g>
  );
}

/** Castillo isométrico en la plaza central (P centrado en la plaza; la puerta mira a la avenida, +j). */
function IsoCastle({ P, tier, prev, s, glow }: { P: Proj; tier: number; prev: number; s: number; glow: string }) {
  const part = makePart(tier, prev);
  const win = tier >= 9 ? 'iso-win' : 'iso-win dim';
  const roofM = tier >= 10 ? 'm-gold' : 'm-roof';
  const ledgeM = tier >= 10 ? 'm-goldtrim' : 'm-stone2';
  const sp = tier >= 11;
  const at = (ci: number, cj: number): Proj => (i, j, z = 0) => P(ci + i, cj + j, z);
  const R = 0.9; // línea de la muralla
  const keepTop = sp ? 5.3 : 4.25;
  const [kx, ky] = P(0, 0, keepTop);

  const tower = (ci: number, cj: number) => {
    const Pt = at(ci, cj);
    const top = 3.1;
    const base = tier >= 5 ? top + 0.08 : top;
    const peak = sp ? 5 : 4.15;
    return (
      <>
        <Box P={Pt} i0={-0.26} j0={-0.26} i1={0.26} j1={0.26} z1={top} m="m-stone" top={false} />
        <polyline className="course" points={pts(Pt, [[-0.26, 0.26, 1.55], [0.26, 0.26, 1.55], [0.26, -0.26, 1.55]])} />
        <FaceL P={Pt} j={0.26} a={-0.06} b={0.06} z0={2.1} z1={2.5} cls={win} />
        <FaceR P={Pt} i={0.26} a={-0.06} b={0.06} z0={0.9} z1={1.3} cls={win} />
        {part(5, <Box P={Pt} i0={-0.32} j0={-0.32} i1={0.32} j1={0.32} z0={top - 0.12} z1={top + 0.08} m={ledgeM} />)}
        <Pyr P={Pt} a={sp ? 0.3 : 0.34} z0={base} z1={peak} m={roofM} />
        {part(6, <Flag P={Pt} z={peak} len={1} />, 11)}
        {part(12, <Flag P={Pt} z={peak} len={1.3} />)}
      </>
    );
  };
  const turret = (ci: number, cj: number) => {
    const Pt = at(ci, cj);
    return (
      <>
        <Box P={Pt} i0={-0.19} j0={-0.19} i1={0.19} j1={0.19} z1={1.3} m="m-wall" />
        <Merlons P={Pt} s={0.19} z={1.3} n={2} size={0.12} hgt={0.18} back />
        <Merlons P={Pt} s={0.19} z={1.3} n={2} size={0.12} hgt={0.18} back={false} />
        {part(11, <Pyr P={Pt} a={0.16} z0={1.3} z1={2.6} m={roofM} />)}
      </>
    );
  };
  const wallMerl = (axis: 'i' | 'j', fixed: number, from: number, to: number) => {
    const out: ReactNode[] = [];
    for (let t = from + 0.06; t + 0.12 <= to; t += 0.24) {
      out.push(axis === 'i'
        ? <Box key={t} P={P} i0={t} j0={fixed + 0.02} i1={t + 0.12} j1={fixed + 0.1} z0={0.85} z1={1.03} m="m-wall" />
        : <Box key={t} P={P} i0={fixed + 0.02} j0={t} i1={fixed + 0.1} j1={t + 0.12} z0={0.85} z1={1.03} m="m-wall" />);
    }
    return out;
  };
  const wt = 0.08;

  return (
    <g className="castle iso-castle">
      {part(12, <Pool P={P} i={0} j={0.4} r={2.4} gid={`${glow}aura`} cls="castle-aura" />)}
      {part(9, <Pool P={P} i={0} j={1.2} r={1.3} gid={glow} />)}
      {part(1, <ellipse cx={P(0, 0)[0]} cy={P(0, 0)[1]} rx={1.3 * Math.abs(P(1, -1)[0] - P(0, 0)[0])} ry={0.65 * Math.abs(P(1, -1)[0] - P(0, 0)[0])} className="c-mound-iso" />, 7)}
      {/* Muralla trasera y torrecilla del fondo */}
      {part(8, (
        <>
          <Box P={P} i0={-R} j0={-R - wt} i1={R - 0.26} j1={-R + wt} z1={0.85} m="m-wall" />
          {wallMerl('i', -R - wt, -R, R - 0.26)}
          <Box P={P} i0={-R - wt} j0={-R} i1={-R + wt} j1={R - 0.26} z1={0.85} m="m-wall" />
          {wallMerl('j', -R - wt, -R, R - 0.26)}
          {turret(-R, -R)}
        </>
      ))}
      {part(1, (
        <path
          className="c-fence-iso"
          d={[[-0.95, -0.4], [-0.95, 0], [-0.95, 0.4], [-0.4, -0.95], [0, -0.95], [0.4, -0.95]].map(([i, j]) => {
            const [x, y] = P(i, j);
            const w = 1.6 * s;
            const h = 9 * s;
            return `M${(x - w).toFixed(1)},${y.toFixed(1)} V${(y - h).toFixed(1)} L${x.toFixed(1)},${(y - h - w * 1.3).toFixed(1)} L${(x + w).toFixed(1)},${(y - h).toFixed(1)} V${y.toFixed(1)} Z`;
          }).join(' ')}
        />
      ), 7)}

      {/* Torre del homenaje */}
      {part(1, (
        <>
          <Box P={P} i0={-0.42} j0={-0.42} i1={0.42} j1={0.42} z1={1.5} m="m-wood" top={false} />
          <FaceL P={P} j={0.42} a={-0.12} b={0.12} z0={0} z1={0.6} cls="m-door" />
          <FaceR P={P} i={0.42} a={-0.1} b={0.1} z0={0.8} z1={1.15} cls={win} />
          <Pyr P={P} a={0.54} z0={1.5} z1={2.6} m="m-roof" />
        </>
      ), 1)}
      {part(2, (
        <>
          <Box P={P} i0={-0.5} j0={-0.5} i1={0.5} j1={0.5} z1={0.8} m="m-stone" />
          <Box P={P} i0={-0.42} j0={-0.42} i1={0.42} j1={0.42} z0={0.8} z1={2.05} m="m-wood" top={false} />
          <FaceL P={P} j={0.5} a={-0.12} b={0.12} z0={0} z1={0.62} cls="m-door" />
          <FaceR P={P} i={0.42} a={-0.1} b={0.1} z0={1.2} z1={1.55} cls={win} />
          <FaceL P={P} j={0.42} a={-0.1} b={0.1} z0={1.2} z1={1.55} cls={win} />
          <Pyr P={P} a={0.54} z0={2.05} z1={3.15} m="m-roof" />
        </>
      ), 2)}
      {part(3, (
        <>
          <Box P={P} i0={-0.52} j0={-0.52} i1={0.52} j1={0.52} z1={2.8} m="m-stone" top={false} />
          <polyline className="course" points={pts(P, [[-0.52, 0.52, 1.4], [0.52, 0.52, 1.4], [0.52, -0.52, 1.4]])} />
          <FaceL P={P} j={0.52} a={-0.36} b={-0.22} z0={1.75} z1={2.2} cls={win} />
          <FaceL P={P} j={0.52} a={0.22} b={0.36} z0={1.75} z1={2.2} cls={win} />
          <FaceR P={P} i={0.52} a={-0.3} b={-0.16} z0={1.75} z1={2.2} cls={win} />
          <FaceR P={P} i={0.52} a={0.16} b={0.3} z0={0.75} z1={1.2} cls={win} />
          <FaceL P={P} j={0.52} a={-0.13} b={0.13} z0={0} z1={0.72} cls="m-door" />
        </>
      ))}
      {part(3, <Pyr P={P} a={0.64} z0={2.8} z1={4.05} m={roofM} />, 4)}
      {part(5, (
        <>
          <Box P={P} i0={-0.6} j0={-0.6} i1={0.6} j1={0.6} z0={2.8} z1={3.02} m={ledgeM} />
          <Merlons P={P} s={0.6} z={3.02} n={4} size={0.16} hgt={0.24} back />
        </>
      ))}
      {part(5, <Pyr P={P} a={0.38} z0={3.02} z1={4.25} m={roofM} />, 10)}
      {part(11, <Pyr P={P} a={0.36} z0={3.02} z1={keepTop} m={roofM} />)}
      {part(9, <FaceL P={P} j={0.52} a={-0.06} b={0.06} z0={2.35} z1={2.55} cls={win} />)}
      {part(10, <Crown x={kx} y={ky + 2 * s} s={s * 0.8} />)}
      {part(6, <Flag P={P} z={keepTop + (tier >= 10 ? 0.55 : 0)} len={1.1} />, 11)}
      {part(12, <Flag P={P} z={keepTop + 0.55} len={1.6} banner="iso-banner c-royal" />)}
      {part(5, <Merlons P={P} s={0.6} z={3.02} n={4} size={0.16} hgt={0.24} back={false} />)}
      {part(6, (
        <>
          <FaceL P={P} j={0.525} a={-0.5} b={-0.38} z0={1.55} z1={2.6} cls="c-drape" />
          <FaceR P={P} i={0.525} a={0.38} b={0.5} z0={1.55} z1={2.6} cls="c-drape" />
        </>
      ))}

      {part(4, tower(R, -R))}
      {part(7, tower(-R, R))}

      {/* Muralla delantera con la puerta, el puente levadizo y la torrecilla frontal */}
      {part(8, (
        <>
          <polygon className="c-bridge" points={pts(P, [[-0.18, R + 0.16, 0.02], [0.18, R + 0.16, 0.02], [0.2, R + 0.66, 0], [-0.2, R + 0.66, 0]])} />
          <Box P={P} i0={-R + 0.26} j0={R - wt} i1={-0.3} j1={R + wt} z1={0.85} m="m-wall" />
          {wallMerl('i', R + wt - 0.12, -R + 0.26, -0.3)}
          <Box P={P} i0={-0.3} j0={R - 0.16} i1={0.3} j1={R + 0.16} z1={1.45} m="m-wall" />
          <Merlons P={(i, j, z = 0) => P(i, R + j, z)} s={0.3} z={1.45} n={3} size={0.12} hgt={0.2} back={false} />
          <FaceL P={P} j={R + 0.16} a={-0.15} b={0.15} z0={0} z1={0.78} cls="iso-gate" />
          <FaceL P={P} j={R + 0.16} a={-0.04} b={0.04} z0={1.0} z1={1.25} cls={win} />
          <polyline className="c-chain" points={pts(P, [[-0.22, R + 0.16, 0.95], [-0.2, R + 0.62, 0.02]])} />
          <polyline className="c-chain" points={pts(P, [[0.22, R + 0.16, 0.95], [0.2, R + 0.62, 0.02]])} />
          <Box P={P} i0={0.3} j0={R - wt} i1={R - 0.19} j1={R + wt} z1={0.85} m="m-wall" />
          {wallMerl('i', R + wt - 0.12, 0.3, R - 0.19)}
          <Box P={P} i0={R - wt} j0={-R + 0.26} i1={R + wt} j1={R - 0.19} z1={0.85} m="m-wall" />
          {wallMerl('j', R + wt - 0.12, -R + 0.26, R - 0.19)}
          {turret(R, R)}
        </>
      ))}
      {part(9, (
        <>
          <IsoTorch P={P} i={-0.36} j={R + 0.18} z={0.7} s={s} glow={glow} />
          <IsoTorch P={P} i={0.36} j={R + 0.18} z={0.7} s={s} glow={glow} />
        </>
      ))}
      {part(12, (
        <g className="c-sparkles">
          {([[-1.5, -1.2, 3.6, 0], [1.3, -1.6, 4.4, 0.7], [-1.2, 1.4, 2.6, 1.4], [1.6, 1.1, 2.2, 2.1], [0, -0.4, 6.3, 1.0]] as const).map(([i, j, z, d]) => {
            const [x, y] = P(i, j, z);
            return <Sparkle key={`${i},${j}`} x={x} y={y} r={4 * s} d={d} />;
          })}
        </g>
      ))}
    </g>
  );
}

/** Andamio isométrico sobre los cimientos de un edificio pendiente. */
function IsoScaffold({ P, type, s }: { P: Proj; type: QuestType; s: number }) {
  const { a, b, h } = ISO_DIM[type];
  const top = type === 'main' ? h : h + 0.5;
  const pole = (i: number, j: number) => {
    const [x0, y0] = P(i, j, 0.15);
    const [x1, y1] = P(i, j, top + 0.25);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const levels = Array.from({ length: Math.max(1, Math.floor(top / 0.8)) }, (_, k) => 0.6 + k * 0.8);
  const plank = (z: number) => {
    const [x0, y0] = P(-a, b, z);
    const [x1, y1] = P(a, b, z);
    const [x2, y2] = P(a, -b, z);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const [bx, by] = P(a + 0.42, b - 0.1);
  const [mx, my] = P(-a - 0.15, b + 0.5);
  const [d0x, d0y] = P(-a, b, 0.15);
  const [d1x, d1y] = P(a, b, top);
  return (
    <g className="iso-scaffold">
      <Box P={P} i0={-a - 0.06} j0={-b - 0.06} i1={a + 0.06} j1={b + 0.06} z1={0.15} m="m-found" />
      <path d={`${pole(-a, -b)} ${pole(a, -b)} ${pole(-a, b)}`} className="pole-back" />
      <path d={`${levels.map(plank).join(' ')} M${d0x.toFixed(1)},${d0y.toFixed(1)} L${d1x.toFixed(1)},${d1y.toFixed(1)}`} />
      <path d={pole(a, b)} />
      <g transform={`translate(${mx},${my}) scale(${s})`} className="materials">
        <rect x={-6} y={-3} width={11} height={3} />
        <rect x={-5} y={-6} width={9} height={3} />
      </g>
      <Builder x={bx} y={by} s={s} />
    </g>
  );
}

/** Pino visto en isométrica (para el bosque de alrededor). */
function Pine({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})`} className="iso-pine">
      <ellipse cx={0} cy={0} rx={7} ry={3.2} className="tree-shadow" />
      <path d="M-7,-3 L0,-24 L7,-3 Z" className="pine-a" />
      <path d="M0,-24 L7,-3 L0,-1 Z" className="pine-b" />
      <path d="M-5,-12 L0,-28 L5,-12 Z" className="pine-a" />
      <path d="M0,-28 L5,-12 L0,-11 Z" className="pine-b" />
    </g>
  );
}

/** Árbol redondo para los solares vacíos. */
function RoundTree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})`} className="iso-tree">
      <ellipse cx={1} cy={0} rx={7} ry={3.2} className="tree-shadow" />
      <rect x={-1.2} y={-7} width={2.4} height={7} className="trunk" />
      <circle cx={0} cy={-12} r={7} className="crown" />
      <circle cx={-2.4} cy={-14.5} r={3.6} className="crown-hi" />
    </g>
  );
}

/** Decoración de un solar libre: arboleda, huerto o rocas. */
function EmptyLot({ P, kind, s }: { P: Proj; kind: number; s: number }) {
  if (kind === 1) {
    const rows = [-0.6, -0.3, 0, 0.3, 0.6];
    return (
      <g className="iso-field">
        <polygon className="soil" points={pts(P, [[-0.85, -0.75, 0], [0.85, -0.75, 0], [0.85, 0.75, 0], [-0.85, 0.75, 0]])} />
        <path d={rows.map((j) => { const [x0, y0] = P(-0.75, j); const [x1, y1] = P(0.75, j); return `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)}`; }).join(' ')} className="crops" />
      </g>
    );
  }
  if (kind === 2) {
    const [x0, y0] = P(-0.3, -0.2);
    const [x1, y1] = P(0.4, 0.3);
    const [x2, y2] = P(-0.4, 0.5);
    return (
      <g className="iso-rocks">
        <RoundTree x={x0} y={y0} s={s * 0.8} />
        <path d={`M${x1 - 6 * s},${y1} Q${x1 - 4 * s},${y1 - 6 * s} ${x1},${y1 - 6 * s} Q${x1 + 6 * s},${y1 - 5 * s} ${x1 + 6 * s},${y1} Z`} className="rock" />
        <circle cx={x2} cy={y2 - 3 * s} r={3.6 * s} className="bush" />
      </g>
    );
  }
  const a = P(-0.45, -0.35);
  const b = P(0.4, -0.2);
  const c = P(-0.1, 0.45);
  return (
    <>
      <RoundTree x={a[0]} y={a[1]} s={s} />
      <RoundTree x={b[0]} y={b[1]} s={s * 0.85} />
      <RoundTree x={c[0]} y={c[1]} s={s * 0.95} />
    </>
  );
}

function IsoCity({ quests, progress, complete, stage, icon, W, fresh, setHover, castle }: SceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `${uid}${s}`;
  const glow = id('glow');
  const n = quests.length;
  const built = quests.filter((q) => q.completedAt).length;
  const walls = progress >= 0.34;
  const stoneWalls = progress >= 0.67;

  // Cuadrícula de solares (impar, con el castillo en el centro y una avenida hasta la puerta). En cuanto la
  // ciudad crece, el castillo se reserva los 3×3 solares centrales para seguir siendo el protagonista.
  const free = (l: number) => (l < 5 ? l * l - 1 - (l - 1) / 2 : l * l - 9 - ((l - 1) / 2 - 1));
  let L = 3;
  while (free(L) < n) L += 2;
  const S = 3;
  const m = 1;
  const G = L * S + 2 * m;
  const c = (L - 1) / 2;
  const th = Math.min((W - 24) / G / 2, (370 - 16) / (G + 5.8));
  const tw = th * 2;
  const H = Math.max(250, Math.round((G + 5.8) * th + 16));
  const ox = W / 2;
  const oy = H - G * th - 0.7 * th - 8;
  const P: Proj = (i, j, z = 0) => [ox + ((i - j) * tw) / 2, oy + ((i + j) * th) / 2 - z * th];
  const s = th / 20; // escala de figuras (obreros, aldeanos, árboles)
  const mid = G / 2;
  const sc = L >= 5 ? 1.9 : 1.25; // escala del castillo

  const lots = useMemo(() => {
    const list: { li: number; lj: number }[] = [];
    for (let li = 0; li < L; li++) for (let lj = 0; lj < L; lj++) {
      if (li === c && lj >= c) continue; // plaza y avenida
      if (L >= 5 && Math.abs(li - c) <= 1 && Math.abs(lj - c) <= 1) continue; // terrenos del castillo
      list.push({ li, lj });
    }
    // Primero los solares más cercanos; a igual distancia, los de los lados (para no tapar el castillo ni quedar
    // tapados por él), luego los de delante y por último los de detrás.
    const d = (l: { li: number; lj: number }) => (l.li - c) ** 2 + (l.lj - c) ** 2;
    const side = (l: { li: number; lj: number }) => Math.abs(l.li - l.lj);
    return list.sort((x, y) => d(x) - d(y) || side(y) - side(x) || y.li + y.lj - (x.li + x.lj) || x.li - y.li);
  }, [L, c]);

  // Bosque alrededor de la parcela (fuera del rombo), en coordenadas de pantalla.
  const forest = useMemo(() => {
    const rnd = seeded(41);
    const out: { x: number; y: number; s: number; depth: number }[] = [];
    for (let k = 0; k < 140 && out.length < 46; k++) {
      const x = rnd() * W;
      const y = 16 + rnd() * (H - 10);
      const u = (x - ox) / (tw / 2);
      const v = (y - oy) / (th / 2);
      const i = (u + v) / 2;
      const j = (v - u) / 2;
      const pad = 0.9;
      if (i > -pad && j > -pad && i < G + pad && j < G + pad) continue;
      out.push({ x, y, s: s * (0.75 + rnd() * 0.5), depth: i + j });
    }
    return out.sort((p, q) => p.y - q.y);
  }, [W, H, ox, oy, tw, th, G, s]);

  const corners: XY[] = [P(0, 0), P(G, 0), P(G, G), P(0, G)];
  const diamond = corners.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const road = (i0: number, j0: number, i1: number, j1: number) => <polygon key={`${i0}-${j0}-${i1}-${j1}`} points={pts(P, [[i0, j0, 0], [i1, j0, 0], [i1, j1, 0], [i0, j1, 0]])} />;
  const rw = 0.3;
  const roads: ReactNode[] = [];
  if (n > 0) {
    for (let k = 0; k <= L; k++) {
      const t = m + k * S;
      roads.push(road(m - rw, t - rw, m + L * S + rw, t + rw));
      roads.push(road(t - rw, m - rw, t + rw, m + L * S + rw));
    }
    roads.push(road(mid - 0.45, mid, mid + 0.45, G));
  }

  // Elementos ordenados de atrás hacia delante.
  type Item = { depth: number; key: string; node: ReactNode };
  const items: Item[] = [];
  lots.forEach((lot, k) => {
    const ci = m + lot.li * S + 1.5;
    const cj = m + lot.lj * S + 1.5;
    const Pl: Proj = (i, j, z = 0) => P(ci + i, cj + j, z);
    const q = quests[k];
    if (!q) {
      items.push({ depth: ci + cj, key: `e${k}`, node: <EmptyLot P={Pl} kind={(lot.li * 7 + lot.lj * 3) % 3} s={s} /> });
      return;
    }
    const dim = ISO_DIM[q.type];
    const tall = q.type === 'main' ? dim.h + 2 : dim.h + 1.6;
    const [lx] = P(ci - dim.a, cj + dim.b);
    const [rx] = P(ci + dim.a, cj - dim.b);
    const [, ty] = P(ci - dim.a, cj - dim.b, tall);
    const [hx, hy] = P(ci, cj, dim.h);
    const [, by] = P(ci + dim.a, cj + dim.b);
    const done = !!q.completedAt;
    const body = q.type === 'side' ? <IsoCabana P={Pl} smoke={done} /> : q.type === 'daily' ? <IsoHerreria P={Pl} gid={glow} live={done} /> : <IsoTorreon P={Pl} live={done} />;
    items.push({
      depth: ci + cj,
      key: q.id,
      node: (
        <g onPointerEnter={() => setHover({ q, x: hx, y: hy })} onPointerLeave={() => setHover(null)}>
          {done && <Pool P={Pl} i={0.25} j={dim.b + 0.35} r={0.9} gid={glow} />}
          {done ? (
            <g className={fresh.has(q.id) ? 'iso-bld built just-built' : 'iso-bld built'}>
              {body}
              {fresh.has(q.id) && <g className="dust">{[-0.6, 0, 0.6].map((d) => { const [x, y] = Pl(d, dim.b + 0.2); return <circle key={d} cx={x} cy={y} r={4 * s} />; })}</g>}
            </g>
          ) : (
            <>
              <g className="iso-bld pending">{body}</g>
              <IsoScaffold P={Pl} type={q.type} s={s} />
            </>
          )}
          <rect x={lx} y={ty} width={rx - lx} height={by - ty} fill="transparent" />
        </g>
      ),
    });
  });

  // Plaza central: el castillo del reino (con el campamento mientras no hay nada construido).
  if (n > 0) {
    const Pc: Proj = (i, j, z = 0) => P(mid + i, mid + j, z);
    const Ps: Proj = (i, j, z = 0) => P(mid + i * sc, mid + j * sc, z * sc);
    const [px, py] = Pc(0, 0);
    const prx = 1.6 * sc * tw * 0.7071;
    const walker = built >= 3 && !complete;
    const [wx0, wy0] = Pc(0.22, 1.6 * sc);
    const [wx1, wy1] = Pc(0.22, mid - 1.2);
    let center: ReactNode = null;
    if (built === 0) {
      const [fx, fy] = Pc(0, 0);
      const tent = (i: number, j: number, key: string) => {
        const [ax, ay] = Pc(i, j, 1.3);
        const [l1x, l1y] = Pc(i - 0.4, j + 0.4);
        const [r1x, r1y] = Pc(i + 0.4, j - 0.4);
        const [f1x, f1y] = Pc(i + 0.4, j + 0.4);
        return (
          <g key={key} className="iso-tent">
            <polygon points={`${ax},${ay} ${l1x},${l1y} ${f1x},${f1y}`} className="tent" />
            <polygon points={`${ax},${ay} ${f1x},${f1y} ${r1x},${r1y}`} className="tent-shade" />
            <polygon points={`${ax},${ay + (f1y - ay) * 0.45} ${(l1x + f1x) / 2 - 2 * s},${(l1y + f1y) / 2} ${(l1x + f1x) / 2 + 3 * s},${(l1y + f1y) / 2}`} className="tent-door" />
          </g>
        );
      };
      center = (
        <g className="iso-camp">
          <Pool P={Pc} i={0} j={0} r={1.5} gid={glow} cls="light-pool fire-light" />
          {tent(-0.7, -0.6, 'a')}
          {tent(0.65, -0.75, 'b')}
          <g transform={`translate(${fx},${fy}) scale(${s * 1.3})`}>
            <path d="M-6,1 L6,-2 M-6,-2 L6,1" className="logs" />
            <path d="M0,0 C5,-5 3,-11 0,-16 C-3,-11 -5,-5 0,0 Z" className="fire" />
            <path d="M0,0 C2.5,-3 1.5,-6 0,-9 C-1.5,-6 -2.5,-3 0,0 Z" className="fire-core" />
          </g>
          {tent(-0.75, 0.6, 'c')}
        </g>
      );
    }
    items.push({
      depth: mid * 2,
      key: 'plaza',
      node: (
        <g>
          <ellipse cx={px} cy={py} rx={prx} ry={prx / 2} className={stoneWalls ? 'iso-plaza paved' : 'iso-plaza'} />
          <ellipse cx={px} cy={py} rx={prx * 0.8} ry={prx * 0.4} className="iso-plaza-ring" />
          {center}
          <g onPointerEnter={() => setHover({ castle: true, x: px + tw * 0.6 * sc, y: py - th * 3 * sc })} onPointerLeave={() => setHover(null)}>
            <IsoCastle P={Ps} tier={castle.tier} prev={castle.prev} s={s * sc} glow={glow} />
            <rect x={Ps(-1.2, 1.2)[0]} y={Ps(0, 0, 5.6)[1]} width={Ps(1.2, -1.2)[0] - Ps(-1.2, 1.2)[0]} height={Ps(1.2, 1.2)[1] - Ps(0, 0, 5.6)[1]} fill="transparent" />
          </g>
          {castle.upgraded && <CastleBurst key={built} x={Ps(0, 0, 3.6)[0]} y={Ps(0, 0, 3.6)[1]} tier={castle.tier} s={s * sc} />}
          {walker && (
            <g transform={`translate(${wx0},${wy0})`}>
              <g className="iso-walk" style={{ ['--dx' as string]: `${wx1 - wx0}px`, ['--dy' as string]: `${wy1 - wy0}px`, animationDuration: '9s' }}>
                <g transform={`scale(${s * 1.1})`} className="iso-villager"><Person i={4} /></g>
              </g>
            </g>
          )}
        </g>
      ),
    });
  }
  items.sort((a, b) => a.depth - b.depth);

  // Aldeanos por los caminos delanteros (delante de todos los solares).
  const edge = m + L * S;
  const walkers = Array.from({ length: Math.min(5, built) }, (_, k) => {
    const rnd = seeded(97 + k * 13);
    const t0 = 0.1 + rnd() * 0.35;
    const t1 = 0.55 + rnd() * 0.35;
    const along = (t: number) => m + t * L * S;
    const [x0, y0] = k % 2 ? P(edge, along(t0)) : P(along(t0), edge);
    const [x1, y1] = k % 2 ? P(edge, along(t1)) : P(along(t1), edge);
    return (
      <g key={k} transform={`translate(${x0},${y0})`}>
        <g className="iso-walk" style={{ ['--dx' as string]: `${x1 - x0}px`, ['--dy' as string]: `${y1 - y0}px`, animationDuration: `${10 + k * 3}s`, animationDelay: `${-k * 2.5}s` }}>
          <g transform={`scale(${s * 1.1})`} className="iso-villager"><Person i={k} /></g>
        </g>
      </g>
    );
  });

  // Murallas: empalizada (villa) o muralla de piedra con torres y puerta (ciudad amurallada y reino glorioso).
  const inset = 0.35;
  const gate0 = mid - 0.65;
  const gate1 = mid + 0.65;
  function stakes(edges: [V3, V3][], skip?: (i: number, j: number) => boolean) {
    const sw = Math.max(2, tw * 0.1);
    const hgt = 0.95 * th;
    let d = '';
    for (const [[i0, j0], [i1, j1]] of edges) {
      const len = Math.hypot(i1 - i0, j1 - j0);
      const nst = Math.round(len / 0.3);
      for (let k = 0; k <= nst; k++) {
        const i = i0 + ((i1 - i0) * k) / nst;
        const j = j0 + ((j1 - j0) * k) / nst;
        if (skip?.(i, j)) continue;
        const [x, y] = P(i, j);
        d += `M${(x - sw / 2).toFixed(1)},${y.toFixed(1)} V${(y - hgt).toFixed(1)} L${x.toFixed(1)},${(y - hgt - sw).toFixed(1)} L${(x + sw / 2).toFixed(1)},${(y - hgt).toFixed(1)} V${y.toFixed(1)} Z`;
      }
    }
    return d;
  }
  const lo = inset;
  const hi = G - inset;
  const inGate = (i: number, j: number) => j > hi - 0.01 && i > gate0 && i < gate1;
  const tower = (ci: number, cj: number, key: string) => {
    const Pt: Proj = (i, j, z = 0) => P(ci + i, cj + j, z);
    const [tx, ty] = Pt(0, 0.55, 1.2);
    return (
      <g key={key}>
        <Box P={Pt} i0={-0.5} j0={-0.5} i1={0.5} j1={0.5} z1={1.9} m="m-wall" />
        <Box P={Pt} i0={-0.6} j0={-0.6} i1={0.6} j1={0.6} z0={1.9} z1={2.15} m="m-stone2" />
        <Merlons P={Pt} s={0.6} z={2.15} back size={0.2} hgt={0.26} />
        {complete && <Flag P={Pt} z={2.15} len={1.3} />}
        <Merlons P={Pt} s={0.6} z={2.15} back={false} size={0.2} hgt={0.26} />
        <FaceL P={Pt} j={0.5} a={-0.08} b={0.08} z0={0.9} z1={1.35} cls="iso-win" />
        {key !== 'tb' && <g className="torch" transform={`translate(${tx},${ty}) scale(${s * 0.9})`}><circle cy={-4} r={12} fill={`url(#${glow})`} className="torch-glow" /><line x1={0} y1={0} x2={0} y2={7} className="torch-stick" /><path d="M0,-7 C3.2,-3.5 2.4,0 0,0 C-2.4,0 -3.2,-3.5 0,-7 Z" className="torch-flame" /></g>}
      </g>
    );
  };
  const wallMerlons = (axis: 'i' | 'j', fixed: number, from: number, to: number, skip?: (t: number) => boolean) => {
    const out: ReactNode[] = [];
    for (let t = from + 0.1; t + 0.2 <= to; t += 0.5) {
      if (skip?.(t)) continue;
      out.push(axis === 'i'
        ? <Box key={t} P={P} i0={t} j0={fixed + 0.08} i1={t + 0.2} j1={fixed + 0.28} z0={0.9} z1={1.15} m="m-wall" />
        : <Box key={t} P={P} i0={fixed + 0.08} j0={t} i1={fixed + 0.28} j1={t + 0.2} z0={0.9} z1={1.15} m="m-wall" />);
    }
    return out;
  };
  const wt = 0.36; // grosor de la muralla
  const torchAt = (i: number, j: number, z: number, key: string) => {
    const [x, y] = P(i, j, z);
    return <g key={key} className="torch" transform={`translate(${x},${y}) scale(${s * 0.9})`}><circle cy={-4} r={12} fill={`url(#${glow})`} className="torch-glow" /><line x1={0} y1={0} x2={0} y2={7} className="torch-stick" /><path d="M0,-7 C3.2,-3.5 2.4,0 0,0 C-2.4,0 -3.2,-3.5 0,-7 Z" className="torch-flame" /></g>;
  };

  let backWalls: ReactNode = null;
  let frontWalls: ReactNode = null;
  if (stoneWalls) {
    backWalls = (
      <g className="iso-wall">
        <Box P={P} i0={lo - wt / 2} j0={lo - wt / 2} i1={lo + wt / 2} j1={hi} z1={0.9} m="m-wall" />
        {wallMerlons('j', lo - wt / 2, lo, hi)}
        <Box P={P} i0={lo - wt / 2} j0={lo - wt / 2} i1={hi} j1={lo + wt / 2} z1={0.9} m="m-wall" />
        {wallMerlons('i', lo - wt / 2, lo, hi)}
        {tower(lo, lo, 'tb')}
      </g>
    );
    frontWalls = (
      <g className="iso-wall">
        <Box P={P} i0={lo} j0={hi - wt / 2} i1={gate0} j1={hi + wt / 2} z1={0.9} m="m-wall" />
        {wallMerlons('i', hi - wt / 2, lo, gate0 - 0.1)}
        {tower(lo, hi, 'tl')}
        <Box P={P} i0={gate0} j0={hi - 0.4} i1={gate1} j1={hi + 0.4} z1={1.6} m="m-wall" />
        <Merlons P={(i, j, z = 0) => P(mid + i, hi + j, z)} s={0.4} z={1.6} n={3} size={0.16} hgt={0.24} back={false} />
        <FaceL P={P} j={hi + 0.4} a={mid - 0.38} b={mid + 0.38} z0={0} z1={0.95} cls="iso-gate" />
        {torchAt(gate0 - 0.12, hi + 0.42, 0.9, 'g0')}
        {torchAt(gate1 + 0.12, hi + 0.42, 0.9, 'g1')}
        <Box P={P} i0={gate1} j0={hi - wt / 2} i1={hi} j1={hi + wt / 2} z1={0.9} m="m-wall" />
        {wallMerlons('i', hi - wt / 2, gate1 + 0.1, hi)}
        <Box P={P} i0={hi - wt / 2} j0={lo} i1={hi + wt / 2} j1={hi} z1={0.9} m="m-wall" />
        {wallMerlons('j', hi - wt / 2, lo, hi)}
        {tower(hi, lo, 'tr')}
        {tower(hi, hi, 'tf')}
      </g>
    );
  } else if (walls) {
    const ropeZ = 0.55;
    backWalls = (
      <g className="iso-palisade">
        <path d={stakes([[[lo, hi, 0], [lo, lo, 0]], [[lo, lo, 0], [hi, lo, 0]]])} />
        <polyline className="rope" points={pts(P, [[lo, hi, ropeZ], [lo, lo, ropeZ], [hi, lo, ropeZ]])} />
      </g>
    );
    const [g0x, g0y] = P(gate0, hi, 0);
    const [g1x, g1y] = P(gate1, hi, 0);
    const ph = 1.4 * th;
    const pw = Math.max(2.5, tw * 0.12);
    frontWalls = (
      <g className="iso-palisade">
        <path d={stakes([[[lo, hi, 0], [hi, hi, 0]], [[hi, lo, 0], [hi, hi, 0]]], inGate)} />
        <polyline className="rope" points={pts(P, [[lo, hi, ropeZ], [gate0, hi, ropeZ]])} />
        <polyline className="rope" points={pts(P, [[gate1, hi, ropeZ], [hi, hi, ropeZ], [hi, lo, ropeZ]])} />
        <rect x={g0x - pw / 2} y={g0y - ph} width={pw} height={ph} className="post" />
        <rect x={g1x - pw / 2} y={g1y - ph} width={pw} height={ph} className="post" />
        <path d={`M${g0x},${g0y - ph} L${g1x},${g1y - ph}`} className="lintel" style={{ strokeWidth: pw }} />
        {torchAt(gate0, hi, 1.65, 'p0')}
        {torchAt(gate1, hi, 1.65, 'p1')}
      </g>
    );
  }

  const flies = useMemo(() => {
    const rnd = seeded(5);
    return Array.from({ length: 8 }, (_, i) => ({ x: 20 + rnd() * (W - 40), y: 30 + rnd() * (H - 50), d: 5 + rnd() * 6, i }));
  }, [W, H]);

  const [pX, pY] = P(0, 0);
  return (
    <svg width={W} height={H} role="img" aria-label={`Ciudad vista desde arriba: ${stage}, ${built} de ${n} construcciones levantadas.${n ? ` ${castle.label} (${castle.name}).` : ''}`}>
      <defs>
        <radialGradient id={id('field')} cx="50%" cy="58%" r="75%">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 14%, #12241a)' }} />
          <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 10%, #050806)' }} />
        </radialGradient>
        <linearGradient id={id('grass')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 12%, #1c3a26)' }} />
          <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 8%, #2a5236)' }} />
        </linearGradient>
        <pattern id={id('chk')} width={2} height={2} patternUnits="userSpaceOnUse" patternTransform={`matrix(${tw / 2},${th / 2},${-tw / 2},${th / 2},${pX},${pY})`}>
          <rect width={1} height={1} fill="#fff" />
          <rect x={1} y={1} width={1} height={1} fill="#fff" />
        </pattern>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor="#ffbe5c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffbe5c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${glow}aura`}>
          <stop offset="0%" stopColor="#ffd77a" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#ffb347" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('vig')} cx="50%" cy="55%" r="72%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
        </radialGradient>
        <radialGradient id={id('cloud')}>
          <stop offset="0%" stopColor="#000" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id('field')})`} />
      {forest.filter((t) => t.depth < G).map((t, k) => <Pine key={k} x={t.x} y={t.y} s={t.s} />)}
      {/* La parcela: un bloque de tierra con césped encima, como una base de estrategia. */}
      <polygon className="plot-side l" points={pts(P, [[0, G, 0], [G, G, 0], [G, G, -0.7], [0, G, -0.7]])} />
      <polygon className="plot-side r" points={pts(P, [[G, 0, 0], [G, G, 0], [G, G, -0.7], [G, 0, -0.7]])} />
      <polygon points={diamond} fill={`url(#${id('grass')})`} className="plot" />
      <polygon points={diamond} fill={`url(#${id('chk')})`} className="plot-checker" />
      <polygon points={diamond} className="plot-edge" />
      <g className={stoneWalls ? 'iso-roads paved' : 'iso-roads'}>{roads}</g>
      {n > 0 && L >= 5 && (
        <g className="iso-court">
          <polygon points={pts(P, [[mid - 4.2, mid - 4.2, 0], [mid + 4.2, mid - 4.2, 0], [mid + 4.2, mid + 4.2, 0], [mid - 4.2, mid + 4.2, 0]])} />
          <polygon className={stoneWalls ? 'court-path paved' : 'court-path'} points={pts(P, [[mid - 0.45, mid + 1.2 * sc, 0], [mid + 0.45, mid + 1.2 * sc, 0], [mid + 0.45, mid + 4.5, 0], [mid - 0.45, mid + 4.5, 0]])} />
        </g>
      )}
      {backWalls}
      {items.map((it) => <g key={it.key}>{it.node}</g>)}
      {walkers}
      {frontWalls}
      {forest.filter((t) => t.depth >= G).map((t, k) => <Pine key={k} x={t.x} y={t.y} s={t.s} />)}
      <g className="cloud-shadows">
        {[0, 1].map((i) => (
          <ellipse key={i} className="cloud-shadow" cx={0} cy={H * (0.35 + i * 0.3)} rx={90 + i * 30} ry={34 + i * 10} fill={`url(#${id('cloud')})`} style={{ animationDuration: `${70 + i * 30}s`, animationDelay: `${-i * 35}s`, ['--w' as string]: `${W}px` }} />
        ))}
      </g>
      <g className="fireflies">
        {flies.map((f) => <circle key={f.i} cx={f.x} cy={f.y} r={1.3} style={{ animationDuration: `${f.d}s`, animationDelay: `${-f.i * 1.3}s` }} />)}
      </g>
      <rect width={W} height={H} fill={`url(#${id('vig')})`} pointerEvents="none" />
      {W >= 560 && <text x={14} y={24} className="city-stage">{icon} {stage} · {Math.round(progress * 100)} %</text>}
      {n === 0 && <EmptyText x={W / 2} y={oy - (W < 480 ? 30 : 14)} W={W} />}
    </svg>
  );
}

// =====================================================================
// Escena (con el selector de perspectiva)
// =====================================================================

type SceneProps = {
  quests: Quest[];
  progress: number;
  complete: boolean;
  stage: string;
  icon: string;
  W: number;
  fresh: Set<string>;
  setHover: SetHover;
  castle: CastleState;
};

type CastleState = ReturnType<typeof castleInfo> & { prev: number; upgraded: boolean };

const BUILT_KEY = 'excelsior:built-seen';
function loadBuilt(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BUILT_KEY) ?? '[]') ?? [];
  } catch {
    return [];
  }
}

const VIEWS: { id: CityView; label: string }[] = [
  { id: 'front', label: 'Frontal' },
  { id: 'top', label: 'Desde arriba' },
];

export function CityScene({ quests, progress, complete, stage, icon }: { quests: Quest[]; progress: number; complete: boolean; stage: string; icon: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(700);
  const [view, setView] = useCityView();
  const [hover, setHover] = useState<Hover>(null);
  // Edificios terminados desde la última visita (o mientras miras): aparecen con un «pop» al estilo de los
  // juegos de estrategia, y el castillo celebra la mejora que traen.
  const [seen] = useState(() => new Set(loadBuilt()));
  const fresh = useMemo(() => new Set(quests.filter((q) => q.completedAt && !seen.has(q.id)).map((q) => q.id)), [quests, seen]);
  useEffect(() => {
    const ids = quests.filter((q) => q.completedAt).map((q) => q.id);
    try {
      localStorage.setItem(BUILT_KEY, JSON.stringify([...new Set([...loadBuilt(), ...ids])].slice(-500)));
    } catch {
      /* ignorado */
    }
  }, [quests]);

  const built = quests.filter((q) => q.completedAt).length;
  const info = castleInfo(built, quests.length);
  const prev = fresh.size ? castleTier(built - fresh.size, quests.length) : info.tier;
  const castle: CastleState = { ...info, prev, upgraded: info.tier > prev };

  const props: SceneProps = { quests, progress, complete, stage, icon, W, fresh, setHover, castle };
  return (
    <div className={`city-scene ${view === 'top' ? 'view-top' : 'view-front'}${complete ? ' glorious' : ''}`} ref={ref}>
      <div className="segmented city-view" role="radiogroup" aria-label="Perspectiva de la ciudad">
        {VIEWS.map((v) => (
          <button
            type="button" key={v.id} role="radio" aria-checked={view === v.id} className={view === v.id ? 'seg on' : 'seg'}
            onClick={() => { setHover(null); setView(v.id); }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'top' ? <IsoCity {...props} /> : <FrontCity {...props} />}
      {quests.length > 0 && (
        <p
          className={`castle-cap${castle.upgraded ? ' up' : ''}${castle.tier >= CASTLE_MAX ? ' max' : ''}`}
          style={{ top: W >= 560 ? 36 : 48 }} title={`${castle.label} · ${castle.name}. ${castle.next}`} aria-live="polite"
        >
          <span aria-hidden="true">🏰 </span>{castle.label}
          {W >= 640 && <span className="cap-name"> · {castle.name}</span>}
          <span className="sr-only">. {castle.next}</span>
        </p>
      )}
      {hover && (
        <div className={'q' in hover ? 'chart-tip' : 'chart-tip castle-tip'} style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > W - 190 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          {'q' in hover ? (
            <>
              <span className="tip-title">{hover.q.completedAt ? BUILDINGS[hover.q.type].name : `Cimientos de ${BUILDINGS[hover.q.type].name.toLowerCase()}`}</span>
              <span className="tip-value">{hover.q.title}</span>
            </>
          ) : (
            <>
              <span className="tip-title">{castle.label}</span>
              <span className="tip-value">{castle.name}</span>
              <span className="tip-sub">{castle.next}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
