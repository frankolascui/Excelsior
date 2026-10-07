// Retratos de los bosses: un medallón SVG por bestia, en el estilo oscuro con degradados de la app.
// En silueta (bloqueados) todo se vuelve negro y los ojos se apagan. Las fases (herido / furioso) añaden grietas y brillo rojo.
import { useId, type ReactNode } from 'react';
import type { BossPhase, BossTier } from './bosses';

export const TIER_COLOR: Record<BossTier, string> = {
  1: '#d6a77a', // bronce
  2: '#a5b4fc', // plata azulada
  3: '#e879f9', // legendario
  4: '#fbbf24', // titánico
};

interface Palette { a: string; b: string; eye: string }
const PALETTE: Record<string, Palette> = {
  hidra: { a: '#5eead4', b: '#0d4f4a', eye: '#fde047' },
  medusa: { a: '#bef264', b: '#24501a', eye: '#ecfeff' },
  minotauro: { a: '#e0a872', b: '#4f2a10', eye: '#ff3d3d' },
  cerbero: { a: '#8b8ba3', b: '#17171f', eye: '#ff7a2d' },
  caronte: { a: '#7c8aa5', b: '#0e1424', eye: '#7dd3fc' },
  hades: { a: '#e8e6f0', b: '#3d3a52', eye: '#38bdf8' },
  esfinge: { a: '#fcd34d', b: '#7a3a0c', eye: '#22d3ee' },
  quimera: { a: '#fb923c', b: '#6b230d', eye: '#fde047' },
  talos: { a: '#f5b041', b: '#5c2c08', eye: '#ff5a2d' },
  polifemo: { a: '#d4b090', b: '#43291b', eye: '#ff3d3d' },
  sirenas: { a: '#67e8f9', b: '#0f4a5e', eye: '#f0abfc' },
  escila: { a: '#5ab8f5', b: '#0a2442', eye: '#a3e635' },
  caos: { a: '#d8a8ff', b: '#2a0d5e', eye: '#ff8ad8' },
  cronos: { a: '#fde68a', b: '#6b4a0c', eye: '#fbbf24' },
  tifon: { a: '#a7b4c8', b: '#18202f', eye: '#fde047' },
  custom: { a: '#ff8ab0', b: '#3a0f2a', eye: '#ffffff' },
};

/** Colores con que se pinta la criatura: cuerpo (degradado), sombra, ojos y contorno. */
interface Ink { body: string; dark: string; light: string; eye: string; line: string; fire: string }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Serpiente ondulada de (x0,y0) a (x1,y1): devuelve el trazo. */
function wave(x0: number, y0: number, x1: number, y1: number, amp: number, waves = 1.5, steps = 14): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${r1(x0)} ${r1(y0)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * Math.PI * 2 * waves) * amp * (1 - t * 0.4);
    d += ` L${r1(x0 + dx * t + nx * off)} ${r1(y0 + dy * t + ny * off)}`;
  }
  return d;
}

/** Espiral de Arquímedes centrada en (cx,cy). */
function spiral(cx: number, cy: number, r0: number, r1max: number, turns: number, start = 0, steps = 60): string {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const r = r0 + (r1max - r0) * t;
    d += `${i ? ' L' : 'M'}${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`;
  }
  return d;
}

/** Estrella de n puntas (melena de león, coronas…). */
function star(cx: number, cy: number, n: number, ro: number, ri: number, rot = -Math.PI / 2): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? ri : ro;
    d += `${i ? ' L' : 'M'}${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`;
  }
  return d + ' Z';
}

const Eyes = ({ k, pts, r = 2.4 }: { k: Ink; pts: [number, number][]; r?: number }) => (
  <g className="ba-eyes">
    {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={r} fill={k.eye} />)}
  </g>
);

