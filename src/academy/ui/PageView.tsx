import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getPage, listSubjects, listTopics, updatePage } from '../study/api';
import { smartFormat } from '../study/format';
import { routeToHash } from '../study/logic';
import { pastedMarkdown } from '../study/paste';
import type { Page, Subject } from '../study/types';
import { sfx } from '../sfx';
import { Icon } from './Icon';
import { askConfirm } from './Dialog';

// Las fórmulas (KaTeX) pesan mucho: se cargan solo al abrir una hoja.
const md = () => import('./Markdown');
const Markdown = lazy(() => md().then((m) => ({ default: m.Markdown })));
const Toc = lazy(() => md().then((m) => ({ default: m.Toc })));

interface Props { subjectId: string; topicId: string; pageId: string; edit: boolean }

/** Una hoja: se lee como unos apuntes cuidados y se edita en Markdown con vista previa al lado. */
export function PageView({ subjectId, topicId, pageId, edit }: Props) {
  const [page, setPage] = useState<Page | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topicName, setTopicName] = useState('…');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [beforeFormat, setBeforeFormat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getPage(pageId).then((p) => { setPage(p); setTitle(p.title); setContent(p.content); }).catch((e) => setError(e.message));
    Promise.all([listSubjects(), listTopics(subjectId)]).then(([ss, ts]) => {
      setSubject(ss.find((s) => s.id === subjectId) ?? null);
      setTopicName(ts.find((t) => t.id === topicId)?.title ?? '…');
    }).catch(() => {});
  }, [pageId, subjectId, topicId]);

  const dirty = page !== null && (title !== page.title || content !== page.content);

  // Avisa antes de cerrar la pestaña si hay cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (!page || !dirty) return;
    setSaving(true);
    try {
      const clean = title.trim() || 'Hoja sin título';
      await updatePage(page.id, { title: clean, content });
      setPage({ ...page, title: clean, content });
      setTitle(clean);
      setError(null);
      sfx.saved();
    } catch (err) { setError((err as Error).message); sfx.error(); }
    setSaving(false);
  }

  /** Al pegar, el texto entra ya ordenado (y con su formato si viene de Word o Docs). */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = pastedMarkdown(e.clipboardData);
    if (!text.trim()) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = content.slice(0, a) + text + content.slice(b);
    setContent(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + text.length; });
  }

  function formatAll() {
    const next = smartFormat(content);
    if (next === content) return;
    setBeforeFormat(content);
    setContent(next);
    sfx.check();
  }

  const go = async (editMode: boolean) => {
    if (!editMode && dirty && !(await askConfirm({ title: 'Tienes cambios sin guardar', message: 'Si sales ahora, se perderán.', confirmLabel: 'Salir sin guardar', danger: true }))) return;
    if (!editMode && dirty && page) { setTitle(page.title); setContent(page.content); }
    sfx.page();
    location.hash = routeToHash({ view: 'hoja', subjectId, topicId, pageId, edit: editMode });
  };

  if (!page) return <p className="muted">{error ?? 'Abriendo hoja…'}</p>;

  const spine = { '--spine': subject?.color ?? 'var(--c2)' } as React.CSSProperties;

  return (
    <section className="stack" style={spine}>
      <nav className="crumbs">
        <a className="back-btn" href={routeToHash({ view: 'asignatura', subjectId, topicId })} onClick={() => sfx.page()}><Icon name="left" size={16} /> Volver al tema</a>
        <a href="#academy/">Estantería</a> <span>›</span>
        <a href={routeToHash({ view: 'asignatura', subjectId })}>{subject?.name ?? '…'}</a> <span>›</span>
        <a href={routeToHash({ view: 'asignatura', subjectId, topicId })}>{topicName}</a>
      </nav>

      {edit ? (
        <div
          className="stack"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
          }}
        >
          <div className="row">
            <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Título de la hoja" />
            <button className="primary" onClick={save} disabled={saving || !dirty}><Icon name="check" /> {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}</button>
            <button className="ghost" onClick={() => go(false)}><Icon name="eye" /> Ver</button>
          </div>
          <div className="row toolbar">
            <button className="secondary" onClick={formatAll} title="Viñetas, títulos y conceptos en negrita"><Icon name="sparkles" /> Ordenar formato</button>
            {beforeFormat !== null && (
              <button className="ghost small" onClick={() => { setContent(beforeFormat); setBeforeFormat(null); sfx.undo(); }}><Icon name="undo" size={16} /> Deshacer</button>
            )}
            <span className="muted small">Pega desde Word o Docs sin miedo: se conserva el formato. Ctrl+S guarda.</span>
          </div>
          <details className="cheats">
            <summary className="muted small">Chuleta de formato</summary>
            <p className="small mono">## Apartado · ### Subapartado · **negrita** · - lista · 1. lista · &gt; recuadro · | tabla | · $x^2$ · $$fórmula$$</p>
          </details>
          <div className="editor">
            <textarea
              ref={area}
              value={content}
              onChange={(e) => { setContent(e.target.value); setBeforeFormat(null); }}
              onPaste={onPaste}
              spellCheck
              placeholder="Escribe o pega aquí tus apuntes…"
            />
            <div className="preview panel"><Suspense fallback={null}><Markdown text={content} /></Suspense></div>
          </div>
        </div>
      ) : (
        <div className="reader">
          <article className="paper">
            <header className="paper-head">
              <p className="eyebrow">{topicName}</p>
              <h1 className="page-title">{page.title}</h1>
              <button className="ghost small" onClick={() => go(true)}><Icon name="edit" size={16} /> Editar</button>
            </header>
            <Suspense fallback={null}><Toc text={page.content} /></Suspense>
            {page.content.trim()
              ? <Suspense fallback={<p className="muted">Cargando…</p>}><Markdown text={page.content} /></Suspense>
              : <p className="muted">Hoja en blanco. Pulsa Editar para escribir o pegar tus apuntes.</p>}
          </article>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
