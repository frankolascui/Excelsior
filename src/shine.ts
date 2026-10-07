// Brillo que sigue al ratón en las tarjetas: un solo oyente para toda la app que deja la posición
// del puntero en --mx / --my de la tarjeta que tienes debajo (el CSS dibuja la luz).
export const SHINE_SELECTOR = '.stat, .item, .attr, .achv, .reward, .boss-template, .pick-card, .rec-card, .mode-card, .guild-card, .challenge';

export function installShine(doc: Document = document) {
  if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
  doc.addEventListener('pointermove', (e) => {
    const el = (e.target as Element | null)?.closest?.(SHINE_SELECTOR) as HTMLElement | SVGElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
  }, { passive: true });
}
