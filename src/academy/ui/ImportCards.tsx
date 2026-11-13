import { useState } from 'react';
import { createCards, createTopic, listTopics, type NewCard } from '../study/api';
import type { ApkgResult } from '../study/apkg';
import { nextPosition } from '../study/logic';
import { parseCardLines } from '../study/srs';
import { sfx } from '../sfx';
import { friendly } from './CardsPanel';
import { DropZone, Modal, Toggle } from './Kit';

type Source =
  | { kind: 'texto'; cards: { front: string; back: string }[] }
  | { kind: 'anki'; name: string; data: ApkgResult };

/**
 * Ventana para traer muchas tarjetas de golpe. Una sola puerta para todo:
 * - un mazo de Anki (.apkg);
 * - un archivo .csv / .txt con «pregunta;respuesta» por línea (lo que da la skill);
 * - o ese mismo texto pegado.
 */
export function ImportCards({ subjectId, topicId, existing, onClose, onDone }: {
  subjectId: string; topicId: string; existing: { front: string; back: string }[];
  onClose: () => void; onDone: (topicsChanged: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perDeck, setPerDeck] = useState(false);
  const [keepProgress, setKeepProgress] = useState(true);

  async function onFiles([file]: File[]) {
    setError(null);
    if (/\.(apkg|colpkg)$/i.test(file.name)) {
      setBusy('Leyendo el mazo…');
      try {
        const { loadApkg } = await import('../study/apkgImport'); // SQLite solo se descarga ahora
        const data = await loadApkg(file);
        if (!data.cards.length) throw new Error('El mazo no tiene tarjetas.');
        setSource({ kind: 'anki', name: file.name, data });
        setPerDeck(data.decks.length > 1);
        sfx.open();
      } catch (e) { setError(friendly((e as Error).message)); sfx.error(); }
      finally { setBusy(null); }
    } else {
      const cards = parseCardLines(await file.text());
      if (!cards.length) { setError('No he encontrado líneas con el formato pregunta;respuesta.'); sfx.error(); return; }
      setSource({ kind: 'texto', cards }); sfx.open();
    }
  }

  // Lo pegado cuenta mientras no hayas elegido un archivo.
  const pasted = parseCardLines(text);
  const active: Source | null = source ?? (pasted.length ? { kind: 'texto', cards: pasted } : null);
  const total = !active ? 0 : active.kind === 'texto' ? active.cards.length : active.data.cards.filter((c) => !c.suspended).length;

  async function run() {
    if (!active) return;
    setError(null);
    try {
      const seen = new Set(existing.map((c) => `${c.front}\u0000${c.back}`));
      const rows: NewCard[] = [];
      if (active.kind === 'texto') {
        for (const c of active.cards) {
          const k = `${c.front}\u0000${c.back}`;
          if (!seen.has(k)) { seen.add(k); rows.push({ topic_id: topicId, ...c }); }
        }
      } else {
        // Un tema nuevo por mazo, o todo en este tema. Las suspendidas en Anki no se importan.
        const topicOf = new Map<string, string>();
        if (perDeck) {
          setBusy('Creando temas…');
          let pos = nextPosition(await listTopics(subjectId));
          for (const d of active.data.decks) {
            const t = await createTopic({ subject_id: subjectId, title: d.name.split('::').pop()!.slice(0, 120), position: pos++, exam_date: null });
            topicOf.set(d.id, t.id);
          }
        }
        for (const c of active.data.cards) {
          if (c.suspended) continue;
          const k = `${c.front}\u0000${c.back}`;
          if (!perDeck && seen.has(k)) continue;
          seen.add(k);
          rows.push({
            topic_id: perDeck ? topicOf.get(c.deckId)! : topicId,
            front: c.front.slice(0, 4000), back: c.back.slice(0, 8000), note_key: c.noteKey,
            ...(keepProgress && c.sched ? c.sched : {}),
          });
        }
      }
      setBusy(`Guardando 0 de ${rows.length}…`);
      await createCards(rows, (n) => setBusy(`Guardando ${n} de ${rows.length}…`));
      sfx.reward();
      onDone(active.kind === 'anki' && perDeck);
    } catch (e) {
      setError(friendly((e as Error).message)); setBusy(null); sfx.error();
    }
  }

  return (
    <Modal
      title="Importar tarjetas"
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={!total || !!busy} onClick={run}>{busy ?? `Importar ${total || ''} tarjetas`}</button>
      </>}
    >
      {!source && (
        <>
          <DropZone accept=".apkg,.colpkg,.csv,.txt,.tsv" hint="Anki (.apkg), .csv o .txt" onFiles={onFiles} />
          <div className="or"><span>o pega el texto</span></div>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Una tarjeta por línea: pregunta;respuesta\n¿Qué es la mitosis?;División celular en 2 células iguales'} />
        </>
      )}

      {source?.kind === 'texto' && <p className="import-summary"><strong>{source.cards.length}</strong> tarjetas listas.</p>}

      {source?.kind === 'anki' && (
        <div className="import-summary">
          <p><strong>{source.name}</strong> · {total} tarjetas</p>
          <ul className="apkg-decks">
            {source.data.decks.map((d) => <li key={d.id}><span>{d.name.split('::').join(' › ')}</span><span className="muted">{d.count}</span></li>)}
          </ul>
          {source.data.decks.length > 1 && <Toggle checked={perDeck} onChange={setPerDeck}>Un tema nuevo por cada mazo</Toggle>}
          <Toggle checked={keepProgress} onChange={setKeepProgress}>Conservar el progreso de Anki</Toggle>
          <p className="muted small">Las imágenes y los sonidos aún no se importan.</p>
        </div>
      )}

      {source && !busy && <button className="link" onClick={() => { setSource(null); sfx.tick(); }}>Elegir otro archivo</button>}
      {busy && !source && <p className="muted small">{busy}</p>}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
