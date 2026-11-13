// Ventanas propias para confirmar y para escribir un nombre, con el estilo de la app.
// Sustituyen a confirm() y prompt() del navegador, que no se pueden decorar.
// Uso: if (await askConfirm({ ... })) { ... }   ·   const nombre = await askText({ ... });
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../sfx';
import { Icon } from './Icon';

interface ConfirmReq { kind: 'confirm'; title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
interface TextReq { kind: 'text'; title: string; label?: string; initial?: string; confirmLabel?: string; resolve: (v: string | null) => void }
type Req = ConfirmReq | TextReq;

// Un único «buzón»: la función pide, el componente DialogHost (montado en App) muestra.
let show: ((r: Req) => void) | null = null;

export function askConfirm(o: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ ...o, kind: 'confirm', resolve }) : resolve(window.confirm(o.title))));
}

export function askText(o: Omit<TextReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => (show ? show({ ...o, kind: 'text', resolve }) : resolve(window.prompt(o.title, o.initial))));
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (r) => { setReq(r); setText(r.kind === 'text' ? r.initial ?? '' : ''); sfx.open(); };
    return () => { show = null; };
  }, []);

  useEffect(() => {
    if (!req) return;
    (req.kind === 'text' ? inputRef.current : okRef.current)?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [req]);

  function close(ok: boolean) {
    if (!req) return;
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok && text.trim() ? text.trim() : null);
    if (!ok) sfx.tick();
    setReq(null);
  }

  if (!req) return null;
  const danger = req.kind === 'confirm' && req.danger;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <form className={danger ? 'dialog danger' : 'dialog'} role="dialog" aria-modal="true" aria-labelledby="dialog-title"
        onSubmit={(e) => { e.preventDefault(); close(true); }}>
        {danger && <div className="dialog-icon"><Icon name="trash" size={22} /></div>}
        <h2 id="dialog-title">{req.title}</h2>
        {req.kind === 'confirm' && req.message && <p className="muted">{req.message}</p>}
        {req.kind === 'text' && (
          <label className="dialog-field">
            {req.label && <span className="muted small">{req.label}</span>}
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={120} />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => close(false)}>Cancelar</button>
          <button ref={okRef} className={danger ? 'danger-btn' : 'primary'} disabled={req.kind === 'text' && !text.trim()}>
            {req.confirmLabel ?? (req.kind === 'text' ? 'Guardar' : 'Aceptar')}
          </button>
        </div>
      </form>
    </div>
  );
}
