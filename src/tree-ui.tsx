// Árbol de misiones en pantalla: submisiones dentro de su misión y «Repartir sesiones».
import { useState, type FormEvent, type ReactElement } from 'react';
import type { GameState, Quest } from './types';
import { daysUntil } from './game';
import { childrenOf, effectiveDeadline, treeProgress } from './tree';
import { MAX_SESSIONS } from './tree-actions';
import { Icon } from './icons';

const shortDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/** Partir una misión: añadir una submisión a mano o repartir N sesiones hasta su fecha. */
export function SubAdd({ quest, inherited, onAdd, onSplit, onClose }: {
  quest: Quest; inherited?: string; onAdd?: (title: string) => void; onSplit?: (n: number) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [n, setN] = useState(3);
  const left = inherited ? daysUntil(inherited, Date.now()) : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !onAdd) return;
    onAdd(title);
    setTitle('');
  }
  return (
    <div className="sub-add">
      <form className="step-add" onSubmit={submit}>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label={`Nueva submisión de ${quest.title}`}
          placeholder="+ Submisión que quepa en una sesión (ej. Derivadas: ej. 1–15)" />
        <button type="submit" className="ghost small" disabled={!title.trim()}><Icon name="plus" /> Añadir</button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar" title="Cerrar"><Icon name="x" /></button>
      </form>
      {onSplit && (
        <div className="split-row">
          <span className="muted">o repartir</span>
          <input type="number" min={1} max={MAX_SESSIONS} value={n} onChange={(e) => setN(Math.max(1, Math.min(MAX_SESSIONS, Number(e.target.value) || 1)))} aria-label="Número de sesiones" className="split-n mono" />
          <span className="muted">
            {n === 1 ? 'sesión' : 'sesiones'} {inherited && left !== null && left > 0 ? `hasta el ${shortDate(inherited)} (${left} ${left === 1 ? 'día' : 'días'})` : 'una por día desde hoy'}
          </span>
          <button type="button" className="ghost small" onClick={() => { onSplit(n); onClose(); }}><Icon name="calendar" /> Repartir</button>
        </div>
      )}
    </div>
  );
}

/**
 * Una misión con todo lo que cuelga de ella. `render` pinta una fila (QuestItem) con sus acciones;
 * aquí solo se añaden el progreso, la fecha heredada y las submisiones.
 */
export function QuestNode({ state, quest, render }: {
  state: GameState;
  quest: Quest;
  render: (q: Quest, extra: { progress?: { done: number; total: number }; inherited?: string; children?: ReactElement }) => ReactElement;
}) {
  const kids = childrenOf(state, quest.id);
  const inherited = quest.parentId ? effectiveDeadline(state, quest) : undefined;
  if (!kids.length) return render(quest, { inherited });
  return render(quest, {
    progress: treeProgress(state, quest.id),
    inherited,
    children: <ul className="list sub-list">{kids.map((k) => <QuestNode key={k.id} state={state} quest={k} render={render} />)}</ul>,
  });
}
