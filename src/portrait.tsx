// Retrato del héroe con el aro de su avatar. Cada avatar tiene un aro más épico que el anterior.
// Dentro va la inicial (o el icono del avatar); el día que haya foto de perfil, irá la foto.
import { useId, type ReactNode } from 'react';

const C = 100; // centro del lienzo 200×200

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};
const around = (n: number, fn: (deg: number, i: number) => ReactNode) => Array.from({ length: n }, (_, i) => fn((360 / n) * i, i));

/** Llama pequeña apuntando hacia fuera en el ángulo `deg`. */
function Flame({ deg, r, h, fill, delay = 0 }: { deg: number; r: number; h: number; fill: string; delay?: number }) {
  const [x, y] = polar(r, deg);
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <path className="ring-flame" style={{ animationDelay: `${delay}s` }} fill={fill}
        d={`M0 ${h * 0.25} C ${-h * 0.42} 0, ${-h * 0.18} ${-h * 0.55}, 0 ${-h} C ${h * 0.18} ${-h * 0.55}, ${h * 0.42} 0, 0 ${h * 0.25} Z`} />
    </g>
  );
}

function Leaf({ deg, r, side, fill }: { deg: number; r: number; side: 1 | -1; fill: string }) {
  const [x, y] = polar(r, deg);
  return <ellipse cx={x} cy={y} rx={4} ry={10} fill={fill} transform={`rotate(${deg + 90 + side * 35} ${x} ${y})`} />;
}

function Bolt({ deg, r, fill }: { deg: number; r: number; fill: string }) {
  const [x, y] = polar(r, deg);
  return <path className="ring-bolt" fill={fill} transform={`translate(${x} ${y}) rotate(${deg}) scale(0.9)`} d="M2 -14 L-6 1 L-1 1 L-3 13 L6 -3 L1 -3 Z" />;
}

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 ? r * 0.45 : r;
    const a = ((i * 36 - 90) * Math.PI) / 180;
    return `${x + rad * Math.cos(a)},${y + rad * Math.sin(a)}`;
  }).join(' ');
  return <polygon points={pts} fill={fill} />;
}

