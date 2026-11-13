import { useEffect, useState } from 'react';
import {
  createPage, createTopic, updateSubject, deletePage, deleteTopic, listPages, listSubjects, listTopics,
  savePositions, updateTopic, type PageSummary,
} from '../study/api';
import { byPosition, nextPosition, routeToHash, swapWithNeighbour, titleFromMarkdown } from '../study/logic';
import type { Subject, Topic } from '../study/types';
import { tidyText } from '../study/format';
import { sfx } from '../sfx';
import { askConfirm, askText } from './Dialog';
import { CardsPanel } from './CardsPanel';
import { ExamsPanel } from './Exams';
import { ExamDatesPanel } from './ExamDates';
import { Icon } from './Icon';
import { DropZone, Menu, Modal } from './Kit';
import { LEVELS } from '../study/srs';
import type { Level } from '../study/types';

/** El archivador de una asignatura: separadores (temas) a la izquierda y hojas a la derecha. */
export function Binder({ subjectId, topicId, section }: { subjectId: string; topicId?: string; section?: 'simulacros' }) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reloadTopics = () => listTopics(subjectId).then(setTopics).catch((e) => setError(e.message));
  useEffect(() => {
    listSubjects().then((all) => setSubject(all.find((s) => s.id === subjectId) ?? null)).catch((e) => setError(e.message));
    reloadTopics();
  }, [subjectId]);

  const sorted = topics ? byPosition(topics) : [];
  // Si no has elegido tema, se abre el primero.
  const current = section ? undefined : sorted.find((t) => t.id === topicId) ?? sorted[0];

  async function act(fn: () => Promise<unknown>, sound: () => void = sfx.drop) {
    try { await fn(); sound(); await reloadTopics(); } catch (err) { setError((err as Error).message); sfx.error(); }
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!topics || !newTopic.trim()) return;
    const title = newTopic.trim();
    setNewTopic('');
    await act(async () => {
      const t = await createTopic({ subject_id: subjectId, title, position: nextPosition(topics), exam_date: null });
      location.hash = routeToHash({ view: 'asignatura', subjectId, topicId: t.id });
    }, sfx.place);
  }

  if (!topics) return <p className="muted">{error ?? 'Abriendo archivador…'}</p>;

  return (
    <section className="stack" style={{ '--spine': subject?.color ?? '#a54dff' } as React.CSSProperties}>
      <nav className="crumbs">
        <a className="back-btn" href="#academy/" onClick={() => sfx.page()}><Icon name="left" size={16} /> Estantería</a>
        <span className="sep">›</span> <span>{subject?.name ?? '…'}</span>
      </nav>
      <div className="binder-head">
        <h1 className="binder-title">{subject?.name ?? '…'}</h1>
        {subject && <LevelPicker subject={subject} onChange={(level) => setSubject({ ...subject, level })} onError={setError} />}
      </div>

      <div className="binder-open">
        <aside className="tabs">
          <ol>
            {sorted.map((t, i) => {
              return (
                <li key={t.id} className={t.id === current?.id ? 'tab active' : 'tab'}>
                  <a href={routeToHash({ view: 'asignatura', subjectId, topicId: t.id })} onClick={() => t.id !== current?.id && sfx.page()}>
                    <span className="tab-num">{i + 1}</span>
                    <span className="tab-title">{t.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <form onSubmit={addTopic} className="add-tab">
            <input placeholder="Nuevo tema" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} maxLength={120} />
            <button className="primary icon-only" title="Añadir tema" aria-label="Añadir tema"><Icon name="plus" /></button>
          </form>
          {sorted.length > 1 && <MixReview subjectId={subjectId} topics={sorted} />}
          <a className={section ? 'exams-tab active' : 'exams-tab'} href={routeToHash({ view: 'simulacros', subjectId })} onClick={() => !section && sfx.page()}>
            <Icon name="exam" size={18} /> Exámenes y simulacros
          </a>
        </aside>

        <div className="sheet-area">
          {section ? (
            <div className="stack exams-area">
              <ExamDatesPanel subjectId={subjectId} topics={sorted} level={subject?.level} />
              <ExamsPanel subjectId={subjectId} topics={sorted} />
            </div>
          ) : current ? (
            <TopicPanel
              key={current.id}
              subjectId={subjectId}
              topic={current}
              onMove={(dir) => act(() => savePositions('study_topics', swapWithNeighbour(topics, current.id, dir)))}
              onTopicsChanged={reloadTopics}
              onRename={async () => {
                const n = await askText({ title: 'Renombrar tema', label: 'Nombre del tema', initial: current.title });
                if (n) act(() => updateTopic(current.id, { title: n }), sfx.saved);
              }}
              onDelete={async () => {
                if (await askConfirm({ title: `¿Borrar «${current.title}»?`, message: 'Se borrarán también sus hojas y tarjetas. No se puede deshacer.', confirmLabel: 'Borrar tema', danger: true })) {
                  act(async () => {
                    await deleteTopic(current.id);
                    location.hash = routeToHash({ view: 'asignatura', subjectId });
                  }, sfx.remove);
                }
              }}
            />
          ) : (
            <p className="empty-state">Este archivador está vacío. Crea el primer tema: será un separador.</p>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

interface PanelProps {
  subjectId: string;
  topic: Topic;
  onMove: (dir: -1 | 1) => void;
  onRename: () => void;
  onDelete: () => void;
  onTopicsChanged: () => void;
}

/** Las hojas de un tema, con las acciones del tema arriba. */
function TopicPanel({ subjectId, topic, onMove, onRename, onDelete, onTopicsChanged }: PanelProps) {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  // Pestaña elegida (hojas o tarjetas); se recuerda en este navegador.
  const [mode, setMode] = useState<'hojas' | 'tarjetas'>(() => { try { return sessionStorage.getItem('modo') === 'tarjetas' ? 'tarjetas' : 'hojas'; } catch { return 'hojas'; } });
  const pick = (m: 'hojas' | 'tarjetas') => { setMode(m); sfx.page(); try { sessionStorage.setItem('modo', m); } catch { /* sin almacenamiento */ } };
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const reload = () => listPages(topic.id).then(setPages).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, [topic.id]);

  async function act(fn: () => Promise<unknown>, sound: () => void = sfx.drop) {
    try { await fn(); sound(); await reload(); } catch (err) { setError((err as Error).message); sfx.error(); }
  }

  const open = (pageId: string, edit = false) =>
    (location.hash = routeToHash({ view: 'hoja', subjectId, topicId: topic.id, pageId, edit }));

  async function newPage() {
    if (!pages) return;
    try {
      const p = await createPage({ topic_id: topic.id, title: 'Hoja nueva', content: '', position: nextPosition(pages) });
      sfx.place();
      open(p.id, true);
    } catch (err) { setError((err as Error).message); sfx.error(); }
  }

  /** Cada archivo .md elegido se convierte en una hoja al final del tema. */
  async function importFiles(files: File[]) {
    if (!pages) return;
    await act(async () => {
      let pos = nextPosition(pages);
      for (const f of files) {
        const content = tidyText(await f.text());
        await createPage({ topic_id: topic.id, title: titleFromMarkdown(f.name, content), content, position: pos++ });
      }
    }, sfx.confirm);
  }

  return (
    <div className="stack">
      <header className="topic-head">
        <h2>{topic.title}</h2>
        <Menu label="Opciones del tema" items={[
          { icon: 'edit', label: 'Renombrar tema', onSelect: onRename },
          { icon: 'up', label: 'Subir tema', onSelect: () => onMove(-1) },
          { icon: 'down', label: 'Bajar tema', onSelect: () => onMove(1) },
          { icon: 'trash', label: 'Borrar tema', danger: true, onSelect: onDelete },
        ]} />
      </header>

      <div className="mode-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'hojas'} onClick={() => pick('hojas')}><Icon name="page" size={16} /> Hojas{pages ? ` (${pages.length})` : ''}</button>
        <button role="tab" aria-selected={mode === 'tarjetas'} onClick={() => pick('tarjetas')}><Icon name="cards" size={16} /> Tarjetas</button>
      </div>

      {mode === 'tarjetas' ? (
        <CardsPanel subjectId={subjectId} topicId={topic.id} onTopicsChanged={onTopicsChanged} />
      ) : !pages ? (
        <p className="muted">Cargando hojas…</p>
      ) : (
        <ul className="pages">
          {pages.length === 0 && <li className="empty-state">Sin hojas todavía. Crea una o importa tus resúmenes.</li>}
          {byPosition(pages).map((p) => (
            <li key={p.id} className="page-row">
              <a href={routeToHash({ view: 'hoja', subjectId, topicId: topic.id, pageId: p.id, edit: false })} onClick={() => sfx.page()}>
                <span className="page-name"><Icon name="page" size={16} /> {p.title}</span>
                <span className="page-meta">editada {new Date(p.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
              </a>
              <Menu items={[
                { icon: 'edit', label: 'Editar', onSelect: () => open(p.id, true) },
                { icon: 'up', label: 'Subir', onSelect: () => act(() => savePositions('study_pages', swapWithNeighbour(pages, p.id, -1))) },
                { icon: 'down', label: 'Bajar', onSelect: () => act(() => savePositions('study_pages', swapWithNeighbour(pages, p.id, 1))) },
                { icon: 'trash', label: 'Borrar', danger: true, onSelect: async () => {
                  if (await askConfirm({ title: `¿Borrar la hoja «${p.title}»?`, message: 'No se puede deshacer.', confirmLabel: 'Borrar hoja', danger: true })) act(() => deletePage(p.id), sfx.remove);
                } },
              ]} />
            </li>
          ))}
        </ul>
      )}

      {mode === 'hojas' && <div className="row">
        <button className="primary" onClick={newPage}><Icon name="plus" /> Hoja nueva</button>
        <button className="ghost" onClick={() => { setImporting(true); sfx.open(); }}><Icon name="download" /> Importar</button>
      </div>}
      {importing && (
        <Modal title="Importar resúmenes" onClose={() => setImporting(false)}>
          <DropZone accept=".md,.markdown,.txt,text/markdown" multiple hint="uno o varios .md o .txt; cada archivo será una hoja"
            onFiles={(files) => { setImporting(false); importFiles(files); }} />
        </Modal>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * Repasar varios temas mezclados (interleaving). Útil cuando un examen entra con varios temas:
 * marcas los que entran y las tarjetas salen turnándose entre ellos.
 */
function MixReview({ subjectId, topics }: { subjectId: string; topics: Topic[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(topics.map((t) => t.id)));
  const toggle = (id: string) => {
    sfx.tick();
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const ids = topics.filter((t) => picked.has(t.id)).map((t) => t.id);
  return (
    <details className="mix">
      <summary><Icon name="shuffle" size={16} /> Repasar mezclando temas</summary>
      <ul>
        {topics.map((t, i) => (
          <li key={t.id}>
            <label><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /> {i + 1}. {t.title}</label>
          </li>
        ))}
      </ul>
      <a
        className={ids.length ? 'button primary' : 'button disabled'}
        aria-disabled={!ids.length}
        href={ids.length ? routeToHash({ view: 'repasar', subjectId, topicIds: ids }) : undefined}
        onClick={() => ids.length && sfx.open()}
      >
        <Icon name="play" /> Repasar {ids.length} {ids.length === 1 ? 'tema' : 'temas'}
      </a>
    </details>
  );
}

/** Nivel de exigencia de la asignatura: cambia la retención objetivo y las nuevas al día (ver LEVELS en srs.ts). */
function LevelPicker({ subject, onChange, onError }: { subject: Subject; onChange: (l: Level) => void; onError: (msg: string) => void }) {
  async function pick(level: Level) {
    if (level === subject.level) return;
    const before = subject.level;
    onChange(level); // se ve al instante; si falla, se deshace
    try {
      await updateSubject(subject.id, { level });
      sfx.check();
    } catch (e) {
      onChange(before);
      sfx.error();
      const msg = (e as Error).message;
      onError(/level/.test(msg) ? 'Para elegir nivel, ejecuta antes supabase/03-niveles.sql en el SQL Editor de Supabase.' : msg);
    }
  }
  const cur = LEVELS[subject.level] ?? LEVELS.equilibrado;
  return (
    <div className="level-picker">
      <div className="segmented" role="radiogroup" aria-label="Nivel de exigencia">
        {(Object.keys(LEVELS) as Level[]).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={(subject.level ?? 'equilibrado') === l} title={LEVELS[l].hint} onClick={() => pick(l)}>
            {LEVELS[l].label}
          </button>
        ))}
      </div>
      <span className="level-meta">{cur.hint} · {Math.round(cur.retention * 100)} % · {cur.newPerDay} nuevas/día</span>
    </div>
  );
}
