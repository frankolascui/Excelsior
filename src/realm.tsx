// Mapa de los reinos: tu fortaleza en el centro y un camino hacia cada reino que se ilumina según su %.
import type { KeyboardEvent } from 'react';
import type { GameState } from './types';
import { kingdomProgress, realmProgress } from './kingdoms';
import { useWidth } from './charts';
import { Birds, Clouds, Mist } from './sky-fx';
import './city.css';

// Posiciones (fracción del mapa) pensadas para que las etiquetas no choquen. Del 13.º en adelante, espiral.
const SLOTS: [number, number][] = [
  [0.24, 0.27], [0.76, 0.27], [0.22, 0.7], [0.78, 0.7], [0.5, 0.17], [0.5, 0.8],
  [0.07, 0.48], [0.93, 0.48], [0.08, 0.14], [0.92, 0.14], [0.08, 0.84], [0.92, 0.84],
];

function slot(i: number): [number, number] {
  if (i < SLOTS.length) return SLOTS[i];
  const a = i * 2.39996;
  const r = 0.2 + 0.14 * ((i % 3) / 2);
  return [0.5 + Math.cos(a) * r * 1.6, 0.5 + Math.sin(a) * r];
}

/** Decoración fija (misma semilla siempre): montañas y árboles en posiciones fraccionales. */
function scenery() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mountains = Array.from({ length: 16 }, () => ({ x: rnd(), y: rnd(), s: 0.7 + rnd() * 0.8 }));
  const trees = Array.from({ length: 34 }, () => ({ x: rnd(), y: rnd(), s: 0.7 + rnd() * 0.6 }));
  return { mountains, trees };
}
const SCENERY = scenery();

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function RealmMap({ state, onSelect }: { state: GameState; onSelect: (kingdomId: string) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>(800);
  const H = W < 600 ? 400 : Math.round(Math.min(440, Math.max(320, W * 0.48)));
  const realm = realmProgress(state);
  const cx = W / 2;
  const cy = H / 2;
  const pad = 60; // margen para que nombres y nodos no se salgan
  const place = ([fx, fy]: [number, number]) => ({
    x: Math.max(pad, Math.min(W - pad, fx * W)),
    y: Math.max(40, Math.min(H - 70, fy * H)),
  });
  const nodes = state.kingdoms.map((k, i) => ({ k, p: kingdomProgress(state, k.id), ...place(slot(i)) }));
  const nameLen = W < 600 ? 14 : 26;
  // Bosque en dos trazos (cara iluminada y cara en sombra) para no llenar el SVG de nodos.
  const pines = SCENERY.trees.reduce((acc, t) => {
    const x = t.x * W;
    const y = t.y * H;
    const s = t.s;
    acc.l += `M${(x - 4.5 * s).toFixed(1)},${(y + 5 * s).toFixed(1)} L${x.toFixed(1)},${(y - 7 * s).toFixed(1)} L${x.toFixed(1)},${(y + 5 * s).toFixed(1)} Z`;
    acc.d += `M${x.toFixed(1)},${(y - 7 * s).toFixed(1)} L${(x + 4.5 * s).toFixed(1)},${(y + 5 * s).toFixed(1)} L${x.toFixed(1)},${(y + 5 * s).toFixed(1)} Z`;
    return acc;
  }, { l: '', d: '' });

  function key(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  }

  return (
    <section className="panel realm" aria-labelledby="realm-h" data-tour="realm">
      <header className="panel-head chart-head">
        <div>
          <h3 id="realm-h">Mapa del reino</h3>
          <p className="muted chart-sub">
            Dominio <span className="mono">{Math.round(realm.progress * 100)} %</span> · {realm.built}/{realm.total} construcciones en {state.kingdoms.length} {state.kingdoms.length === 1 ? 'reino' : 'reinos'}
          </p>
        </div>
      </header>
      <div className="realm-map" ref={ref}>
        <svg width={W} height={H} role="img" aria-label={`Mapa con ${state.kingdoms.length} reinos. ${nodes.map((n) => `${n.k.name}: ${Math.round(n.p.progress * 100)} %`).join(', ')}`}>
          <defs>
            <radialGradient id="realm-bg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c3) 22%, #050505)' }} />
              <stop offset="100%" stopColor="#040404" />
            </radialGradient>
            <radialGradient id="realm-halo">
              <stop offset="0%" style={{ stopColor: 'var(--c1)' }} stopOpacity="0.45" />
              <stop offset="100%" style={{ stopColor: 'var(--c1)' }} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="realm-vig" cx="50%" cy="50%" r="72%">
              <stop offset="65%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
            </radialGradient>
            <linearGradient id="realm-road" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--c2)" />
              <stop offset="100%" stopColor="var(--c1)" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} rx={14} fill="url(#realm-bg)" />
          <rect x={6} y={6} width={W - 12} height={H - 12} rx={10} className="realm-frame" />
          <path className="river" d={`M${-10},${H * 0.18} C${W * 0.25},${H * 0.05} ${W * 0.3},${H * 0.62} ${W * 0.55},${H * 0.6} S${W * 0.85},${H * 0.95} ${W + 10},${H * 0.9}`} />
          <path className="river-glint" d={`M${-10},${H * 0.18} C${W * 0.25},${H * 0.05} ${W * 0.3},${H * 0.62} ${W * 0.55},${H * 0.6} S${W * 0.85},${H * 0.95} ${W + 10},${H * 0.9}`} />
          {SCENERY.mountains.map((m, i) => {
            const x = m.x * W;
            const y = m.y * H;
            const s = 14 * m.s;
            return (
              <g key={`m${i}`} className="mountain">
                <ellipse cx={x + s * 0.15} cy={y + s * 0.62} rx={s * 1.1} ry={s * 0.22} className="m-shadow" />
                <path d={`M${x - s},${y + s * 0.6} L${x},${y - s * 0.8} L${x + s},${y + s * 0.6} Z`} />
                <path className="m-dark" d={`M${x},${y - s * 0.8} L${x + s},${y + s * 0.6} L${x + s * 0.12},${y + s * 0.6} Z`} />
                <path className="snow" d={`M${x - s * 0.32},${y - s * 0.25} L${x},${y - s * 0.8} L${x + s * 0.32},${y - s * 0.25} L${x + s * 0.1},${y - s * 0.34} Z`} />
              </g>
            );
          })}
          <path className="pine-l" d={pines.l} />
          <path className="pine-d" d={pines.d} />
          <text className="compass" x={W - 26} y={34} textAnchor="middle">✧</text>
          <text className="compass-n" x={W - 26} y={18} textAnchor="middle">N</text>

          {nodes.map(({ k, p, x, y }) => {
            const mx = (cx + x) / 2 + (y - cy) * 0.18;
            const my = (cy + y) / 2 - (x - cx) * 0.18;
            const d = `M${cx},${cy} Q${mx},${my} ${x},${y}`;
            return (
              <g key={`r${k.id}`}>
                <path d={d} className="road" />
                {p.progress > 0 && <path d={d} className="road-lit" pathLength={1} strokeDasharray={`${p.progress} 1`} />}
              </g>
            );
          })}

          <Mist gid="realm-mist" W={W} bands={[{ y: H * 0.35, h: H * 0.14, o: 0.06 }, { y: H * 0.82, h: H * 0.12, o: 0.05 }]} />
          <Birds W={W} y={H * 0.12} n={3} dur={34} delay={4} />
          <Clouds W={W} shadow rows={[{ y: H * 0.22, s: 1.3, dur: 80, o: 0.07 }, { y: H * 0.62, s: 1.8, dur: 115, o: 0.05 }, { y: H * 0.9, s: 1, dur: 95, o: 0.05 }]} />
          <rect width={W} height={H} rx={14} fill="url(#realm-vig)" pointerEvents="none" />
          <g className="capital" transform={`translate(${cx},${cy})`}>
            <circle r={62} fill="url(#realm-halo)" className="node-halo capital-halo" />
            <circle r={34} className="node-bg" />
            <circle r={34} className="node-ring" pathLength={1} strokeDasharray={`${realm.progress} 1`} transform="rotate(-90)" />
            <text className="node-icon" fontSize={28} dy="0.35em" textAnchor="middle">⚜️</text>
            <text className="node-name" y={52} textAnchor="middle">{clip(state.profile?.name ?? 'Tu fortaleza', nameLen)}</text>
            <text className="node-pct" y={68} textAnchor="middle">Tu fortaleza</text>
          </g>

          {nodes.map(({ k, p, x, y }) => (
            <g
              key={k.id}
              className={p.complete ? 'kingdom-node complete' : 'kingdom-node'}
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${k.name}: ${p.stage}, ${p.built} construcciones`}
              onClick={() => onSelect(k.id)}
              onKeyDown={(e) => key(e, k.id)}
            >
              <circle r={44} fill="transparent" />
              {p.progress > 0 && <circle r={50} fill="url(#realm-halo)" className="node-halo" style={{ opacity: 0.25 + p.progress * 0.75 }} />}
              <circle r={27} className="node-bg" />
              <circle r={27} className="node-track" />
              <circle r={27} className="node-ring" pathLength={1} strokeDasharray={`${p.progress} 1`} transform="rotate(-90)" />
              <text className="node-icon" fontSize={24} dy="0.35em" textAnchor="middle">{p.icon}</text>
              <text className="node-name" y={45} textAnchor="middle">{clip(k.name, nameLen)}</text>
              <text className="node-pct" y={61} textAnchor="middle">{p.icon} {p.built}{W < 600 ? '' : ` · ${p.stage}`}</text>
            </g>
          ))}
        </svg>
        {state.kingdoms.length === 0 && <p className="realm-empty">Funda tu primer reino y aparecerá en el mapa.</p>}
      </div>
    </section>
  );
}
