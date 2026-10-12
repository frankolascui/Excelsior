// Pasos de una misión: una lista corta de casillas para partir una misión grande («Examen de Física» → temas).
import { useState, type FormEvent } from 'react';
import type { Quest } from './types';
import { Icon } from './icons';
import { sfx } from './sfx';

export interface StepActions {
  add: (title: string) => void;
  toggle: (stepId: string) => void;
  remove: (stepId: string) => void;
}

export function QuestSteps({ quest, actions }: { quest: Quest; actions: StepActions }) {
  const [title, setTitle] = useState('');
  const steps = quest.steps ?? [];
  const done = steps.filter((x) => x.done).length;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add(title);
    setTitle('');
  }
  return (
    <div className="steps">
      {steps.length > 0 && (
        <>
          <div className="steps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <ul className="steps-list">
            {steps.map((x) => (
              <li key={x.id} className={x.done ? 'step done' : 'step'}>
                <button type="button" className="step-check" aria-pressed={x.done} aria-label={`${x.done ? 'Desmarcar' : 'Marcar'} paso ${x.title}`} onClick={() => { actions.toggle(x.id); if (!x.done) sfx.tick(); }}>
                  {x.done && <Icon name="check" />}
                </button>
                <span className="step-title">{x.title}</span>
                <button type="button" className="icon-btn step-del" aria-label={`Quitar paso ${x.title}`} title="Quitar paso" onClick={() => actions.remove(x.id)}><Icon name="x" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="step-add" onSubmit={submit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Añadir paso (ej. Tema 1: cinemática)" maxLength={80} aria-label={`Nuevo paso de ${quest.title}`} />
        <button type="submit" className="ghost small" disabled={!title.trim()}><Icon name="plus" /> Paso</button>
      </form>
      {steps.length > 0 && done === steps.length && <p className="steps-ready"><Icon name="check" /> Todos los pasos hechos: márcala como terminada.</p>}
    </div>
  );
}
