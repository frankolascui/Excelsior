// La ⓘ de ayuda: un icono suelto que brilla al pasar el ratón y, al pulsarlo, abre la explicación encima del resto.
// Sustituye a los párrafos de ayuda largos para que las pantallas ocupen menos. La ventanita va en un portal
// para que ningún panel la recorte ni la tape.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export function InfoTip({ label = 'Cómo funciona', className, children }: {
  label?: string; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dot = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!dot.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); dot.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  // Debajo del icono y sin salirse de la pantalla.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = dot.current?.getBoundingClientRect();
      if (!b) return;
      const w = pop.current?.offsetWidth ?? 340;
      const left = Math.max(12, Math.min(b.left - 10, window.innerWidth - w - 12));
      setPos({ top: b.bottom + window.scrollY + 8, left: left + window.scrollX });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  return (
    <span className={`info-tip${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" ref={dot} className="info-dot" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="info" />
      </button>
      {open && createPortal(
        <div className="info-pop" role="note" aria-label={label} ref={pop}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
          {children}
        </div>, document.body)}
    </span>
  );
}