/** Cabeza de víbora apuntando hacia arriba: punta de flecha, lengua bífida y ojos con ceño. */
const SnakeHead = ({ k, x, y, rot = 0, s = 1 }: { k: Ink; x: number; y: number; rot?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path d="M0 -15 L0 -21 L-2.5 -25 M0 -21 L2.5 -25" stroke="#ef4444" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M0 -15 Q3 -15 9 -6 Q13 2 9 8 Q5 11 0 10 Q-5 11 -9 8 Q-13 2 -9 -6 Q-3 -15 0 -15 Z" fill={k.body} stroke={k.line} strokeWidth="1" />
    <path d="M-8 -5 L-2 -2 M8 -5 L2 -2" stroke={k.dark} strokeWidth="1.8" strokeLinecap="round" />
    <Eyes k={k} pts={[[-4.5, 0], [4.5, 0]]} r={1.9} />
    <path d="M-1.5 -10 L-1 -8 M1.5 -10 L1 -8" stroke={k.dark} strokeWidth="1" />
  </g>
);

const DogHead = ({ k, x, y, rot = 0, s = 1 }: { k: Ink; x: number; y: number; rot?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path d="M-15 -20 L-7 -9 L7 -9 L15 -20 L16 2 Q14 14 6 20 L0 22 L-6 20 Q-14 14 -16 2 Z" fill={k.body} stroke={k.line} strokeWidth="1.1" />
    <path d="M-12 -15 L-8 -9 M12 -15 L8 -9" stroke={k.dark} strokeWidth="2" />
    <path d="M-9 -2 L-2 1 M9 -2 L2 1" stroke={k.dark} strokeWidth="2.4" strokeLinecap="round" />
    <Eyes k={k} pts={[[-6, 3], [6, 3]]} r={2.1} />
    <path d="M-6 12 Q0 18 6 12 L4 18 L0 22 L-4 18 Z" fill={k.dark} />
    <path d="M-4 13 L-3 17 L-2 13 M2 13 L3 17 L4 13" fill="#fff" />
    <ellipse cx="0" cy="10" rx="3" ry="2" fill={k.dark} />
  </g>
);

const DRAW: Record<string, (k: Ink) => ReactNode> = {
  hidra: (k) => (
    <>
      <ellipse cx="60" cy="102" rx="34" ry="12" fill={k.dark} />
      {[wave(48, 100, 26, 52, 5, 1), wave(72, 100, 94, 52, 5, 1), wave(60, 100, 60, 36, 6, 1.2)].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke={k.dark} strokeWidth="14" strokeLinecap="round" />
          <path d={d} fill="none" stroke={k.body} strokeWidth="10" strokeLinecap="round" />
          <path d={d} fill="none" stroke={k.light} strokeOpacity="0.35" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M40 92 Q60 84 80 92" stroke={k.light} strokeWidth="1.5" fill="none" opacity="0.5" strokeDasharray="2 3" />
      <SnakeHead k={k} x={26} y={48} rot={-14} s={1.05} />
      <SnakeHead k={k} x={94} y={48} rot={14} s={1.05} />
      <SnakeHead k={k} x={60} y={30} s={1.25} />
    </>
  ),
  medusa: (k) => {
    const snakes = Array.from({ length: 9 }, (_, i) => {
      const a = (-180 + 22.5 * i) * (Math.PI / 180);
      return { x0: 60 + Math.cos(a) * 16, y0: 54 + Math.sin(a) * 16, x1: 60 + Math.cos(a) * 44, y1: 54 + Math.sin(a) * 40, a };
    });
    return (
      <>
        {snakes.map((n, i) => (
          <g key={i}>
            <path d={wave(n.x0, n.y0, n.x1, n.y1, 4, 1.25, 12)} fill="none" stroke={k.dark} strokeWidth="6.5" strokeLinecap="round" />
            <path d={wave(n.x0, n.y0, n.x1, n.y1, 4, 1.25, 12)} fill="none" stroke={k.body} strokeWidth="4" strokeLinecap="round" />
            <circle cx={n.x1} cy={n.y1} r="3.6" fill={k.body} stroke={k.dark} strokeWidth="1" />
            <circle cx={n.x1 + Math.cos(n.a) * 1.2} cy={n.y1 + Math.sin(n.a) * 1.2} r="0.9" fill={k.eye} className="ba-eyes" />
          </g>
        ))}
        <path d="M44 56 Q44 38 60 38 Q76 38 76 56 Q76 74 66 82 Q60 86 54 82 Q44 74 44 56 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
        <path d="M48 52 Q53 47 58 52 M62 52 Q67 47 72 52" stroke={k.dark} strokeWidth="2" fill="none" />
        <Eyes k={k} pts={[[53, 57], [67, 57]]} r={3} />
        <path d="M53 57 L49 59 M67 57 L71 59" stroke={k.eye} strokeWidth="1" className="ba-eyes" />
        <path d="M55 72 Q60 75 65 72" stroke={k.dark} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M60 60 L58 67 L61 67" stroke={k.dark} strokeWidth="1.2" fill="none" />
        <path d="M46 96 Q60 84 74 96 L78 112 L42 112 Z" fill={k.dark} />
      </>
    );
  },
  minotauro: (k) => (
    <>
      <path d="M44 50 Q24 50 14 28 Q20 30 26 36 Q34 44 46 42 Z" fill={k.light} stroke={k.line} strokeWidth="1" />
      <path d="M76 50 Q96 50 106 28 Q100 30 94 36 Q86 44 74 42 Z" fill={k.light} stroke={k.line} strokeWidth="1" />
      <path d="M40 56 Q28 52 26 60 Q32 66 42 64 Z M80 56 Q92 52 94 60 Q88 66 78 64 Z" fill={k.dark} />
      <path d="M42 46 Q60 34 78 46 L80 72 Q76 98 60 102 Q44 98 40 72 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M50 44 Q60 50 70 44 Q64 40 60 46 Q56 40 50 44 Z" fill={k.dark} />
      <path d="M47 60 L57 64 M73 60 L63 64" stroke={k.dark} strokeWidth="3" strokeLinecap="round" />
      <Eyes k={k} pts={[[53, 66], [67, 66]]} r={2.6} />
      <ellipse cx="60" cy="88" rx="13" ry="9" fill={k.light} opacity="0.9" />
      <ellipse cx="55" cy="88" rx="2.2" ry="3" fill={k.dark} />
      <ellipse cx="65" cy="88" rx="2.2" ry="3" fill={k.dark} />
      <circle cx="60" cy="96" r="5.5" fill="none" stroke="#fcd34d" strokeWidth="2.2" />
      <path d="M48 76 Q46 80 50 82 M72 76 Q74 80 70 82" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
    </>
  ),
  cerbero: (k) => {
    const head = (x: number, y: number, rot: number, sc: number) => <DogHead k={k} x={x} y={y} rot={rot} s={sc} />;
    return (
      <>
        <path d="M14 112 Q22 78 60 74 Q98 78 106 112 Z" fill={k.dark} />
        <path d="M30 96 L36 90 L42 96 L48 90 L54 96 L60 90 L66 96 L72 90 L78 96 L84 90 L90 96" fill="none" stroke={k.fire} strokeWidth="2" opacity="0.8" />
        {head(31, 66, -22, 0.95)}
        {head(89, 66, 22, 0.95)}
        {head(60, 52, 0, 1.2)}
      </>
    );
  },
  caronte: (k) => (
    <>
      <path d="M88 26 L64 112" stroke="#8b6b4a" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 24 Q86 28 86 62 L92 96 L28 96 L34 62 Q34 28 60 24 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M60 30 Q78 34 78 58 Q72 74 60 74 Q48 74 42 58 Q42 34 60 30 Z" fill="#020205" />
      <Eyes k={k} pts={[[53, 55], [67, 55]]} r={2.4} />
      <path d="M44 70 Q38 84 42 96 M76 70 Q82 84 78 96" stroke={k.dark} strokeWidth="2" fill="none" />
      <path d="M32 40 L32 50" stroke="#8b6b4a" strokeWidth="1.5" />
      <rect x="27" y="50" width="10" height="12" rx="2" fill={k.eye} opacity="0.9" className="ba-eyes" />
      <rect x="27" y="50" width="10" height="12" rx="2" fill="none" stroke={k.dark} strokeWidth="1.2" />
      <path d="M14 92 Q60 116 106 92 L98 104 Q60 120 22 104 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M10 108 Q20 104 30 108 T50 108 M70 110 Q80 106 90 110 T110 110" stroke={k.eye} strokeOpacity="0.45" strokeWidth="1.4" fill="none" />
    </>
  ),
  hades: (k) => (
    <>
      <path d="M34 50 Q30 32 40 22 Q42 34 48 36 Q46 18 58 8 Q60 24 66 30 Q70 18 80 16 Q78 28 84 34 Q90 30 90 22 Q94 38 86 50 Z" fill={k.fire} opacity="0.95" />
      <path d="M42 50 Q42 36 50 30 Q52 40 58 42 Q60 28 68 22 Q68 36 74 40 Q80 36 80 30 Q84 42 78 50 Z" fill="#e0f2fe" opacity="0.55" />
      <path d="M38 52 Q38 34 60 34 Q82 34 82 52 L82 68 Q82 76 74 78 L72 90 L48 90 L46 78 Q38 76 38 68 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M38 50 L44 44 L50 50 L56 42 L60 48 L64 42 L70 50 L76 44 L82 50" fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="50" cy="62" rx="7" ry="8" fill="#05050a" />
      <ellipse cx="70" cy="62" rx="7" ry="8" fill="#05050a" />
      <Eyes k={k} pts={[[50, 63], [70, 63]]} r={2.6} />
      <path d="M60 68 L56 76 L64 76 Z" fill="#05050a" />
      <path d="M50 82 L70 82 M54 79 L54 88 M60 79 L60 89 M66 79 L66 88" stroke="#05050a" strokeWidth="1.6" />
      <path d="M100 30 L100 112 M94 30 L94 40 Q100 46 106 40 L106 30" stroke="#94a3b8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  esfinge: (k) => (
    <>
      <path d="M30 70 Q8 56 10 26 Q22 44 36 50 Z M90 70 Q112 56 110 26 Q98 44 84 50 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M14 34 L28 50 M18 46 L30 56 M106 34 L92 50 M102 46 L90 56" stroke={k.light} strokeOpacity="0.5" strokeWidth="1.2" />
      <path d="M60 20 Q86 22 90 50 L98 96 L80 88 L78 62 Q60 70 42 62 L40 88 L22 96 L30 50 Q34 22 60 20 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      {[30, 38, 46].map((y) => (
        <path key={y} d={`M${34 - (y - 30) * 0.1} ${y + 6} Q60 ${y - 4} ${86 + (y - 30) * 0.1} ${y + 6}`} stroke={k.dark} strokeOpacity="0.55" strokeWidth="2.5" fill="none" />
      ))}
      <path d="M26 66 L40 70 M24 76 L40 78 M22 86 L40 86 M94 66 L80 70 M96 76 L80 78 M98 86 L80 86" stroke={k.dark} strokeOpacity="0.55" strokeWidth="2.5" />
      <path d="M46 48 Q60 42 74 48 L72 74 Q66 86 60 86 Q54 86 48 74 Z" fill="#c98a3c" stroke={k.line} strokeWidth="1" />
      <path d="M48 58 L56 58 L58 60 M72 58 L64 58 L62 60" stroke="#0b0b10" strokeWidth="2" fill="none" strokeLinecap="round" />
      <Eyes k={k} pts={[[53, 60], [67, 60]]} r={2.1} />
      <path d="M60 62 L58 70 L62 70" stroke="#7a3a0c" strokeWidth="1.2" fill="none" />
      <path d="M55 77 Q60 79 65 77" stroke="#7a3a0c" strokeWidth="1.6" fill="none" />
      <path d="M56 86 L64 86 L62 100 L58 100 Z" fill="#3b82f6" opacity="0.8" />
    </>
  ),
  quimera: (k) => (
    <>
      <path d={wave(86, 100, 100, 44, 6, 1, 14)} fill="none" stroke="#3f6212" strokeWidth="8" strokeLinecap="round" />
      <path d={wave(86, 100, 100, 44, 6, 1, 14)} fill="none" stroke="#84cc16" strokeWidth="5" strokeLinecap="round" />
      <SnakeHead k={{ ...k, body: '#84cc16', line: '#1a2e05' }} x={100} y={40} rot={10} s={0.85} />
      <g transform="translate(26 50) rotate(-14)">
        <path d="M-2 -10 Q-16 -26 -6 -34 Q-2 -26 2 -20" fill="none" stroke="#e7e5e4" strokeWidth="4" strokeLinecap="round" />
        <path d="M-9 -10 Q-10 4 0 14 Q10 4 9 -10 Q0 -16 -9 -10 Z" fill="#a8a29e" stroke="#292524" strokeWidth="1" />
        <path d="M-2 14 L0 22 L2 14" fill="#e7e5e4" />
        <Eyes k={k} pts={[[-4, -2], [4, -2]]} r={1.6} />
      </g>
      <path d={star(60, 62, 16, 34, 24)} fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d={star(60, 62, 16, 28, 20, -Math.PI / 2 + 0.2)} fill={k.fire} opacity="0.8" />
      <circle cx="60" cy="62" r="18" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M50 54 L57 57 M70 54 L63 57" stroke={k.dark} strokeWidth="2.2" strokeLinecap="round" />
      <Eyes k={k} pts={[[54, 60], [66, 60]]} r={2.3} />
      <path d="M54 70 Q60 66 66 70 L64 76 Q60 80 56 76 Z" fill="#1c0a04" />
      <path d="M52 78 Q60 102 68 78 Q66 92 60 104 Q54 92 52 78 Z" fill="#fde047" opacity="0.9" className="ba-fire" />
      <path d="M56 80 Q60 92 64 80 Q62 88 60 94 Q58 88 56 80 Z" fill="#fff7ed" />
    </>
  ),
  talos: (k) => (
    <>
      <path d="M14 112 Q16 82 42 76 L78 76 Q104 82 106 112 Z" fill={k.dark} stroke={k.line} strokeWidth="1.2" />
      <path d="M24 92 Q40 86 52 92 M68 92 Q80 86 96 92" stroke={k.light} strokeOpacity="0.4" strokeWidth="2" fill="none" />
      <rect x="52" y="66" width="16" height="12" fill={k.dark} />
      <path d="M40 40 Q40 18 60 18 Q80 18 80 40 L82 66 Q72 74 60 74 Q48 74 38 66 Z" fill={k.body} stroke={k.line} strokeWidth="1.3" />
      <path d="M56 6 Q60 2 64 6 L66 20 L54 20 Z" fill="#dc2626" />
      <path d="M60 18 L60 36" stroke={k.dark} strokeWidth="2" />
      <rect x="44" y="44" width="32" height="7" rx="2" fill="#0b0503" />
      <rect x="46" y="45.5" width="28" height="4" rx="2" fill={k.eye} className="ba-eyes" />
      <path d="M50 58 L70 58 M52 63 L68 63" stroke={k.dark} strokeWidth="2" />
      {[[42, 32], [78, 32], [40, 60], [80, 60], [30, 98], [90, 98]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={k.light} />)}
    </>
  ),
  polifemo: (k) => (
    <>
      <path d="M86 112 L100 30" stroke="#5b3a1e" strokeWidth="9" strokeLinecap="round" />
      <path d="M96 28 L104 30 L100 46 L92 44 Z" fill="#3b2412" />
      <path d="M30 56 Q28 24 60 22 Q92 24 90 56 Q92 90 60 98 Q28 90 30 56 Z" fill={k.body} stroke={k.line} strokeWidth="1.3" />
      <path d="M34 40 Q46 22 60 22 Q74 22 86 40 Q72 30 60 32 Q48 30 34 40 Z" fill={k.dark} />
      <path d="M40 44 Q60 36 80 44" stroke={k.dark} strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="60" cy="54" rx="15" ry="11" fill="#f8fafc" stroke={k.dark} strokeWidth="1.5" />
      <circle cx="60" cy="55" r="7" fill={k.eye} className="ba-eyes" />
      <circle cx="60" cy="55" r="3" fill="#0b0b10" />
      <circle cx="57.5" cy="52.5" r="1.4" fill="#fff" />
      <path d="M56 66 L54 74 L60 75" stroke={k.dark} strokeWidth="1.6" fill="none" />
      <path d="M46 82 Q60 76 74 82 Q68 90 60 90 Q52 90 46 82 Z" fill="#1c0f08" />
      <path d="M50 82 L52 86 L54 81 M64 81 L66 86 L68 82" fill="#f5f5f4" />
      <path d="M26 56 Q20 54 22 62 Q24 68 30 66 M94 56 Q100 54 98 62 Q96 68 90 66" fill={k.body} stroke={k.line} strokeWidth="1" />
    </>
  ),
  sirenas: (k) => (
    <>
      <path d="M60 70 Q38 80 46 98 Q54 112 74 104 Q86 96 80 86" fill="none" stroke={k.dark} strokeWidth="13" strokeLinecap="round" />
      <path d="M60 70 Q38 80 46 98 Q54 112 74 104 Q86 96 80 86" fill="none" stroke={k.body} strokeWidth="9" strokeLinecap="round" />
      <path d="M80 86 Q74 74 86 70 Q84 80 92 84 Q84 86 80 86 Z" fill={k.light} stroke={k.line} strokeWidth="1" />
      <path d="M48 92 L52 90 M54 102 L58 99 M64 105 L67 101" stroke={k.light} strokeOpacity="0.6" strokeWidth="1.4" />
      <path d="M60 22 Q32 22 30 50 Q28 70 18 84 Q40 80 44 62 Q46 72 40 82 Q56 74 58 60 L62 60 Q64 74 80 82 Q74 72 76 62 Q80 80 102 84 Q92 70 90 50 Q88 22 60 22 Z" fill="#a21caf" opacity="0.85" />
      <path d="M48 44 Q48 32 60 32 Q72 32 72 44 Q72 60 60 64 Q48 60 48 44 Z" fill="#fde2e4" stroke={k.line} strokeWidth="1" />
      <path d="M46 40 Q54 28 74 38 Q66 30 58 30 Q48 30 46 40 Z" fill="#86198f" />
      <Eyes k={k} pts={[[55, 46], [65, 46]]} r={2} />
      <path d="M56 55 Q60 58 64 55" stroke="#be123c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M58 64 L56 72 L64 72 L62 64 Z" fill="#fde2e4" />
      <g className="ba-notes" fill={k.eye} stroke={k.eye} strokeWidth="1.4">
        <circle cx="24" cy="38" r="3" /><path d="M27 38 L27 26 L32 28" fill="none" />
        <circle cx="96" cy="30" r="3" /><path d="M99 30 L99 18 L104 20" fill="none" />
        <circle cx="102" cy="52" r="2.4" /><path d="M104.4 52 L104.4 43" fill="none" />
      </g>
    </>
  ),
  escila: (k) => (
    <>
      <path d={spiral(46, 92, 2, 34, 2.3, 0.5)} fill="none" stroke={k.dark} strokeWidth="7" strokeLinecap="round" />
      <path d={spiral(46, 92, 2, 34, 2.3, 0.5)} fill="none" stroke={k.body} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="46" cy="92" r="4" fill="#020205" />
      {[
        [80, 104, 64, 34, -10], [86, 104, 92, 30, 12], [92, 106, 106, 58, 30],
      ].map(([x0, y0, x1, y1, rot], i) => {
        const d = wave(x0, y0, x1, y1, 4, 1, 12);
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="#14532d" strokeWidth="8.5" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#4ade80" strokeWidth="5.5" strokeLinecap="round" />
            <SnakeHead k={{ ...k, body: '#4ade80', line: '#14532d', dark: '#14532d' }} x={x1} y={y1} rot={rot} s={0.95} />
          </g>
        );
      })}
      <path d="M8 70 Q20 64 30 70 T52 70 M64 64 Q72 60 80 64" stroke={k.light} strokeOpacity="0.5" strokeWidth="1.6" fill="none" />
    </>
  ),
  caos: (k) => (
    <>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={spiral(60, 60, 4, 50, 0.85, (i * Math.PI) / 2, 30)} fill="none" stroke={i % 2 ? k.fire : k.body} strokeWidth={i % 2 ? 4 : 7} strokeLinecap="round" opacity={i % 2 ? 0.75 : 0.95} />
      ))}
      <circle cx="60" cy="60" r="13" fill="#010003" stroke={k.light} strokeWidth="1.5" />
      <circle cx="60" cy="60" r="17" fill="none" stroke={k.eye} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 4" />
      <ellipse cx="60" cy="60" rx="7" ry="3.2" fill={k.eye} className="ba-eyes" />
      <ellipse cx="60" cy="60" rx="1.6" ry="3.2" fill="#010003" />
      <Eyes k={k} pts={[[30, 36], [92, 44], [86, 88], [32, 84]]} r={1.6} />
      {[[20, 56], [100, 66], [56, 18], [66, 102], [40, 22], [96, 26]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" fill="#fff" opacity="0.8" />)}
    </>
  ),
  cronos: (k) => (
    <>
      <path d="M22 108 Q12 44 62 16 Q34 40 34 104 Z" fill="#cbd5e1" stroke="#334155" strokeWidth="1.2" />
      <path d="M26 104 L36 118" stroke="#6b4a2a" strokeWidth="5" strokeLinecap="round" />
      <rect x="38" y="22" width="44" height="7" rx="2" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <rect x="38" y="91" width="44" height="7" rx="2" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M41 29 L41 91 M79 29 L79 91" stroke={k.dark} strokeWidth="3" />
      <path d="M46 29 L74 29 Q74 48 62 60 Q74 72 74 91 L46 91 Q46 72 58 60 Q46 48 46 29 Z" fill="rgba(186,230,253,0.18)" stroke="#e0f2fe" strokeWidth="1.4" />
      <path d="M51 40 L69 40 Q66 50 60 56 Q54 50 51 40 Z" fill={k.body} />
      <path d="M60 58 L60 82" stroke={k.body} strokeWidth="1.5" strokeDasharray="1.5 2" className="ba-sand" />
      <path d="M48 91 Q60 74 72 91 Z" fill={k.body} />
      <Eyes k={k} pts={[[54, 34], [66, 34]]} r={1.8} />
      <circle cx="96" cy="40" r="11" fill="none" stroke={k.light} strokeWidth="1.4" opacity="0.7" />
      <path d="M96 33 L96 40 L101 43" stroke={k.light} strokeWidth="1.4" fill="none" opacity="0.7" />
    </>
  ),
  tifon: (k) => (
    <>
      <path d="M16 28 Q60 14 104 28 Q98 48 80 56 Q74 76 62 106 Q56 78 42 58 Q22 48 16 28 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      {[38, 52, 68, 84].map((y, i) => (
        <path key={y} d={`M${26 + i * 9} ${y} Q60 ${y + 8 - i} ${94 - i * 9} ${y - 2}`} stroke={k.dark} strokeWidth="2.4" fill="none" opacity="0.7" />
      ))}
      {[[26, 26, -30], [46, 18, -10], [74, 18, 10], [94, 26, 30]].map(([x, y, rot], i) => (
        <g key={i}>
          <path d={wave(x * 0.6 + 24, 30, x, y, 2.5, 1, 8)} stroke={k.dark} strokeWidth="5" fill="none" strokeLinecap="round" />
          <SnakeHead k={{ ...k, body: '#64748b' }} x={x} y={y - 4} rot={rot} s={0.6} />
        </g>
      ))}
      <path d="M44 40 L56 46 M76 40 L64 46" stroke="#05070c" strokeWidth="3" strokeLinecap="round" />
      <Eyes k={k} pts={[[50, 48], [70, 48]]} r={3} />
      <path d="M50 60 Q60 54 70 60 Q66 68 60 68 Q54 68 50 60 Z" fill="#05070c" />
      <path d="M12 60 L22 72 L16 74 L26 90" stroke="#fde047" strokeWidth="2.6" fill="none" strokeLinejoin="round" className="ba-bolt" />
      <path d="M104 52 L96 66 L102 68 L92 84" stroke="#fde047" strokeWidth="2.6" fill="none" strokeLinejoin="round" className="ba-bolt" />
    </>
  ),
};

