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
    const head = (x: number, y: number, rot: number, s: number) => (
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

/** Grietas que aparecen cuando el boss está herido (y más cuando está furioso). */
const CRACKS = {
  herido: 'M44 30 L50 42 L46 50 L54 60 M84 70 L76 76 L80 86',
  furioso: 'M44 30 L50 42 L46 50 L54 60 M84 70 L76 76 L80 86 M70 24 L66 36 L72 44 M30 74 L40 78 L36 88 L44 94',
};

export function BossArt({
  templateId, icon, tier, size = 96, silhouette = false, phase = 'calma', defeated = false, className = '',
}: {
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
  const draw = templateId ? DRAW[templateId] : undefined;
  const p = PALETTE[draw ? templateId! : 'custom'];
  const ring = silhouette ? '#2a2a36' : tier ? TIER_COLOR[tier] : '#ff8ab0';
  const ink: Ink = { body: `url(#${id}-body)`, dark: p.b, light: p.a, eye: phase === 'furioso' ? '#ff2d4a' : p.eye, line: 'rgba(0,0,0,0.55)', fire: `url(#${id}-fire)` };
  const classes = ['boss-art', silhouette ? 'is-silhouette' : '', `phase-${phase}`, defeated ? 'is-defeated' : '', className].filter(Boolean).join(' ');
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
        <g className="ba-creature" filter={silhouette ? `url(#${id}-sil)` : undefined}>
          {draw ? draw(ink) : <text x="60" y="64" textAnchor="middle" dominantBaseline="middle" fontSize="58">{icon}</text>}
        </g>
        {!silhouette && phase !== 'calma' && (
          <path d={CRACKS[phase]} stroke={phase === 'furioso' ? '#ff2d4a' : '#fff'} strokeOpacity={phase === 'furioso' ? 0.9 : 0.6} strokeWidth="1.6" fill="none" className="ba-cracks" />
        )}
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke={ring} strokeWidth="2.5" />
      <circle cx="60" cy="60" r="53" fill="none" stroke={ring} strokeOpacity="0.35" strokeWidth="0.8" />
      {tier && !silhouette && (
        <g className="ba-tier">
          {Array.from({ length: tier }, (_, i) => {
            const x = 60 + (i - (tier - 1) / 2) * 9;
            return <path key={i} d={`M${x} 110 L${x + 3.5} 114 L${x} 118 L${x - 3.5} 114 Z`} fill={ring} stroke="#05050a" strokeWidth="0.8" />;
          })}
        </g>
      )}
    </svg>
  );
}
