// Ambiente para los paisajes en SVG (camino del héroe y reinos): estrellas fugaces, nubes, bruma y pájaros.
// Todo se mueve con CSS (transform y opacidad) para que sea barato; con «reducir movimiento» se queda quieto.
import type { CSSProperties } from 'react';

type Vars = CSSProperties & Record<`--${string}`, string>;

/** Estrellas fugaces que cruzan el cielo de vez en cuando, cada una por su sitio y con su ritmo. */
export function ShootingStars({ gid, W, H, n = 3, len = 80 }: { gid: string; W: number; H: number; n?: number; len?: number }) {
  return (
    <g className="fx-shooting" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: n }, (_, i) => {
        const style: Vars = {
          '--x': `${Math.round(W * (0.08 + ((i * 0.37) % 0.7)))}px`,
          '--y': `${Math.round(H * (0.04 + ((i * 0.13) % 0.2)))}px`,
          '--dx': `${Math.round(len * 3)}px`,
          '--dy': `${Math.round(len * 1.1)}px`,
          animationDuration: `${9 + i * 4.5}s`,
          animationDelay: `${2 + i * 3.7}s`,
        };
        return (
          <g key={i} className="fx-shoot" style={style}>
            <polygon points={`0,-1.1 0,1.1 ${-len},${-len * 0.37}`} fill={`url(#${gid})`} />
            <circle r={1.6} className="fx-shoot-head" />
          </g>
        );
      })}
    </g>
  );
}

/** Una nube hecha de bolas superpuestas; la opacidad va en el grupo para que no se marquen los solapes. */
function Puff({ s }: { s: number }) {
  return (
    <>
      <ellipse cx={0} cy={0} rx={34 * s} ry={9 * s} />
      <ellipse cx={-14 * s} cy={-5 * s} rx={15 * s} ry={9 * s} />
      <ellipse cx={8 * s} cy={-9 * s} rx={18 * s} ry={12 * s} />
      <ellipse cx={24 * s} cy={-3 * s} rx={13 * s} ry={8 * s} />
    </>
  );
}

/**
 * Nubes que cruzan de lado a lado a distintas alturas y velocidades (las grandes, más cerca y más lentas).
 * `shadow`: vistas desde arriba, cada nube arrastra su sombra por el suelo.
 */
export function Clouds({ W, rows, shadow = false }: { W: number; rows: { y: number; s: number; dur: number; o?: number }[]; shadow?: boolean }) {
  return (
    <g className="fx-clouds" aria-hidden="true">
      {rows.map((r, i) => {
        const style: Vars = { '--w': `${W}px`, animationDuration: `${r.dur}s`, animationDelay: `${-r.dur * ((i * 0.41) % 1)}s` };
        return (
          <g key={i} className="fx-cloud" style={style}>
            {shadow && <g className="fx-cloud-shadow" transform={`translate(${22 * r.s} ${r.y + 30 * r.s})`}><Puff s={r.s} /></g>}
            <g className="fx-cloud-body" transform={`translate(0 ${r.y})`} style={{ opacity: (r.o ?? 0.08) * 1.5 }}><Puff s={r.s} /></g>
          </g>
        );
      })}
    </g>
  );
}

/** Bruma: franjas suaves que van y vienen despacio. */
export function Mist({ gid, W, bands }: { gid: string; W: number; bands: { y: number; h: number; o?: number }[] }) {
  return (
    <g className="fx-mist" aria-hidden="true">
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--c2) 25%, #fff)' }} stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {bands.map((b, i) => (
        <ellipse
          key={i} className="fx-mist-band" cx={W * (0.3 + i * 0.4)} cy={b.y} rx={W * 0.55} ry={b.h} fill={`url(#${gid})`}
          style={{ opacity: b.o ?? 0.1, animationDuration: `${26 + i * 9}s`, animationDelay: `${-i * 7}s` }}
        />
      ))}
    </g>
  );
}

/** Bandada que cruza el cielo batiendo las alas. */
export function Birds({ W, y, n = 3, dur = 34, delay = 0, s = 1 }: { W: number; y: number; n?: number; dur?: number; delay?: number; s?: number }) {
  const style: Vars = { '--w': `${W}px`, animationDuration: `${dur}s`, animationDelay: `${delay}s` };
  return (
    <g className="fx-birds" style={style} aria-hidden="true">
      <g transform={`translate(0 ${y}) scale(${s})`}>
        {Array.from({ length: n }, (_, i) => (
          <g key={i} transform={`translate(${-i * 16} ${(i % 2 ? 7 : -5) + i * 2})`}>
            <path className="fx-bird" d="M-6,0 Q-3,-4 0,0 Q3,-4 6,0" style={{ animationDelay: `${-i * 0.23}s` }} />
          </g>
        ))}
      </g>
    </g>
  );
}
