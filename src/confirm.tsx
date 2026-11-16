// «¿Seguro?» antes de borrar, con el estilo del juego (sustituye a confirm() del navegador).
// Uso: if (await askSure({ title: '¿Borrar «X»?', message: '…', confirmLabel: 'Borrar' })) { … }
// El componente <SureHost /> se monta una vez en App.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { sfx } from './sfx';

interface SureReq { title: string; message?: string; confirmLabel?: string; resolve: (ok: boolean) => void }
let show: ((r: SureReq) => void) | null = null;

export function askSure(o: Omit<SureReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ ...o, resolve }) : resolve(window.confirm(o.title))));
}

/** Atajo: pregunta y, si dices que sí, ejecuta `fn`. */
export function sureThen(o: Omit<SureReq, 'resolve'>, fn: () => void) {
  void askSure(o).then((ok) => { if (ok) fn(); });
}

export function SureHost() {
  const [req, setReq] = useState<SureReq | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    show = (r) => setReq(r);
    return () => { show = null; };
  }, []);
  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  function close(ok: boolean) {
    if (!req) return;
    req.resolve(ok);
    if (!ok) sfx.tick();
    setReq(null);
  }
  if (!req) return null;
  return (
    <div className="overlay sure-overlay" role="alertdialog" aria-modal="true" aria-labelledby="sure-h" data-testid="sure-dialog"
      onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <form className="overlay-card sure-card" onSubmit={(e) => { e.preventDefault(); close(true); }}>
        <div className="sure-icon"><Icon name="trash" /></div>
        <h3 id="sure-h">{req.title}</h3>
        {req.message && <p className="muted">{req.message}</p>}
        <div className="sure-actions">
          <button type="button" className="ghost" onClick={() => close(false)}>Cancelar</button>
          <button ref={okRef} type="submit" className="danger-solid">{req.confirmLabel ?? 'Sí, borrar'}</button>
        </div>
      </form>
    </div>
  );
}
