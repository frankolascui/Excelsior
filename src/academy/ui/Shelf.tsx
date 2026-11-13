import { useEffect, useState } from 'react';
import { createSubject, deleteSubject, listSubjects, savePositions, updateSubject } from '../study/api';
import { byPosition, nextPosition, routeToHash, swapWithNeighbour, SUBJECT_COLORS } from '../study/logic';
import type { Subject } from '../study/types';
import { sfx } from '../sfx';
import { askConfirm, askText } from './Dialog';
import { TodayPanel } from './Review';
import { Icon } from './Icon';
import { Menu, Modal } from './Kit';

/** La estantería: una carpeta por asignatura. */
export function Shelf() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => listSubjects().then(setSubjects).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!subjects || !name.trim()) return;
    try {
      await createSubject({ name: name.trim(), color, position: nextPosition(subjects) });
      sfx.place();
      setAdding(false);
      setName('');
      setColor(SUBJECT_COLORS[(subjects.length + 1) % SUBJECT_COLORS.length]);
      reload();
    } catch (err) { setError((err as Error).message); sfx.error(); }
  }

  async function act(fn: () => Promise<unknown>, sound: () => void = sfx.drop) {
    try { await fn(); sound(); reload(); } catch (err) { setError((err as Error).message); sfx.error(); }
  }

  if (!subjects) return <p className="muted">{error ?? 'Cargando estantería…'}</p>;

  return (
    <section className="stack">
      <div className="shelf-head">
        <div>
          <p className="eyebrow">Tu archivo de apuntes</p>
          <h1 className="section-title">Mi estantería</h1>
        </div>
        {subjects.length > 0 && <a className="button" href={routeToHash({ view: 'estadisticas' })} onClick={() => sfx.open()}><Icon name="chart" /> Estadísticas</a>}
      </div>
      {subjects.length > 0 && <TodayPanel />}
      {subjects.length === 0 && <p className="empty-state">Todavía no tienes asignaturas. Crea la primera: cada una será una carpeta.</p>}
      <ul className="shelf">
        {byPosition(subjects).map((s) => (
          <li key={s.id} className="binder" style={{ '--spine': s.color } as React.CSSProperties}>
            <a href={routeToHash({ view: 'asignatura', subjectId: s.id })} className="binder-cover" onClick={() => sfx.open()}>
              <span className="binder-label">Asignatura</span>
              <span className="binder-name">{s.name}</span>
            </a>
            <Menu label={`Opciones de ${s.name}`} items={[
              { icon: 'edit', label: 'Renombrar', onSelect: async () => {
                const n = await askText({ title: 'Renombrar asignatura', label: 'Nombre de la asignatura', initial: s.name });
                if (n) act(() => updateSubject(s.id, { name: n }), sfx.saved);
              } },
              { icon: 'left', label: 'Mover antes', onSelect: () => act(() => savePositions('study_subjects', swapWithNeighbour(subjects, s.id, -1))) },
              { icon: 'right', label: 'Mover después', onSelect: () => act(() => savePositions('study_subjects', swapWithNeighbour(subjects, s.id, 1))) },
              { icon: 'trash', label: 'Borrar', danger: true, onSelect: async () => {
                if (await askConfirm({ title: `¿Borrar «${s.name}»?`, message: 'Se borrarán todos sus temas, hojas y tarjetas. No se puede deshacer.', confirmLabel: 'Borrar asignatura', danger: true })) act(() => deleteSubject(s.id), sfx.remove);
              } },
            ]} />
          </li>
        ))}
        <li>
          <button className="binder-new" onClick={() => { setAdding(true); sfx.open(); }}>
            <span className="drop-icon"><Icon name="plus" size={22} /></span>
            Nueva asignatura
          </button>
        </li>
      </ul>

      {adding && (
        <Modal title="Nueva asignatura" onClose={() => setAdding(false)}>
          <form className="new-subject" onSubmit={add}>
            <input autoFocus placeholder="Nombre (p. ej. Física y Química)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <div className="colors" role="radiogroup" aria-label="Color">
              {SUBJECT_COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={`Color ${c}`} className="swatch" style={{ background: c }} onClick={() => { setColor(c); sfx.tick(); }} />
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="primary" disabled={!name.trim()}><Icon name="plus" /> Crear</button>
            </div>
          </form>
        </Modal>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