export function AvatarPortrait({
  tier, label, size = 96, photo, dim = false, title,
}: { tier: number; label: string; size?: number; photo?: string; dim?: boolean; title?: string }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `url(#${id}-${n})`;
  const t = Math.max(0, Math.min(9, tier));
  const epic = t >= 6;
  return (
    <svg className={`portrait tier-${t}${dim ? ' dim' : ''}`} viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={title ?? label}>
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--c3)" /><stop offset="50%" stopColor="var(--c1)" /><stop offset="100%" stopColor="var(--c2)" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3c4" /><stop offset="45%" stopColor="#f5c451" /><stop offset="100%" stopColor="#9a5b12" />
        </linearGradient>
        <linearGradient id={`${id}-bronze`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0c08a" /><stop offset="100%" stopColor="#7a4a1d" />
        </linearGradient>
        <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff4d2e" /><stop offset="60%" stopColor="#ffb23e" /><stop offset="100%" stopColor="#fff1a8" />
        </linearGradient>
        <radialGradient id={`${id}-face`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--c3) 55%, #1a1a24)" /><stop offset="100%" stopColor="#0c0c14" />
        </radialGradient>
        <radialGradient id={`${id}-aura`}>
          <stop offset="55%" stopColor="var(--c1)" stopOpacity="0.55" /><stop offset="100%" stopColor="var(--c1)" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}><circle cx={C} cy={C} r={60} /></clipPath>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* Fondo: aura y rayos en los avatares altos */}
      {t >= 8 && <circle className="ring-aura" cx={C} cy={C} r={98} fill={g('aura')} />}
      {t >= 9 && (
        <g className="ring-spin-slow" opacity="0.5">
          {around(24, (d, i) => { const [x1, y1] = polar(70, d); const [x2, y2] = polar(i % 2 ? 92 : 99, d); return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={g('gold')} strokeWidth={i % 2 ? 1.5 : 3} strokeLinecap="round" />; })}
        </g>
      )}

      {/* Aro según el avatar */}
      {t === 0 && <circle cx={C} cy={C} r={68} fill="none" stroke="var(--line)" strokeWidth={3} />}
      {t === 1 && (
        <>
          <circle cx={C} cy={C} r={68} fill="none" stroke="var(--c2)" strokeWidth={3.5} opacity={0.85} />
          <Flame deg={0} r={70} h={22} fill={g('fire')} />
        </>
      )}
      {t === 2 && (
        <>
          <circle cx={C} cy={C} r={67} fill="none" stroke="var(--c3)" strokeWidth={3} />
          <circle cx={C} cy={C} r={75} fill="none" stroke="var(--c3)" strokeWidth={1.5} opacity={0.6} />
          {around(4, (d) => { const [x, y] = polar(71, d); return <rect key={d} x={x - 5} y={y - 5} width={10} height={10} fill="var(--c2)" transform={`rotate(45 ${x} ${y})`} />; })}
        </>
      )}
      {t === 3 && (
        <>
          <g className="ring-spin-slow">
            {around(24, (d) => { const [x, y] = polar(76, d); return <rect key={d} x={x - 4} y={y - 6} width={8} height={12} rx={1.5} fill={g('bronze')} transform={`rotate(${d} ${x} ${y})`} />; })}
          </g>
          <circle cx={C} cy={C} r={69} fill="none" stroke={g('bronze')} strokeWidth={8} />
        </>
      )}
      {t === 4 && (
        <>
          <circle cx={C} cy={C} r={67} fill="none" stroke="var(--c3)" strokeWidth={3} />
          {around(60, (d, i) => { const long = i % 15 === 0; const [x1, y1] = polar(71, d); const [x2, y2] = polar(long ? 86 : i % 5 === 0 ? 79 : 75, d); return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={long ? 'var(--c1)' : 'var(--muted)'} strokeWidth={long ? 3 : 1.2} />; })}
          <circle cx={C} cy={C} r={90} fill="none" stroke="var(--c3)" strokeWidth={1} strokeDasharray="2 6" opacity={0.7} />
        </>
      )}
      {t === 5 && (
        <>
          <circle cx={C} cy={C} r={68} fill="none" stroke={g('grad')} strokeWidth={5} />
          <g className="ring-spin">
            {around(8, (d) => { const [x, y] = polar(82, d); return <path key={d} d="M0 -10 L7 6 L0 2 L-7 6 Z" fill="var(--c1)" transform={`translate(${x} ${y}) rotate(${d})`} />; })}
            <circle cx={C} cy={C} r={82} fill="none" stroke="var(--c1)" strokeWidth={1} opacity={0.5} />
          </g>
        </>
      )}
      {t === 6 && (
        <g filter={`url(#${id}-glow)`}>
          {around(14, (d, i) => <Flame key={d} deg={d} r={70} h={i % 2 ? 18 : 26} fill={g('fire')} delay={i * 0.13} />)}
          <circle cx={C} cy={C} r={68} fill="none" stroke={g('fire')} strokeWidth={6} />
        </g>
      )}
      {t === 7 && (
        <>
          {[-1, 1].map((side) => around(12, (d, i) => (i > 0 && i < 10 ? <Leaf key={`${side}${d}`} deg={side === 1 ? 180 - d / 2.4 : 180 + d / 2.4} r={80} side={side as 1 | -1} fill="#8fbf5a" /> : null)))}
          <circle cx={C} cy={C} r={68} fill="none" stroke={g('gold')} strokeWidth={9} />
          <path d="M80 30 L86 16 L94 26 L100 10 L106 26 L114 16 L120 30 Z" fill={g('gold')} />
          <circle cx={C} cy={21} r={3.5} fill="var(--c1)" />
        </>
      )}
      {t === 8 && (
        <>
          <circle cx={C} cy={C} r={66} fill="none" stroke={g('grad')} strokeWidth={6} filter={`url(#${id}-glow)`} />
          <circle className="ring-dash" cx={C} cy={C} r={78} fill="none" stroke="var(--c3)" strokeWidth={2.5} strokeDasharray="14 10" />
          {around(6, (d) => <Bolt key={d} deg={d + 30} r={88} fill="#fff59a" />)}
        </>
      )}
      {t === 9 && (
        <>
          <circle className="ring-spin" cx={C} cy={C} r={68} fill="none" stroke={g('grad')} strokeWidth={9} filter={`url(#${id}-glow)`} />
          <circle cx={C} cy={C} r={77} fill="none" stroke={g('gold')} strokeWidth={2.5} />
          <g className="ring-orbit">
            {around(12, (d, i) => { const [x, y] = polar(86, d); return <circle key={d} cx={x} cy={y} r={i % 3 ? 2 : 3.5} fill={i % 2 ? 'var(--c1)' : '#fff6c8'} />; })}
          </g>
          <Star x={C} y={18} r={15} fill={g('gold')} />
          {[-1, 1].map((side) => (
            <path key={side} d="M0 0 C 18 -6, 34 -2, 44 10 C 30 6, 16 8, 0 14 Z" fill={g('gold')} opacity={0.9}
              transform={`translate(${C + side * 70} ${C + 18}) scale(${side} 1)`} />
          ))}
        </>
      )}

      {/* Cara: foto el día que exista; mientras, la inicial o el icono */}
      <circle cx={C} cy={C} r={60} fill={g('face')} stroke={epic ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'} strokeWidth={1.5} />
      {photo
        ? <image href={photo} x={40} y={40} width={120} height={120} clipPath={`url(#${id}-clip)`} preserveAspectRatio="xMidYMid slice" />
        : <text x={C} y={C} textAnchor="middle" dominantBaseline="central" className="portrait-label" fontSize={label.length > 1 ? 50 : 64}>{label}</text>}
    </svg>
  );
}

/** Inicial del nombre para el retrato. */
export function initialOf(name: string | undefined): string {
  return (name?.trim()[0] ?? '?').toUpperCase();
}
