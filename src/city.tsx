// Escena de la ciudad medieval de un reino, dibujada en SVG: cada misión es un edificio
// (cimientos con andamios si está pendiente) y las murallas aparecen según la etapa.
import { useEffect, useState } from 'react';
import type { Quest, QuestType } from './types';
import { useWidth } from './charts';
import { BUILDINGS } from './kingdoms';

const H = 230;
const GROUND = H - 30;

// Estrellas fijas (misma semilla siempre).
const STARS = (() => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd() * 0.55, r: 0.4 + rnd() * 1.1 }));
})();

function Cabana({ built }: { built: boolean }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      <rect x={-19} y={-24} width={38} height={24} className="wood" />
      <path d="M-24,-24 L0,-44 L24,-24 Z" className="roof" />
      <rect x={-5} y={-13} width={10} height={13} className="door" />
      <rect x={-15} y={-19} width={7} height={6} className="window" />
      <rect x={8} y={-19} width={7} height={6} className="window" />
    </g>
  );
}

function Herreria({ built }: { built: boolean }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      <rect x={13} y={-50} width={8} height={22} className="stone" />
      <rect x={-24} y={-30} width={48} height={30} className="stone" />
      <path d="M-27,-30 L-18,-42 L27,-42 L27,-30 Z" className="roof" />
      <path d="M-8,0 L-8,-12 A8,8 0 0 1 8,-12 L8,0 Z" className="forge" />
      <rect x={-20} y={-24} width={7} height={7} className="window" />
      {built && (
        <g className="smoke">
          <circle cx={17} cy={-56} r={4} />
          <circle cx={19} cy={-64} r={5} />
          <circle cx={16} cy={-73} r={6} />
        </g>
      )}
    </g>
  );
}

function Torreon({ built }: { built: boolean }) {
  return (
    <g className={built ? 'bld built' : 'bld pending'}>
      <rect x={-14} y={-78} width={28} height={78} className="stone" />
      {[-14, -6, 2, 10].map((x) => <rect key={x} x={x} y={-86} width={5} height={8} className="stone" />)}
      <rect x={-4} y={-62} width={8} height={11} rx={4} className="window" />
      <rect x={-4} y={-36} width={8} height={11} rx={4} className="window" />
      <path d="M-6,0 L-6,-14 A6,6 0 0 1 6,-14 L6,0 Z" className="door" />
      <line x1={0} y1={-86} x2={0} y2={-108} className="pole" />
      {built && <path d="M0,-108 L20,-103 L0,-97 Z" className="banner" />}
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
      <Builder x={w / 2 + 6} />
    </g>
  );
}

/** Obrero martilleando junto a una obra pendiente. */
function Builder({ x }: { x: number }) {
  return (
    <g className="builder" transform={`translate(${x},0)`}>
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

/** Aldeano que pasea por el suelo de la ciudad. */
function Villager({ i, W }: { i: number; W: number }) {
  const dur = 18 + i * 5;
  return (
    <g className="villager" style={{ animationDuration: `${dur}s`, animationDelay: `${-i * 4}s`, ['--w' as string]: `${W}px` }}>
      <g className="bob">
        <circle cx={0} cy={-11} r={2.4} className="skin" />
        <rect x={-2.2} y={-9} width={4.4} height={6} rx={1} className={`tunic t${i % 3}`} />
        <line x1={-1.2} y1={-3} x2={-1.6} y2={0} className="legs" />
        <line x1={1.2} y1={-3} x2={1.6} y2={0} className="legs" />
      </g>
    </g>
  );
}

const BUILT_KEY = 'excelsior:built-seen';
function loadBuilt(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BUILT_KEY) ?? '[]') ?? [];
  } catch {
    return [];
  }
}

const SHAPE = { side: Cabana, daily: Herreria, main: Torreon };
const SLOT = { side: 54, daily: 62, main: 44 };

