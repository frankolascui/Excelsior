import { useEffect, useRef, useState } from 'react';
import { createCards, deleteCard, listCards, updateCard } from '../study/api';
import { routeToHash } from '../study/logic';
import { dueLabel, isLeech } from '../study/srs';
import { clozeCards, isCloze } from '../study/cloze';
import { plainPreview } from '../study/format';
import type { CardRow } from '../study/types';
import { sfx } from '../sfx';
import { askConfirm } from './Dialog';
import { Icon } from './Icon';
import { ImportCards } from './ImportCards';
import { Menu } from './Kit';

/** Las flashcards de un tema: crear, editar, borrar, importar y lanzar el repaso. */
export function CardsPanel({ subjectId, topicId, onTopicsChanged }: { subjectId: string; topicId: string; onTopicsChanged?: () => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const reload = () => listCards(topicId).then(setCards).catch((e) => setError(friendly(e.message)));
  useEffect(() => { reload(); }, [topicId]);

  async function act(fn: () => Promise<unknown>, sound: () => void = sfx.drop) {
    try { setError(null); await fn(); sound(); await reload(); } catch (err) { setError(friendly((err as Error).message)); sfx.error(); }
  }

  function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!front.trim()) return;
    // Con huecos {{c1::…}} se crea una tarjeta por hueco, todas hermanas (misma note_key).
    const key = `cloze:${crypto.randomUUID()}`;
    const rows = isCloze(front)
      ? clozeCards(front.trim(), back).map((c) => ({ topic_id: topicId, ...c, note_key: key }))
      : [{ topic_id: topicId, front: front.trim(), back: back.trim() }];
    setFront(''); setBack('');
    frontRef.current?.focus(); // así puedes escribir la siguiente sin tocar el ratón
    act(() => createCards(rows), sfx.place);
  }

  // Ctrl+Enter (o Cmd+Enter) añade la tarjeta desde cualquiera de los dos cuadros.
  const ctrlEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); };

  if (!cards) return <p className="muted">{error ?? 'Cargando tarjetas…'}</p>;
  const now = new Date();
  const active = cards.filter((c) => !c.suspended);
  const dueNow = active.filter((c) => c.state !== 0 && new Date(c.due) <= now).length;
  const fresh = active.filter((c) => c.state === 0).length;
  const apartadas = cards.length - active.length;
  const clozeCount = isCloze(front) ? clozeCards(front).length : 0;

  return (
    <div className="stack">
      <div className="review-cta">
        <div>
          <strong>{cards.length}</strong> tarjetas · <span className="pill due">{dueNow} tocan</span> <span className="pill new">{fresh} nuevas</span>
          {apartadas > 0 && <> <span className="pill off">{apartadas} apartadas</span></>}
        </div>
        <div className="row">
          <button className="ghost" onClick={() => { setImporting(true); sfx.open(); }}><Icon name="download" /> Importar</button>
          <a
            className={dueNow + fresh ? 'button primary' : 'button'}
            href={routeToHash({ view: 'repasar', subjectId, topicIds: [topicId] })}
            onClick={() => sfx.open()}
          >
            <Icon name="play" /> Repasar
          </a>
        </div>
      </div>
      {importing && (
        <ImportCards subjectId={subjectId} topicId={topicId} existing={cards}
          onClose={() => setImporting(false)}
          onDone={(changed) => { setImporting(false); reload(); if (changed) onTopicsChanged?.(); }} />
      )}

      <form className="card-form composer" onSubmit={add}>
        <textarea ref={frontRef} placeholder="Escribe la pregunta… o una frase con huecos: La capital de Francia es {{c1::París}}" value={front} onChange={(e) => setFront(e.target.value)} onKeyDown={ctrlEnter} rows={2} maxLength={4000} />
        <textarea placeholder={clozeCount ? '…nota extra para el reverso (opcional)' : '…y la respuesta'} value={back} onChange={(e) => setBack(e.target.value)} onKeyDown={ctrlEnter} rows={2} maxLength={8000} />
        <div className="row card-form-foot">
          <span className="muted small">{clozeCount ? `Huecos: se crearán ${clozeCount} ${clozeCount === 1 ? 'tarjeta' : 'tarjetas hermanas'} (sale una al día)` : 'Ctrl+Enter para añadir · {{c1::…}} para huecos · Markdown y fórmulas'}</span>
          <button className="primary" disabled={!front.trim()}><Icon name="plus" /> {clozeCount > 1 ? `Añadir ${clozeCount}` : 'Añadir'}</button>
        </div>
      </form>

      <ul className="cards">
        {cards.length === 0 && <li className="empty-state">Sin tarjetas todavía. Escribe una arriba o pulsa Importar.</li>}
        {cards.map((c) =>
          editing === c.id ? (
            <CardEditor key={c.id} card={c} onCancel={() => setEditing(null)} onSave={(f, b) => {
              setEditing(null);
              act(() => updateCard(c.id, { front: f, back: b }), sfx.saved);
            }} />
          ) : (
            <li key={c.id} className={c.suspended ? 'card-row off' : 'card-row'} onClick={() => { sfx.tick(); setEditing(c.id); }} title="Pulsa para editar">
              <div className="card-text">
                <span className="card-front">{plainPreview(c.front)}</span>
                <span className="card-back">{plainPreview(c.back)}</span>
              </div>
              {isLeech(c) && <span className="pill leech" title={`Fallada ${c.lapses} veces: reescríbela más simple`}>{c.lapses} fallos</span>}
              <span className={c.suspended ? 'pill off' : `pill s${c.state}`}>{c.suspended ? 'apartada' : dueLabel(c, now)}</span>
              <Menu items={[
                { icon: 'edit', label: 'Editar', onSelect: () => setEditing(c.id) },
                c.suspended
                  ? { icon: 'play', label: 'Volver a repasar', onSelect: () => act(() => updateCard(c.id, { suspended: false }), sfx.check) }
                  : { icon: 'eye', label: 'Apartar (no repasar)', onSelect: () => act(() => updateCard(c.id, { suspended: true }), sfx.uncheck) },
                { icon: 'trash', label: 'Borrar', danger: true, onSelect: async () => { if (await askConfirm({ title: '¿Borrar esta tarjeta?', message: 'Se borra también su historial de repasos.', confirmLabel: 'Borrar tarjeta', danger: true })) act(() => deleteCard(c.id), sfx.remove); } },
              ]} />
            </li>
          ),
        )}
      </ul>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function CardEditor({ card, onSave, onCancel }: { card: CardRow; onSave: (front: string, back: string) => void; onCancel: () => void }) {
  const [f, setF] = useState(card.front);
  const [b, setB] = useState(card.back);
  return (
    <li className="card-row editing">
      <form className="card-form" onSubmit={(e) => { e.preventDefault(); if (f.trim()) onSave(f.trim(), b.trim()); }}>
        <textarea value={f} onChange={(e) => setF(e.target.value)} rows={2} autoFocus />
        <textarea value={b} onChange={(e) => setB(e.target.value)} rows={2} />
        <div className="row">
          <button className="primary" disabled={!f.trim()}><Icon name="check" /> Guardar</button>
          <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </li>
  );
}

/** Si aún no se ha ejecutado 02-flashcards.sql, la base de datos no conoce la tabla. */
export function friendly(msg: string): string {
  return /suspended|note_key/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)
    ? 'Falta ejecutar supabase/06-repaso.sql en el SQL Editor de Supabase.'
    : /study_cards|study_reviews/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)
    ? 'Falta crear las tablas de tarjetas: ejecuta supabase/02-flashcards.sql en el SQL Editor de Supabase.'
    : msg;
}