// ---------- Cuerpo entero (lienzo 120 × 170, suelo en y = 158) ----------

const WOOD = '#6b4a2b';
const STEEL = '#cbd5e1';
const GOLD = '#fbbf24';

/** Trazo grueso con contorno: cuellos, colas, brazos. */
const Tube = ({ d, k, w, color }: { d: string; k: Ink; w: number; color?: string }) => (
  <>
    <path d={d} fill="none" stroke={k.dark} strokeWidth={w + 3} strokeLinecap="round" strokeLinejoin="round" />
    <path d={d} fill="none" stroke={color ?? k.body} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/** Pierna con pie: de la cadera (x, top) al suelo. */
const Leg = ({ k, x, top, w = 12, dir = 1, fill }: { k: Ink; x: number; top: number; w?: number; dir?: number; fill?: string }) => (
  <path
    d={`M${x - w / 2} ${top} L${x - w / 2 + dir * 1} 150 L${x - w / 2 - (dir > 0 ? 4 : -2)} 158 L${x + w / 2 + (dir > 0 ? 2 : 4)} 158 L${x + w / 2} ${top} Z`}
    fill={fill ?? k.body} stroke={k.line} strokeWidth="1.1" strokeLinejoin="round"
  />
);

const Waves = ({ k, y }: { k: Ink; y: number }) => (
  <path d={`M0 ${y} Q10 ${y - 5} 20 ${y} T40 ${y} T60 ${y} T80 ${y} T100 ${y} T120 ${y} L120 170 L0 170 Z`} fill={k.dark} opacity="0.85" />
);

const FIGURES: Record<string, (k: Ink) => ReactNode> = {
  hidra: (k) => (
    <>
      <Tube d={wave(92, 146, 116, 118, 5, 1, 12)} k={k} w={8} />
      {[34, 50, 70, 86].map((x) => <Leg key={x} k={k} x={x} top={138} w={10} dir={x < 60 ? -1 : 1} fill={k.dark} />)}
      <path d="M18 150 Q16 116 60 110 Q104 116 102 150 Q60 162 18 150 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M34 148 Q60 126 86 148" stroke={k.light} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3 3" fill="none" />
      {[[38, 122, 14, 70, -30, 0.95], [48, 116, 30, 46, -16, 1], [60, 114, 60, 30, 0, 1.3], [72, 116, 90, 46, 16, 1], [82, 122, 106, 70, 30, 0.95]].map(([x0, y0, x1, y1, rot, sc], i) => (
        <g key={i}>
          <Tube d={wave(x0, y0, x1, y1 + 10, 4, 1, 12)} k={k} w={i === 2 ? 10 : 8} />
          <SnakeHead k={k} x={x1} y={y1} rot={rot} s={sc} />
        </g>
      ))}
    </>
  ),
  medusa: (k) => {
    const snakes = Array.from({ length: 9 }, (_, i) => {
      const a = (-180 + 22.5 * i) * (Math.PI / 180);
      return { x0: 60 + Math.cos(a) * 10, y0: 40 + Math.sin(a) * 10, x1: 60 + Math.cos(a) * 28, y1: 40 + Math.sin(a) * 26, a };
    });
    return (
      <>
        <Tube d="M60 98 Q38 116 46 138 Q56 158 86 152 Q106 146 100 130 Q96 120 108 116" k={k} w={15} />
        <path d="M50 132 L54 130 M62 146 L66 143 M80 150 L83 146 M96 136 L100 134" stroke={k.light} strokeOpacity="0.6" strokeWidth="1.4" />
        <Tube d="M48 68 Q36 82 32 98" k={k} w={6} />
        <Tube d="M72 68 Q86 70 92 56" k={k} w={6} />
        <path d="M86 44 Q100 56 92 74" stroke={WOOD} strokeWidth="2.4" fill="none" />
        <path d="M89 46 L91 72" stroke="#e5e7eb" strokeWidth="0.8" />
        <path d="M48 62 Q60 56 72 62 L74 96 Q60 104 46 96 Z" fill={k.body} stroke={k.line} strokeWidth="1.1" />
        <path d="M47 76 Q60 82 73 76 L74 86 Q60 92 46 86 Z" fill={k.dark} />
        {snakes.map((n, i) => (
          <g key={i}>
            <Tube d={wave(n.x0, n.y0, n.x1, n.y1, 3, 1.25, 10)} k={k} w={3.4} />
            <circle cx={n.x1} cy={n.y1} r="3" fill={k.body} stroke={k.dark} strokeWidth="1" />
            <circle cx={n.x1 + Math.cos(n.a)} cy={n.y1 + Math.sin(n.a)} r="0.8" fill={k.eye} className="ba-eyes" />
          </g>
        ))}
        <path d="M50 42 Q50 30 60 30 Q70 30 70 42 Q70 54 60 58 Q50 54 50 42 Z" fill={k.body} stroke={k.line} strokeWidth="1.1" />
        <path d="M52 39 Q55.5 36 59 39 M61 39 Q64.5 36 68 39" stroke={k.dark} strokeWidth="1.6" fill="none" />
        <Eyes k={k} pts={[[55.5, 43], [64.5, 43]]} r={2.2} />
        <path d="M56 52 Q60 54 64 52" stroke={k.dark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>
    );
  },
  minotauro: (k) => (
    <>
      <path d="M101 14 L94 130" stroke={WOOD} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M100 26 Q118 12 117 36 Q113 46 99 40 Z M100 26 Q84 12 84 34 Q88 44 99 40 Z" fill={STEEL} stroke={k.line} strokeWidth="1" />
      <Leg k={k} x={48} top={112} w={14} dir={-1} />
      <Leg k={k} x={72} top={112} w={14} />
      <path d="M34 152 L54 152 L56 158 L34 158 Z M66 152 L86 152 L86 158 L64 158 Z" fill={k.dark} />
      <Tube d="M38 62 Q24 78 26 104" k={k} w={10} />
      <Tube d="M82 62 Q96 64 98 44" k={k} w={10} />
      <path d="M38 58 Q60 50 82 58 L86 80 Q80 104 60 108 Q40 104 34 80 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M46 70 Q53 76 60 70 Q67 76 74 70 M52 86 L68 86 M53 94 L67 94" stroke={k.dark} strokeOpacity="0.55" strokeWidth="1.6" fill="none" />
      <path d="M42 102 L78 102 L74 124 L60 118 L46 124 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M48 32 Q34 32 26 16 Q36 20 46 26 Z M72 32 Q86 32 94 16 Q84 20 74 26 Z" fill={k.light} stroke={k.line} strokeWidth="1" />
      <path d="M48 28 Q60 20 72 28 L74 46 Q70 60 60 62 Q50 60 46 46 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M50 38 L57 41 M70 38 L63 41" stroke={k.dark} strokeWidth="2.4" strokeLinecap="round" />
      <Eyes k={k} pts={[[54, 43], [66, 43]]} r={2.1} />
      <ellipse cx="60" cy="54" rx="9" ry="6" fill={k.light} />
      <ellipse cx="56.5" cy="54" rx="1.6" ry="2.2" fill={k.dark} />
      <ellipse cx="63.5" cy="54" rx="1.6" ry="2.2" fill={k.dark} />
      <circle cx="60" cy="60" r="3.6" fill="none" stroke={GOLD} strokeWidth="1.6" />
    </>
  ),
  cerbero: (k) => (
    <>
      <Tube d={wave(90, 112, 112, 70, 4, 1, 10)} k={k} w={4} color="#84cc16" />
      <SnakeHead k={{ ...k, body: '#84cc16' }} x={112} y={64} rot={14} s={0.6} />
      <Leg k={k} x={36} top={114} w={11} dir={-1} fill={k.dark} />
      <Leg k={k} x={84} top={114} w={11} fill={k.dark} />
      <ellipse cx="60" cy="112" rx="36" ry="22" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M36 104 Q60 96 84 104" stroke={k.light} strokeOpacity="0.35" strokeWidth="2" fill="none" />
      <Leg k={k} x={47} top={118} w={13} dir={-1} />
      <Leg k={k} x={73} top={118} w={13} />
      <path d="M38 156 L40 152 M44 156 L45 152 M76 156 L75 152 M82 156 L80 152" stroke={k.dark} strokeWidth="1.4" />
      <path d="M30 94 L36 88 L42 94 L48 88 L54 94 L60 88 L66 94 L72 88 L78 94 L84 88 L90 94" fill="none" stroke={k.fire} strokeWidth="2.4" />
      <DogHead k={k} x={28} y={76} rot={-24} s={0.85} />
      <DogHead k={k} x={92} y={76} rot={24} s={0.85} />
      <DogHead k={k} x={60} y={62} s={1.05} />
    </>
  ),
  caronte: (k) => (
    <>
      <path d="M94 12 L70 166" stroke={WOOD} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 26 Q86 30 86 68 L94 140 L26 140 L34 68 Q34 30 60 26 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M46 80 Q42 110 40 138 M74 80 Q78 110 80 138 M60 78 L60 138" stroke={k.dark} strokeWidth="1.6" fill="none" opacity="0.7" />
      <path d="M60 32 Q76 36 76 56 Q70 70 60 70 Q50 70 44 56 Q44 36 60 32 Z" fill="#020205" />
      <Eyes k={k} pts={[[54, 52], [66, 52]]} r={2.2} />
      <Tube d="M80 72 Q90 80 84 94" k={k} w={8} />
      <Tube d="M40 72 Q30 80 32 90" k={k} w={8} />
      <path d="M32 90 L32 98" stroke={WOOD} strokeWidth="1.4" />
      <rect x="27" y="98" width="10" height="12" rx="2" fill={k.eye} opacity="0.9" className="ba-eyes" />
      <rect x="27" y="98" width="10" height="12" rx="2" fill="none" stroke={k.dark} strokeWidth="1.2" />
      <path d="M8 138 Q60 160 112 138 L104 152 Q60 168 16 152 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M2 162 Q12 158 22 162 T42 162 M78 164 Q88 160 98 164 T118 164" stroke={k.eye} strokeOpacity="0.45" strokeWidth="1.4" fill="none" />
    </>
  ),
  hades: (k) => (
    <>
      <path d="M30 58 Q12 110 18 156 L102 156 Q108 110 90 58 Z" fill={k.dark} />
      <path d="M100 16 L96 160 M94 16 L94 28 Q100 34 106 28 L106 16" stroke="#94a3b8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M42 60 Q60 54 78 60 L88 156 L32 156 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M38 100 L82 100" stroke={GOLD} strokeWidth="2.4" />
      <path d="M48 104 L44 154 M60 104 L60 154 M72 104 L76 154" stroke={k.dark} strokeWidth="1.4" opacity="0.6" />
      <Tube d="M78 64 Q92 72 95 86" k={k} w={8} />
      <Tube d="M42 64 Q30 80 32 98" k={k} w={8} />
      <circle cx="32" cy="104" r="6" fill={k.fire} className="ba-fire" />
      <g transform="translate(23 2) scale(0.6)">
        <path d="M34 50 Q30 32 40 22 Q42 34 48 36 Q46 18 58 8 Q60 24 66 30 Q70 18 80 16 Q78 28 84 34 Q90 30 90 22 Q94 38 86 50 Z" fill={k.fire} opacity="0.95" />
        <path d="M38 52 Q38 34 60 34 Q82 34 82 52 L82 68 Q82 76 74 78 L72 90 L48 90 L46 78 Q38 76 38 68 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
        <path d="M38 50 L44 44 L50 50 L56 42 L60 48 L64 42 L70 50 L76 44 L82 50" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinejoin="round" />
        <ellipse cx="50" cy="62" rx="7" ry="8" fill="#05050a" />
        <ellipse cx="70" cy="62" rx="7" ry="8" fill="#05050a" />
        <Eyes k={k} pts={[[50, 63], [70, 63]]} r={2.6} />
        <path d="M60 68 L56 76 L64 76 Z" fill="#05050a" />
        <path d="M50 82 L70 82 M54 79 L54 88 M60 79 L60 89 M66 79 L66 88" stroke="#05050a" strokeWidth="1.6" />
      </g>
    </>
  ),
  esfinge: (k) => (
    <>
      <Tube d="M104 132 Q120 120 112 100" k={k} w={3} />
      <circle cx="112" cy="98" r="3.4" fill={k.dark} />
      <path d="M62 110 Q70 62 112 52 Q102 70 106 76 Q96 78 98 90 Q88 92 86 106 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M74 98 L104 62 M80 100 L100 80 M86 104 L96 92" stroke={k.light} strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M30 128 Q34 104 64 104 Q100 102 106 126 Q108 148 96 152 L40 152 Q28 146 30 128 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <ellipse cx="92" cy="134" rx="13" ry="14" fill={k.light} opacity="0.25" />
      <path d="M40 144 L8 146 Q4 152 10 156 L44 156 Z M52 148 L22 150 Q18 156 24 158 L56 158 Z" fill={k.body} stroke={k.line} strokeWidth="1" />
      <path d="M12 150 L12 154 M16 150 L16 154 M26 154 L26 157" stroke={k.dark} strokeWidth="1" />
      <path d="M18 70 Q34 54 50 70 L54 108 L44 102 L24 102 L14 108 Z" fill={GOLD} stroke={k.line} strokeWidth="1" />
      {[78, 86, 94].map((y) => <path key={y} d={`M${17 - (y - 78) * 0.1} ${y} L24 ${y} M44 ${y} L${51 + (y - 78) * 0.1} ${y}`} stroke="#1e3a8a" strokeWidth="2.4" />)}
      <path d="M24 74 Q34 66 44 74 L44 90 Q34 100 24 90 Z" fill="#c98a3c" stroke={k.line} strokeWidth="1" />
      <path d="M26 80 L32 80 M42 80 L36 80" stroke="#0b0b10" strokeWidth="1.6" strokeLinecap="round" />
      <Eyes k={k} pts={[[29.5, 82], [38.5, 82]]} r={1.6} />
      <path d="M31 92 Q34 94 37 92" stroke="#7a3a0c" strokeWidth="1.3" fill="none" />
      <path d="M31 98 L37 98 L36 108 L32 108 Z" fill="#3b82f6" />
    </>
  ),
  quimera: (k) => (
    <>
      <Tube d={wave(102, 110, 114, 70, 5, 1, 12)} k={{ ...k, dark: '#3f6212' }} w={4.5} color="#84cc16" />
      <SnakeHead k={{ ...k, body: '#84cc16', line: '#1a2e05' }} x={114} y={64} rot={10} s={0.7} />
      <Leg k={k} x={84} top={118} w={10} fill={k.dark} />
      <Leg k={k} x={40} top={118} w={10} dir={-1} fill={k.dark} />
      <path d="M26 104 Q40 92 70 94 Q100 92 106 108 Q106 128 92 130 L36 130 Q22 124 26 104 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <Leg k={k} x={94} top={120} w={11} />
      <Leg k={k} x={50} top={120} w={11} dir={-1} />
      <path d="M62 112 Q72 64 104 56 Q96 74 100 80 Q90 82 90 94 Z" fill={k.dark} opacity="0.9" />
      <Tube d="M76 98 L80 82" k={k} w={6} color="#a8a29e" />
      <g transform="translate(80 72) rotate(10)">
        <path d="M-2 -8 Q-14 -22 -4 -28 Q0 -22 3 -16" fill="none" stroke="#e7e5e4" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M-7 -8 Q-8 3 0 11 Q8 3 7 -8 Q0 -13 -7 -8 Z" fill="#a8a29e" stroke="#292524" strokeWidth="1" />
        <Eyes k={k} pts={[[-3, -2], [3, -2]]} r={1.3} />
      </g>
      <path d={star(28, 88, 14, 24, 16)} fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d={star(28, 88, 14, 19, 13, -Math.PI / 2 + 0.2)} fill={k.fire} opacity="0.85" />
      <circle cx="28" cy="88" r="12" fill={k.body} stroke={k.line} strokeWidth="1.1" />
      <path d="M21 83 L26 85 M35 83 L30 85" stroke={k.dark} strokeWidth="1.8" strokeLinecap="round" />
      <Eyes k={k} pts={[[24, 87], [32, 87]]} r={1.7} />
      <path d="M23 94 Q28 91 33 94 L31 98 Q28 100 25 98 Z" fill="#1c0a04" />
      <path d="M22 96 Q8 92 0 100 Q8 102 2 112 Q14 106 24 100 Z" fill="#fde047" opacity="0.9" className="ba-fire" />
    </>
  ),
  talos: (k) => (
    <>
      <Leg k={k} x={46} top={110} w={15} dir={-1} />
      <Leg k={k} x={74} top={110} w={15} />
      <rect x="38" y="126" width="16" height="7" rx="2" fill={k.dark} />
      <rect x="66" y="126" width="16" height="7" rx="2" fill={k.dark} />
      <path d="M36 100 L84 100 L86 116 L34 116 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M44 100 L44 116 M52 100 L52 116 M60 100 L60 116 M68 100 L68 116 M76 100 L76 116" stroke={k.light} strokeOpacity="0.35" strokeWidth="1" />
      <path d="M20 62 L32 62 L30 98 L18 96 Z M100 62 L88 62 L90 98 L102 96 Z" fill={k.body} stroke={k.line} strokeWidth="1.1" />
      <circle cx="24" cy="102" r="7" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <circle cx="96" cy="102" r="7" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M32 52 L88 52 L82 100 L38 100 Z" fill={k.body} stroke={k.line} strokeWidth="1.3" />
      <circle cx="26" cy="58" r="11" fill={k.body} stroke={k.line} strokeWidth="1.1" />
      <circle cx="94" cy="58" r="11" fill={k.body} stroke={k.line} strokeWidth="1.1" />
      <circle cx="60" cy="72" r="9" fill="#0b0503" />
      <circle cx="60" cy="72" r="6" fill={k.eye} className="ba-eyes" />
      <path d="M44 88 L76 88 M46 94 L74 94" stroke={k.dark} strokeWidth="2" />
      {[[40, 58], [80, 58], [42, 96], [78, 96], [26, 50], [94, 50]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill={k.light} />)}
      <rect x="54" y="44" width="12" height="9" fill={k.dark} />
      <path d="M46 26 Q46 14 60 14 Q74 14 74 26 L74 44 Q60 50 46 44 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M56 4 Q60 0 64 4 L66 16 L54 16 Z" fill="#dc2626" />
      <rect x="49" y="28" width="22" height="6" rx="2" fill="#0b0503" />
      <rect x="50.5" y="29.5" width="19" height="3" rx="1.5" fill={k.eye} className="ba-eyes" />
    </>
  ),
  polifemo: (k) => (
    <>
      <path d="M100 96 L112 18" stroke={WOOD} strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="111" cy="26" rx="7" ry="12" transform="rotate(9 111 26)" fill="#3b2412" />
      <path d="M106 18 L104 14 M114 22 L118 20 M108 34 L104 36" stroke="#3b2412" strokeWidth="2" />
      <Leg k={k} x={46} top={112} w={16} dir={-1} />
      <Leg k={k} x={74} top={112} w={16} />
      <Tube d="M36 62 Q20 78 22 104" k={k} w={12} />
      <Tube d="M84 62 Q100 70 102 92" k={k} w={12} />
      <path d="M34 56 Q60 44 86 56 Q96 84 84 108 L36 108 Q24 84 34 56 Z" fill={k.body} stroke={k.line} strokeWidth="1.3" />
      <ellipse cx="60" cy="90" rx="18" ry="14" fill={k.light} opacity="0.3" />
      <path d="M36 102 L84 102 L82 116 L76 124 L70 116 L64 126 L58 116 L52 124 L46 116 L40 122 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <path d="M42 34 Q42 14 60 14 Q78 14 78 34 Q78 54 60 58 Q42 54 42 34 Z" fill={k.body} stroke={k.line} strokeWidth="1.3" />
      <path d="M44 26 Q52 14 60 14 Q68 14 76 26 Q68 20 60 21 Q52 20 44 26 Z" fill={k.dark} />
      <path d="M46 28 Q60 22 74 28" stroke={k.dark} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <ellipse cx="60" cy="35" rx="10" ry="7.5" fill="#f8fafc" stroke={k.dark} strokeWidth="1.3" />
      <circle cx="60" cy="35.5" r="4.6" fill={k.eye} className="ba-eyes" />
      <circle cx="60" cy="35.5" r="2" fill="#0b0b10" />
      <path d="M50 48 Q60 44 70 48 Q66 53 60 53 Q54 53 50 48 Z" fill="#1c0f08" />
      <path d="M53 48 L54 51 L55 48 M65 48 L66 51 L67 48" fill="#f5f5f4" />
    </>
  ),
  sirenas: (k) => (
    <>
      <path d="M18 158 Q22 126 46 120 Q80 114 98 132 Q110 146 106 158 Z" fill="#334155" stroke="#0f172a" strokeWidth="1" />
      <path d="M30 140 Q40 132 50 136 M76 128 Q88 130 94 140" stroke="#64748b" strokeWidth="1.4" fill="none" />
      <Tube d="M56 96 Q42 118 60 128 Q82 136 96 116" k={k} w={13} />
      <path d="M96 116 L114 100 L108 118 L116 130 Z" fill={k.light} stroke={k.line} strokeWidth="1" />
      <path d="M50 110 L54 108 M60 124 L63 121 M74 128 L77 124 M86 124 L88 120" stroke={k.light} strokeOpacity="0.6" strokeWidth="1.4" />
      <path d="M60 22 Q34 24 34 52 Q32 76 22 94 Q42 88 46 66 L74 66 Q78 88 98 94 Q88 76 86 52 Q86 24 60 22 Z" fill="#a21caf" opacity="0.85" />
      <path d="M50 64 Q60 58 70 64 L72 98 L48 98 Z" fill="#fde2e4" stroke={k.line} strokeWidth="1" />
      <circle cx="55" cy="72" r="4" fill={k.dark} /><circle cx="65" cy="72" r="4" fill={k.dark} />
      <Tube d="M70 66 Q80 72 80 82" k={{ ...k, dark: 'rgba(0,0,0,0.4)' }} w={4.5} color="#fde2e4" />
      <path d="M76 84 Q72 66 80 64 M90 84 Q94 66 86 64 M76 84 L90 84 M80 68 L80 84 M83 66 L83 84 M86 68 L86 84" stroke={GOLD} strokeWidth="1.4" fill="none" />
      <path d="M50 40 Q50 28 60 28 Q70 28 70 40 Q70 54 60 58 Q50 54 50 40 Z" fill="#fde2e4" stroke={k.line} strokeWidth="1" />
      <path d="M48 36 Q56 24 72 34 Q66 26 58 26 Q50 26 48 36 Z" fill="#86198f" />
      <Eyes k={k} pts={[[55.5, 42], [64.5, 42]]} r={1.8} />
      <path d="M57 50 Q60 52 63 50" stroke="#be123c" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <g className="ba-notes" fill={k.eye} stroke={k.eye} strokeWidth="1.4">
        <circle cx="20" cy="40" r="3" /><path d="M23 40 L23 28 L28 30" fill="none" />
        <circle cx="100" cy="30" r="3" /><path d="M103 30 L103 18 L108 20" fill="none" />
        <circle cx="104" cy="56" r="2.4" /><path d="M106.4 56 L106.4 47" fill="none" />
      </g>
    </>
  ),
  escila: (k) => {
    const sea = { ...k, body: '#4ade80', line: '#14532d', dark: '#14532d' };
    return (
      <>
        {[[44, 150, 6, 118], [76, 150, 114, 120], [52, 152, 24, 140], [68, 152, 98, 142]].map(([x0, y0, x1, y1], i) => (
          <Tube key={i} d={wave(x0, y0, x1, y1, 5, 1.2, 12)} k={k} w={6} />
        ))}
        <path d="M30 152 Q32 104 60 98 Q88 104 90 152 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
        <path d={spiral(60, 128, 2, 14, 1.6, 0.5)} fill="none" stroke={k.dark} strokeWidth="2.4" />
        {[[46, 106, 14, 56, -30], [52, 102, 32, 30, -14], [58, 100, 52, 16, -4], [64, 100, 72, 18, 6], [70, 102, 92, 32, 16], [76, 106, 106, 58, 30]].map(([x0, y0, x1, y1, rot], i) => (
          <g key={i}>
            <Tube d={wave(x0, y0, x1, y1 + 8, 3, 1, 10)} k={sea} w={4.5} color="#4ade80" />
            <DogHead k={sea} x={x1} y={y1} rot={rot} s={0.5} />
          </g>
        ))}
        <Waves k={k} y={154} />
      </>
    );
  },
  caos: (k) => (
    <>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={spiral(60, 70, 6, 58, 0.8, (i * Math.PI) / 2, 30)} fill="none" stroke={i % 2 ? k.fire : k.light} strokeWidth={i % 2 ? 2.4 : 3} strokeLinecap="round" opacity="0.45" />
      ))}
      {[[24, 156, 4, 134], [44, 158, 30, 166], [76, 158, 90, 166], [96, 156, 116, 134]].map(([x0, y0, x1, y1], i) => (
        <Tube key={i} d={wave(x0, y0 - 6, x1, y1, 3, 1, 10)} k={k} w={4} />
      ))}
      <path d="M60 16 Q88 24 90 64 Q94 110 106 156 L14 156 Q26 110 30 64 Q32 24 60 16 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M60 30 Q78 38 78 70 Q80 112 86 146 L34 146 Q40 112 42 70 Q42 38 60 30 Z" fill="#05010f" />
      <ellipse cx="60" cy="58" rx="8" ry="3.6" fill={k.eye} className="ba-eyes" />
      <ellipse cx="60" cy="58" rx="1.8" ry="3.6" fill="#010003" />
      <Eyes k={k} pts={[[50, 82], [70, 90], [56, 110], [68, 124], [48, 132], [64, 72]]} r={1.6} />
      {[[16, 30], [104, 40], [20, 92], [102, 96], [36, 12], [86, 10]].map(([x, y]) => <path key={`${x}${y}`} d={star(x, y, 4, 3, 1)} fill="#fff" opacity="0.85" />)}
    </>
  ),
  cronos: (k) => (
    <>
      <path d="M98 18 L86 158" stroke={WOOD} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M98 20 Q72 6 50 20 Q74 16 96 30 Z" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
      <circle cx="60" cy="32" r="22" fill="none" stroke={k.eye} strokeOpacity="0.5" strokeWidth="1.4" strokeDasharray="1.5 4.2" />
      <path d="M40 58 Q60 52 80 58 L92 156 L28 156 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M46 70 L40 154 M60 92 L60 154 M74 70 L80 154" stroke={k.dark} strokeWidth="1.4" opacity="0.55" />
      <Tube d="M42 62 Q28 80 30 96" k={k} w={8} />
      <Tube d="M78 62 Q90 72 90 86" k={k} w={8} />
      <g transform="translate(30 104)">
        <rect x="-8" y="-12" width="16" height="3" rx="1" fill={k.dark} />
        <rect x="-8" y="10" width="16" height="3" rx="1" fill={k.dark} />
        <path d="M-6 -9 L6 -9 Q6 -2 0 1 Q6 4 6 10 L-6 10 Q-6 4 0 1 Q-6 -2 -6 -9 Z" fill="rgba(186,230,253,0.2)" stroke="#e0f2fe" strokeWidth="1" />
        <path d="M-4 -6 L4 -6 Q2 -2 0 0 Q-2 -2 -4 -6 Z M-5 10 Q0 4 5 10 Z" fill={k.eye} />
      </g>
      <path d="M48 44 Q60 50 72 44 Q74 70 60 86 Q46 70 48 44 Z" fill="#f1f5f9" stroke={k.line} strokeWidth="1" />
      <path d="M54 56 L56 74 M60 58 L60 80 M66 56 L64 74" stroke="#94a3b8" strokeWidth="0.9" />
      <path d="M48 32 Q48 18 60 18 Q72 18 72 32 L72 44 Q60 50 48 44 Z" fill={k.light} stroke={k.line} strokeWidth="1.1" />
      <path d="M48 26 Q60 16 72 26" stroke="#f1f5f9" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M51 32 L57 34 M69 32 L63 34" stroke={k.dark} strokeWidth="2" strokeLinecap="round" />
      <Eyes k={k} pts={[[54.5, 37], [65.5, 37]]} r={1.8} />
    </>
  ),
  tifon: (k) => (
    <>
      <path d="M8 22 Q30 6 60 14 Q90 6 112 22 Q100 30 60 26 Q20 30 8 22 Z" fill="#334155" opacity="0.8" />
      <path d="M40 68 Q4 40 2 96 Q14 84 20 92 Q22 80 34 84 Z M80 68 Q116 40 118 96 Q106 84 100 92 Q98 80 86 84 Z" fill={k.dark} stroke={k.line} strokeWidth="1" />
      <Tube d="M48 112 Q18 124 24 146 Q32 162 58 156" k={k} w={14} />
      <Tube d="M72 112 Q102 124 96 146 Q88 162 62 156" k={k} w={14} />
      <path d="M30 130 L34 128 M28 142 L32 142 M90 130 L86 128 M92 142 L88 142" stroke={k.light} strokeOpacity="0.5" strokeWidth="1.4" />
      <Tube d="M38 68 Q22 80 16 98" k={k} w={9} />
      <Tube d="M82 68 Q98 80 104 98" k={k} w={9} />
      <SnakeHead k={k} x={14} y={104} rot={200} s={0.75} />
      <SnakeHead k={k} x={106} y={104} rot={160} s={0.75} />
      <path d="M36 62 Q60 50 84 62 L80 116 L40 116 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M44 78 Q60 86 76 78 M46 92 Q60 98 74 92 M48 104 Q60 110 72 104" stroke={k.dark} strokeWidth="2" fill="none" opacity="0.7" />
      {[[50, 30, -20], [60, 26, 0], [70, 30, 20]].map(([x, y, rot], i) => (
        <g key={i}>
          <path d={wave(56 + i * 4, 40, x, y + 4, 2, 1, 8)} stroke={k.dark} strokeWidth="4" fill="none" strokeLinecap="round" />
          <SnakeHead k={{ ...k, body: '#64748b' }} x={x} y={y} rot={rot} s={0.45} />
        </g>
      ))}
      <path d="M48 44 Q48 32 60 32 Q72 32 72 44 Q72 58 60 62 Q48 58 48 44 Z" fill={k.body} stroke={k.line} strokeWidth="1.2" />
      <path d="M51 42 L57 45 M69 42 L63 45" stroke="#05070c" strokeWidth="2.4" strokeLinecap="round" />
      <Eyes k={k} pts={[[54.5, 47], [65.5, 47]]} r={2.2} />
      <path d="M54 54 Q60 51 66 54 Q63 58 60 58 Q57 58 54 54 Z" fill="#05070c" />
      <path d="M14 28 L24 42 L18 44 L28 60" stroke="#fde047" strokeWidth="2.4" fill="none" strokeLinejoin="round" className="ba-bolt" />
      <path d="M106 28 L98 42 L104 44 L94 60" stroke="#fde047" strokeWidth="2.4" fill="none" strokeLinejoin="round" className="ba-bolt" />
    </>
  ),
};

