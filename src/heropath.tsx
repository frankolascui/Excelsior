// Camino del héroe: los 10 avatares como un sendero que sube la montaña hasta la cima (Excelsior: «siempre más alto»).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GameState } from './types';
import { AVATARS, avatarInfo, avatarRequirements, requirementStatus } from './attributes';
import { AvatarPortrait, initialOf } from './portrait';
import { RitualCTA } from './ritual';
import { DEFAULT_GUIDE } from './tutorial';

const W = 1000;
const H = 470;
// Paradas del sendero, de abajo a la izquierda a la cima.
const STOPS: [number, number][] = [
  [70, 380], [175, 318], [295, 352], [405, 278], [505, 306], [598, 228], [700, 250], [780, 170], [868, 128], [938, 58],
];

/** Curva suave (Catmull-Rom → Bézier) que pasa por los puntos. */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return '';
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

type NodeState = 'past' | 'current' | 'next' | 'locked';

export function HeroPath({ state, now }: { state: GameState; now: number }) {
  const info = avatarInfo(state, now);
  const [selected, setSelected] = useState(info.next ? info.index + 1 : info.index);
  const scroller = useRef<HTMLDivElement>(null);

  // En pantallas estrechas el mapa se desplaza: se centra en el avatar actual.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = (STOPS[info.index][0] / W) * el.scrollWidth - el.clientWidth / 2;
  }, [info.index]);

  const stateOf = (i: number): NodeState => (i < info.index ? 'past' : i === info.index ? 'current' : i === info.index + 1 ? 'next' : 'locked');
  // Tramo recorrido: hasta el avatar actual y, de ahí, la parte proporcional al progreso hacia el siguiente.
  const walked: [number, number][] = STOPS.slice(0, info.index + 1);
  if (info.next) {
    const [a, b] = [STOPS[info.index], STOPS[info.index + 1]];
    walked.push([a[0] + (b[0] - a[0]) * info.progress, a[1] + (b[1] - a[1]) * info.progress]);
  }

  const a = AVATARS[selected];
  const st = stateOf(selected);
  const reqs = avatarRequirements(state, a).map((r) => requirementStatus(state, r, now));
  const select = (i: number) => setSelected(i);
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    if (e.key === 'ArrowRight' && i < AVATARS.length - 1) select(i + 1);
    if (e.key === 'ArrowLeft' && i > 0) select(i - 1);
  };

  return (
    <section className="panel hero-path" aria-labelledby="path-h" data-tour="ladder">
      <header className="panel-head"><h3 id="path-h">Camino del héroe</h3><span className="count mono">{info.index + 1}/{AVATARS.length}</span></header>
      <div className="path-scroll" ref={scroller}>
        <svg className="path-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Camino del héroe: 10 avatares hasta la cima">
          <defs>
            <linearGradient id="pm-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c3) 22%, #07070c)" /><stop offset="100%" stopColor="#07070c" />
            </linearGradient>
            <linearGradient id="pm-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c3) 30%, #14141f)" /><stop offset="100%" stopColor="#0d0d16" />
            </linearGradient>
            <linearGradient id="pm-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--c2) 18%, #191924)" /><stop offset="100%" stopColor="#0a0a10" />
            </linearGradient>
            <linearGradient id="pm-walk" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--c3)" /><stop offset="50%" stopColor="var(--c1)" /><stop offset="100%" stopColor="var(--c2)" />
            </linearGradient>
            <radialGradient id="pm-summit">
              <stop offset="0%" stopColor="#fff6c8" stopOpacity="0.9" /><stop offset="100%" stopColor="var(--c1)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} fill="url(#pm-sky)" />
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} className="pm-star" cx={(i * 263) % W} cy={(i * 97) % 200} r={i % 5 ? 1 : 1.8} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
          ))}
          <circle cx={938} cy={58} r={120} fill="url(#pm-summit)" className="pm-summit" />
          <path d="M0 300 L120 210 L210 260 L330 150 L450 230 L560 120 L680 190 L800 80 L900 40 L1000 90 L1000 470 L0 470 Z" fill="url(#pm-far)" />
          <path d="M800 80 L835 112 L818 108 L800 122 L782 104 L768 110 Z M560 120 L590 150 L572 146 L560 156 L546 142 Z" fill="rgba(255,255,255,0.35)" />
          <g className="pm-clouds">
            <ellipse cx={240} cy={190} rx={70} ry={12} />
            <ellipse cx={620} cy={150} rx={90} ry={13} />
          </g>
          <path d="M0 420 L90 340 L200 380 L320 300 L430 340 L540 260 L660 300 L760 210 L880 170 L1000 140 L1000 470 L0 470 Z" fill="url(#pm-near)" />

          <path className="pm-trail" d={smooth(STOPS)} />
          <path className="pm-walked" d={smooth(walked)} stroke="url(#pm-walk)" pathLength={1} />
          {/* Luz que sube por el tramo recorrido y una chispa que lo recorre hasta donde estás */}
          <path className="pm-flow" d={smooth(walked)} pathLength={1} />
          {walked.length > 1 && (
            <circle className="pm-spark" r={6}>
              <animateMotion dur="3.6s" repeatCount="indefinite" path={smooth(walked)} keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="linear" />
            </circle>
          )}
          {info.next && (
            <path className="pm-next" d={smooth([walked[walked.length - 1], STOPS[info.index + 1]])} />
          )}

          {AVATARS.map((av, i) => {
            const s = stateOf(i);
            const [x, y] = STOPS[i];
            const big = s === 'current';
            const size = big ? 104 : s === 'next' ? 84 : 70;
            const ready = s === 'next' && info.ready;
            return (
              <g
                key={av.id} className={`path-node ${s}${ready ? ' ready' : ''}${selected === i ? ' sel' : ''}`} role="button" tabIndex={0}
                aria-label={`${av.name}: ${s === 'past' ? 'superado' : s === 'current' ? 'tu avatar actual' : ready ? 'ritual disponible' : 'bloqueado'}`}
                aria-pressed={selected === i} onClick={() => select(i)} onKeyDown={onKey(i)}
              >
                {(selected === i || ready) && <circle className="node-halo" cx={x} cy={y} r={size / 2 + 8} />}
                <g className="node-float" style={{ animationDelay: `${-i * 0.37}s` }}>
                  <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 200 200" overflow="visible">
                    <AvatarPortrait tier={i} photo={s === 'current' ? state.profile?.photo : undefined} label={s === 'current' ? initialOf(state.profile?.name) : av.icon} size={200} dim={s === 'locked'} title={av.name} />
                  </svg>
                </g>
                {s === 'locked' && <text x={x + size / 2 - 8} y={y + size / 2 - 4} className="node-lock" textAnchor="middle">🔒</text>}
                {i === AVATARS.length - 1
                  ? <text x={x - size / 2 - 8} y={y + 6} className="node-name" textAnchor="end">{av.name}</text>
                  : <text x={x} y={y + size / 2 + 20} className="node-name" textAnchor="middle">{av.name}</text>}
              </g>
            );
          })}
        </svg>
      </div>

      <div className={`path-detail ${st}`} aria-live="polite">
        <div className="path-detail-head">
          <span className="path-detail-icon" aria-hidden="true">{a.icon}</span>
          <div>
            <h4 className="path-detail-name">{a.name}</h4>
            <p className="rung-motto">«{a.motto}»</p>
          </div>
          <span className="path-detail-state small-text">
            {st === 'past' ? 'Superado' : st === 'current' ? 'Tu avatar actual' : st === 'next' ? (info.ready ? '🕯️ Ritual disponible' : `${reqs.filter((r) => r.met).length}/${reqs.length} requisitos`) : 'Más adelante'}
          </span>
        </div>
        {reqs.length === 0 ? <p className="muted small-text">Punto de partida.</p> : (
          <ul className="path-reqs">
            {reqs.map((r, j) => (
              <li key={j} className={r.met ? 'met' : ''}>
                <span className="path-req-label"><span aria-hidden="true">{r.met ? '✓' : '○'}</span> {r.label}</span>
                <span className="path-req-bar" aria-hidden="true"><span style={{ width: `${Math.floor(r.progress * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        )}
        {st === 'next' && <RitualCTA state={state} now={now} />}
        <p className="hint">Requisitos iguales para todos. Al cumplirlos, {DEFAULT_GUIDE} te espera para el ritual y ganas un aro más épico.</p>
      </div>
    </section>
  );
}
