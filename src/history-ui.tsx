// Historial de XP (las últimas ganancias), en Ajustes.
import type { GameState } from './types';
import { RewardTags } from './ui';
import { Fold } from './fold';

const SOURCE = { quest: 'Misión', habit: 'Hábito', deepwork: 'Deep Work', admin: 'Admin', guild: 'Gremio' } as const;

export function XpHistory({ state }: { state: GameState }) {
  const history = [...state.xp].reverse().slice(0, 15);
  return (
    <section className="panel" aria-labelledby="xp-history-h">
      <header className="panel-head"><h3 id="xp-history-h">Historial</h3></header>
      {history.length === 0 ? <p className="empty">Aquí aparecerá cada XP que ganes.</p> : (
        <Fold label="Ver lo último que has ganado" icon="clock" count={history.length}>
        <ul className="list plain">
          {history.map((t) => (
            <li key={t.id} className="row-between">
              <span><span className="muted">{SOURCE[t.source]} · </span>{t.label}</span>
              <span className="mono"><RewardTags rewards={t.attributes ?? {}} /> +{t.amount} <span className="muted">{new Date(t.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></span>
            </li>
          ))}
        </ul>
        </Fold>
      )}
    </section>
  );
}