/** Grietas que aparecen cuando el boss está herido (y más cuando está furioso). */
const CRACKS = {
  herido: 'M44 30 L50 42 L46 50 L54 60 M84 70 L76 76 L80 86',
  furioso: 'M44 30 L50 42 L46 50 L54 60 M84 70 L76 76 L80 86 M70 24 L66 36 L72 44 M30 74 L40 78 L36 88 L44 94',
};

export function BossArt({
  templateId, icon, tier, size = 96, silhouette = false, phase = 'calma', defeated = false, className = '', full = false,
}: {
  /** Cuerpo entero (lienzo vertical) en vez del medallón. `size` es el ancho. */
  full?: boolean;
  templateId?: string;
  icon: string;
  tier?: BossTier;
  size?: number;
  silhouette?: boolean;
  phase?: BossPhase;
  defeated?: boolean;
  className?: string;
}) {
  const uidRaw = useId();
  const id = `ba-${templateId ?? 'custom'}-${silhouette ? 's' : phase}-${uidRaw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const draw = templateId ? (full ? FIGURES : DRAW)[templateId] : undefined;
  const p = PALETTE[draw ? templateId! : 'custom'];
  const ring = silhouette ? '#2a2a36' : tier ? TIER_COLOR[tier] : '#ff8ab0';
  const ink: Ink = { body: `url(#${id}-body)`, dark: p.b, light: p.a, eye: phase === 'furioso' ? '#ff2d4a' : p.eye, line: 'rgba(0,0,0,0.55)', fire: `url(#${id}-fire)` };
  const classes = ['boss-art', full ? 'is-full' : '', silhouette ? 'is-silhouette' : '', `phase-${phase}`, defeated ? 'is-defeated' : '', className].filter(Boolean).join(' ');
  const creature = (
    <g className="ba-creature" filter={silhouette ? `url(#${id}-sil)` : undefined}>
      {draw ? draw(ink) : <text x="60" y={full ? 100 : 64} textAnchor="middle" dominantBaseline="middle" fontSize={full ? 70 : 58}>{icon}</text>}
    </g>
  );
  const cracks = !silhouette && phase !== 'calma' && (
    <path d={CRACKS[phase]} transform={full ? 'translate(0 34)' : undefined} stroke={phase === 'furioso' ? '#ff2d4a' : '#fff'} strokeOpacity={phase === 'furioso' ? 0.9 : 0.6} strokeWidth="1.6" fill="none" className="ba-cracks" />
  );
  const gems = (cy: number) => tier && !silhouette && (
    <g className="ba-tier">
      {Array.from({ length: tier }, (_, i) => {
        const x = 60 + (i - (tier - 1) / 2) * 9;
        return <path key={i} d={`M${x} ${cy - 4} L${x + 3.5} ${cy} L${x} ${cy + 4} L${x - 3.5} ${cy} Z`} fill={ring} stroke="#05050a" strokeWidth="0.8" />;
      })}
    </g>
  );
  if (full) {
    return (
      <svg className={classes} viewBox="0 0 120 170" width={size} height={Math.round((size * 170) / 120)} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={silhouette ? '#15151d' : p.b} stopOpacity={silhouette ? 1 : 0.95} />
          <stop offset="70%" stopColor="#07070c" />
          <stop offset="100%" stopColor="#020204" />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.a} />
          <stop offset="100%" stopColor={p.b} />
        </linearGradient>
        <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={templateId === 'hades' ? '#1d4ed8' : '#dc2626'} />
          <stop offset="55%" stopColor={templateId === 'hades' ? '#38bdf8' : '#f97316'} />
          <stop offset="100%" stopColor={templateId === 'hades' ? '#e0f2fe' : '#fde047'} />
        </linearGradient>
        {full ? <clipPath id={`${id}-clip`}><rect x="3" y="3" width="114" height="164" rx="14" /></clipPath> : <clipPath id={`${id}-clip`}><circle cx="60" cy="60" r="55" /></clipPath>}
        {silhouette && (
          <filter id={`${id}-sil`} x="-5%" y="-5%" width="110%" height="110%">
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0 0.28  0 0 0 1 0" result="rim" />
            <feMorphology in="SourceAlpha" operator="erode" radius="1.1" result="inner" />
            <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0.015  0 0 0 0 0.015  0 0 0 0 0.025  0 0 0 1 0" result="dark" />
            <feMerge><feMergeNode in="rim" /><feMergeNode in="dark" /></feMerge>
          </filter>
        )}
      </defs>
        <rect x="2" y="2" width="116" height="166" rx="15" fill={`url(#${id}-bg)`} />
        <g clipPath={`url(#${id}-clip)`}>
          <ellipse cx="60" cy="159" rx="46" ry="6" fill="#000" opacity="0.55" />
          {creature}
          {cracks}
        </g>
        <rect x="2" y="2" width="116" height="166" rx="15" fill="none" stroke={ring} strokeWidth="2.5" />
        <rect x="6" y="6" width="108" height="158" rx="12" fill="none" stroke={ring} strokeOpacity="0.3" strokeWidth="0.8" />
        {gems(164)}
      </svg>
    );
  }
  return (
    <svg className={classes} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={silhouette ? '#15151d' : p.b} stopOpacity={silhouette ? 1 : 0.95} />
          <stop offset="70%" stopColor="#07070c" />
          <stop offset="100%" stopColor="#020204" />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.a} />
          <stop offset="100%" stopColor={p.b} />
        </linearGradient>
        <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={templateId === 'hades' ? '#1d4ed8' : '#dc2626'} />
          <stop offset="55%" stopColor={templateId === 'hades' ? '#38bdf8' : '#f97316'} />
          <stop offset="100%" stopColor={templateId === 'hades' ? '#e0f2fe' : '#fde047'} />
        </linearGradient>
        <clipPath id={`${id}-clip`}><circle cx="60" cy="60" r="55" /></clipPath>
        {silhouette && (
          <filter id={`${id}-sil`} x="-5%" y="-5%" width="110%" height="110%">
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0 0.28  0 0 0 1 0" result="rim" />
            <feMorphology in="SourceAlpha" operator="erode" radius="1.1" result="inner" />
            <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0.015  0 0 0 0 0.015  0 0 0 0 0.025  0 0 0 1 0" result="dark" />
            <feMerge><feMergeNode in="rim" /><feMergeNode in="dark" /></feMerge>
          </filter>
        )}
      </defs>
      <circle cx="60" cy="60" r="57" fill={`url(#${id}-bg)`} />
      {!silhouette && <circle cx="60" cy="60" r="57" fill="none" stroke={ring} strokeOpacity="0.18" strokeWidth="10" className="ba-halo" />}
      <g clipPath={`url(#${id}-clip)`}>
        {creature}
        {cracks}
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke={ring} strokeWidth="2.5" />
      <circle cx="60" cy="60" r="53" fill="none" stroke={ring} strokeOpacity="0.35" strokeWidth="0.8" />
      {gems(114)}
    </svg>
  );
}
