// Símbolos de la app: un solo componente para los iconos de interfaz (Lucide, de trazo) y los emblemas
// (game-icons, rellenos). Los datos guardan el nombre del símbolo; las partidas antiguas guardaban emojis,
// que se traducen aquí para que se sigan viendo con el símbolo nuevo.
import type { CSSProperties, ReactNode } from 'react';
import { ICONS, type IconName } from './icon-data';

export type { IconName };

export const isIconName = (s: unknown): s is IconName => typeof s === 'string' && Object.prototype.hasOwnProperty.call(ICONS, s);

/** Emojis de versiones anteriores (premios, bosses, emblemas de gremio…) → símbolo actual. */
const LEGACY: Record<string, IconName> = {
  // premios y categorías
  '🎁': 'present', '📺': 'tv', '🎮': 'gamepad', '🍔': 'burger', '🍕': 'pizza', '🍦': 'ice-cream', '🍻': 'beer', '☕': 'coffee-cup',
  '😴': 'sleep', '🛁': 'bath', '🧘': 'meditation', '🏖': 'palm', '🎬': 'film', '🎧': 'headphones', '📚': 'books', '🛍': 'shopping-bag',
  '👟': 'shoe', '⚽': 'ball', '✈': 'plane', '🎟': 'ticket', '💆': 'spa', '🏆': 'trophy',
  // bosses y criaturas
  '🐉': 'dragon-head', '🐍': 'snake', '🐂': 'bull', '🐺': 'wolf', '🦁': 'lion', '👁': 'evil-eye', '🌀': 'vortex', '🌪': 'tornado',
  '🦂': 'scorpion', '🦅': 'eagle', '🕷': 'spider', '💀': 'death-skull', '👹': 'ogre', '🧟': 'zombie', '🦈': 'shark', '🐙': 'octopus',
  '⛵': 'boat', '🔥': 'flame', '🗿': 'golem', '🧜': 'mermaid', '🌊': 'whirlpool', '⏳': 'hourglass',
  // gremios
  '🛡': 'round-shield', '⚔': 'crossed-swords', '⚡': 'lightning-helix', '🌙': 'moon-emblem', '👑': 'crown', '🏹': 'bow-arrow',
  '🗡': 'pointy-sword', '🔗': 'linked-rings',
};

const strip = (s: string) => s.replace(/️/g, '').trim();

/** Nombre de símbolo para un valor guardado (nombre nuevo o emoji antiguo), o null si es texto libre. */
export function iconOf(value: string | null | undefined): IconName | null {
  if (!value) return null;
  if (isIconName(value)) return value;
  return LEGACY[strip(value)] ?? null;
}

interface IconProps {
  name: IconName;
  size?: number | string;
  className?: string;
  title?: string;
  style?: CSSProperties;
  /** Posición cuando se dibuja dentro de otro SVG. */
  x?: number;
  y?: number;
}

/** Un símbolo. Por defecto mide 1em y toma el color del texto. */
export function Icon({ name, size = '1em', className = '', title, style, x, y }: IconProps) {
  const [box, body] = ICONS[name];
  const kind = box === 24 ? 'ico-line' : 'ico-fill';
  return (
    <svg
      className={`ico ${kind} ${className}`} viewBox={`0 0 ${box} ${box}`} width={size} height={size} x={x} y={y} style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} focusable="false"
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title.replace(/</g, '&lt;')}</title>` : '') + body }}
    />
  );
}

/** Un icono guardado en los datos: símbolo si lo reconoce; si no (texto libre antiguo), el propio texto. */
export function Glyph({ icon, size, className = '' }: { icon: string | null | undefined; size?: number | string; className?: string }) {
  const name = iconOf(icon);
  if (name) return <Icon name={name} size={size} className={className} />;
  return icon ? <span className={`glyph-text ${className}`} aria-hidden="true">{icon}</span> : null;
}

/** Texto con símbolos incrustados: «{i:coin} 120» → [moneda] 120. */
export function rich(text: string): ReactNode {
  const parts = text.split(/\{i:([\w-]+)\}/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 ? (isIconName(p) ? <Icon key={i} name={p} /> : null) : p || null));
}

/** El mismo texto sin las marcas de símbolo (para notificaciones del sistema o lectores de pantalla). */
export const plain = (text: string) => text.replace(/\{i:[\w-]+\}\s?/g, '').trim();

/** Marca de símbolo para meter en un texto: `${ic('coin')} 120`. */
export const ic = (name: IconName) => `{i:${name}}`;

/** Marca para un icono guardado en los datos (nombre o emoji antiguo); si no lo reconoce, el texto tal cual. */
export function tok(icon: string | null | undefined): string {
  const name = iconOf(icon);
  return name ? `{i:${name}}` : icon ?? '';
}

/** Degradados que usan los emblemas (con los colores del tema). Se pinta una vez, en la raíz de la app. */
export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ico-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" className="ig-1" />
          <stop offset="55%" className="ig-2" />
          <stop offset="100%" className="ig-3" />
        </linearGradient>
        <linearGradient id="ico-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1b8" />
          <stop offset="45%" stopColor="#f5c542" />
          <stop offset="100%" stopColor="#b7791f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
