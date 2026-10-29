// Historial de misiones completadas: plegado, por días (lo último arriba) y de 30 en 30 para no cargar listas enormes.
import { useState } from 'react';
import type { GameState } from './types';
import { dayKey } from './game';
import { kingdomName } from './kingdoms';
import { dayWords } from './pickers';
import { Fold } from './fold';
import { QuestItem } from './ui';

const PAGE = 30;

export function QuestHistory({ state, onUndo }: { state: GameState; onUndo: (id: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  const all = state.quests.filter((q) => q.completedAt).sort((a, b) => b.completedAt! - a.completedAt!);
  if (all.length === 0) return null;
  const days: { day: string; quests: typeof all }[] = [];
  for (const q of all.slice(0, shown)) {
    const day = dayKey(q.completedAt!);
    if (days.at(-1)?.day !== day) days.push({ day, quests: [] });
    days.at(-1)!.quests.push(q);
  }
  return (
    <section className="panel quest-history">
      <Fold label="Historial de misiones" icon="clock" count={all.length} className="quest-history-fold">
        {days.map(({ day, quests }) => (
          <div key={day} className="history-day">
            <p className="eyebrow history-day-h">{dayWords(day)} <span className="mono">· {quests.length}</span></p>
            <ul className="list">
              {quests.map((q) => <QuestItem key={q.id} quest={q} kingdom={kingdomName(state, q.kingdomId)} onUndo={() => onUndo(q.id)} />)}
            </ul>
          </div>
        ))}
        {all.length > shown && (
          <button type="button" className="ghost small history-more" onClick={() => setShown(shown + PAGE)}>
            Ver más ({all.length - shown})
          </button>
        )}
      </Fold>
    </section>
  );
}
