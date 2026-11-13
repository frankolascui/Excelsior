// Piezas de interfaz reutilizables: ventana (Modal), menú «⋯» (Menu) y zona para soltar archivos (DropZone).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../sfx';
import { Icon, type IconName } from './Icon';

/** Ventana centrada con fondo oscurecido. Se cierra con Esc o pulsando fuera. */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Cerrar" title="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <div className="dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}

export interface MenuItem { icon: IconName; label: string; onSelect: () => unknown; danger?: boolean; disabled?: boolean }

/** Botón «⋯» que despliega las acciones de una fila. Así cada fila tiene un botón en vez de cuatro. */
export function Menu({ items, label = 'Más opciones' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} title={label} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); sfx.tick(); }}>
        <Icon name="more" />
      </button>
      {open && (
        <ul className="menu-list" role="menu">
          {items.map((it) => (
            <li key={it.label}>
              <button type="button" role="menuitem" className={it.danger ? 'danger' : undefined} disabled={it.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); it.onSelect(); }}>
                <Icon name={it.icon} size={16} /> {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Zona para soltar archivos (o pulsar para elegirlos). */
export function DropZone({ accept, multiple, hint, onFiles }: { accept: string; multiple?: boolean; hint: string; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={over ? 'drop over' : 'drop'}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) onFiles(f); }}
    >
      <span className="drop-icon"><Icon name="upload" size={22} /></span>
      <strong>Suelta aquí el archivo</strong>
      <span className="muted small">o pulsa para elegirlo · {hint}</span>
      <input type="file" accept={accept} multiple={multiple} hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
    </label>
  );
}

/** Interruptor con texto (en lugar de una casilla). */
export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked); sfx.tick(); }} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span>{children}</span>
    </label>
  );
}
