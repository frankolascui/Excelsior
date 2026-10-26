// Feedback al cumplir algo: al pulsar un botón de «hecho» sin marcar, salen chispas desde el botón y la fila
// destella (estilos en motion.css). Un solo oyente para toda la app, como installCheckPulse en shine.ts.
// Las chispas van al <body> con posición fija: la misión completada puede desaparecer de la lista al instante.

const SPARKS = 8;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Confeti pequeño dentro de la fila: sale del botón y no pasa de los bordes de la fila. */
export function rowBurst(row: HTMLElement, x: number, y: number, doc: Document = document) {
  if (reducedMotion()) return;
  const box = doc.createElement('div');
  box.className = 'mo-burst';
  box.setAttribute('aria-hidden', 'true');
  const r = row.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
    const d = 30 + Math.random() * 60;
    const s = doc.createElement('span');
    s.className = 'mo-bit';
    s.style.left = `${x - r.left}px`;
    s.style.top = `${y - r.top}px`;
    s.style.setProperty('--dx', `${Math.round(Math.cos(a) * d * 1.6)}px`);
    s.style.setProperty('--dy', `${Math.round(Math.sin(a) * d * 0.6)}px`);
    s.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    box.appendChild(s);
  }
  row.appendChild(box);
  setTimeout(() => box.remove(), 900);
}

export function sparkBurst(x: number, y: number, doc: Document = document) {
  if (reducedMotion()) return;
  const box = doc.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < SPARKS; i++) {
    const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.5;
    const d = 22 + Math.random() * 18;
    const s = doc.createElement('span');
    s.className = 'mo-spark';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
    s.style.setProperty('--dy', `${Math.round(Math.sin(a) * d)}px`);
    box.appendChild(s);
  }
  doc.body.appendChild(box);
  setTimeout(() => box.remove(), 700);
}

/**
 * Desmarcar no anima nada: al pulsar un «hecho» ya marcado se pone data-quiet en la fila (o el botón) un momento.
 * Va en un atributo y no en una clase porque React reescribe className al repintar. Fase de captura: antes que React.
 */
function quietUncheck(e: Event) {
  const btn = (e.target as Element | null)?.closest?.('button.check.checked') as HTMLElement | null;
  if (!btn) return;
  const el = (btn.closest('.item') as HTMLElement | null) ?? btn;
  el.setAttribute('data-quiet', '');
  setTimeout(() => el.removeAttribute('data-quiet'), 500);
}

export function installDoneFeedback(doc: Document = document) {
  doc.addEventListener('pointerdown', quietUncheck, true);
  doc.addEventListener('click', quietUncheck, true);
  // Captura: se mira si estaba marcado antes de que React repinte el botón.
  doc.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest?.('button.check') as HTMLElement | null;
    if (!btn || btn.classList.contains('checked') || (btn as HTMLButtonElement).disabled) return;
    const r = btn.getBoundingClientRect();
    const row = btn.closest('.item') as HTMLElement | null;
    // Hábitos: el efecto se queda dentro de su fila. Misiones: chispas en el body (la fila puede desaparecer).
    if (row?.hasAttribute('data-habit')) rowBurst(row, r.left + r.width / 2, r.top + r.height / 2, doc);
    else sparkBurst(r.left + r.width / 2, r.top + r.height / 2, doc);
    if (!row) return;
    // Tras el repintado de React: si la fila sigue ahí, destella.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!row.isConnected) return;
      row.classList.remove('mo-done');
      void row.offsetWidth;
      row.classList.add('mo-done');
      setTimeout(() => row.classList.remove('mo-done'), 800);
    }));
  }, true);
}
