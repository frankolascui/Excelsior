// Iconos dibujados en SVG (líneas finas, heredan el color del texto) y el botón de icono.
// Así todos los botones se ven igual en cualquier ordenador o móvil, a diferencia de los emojis.
const PATHS = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  left: 'M19 12H5M12 19l-7-7 7-7',
  right: 'M5 12h14M12 5l7 7-7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  play: 'M7 4v16l13-8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M5 12l5 5L20 7',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  page: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  cards: 'M3 8h13v12H3zM7 8V4h14v12h-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  exam: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12l2 2 4-4M8 17h8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  chart: 'M4 20V11M10 20V4M16 20v-6M2 20h20',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={name === "more" ? 3.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Botón cuadrado con solo un icono. `label` es lo que lee un lector de pantalla y sale al pasar el ratón. */
export function IconButton({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => unknown; danger?: boolean }) {
  return (
    <button type="button" className={danger ? 'icon-btn danger' : 'icon-btn'} title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}