export function CityScene({ quests, progress, complete, stage, icon }: { quests: Quest[]; progress: number; complete: boolean; stage: string; icon: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(700);
  const [hover, setHover] = useState<{ q: Quest; x: number; y: number } | null>(null);
  // Edificios terminados desde la última visita: aparecen con un «pop» al estilo de los juegos de estrategia.
  const [fresh] = useState(() => {
    const seen = new Set(loadBuilt());
    return new Set(quests.filter((q) => q.completedAt && !seen.has(q.id)).map((q) => q.id));
  });
  useEffect(() => {
    const ids = quests.filter((q) => q.completedAt).map((q) => q.id);
    try {
      localStorage.setItem(BUILT_KEY, JSON.stringify([...new Set([...loadBuilt(), ...ids])].slice(-500)));
    } catch {
      /* ignorado */
    }
  }, [quests]);

  // Primera fila hasta llenar el ancho; el resto, más pequeño y detrás.
  const usable = W - 40;
  const front: Quest[] = [];
  const back: Quest[] = [];
  let used = 0;
  for (const q of quests) {
    if (used + SLOT[q.type] <= usable) {
      front.push(q);
      used += SLOT[q.type];
    } else back.push(q);
  }
  function row(list: Quest[], baseline: number, scale: number) {
    const total = list.reduce((n, q) => n + SLOT[q.type] * scale, 0);
    let x = (W - total) / 2;
    return list.map((q) => {
      const cx = x + (SLOT[q.type] * scale) / 2;
      x += SLOT[q.type] * scale;
      const Shape = SHAPE[q.type];
      return (
        <g
          key={q.id} transform={`translate(${cx},${baseline}) scale(${scale})`}
          onPointerEnter={() => setHover({ q, x: cx, y: baseline - 60 * scale })} onPointerLeave={() => setHover(null)}
        >
          <rect x={-SLOT[q.type] / 2} y={-110} width={SLOT[q.type]} height={110} fill="transparent" />
          {q.completedAt ? (
            <g className={fresh.has(q.id) ? 'just-built' : undefined}>
              <Shape built />
              {fresh.has(q.id) && <g className="dust">{[-18, -6, 6, 18].map((dx) => <circle key={dx} cx={dx} cy={-3} r={5} />)}</g>}
            </g>
          ) : <><Shape built={false} /><Scaffold type={q.type} /></>}
        </g>
      );
    });
  }

  const walls = progress >= 0.34;
  const stoneWalls = progress >= 0.67;
  return (
    <div className={complete ? 'city-scene glorious' : 'city-scene'} ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Ciudad: ${stage}, ${quests.filter((q) => q.completedAt).length} de ${quests.length} construcciones levantadas`}>
        <defs>
          <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 32%, #000)' }} />
            <stop offset="100%" stopColor="#050507" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#city-sky)" />
        {STARS.map((s, i) => <circle key={i} cx={s.x * W} cy={s.y * H} r={s.r} className="star" />)}
        <circle cx={W - 60} cy={42} r={18} className="moon" />
        <g className="clouds">
          {[0, 1, 2].map((i) => (
            <g key={i} className="cloud" style={{ animationDuration: `${60 + i * 25}s`, animationDelay: `${-i * 22}s`, ['--w' as string]: `${W}px` }}>
              <ellipse cx={0} cy={30 + i * 22} rx={26 - i * 4} ry={7} />
              <ellipse cx={14} cy={26 + i * 22} rx={14} ry={7} />
            </g>
          ))}
        </g>
        <path d={`M0,${GROUND - 34} Q${W * 0.2},${GROUND - 70} ${W * 0.42},${GROUND - 40} T${W * 0.8},${GROUND - 52} T${W},${GROUND - 36} L${W},${GROUND} L0,${GROUND} Z`} className="hills" />
        {complete && (
          <g transform={`translate(${W / 2},${GROUND - 26})`} className="keep">
            <rect x={-46} y={-70} width={92} height={70} />
            <rect x={-62} y={-96} width={26} height={96} />
            <rect x={36} y={-96} width={26} height={96} />
            {[-62, -50, 36, 48].map((x) => <rect key={x} x={x} y={-104} width={7} height={8} />)}
            <line x1={0} y1={-70} x2={0} y2={-112} className="pole" />
            <path d="M0,-112 L26,-105 L0,-98 Z" className="banner" />
          </g>
        )}
        {row(back, GROUND - 26, 0.7)}
        <rect x={0} y={GROUND} width={W} height={H - GROUND} className="earth" />
        {row(front, GROUND, 1)}
        <g transform={`translate(0,${GROUND + 14})`}>
          {Array.from({ length: Math.min(5, quests.filter((q) => q.completedAt).length) }, (_, i) => <Villager key={i} i={i} W={W} />)}
        </g>
        {walls && !stoneWalls && (
          <g className="palisade">
            {Array.from({ length: Math.ceil(W / 9) }, (_, i) => (
              <path key={i} d={`M${i * 9},${H} L${i * 9},${H - 14} L${i * 9 + 3.5},${H - 19} L${i * 9 + 7},${H - 14} L${i * 9 + 7},${H} Z`} />
            ))}
          </g>
        )}
        {stoneWalls && (
          <g className="wall">
            <rect x={0} y={H - 18} width={W} height={18} />
            {Array.from({ length: Math.ceil(W / 16) }, (_, i) => <rect key={i} x={i * 16} y={H - 24} width={9} height={6} />)}
            <rect x={W / 2 - 30} y={H - 36} width={60} height={36} />
            <path d={`M${W / 2 - 11},${H} L${W / 2 - 11},${H - 14} A11,11 0 0 1 ${W / 2 + 11},${H - 14} L${W / 2 + 11},${H} Z`} className="gate" />
            <rect x={8} y={H - 46} width={22} height={46} />
            <rect x={W - 30} y={H - 46} width={22} height={46} />
            {complete && [19, W - 19].map((x) => (
              <g key={x}>
                <line x1={x} y1={H - 46} x2={x} y2={H - 66} className="pole" />
                <path d={`M${x},${H - 66} L${x + 16},${H - 61} L${x},${H - 56} Z`} className="banner" />
              </g>
            ))}
          </g>
        )}
        <text x={14} y={24} className="city-stage">{icon} {stage} · {Math.round(progress * 100)} %</text>
        {quests.length === 0 && <text x={W / 2} y={GROUND - 50} textAnchor="middle" className="city-empty-text">Tierras baldías: planea tu primera construcción.</text>}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > W - 170 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          <span className="tip-title">{hover.q.completedAt ? BUILDINGS[hover.q.type].name : `Cimientos de ${BUILDINGS[hover.q.type].name.toLowerCase()}`}</span>
          <span className="tip-value">{hover.q.title}</span>
        </div>
      )}
    </div>
  );
}
