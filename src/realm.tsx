// Mapa de los reinos: tu fortaleza en el centro y un camino hacia cada reino que se ilumina según su %.
import type { KeyboardEvent } from 'react';
import type { GameState } from './types';
import { citiesOf, kingdomProgress, realmProgress, realms, realmTotals, stageFor } from './kingdoms';
import { healthFounded, healthStructures } from './health';
import { HEALTH_KINGDOM } from './nav-state';
import { useWidth } from './charts';
import { Birds, Clouds, Mist } from './sky-fx';
import './city.css';
import { Icon } from './icons';
import { fields, roadPoints, seedOf, terrain, type Clear } from './realm-terrain';

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

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Mapa general (tus reinos alrededor de tu fortaleza) o, con `realmId`, el mapa de un reino: sus ciudades
 * alrededor de la capital.
 */
export function RealmMap({ state, onSelect, realmId }: { state: GameState; onSelect: (kingdomId: string) => void; realmId?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(800);
  const H = W < 600 ? 400 : Math.round(Math.min(440, Math.max(320, W * 0.48)));
  const inside = realmId ? state.kingdoms.find((k) => k.id === realmId) : undefined;
  const realm = inside ? realmTotals(state, inside.id) : realmProgress(state);
  const cx = W / 2;
  const cy = H / 2;
  const pad = 60; // margen para que nombres y nodos no se salgan
  const place = ([fx, fy]: [number, number]) => ({
    x: Math.max(pad, Math.min(W - pad, fx * W)),
    y: Math.max(40, Math.min(H - 70, fy * H)),
  });
  // El Reino de la Salud también es un reino del mapa: crece con sus obras (12 = castillo glorioso).
  const works = healthStructures(state);
  const healthStage = stageFor(works);
  const monument = <T extends object>(p: T) => ({ ...p, progress: 1, complete: true, stage: 'Monumento', icon: 'laurel-crown' as const });
  const entries = inside ? citiesOf(state, inside.id).map((c) => {
    const p = kingdomProgress(state, c.id);
    return { k: { id: c.id, name: c.name }, p: c.closedAt ? monument(p) : p, cities: 0 };
  }) : [
    ...(healthFounded(state) ? [{
      cities: 0,
      k: { id: HEALTH_KINGDOM, name: 'Reino de la Salud' },
      p: { built: works, progress: Math.min(1, works / 12), stage: healthStage.name, icon: 'caduceus' as const, complete: works >= 12 },
    }] : []),
    ...realms(state).map((k) => {
      // El reino suma su capital y sus ciudades. Uno cerrado queda como monumento: anillo completo y laurel.
      const p = realmTotals(state, k.id);
      return { k: { id: k.id, name: k.name }, p: k.closedAt ? monument(p) : p, cities: p.cities };
    }),
  ];
  const nodes = entries.map((e, i) => {
    const pos = place(slot(i));
    const mx = (cx + pos.x) / 2 + (pos.y - cy) * 0.18;
    const my = (cy + pos.y) / 2 - (pos.x - cx) * 0.18;
    return { ...e, ...pos, mx, my, road: `M${cx},${cy} Q${mx},${my} ${pos.x},${pos.y}` };
  });
  const nameLen = W < 600 ? 14 : 26;
  // Cada mapa es su propia tierra (el general y el de cada reino). Nada se planta sobre reinos, nombres ni caminos.
  const seed = seedOf(inside ? inside.id : 'mundo');
  const clear: Clear[] = [{ x: cx, y: cy, r: 66 }, { x: cx, y: cy + 58, r: 30 }];
  for (const n of nodes) {
    clear.push({ x: n.x, y: n.y, r: 38 }, { x: n.x, y: n.y + 50, r: 22 }, { x: n.x - 34, y: n.y + 50, r: 18 }, { x: n.x + 34, y: n.y + 50, r: 18 });
    for (const [x, y] of roadPoints([cx, cy], [n.mx, n.my], [n.x, n.y])) clear.push({ x, y, r: 8 });
  }
  const land = terrain(seed, W, H, clear);
  // Campos de cultivo: uno por cada cuarto de progreso, el reino se ve habitado a medida que crece.
  const farms = W < 600 ? '' : nodes.map((n) => fields(seed + seedOf(n.k.id), n.x, n.y, Math.min(4, Math.ceil(n.p.progress * 4)))).join('');

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
          <h3 id="realm-h">{inside ? `Mapa de ${inside.name}` : 'Mapa del reino'}</h3>
          <p className="muted chart-sub">
            {inside
              ? <>{nodes.length} {nodes.length === 1 ? 'ciudad' : 'ciudades'} · {realm.built} {realm.built === 1 ? 'construcción levantada' : 'construcciones levantadas'}</>
              : <>{realm.built}/{realm.total} construcciones en {nodes.length - (healthFounded(state) ? 1 : 0)} {nodes.length - (healthFounded(state) ? 1 : 0) === 1 ? 'reino' : 'reinos'}{works > 0 && <> · {works} {works === 1 ? 'estructura' : 'estructuras'} de salud</>}</>}
          </p>
        </div>
      </header>
      <div className="realm-map" ref={ref}>
        <svg width={W} height={H} role="img" aria-label={`Mapa con ${nodes.length} ${inside ? 'ciudades' : 'reinos'}. ${nodes.map((n) => `${n.k.name}: ${Math.round(n.p.progress * 100)} %`).join(', ')}`}>
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
          <rect width={W} height={H} rx={14} className="realm-sea" />
          <path className="realm-waves" d={land.waves} />
          <path className="realm-shallows" d={land.coast} />
          <path d={land.coast} fill="url(#realm-bg)" className="realm-land" />
          {land.contours.map((d, i) => <path key={`c${i}`} className="realm-contour" d={d} />)}
          <clipPath id="realm-clip"><path d={land.coast} /></clipPath>
          <g clipPath="url(#realm-clip)">
            <path className="river" d={land.river} />
            <path className="river-glint" d={land.river} />
          </g>
          <path className="realm-farm" d={farms} />
          {land.mountains.map((m, i) => {
            const { x, y, s } = m;
            return (
              <g key={`m${i}`} className="mountain">
                <ellipse cx={x + s * 0.15} cy={y + s * 0.62} rx={s * 1.1} ry={s * 0.22} className="m-shadow" />
                <path d={`M${x - s},${y + s * 0.6} L${x},${y - s * 0.8} L${x + s},${y + s * 0.6} Z`} />
                <path className="m-dark" d={`M${x},${y - s * 0.8} L${x + s},${y + s * 0.6} L${x + s * 0.12},${y + s * 0.6} Z`} />
                <path className="snow" d={`M${x - s * 0.32},${y - s * 0.25} L${x},${y - s * 0.8} L${x + s * 0.32},${y - s * 0.25} L${x + s * 0.1},${y - s * 0.34} Z`} />
              </g>
            );
          })}
          <path className="pine-l" d={land.pinesL} />
          <path className="pine-d" d={land.pinesD} />
          <Icon name="compass-rose" className="compass" x={W - 38} y={22} size={24} />
          <text className="compass-n" x={W - 26} y={18} textAnchor="middle">N</text>

          {nodes.map(({ k, p, road }) => (
            <g key={`r${k.id}`}>
              <path d={road} className="road-bed" />
              <path d={road} className="road" />
              {p.progress > 0 && <path d={road} className="road-lit" pathLength={1} strokeDasharray={`${p.progress} 1`} />}
            </g>
          ))}

          <Mist gid="realm-mist" W={W} bands={[{ y: H * 0.35, h: H * 0.14, o: 0.06 }, { y: H * 0.82, h: H * 0.12, o: 0.05 }]} />
          <Birds W={W} y={H * 0.12} n={3} dur={34} delay={4} />
          <Clouds W={W} shadow rows={[{ y: H * 0.22, s: 1.3, dur: 80, o: 0.07 }, { y: H * 0.62, s: 1.8, dur: 115, o: 0.05 }, { y: H * 0.9, s: 1, dur: 95, o: 0.05 }]} />
          <rect width={W} height={H} rx={14} fill="url(#realm-vig)" pointerEvents="none" />
          <g className="capital" transform={`translate(${cx},${cy})`}>
            <circle r={62} fill="url(#realm-halo)" className="node-halo capital-halo" />
            <ellipse cy={30} rx={38} ry={8} className="node-base" />
            <circle r={34} className="node-bg" />
            <circle r={34} className="node-ring" pathLength={1} strokeDasharray={`${realm.progress} 1`} transform="rotate(-90)" />
            <Icon name="fleur" className="node-icon" x={-15} y={-15} size={30} />
            <text className="node-name" y={52} textAnchor="middle">{clip(inside ? inside.name : state.profile?.name ?? 'Tu fortaleza', nameLen)}</text>
            <text className="node-pct" y={68} textAnchor="middle">{inside ? 'Capital' : 'Tu fortaleza'}</text>
          </g>

          {nodes.map(({ k, p, x, y, cities }) => (
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
              <ellipse cy={24} rx={30} ry={7} className="node-base" />
              {p.progress > 0 && <circle r={50} fill="url(#realm-halo)" className="node-halo" style={{ opacity: 0.25 + p.progress * 0.75 }} />}
              <circle r={27} className="node-bg" />
              <circle r={27} className="node-track" />
              <circle r={27} className="node-ring" pathLength={1} strokeDasharray={`${p.progress} 1`} transform="rotate(-90)" />
              <Icon name={p.icon} className="node-icon" x={-13} y={-13} size={26} />
              <text className="node-name" y={45} textAnchor="middle">{clip(k.name, nameLen)}</text>
              <text className="node-pct" y={61} textAnchor="middle">{cities > 0 ? `${cities} ${cities === 1 ? 'ciudad' : 'ciudades'}` : p.built}{W < 600 ? (cities > 0 ? '' : ' constr.') : ` · ${p.stage}`}</text>
            </g>
          ))}
        </svg>
        {nodes.length === 0 && <p className="realm-empty">{inside ? 'Funda la primera ciudad de este reino (un proyecto concreto) y aparecerá aquí.' : 'Funda tu primer reino y aparecerá en el mapa.'}</p>}
      </div>
    </section>
  );
}
