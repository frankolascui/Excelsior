// Piezas comunes de los combates (Arena y jefes de gremio): el nombre a lo grande y la barra de vida.
import type { ReactNode } from 'react';
import { splitBossName, type BossPhase } from './bosses';

/**
 * Nombre de boss con presencia: sobrenombre arriba, título grande y el resto del nombre debajo, entre filigranas.
 * El texto del encabezado sigue siendo el nombre completo («Hidra de la Procrastinación»).
 */
export function EpicName({ name, epithet, split = true, as: Tag = 'h4', id, size = 'xl' }: {
  name: string;
  epithet?: string;
  /** Partir «Hidra de la Procrastinación» en título y resto. Los bosses propios van enteros. */
  split?: boolean;
  as?: 'h2' | 'h3' | 'h4' | 'h5';
  id?: string;
  size?: 'xl' | 'lg' | 'sm';
}) {
  const { title, rest } = split ? splitBossName(name) : { title: name, rest: '' };
  return (
    <div className={`epic-name en-${size}`}>
      {epithet && <span className="en-epithet">{epithet}</span>}
      <Tag id={id} className="boss-name en-heading">
        <span className="en-title">{title}</span>
        {rest && <> <span className="en-rest">{rest}</span></>}
      </Tag>
    </div>
  );
}

/**
 * Barra de vida de jefe: marco con puntas, relleno con volumen, marcas cada 10 % y un rastro claro
 * que se queda un momento donde estaba la vida antes del golpe.
 */
export function BossHpBar({ max, left, trail, phase = 'calma', label }: {
  max: number;
  left: number;
  /** Vida antes del último golpe; el rastro baja hasta `left` con retraso. */
  trail?: number;
  phase?: BossPhase;
  label: ReactNode;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / Math.max(1, max))) * 100}%`;
  return (
    <div className={`bhp phase-${phase}`}>
      <div className="bhp-bar" role="progressbar" aria-label="Vida restante" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(left)}>
        <div className="bhp-frame">
          <div className="bhp-track">
            <div className="bhp-trail" style={{ width: pct(Math.max(left, trail ?? left)) }} />
            <div className="bhp-fill" style={{ width: pct(left) }} />
          </div>
        </div>
      </div>
      <span className="boss-hp mono">{label}</span>
    </div>
  );
}
