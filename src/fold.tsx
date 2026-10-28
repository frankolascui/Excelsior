// Plegable con un botón (como «Logros»): para historiales y listas largas que no hace falta ver siempre.
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function Fold({ label, icon, count, className, defaultOpen = false, children }: {
  label: string; icon?: IconName; count?: ReactNode; className?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`fold${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="secondary fold-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} />} {label}
        {count !== undefined && <span className="mono fold-count">{count}</span>}
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}
