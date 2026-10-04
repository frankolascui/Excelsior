// Confeti en un <canvas> temporal, con los colores del tema. Sin librerías.
// No se lanza si la persona prefiere menos movimiento.

interface Piece { x: number; y: number; vx: number; vy: number; r: number; spin: number; angle: number; color: string; w: number; h: number }

function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  const vars = ['--c1', '--c2', '--c3', '--gold'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  return [...vars, '#ffffff'];
}

export function confetti({ count = 140, big = false }: { count?: number; big?: boolean } = {}) {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);
  const colors = themeColors();
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const fromLeft = Math.random() < 0.5;
    return {
      x: big ? (fromLeft ? 0 : innerWidth) : innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: big ? innerHeight * 0.7 : innerHeight * 0.35,
      vx: big ? (fromLeft ? 1 : -1) * (4 + Math.random() * 9) : (Math.random() - 0.5) * 12,
      vy: -(6 + Math.random() * (big ? 14 : 9)),
      r: 0, spin: (Math.random() - 0.5) * 0.4, angle: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 5 + Math.random() * 6, h: 8 + Math.random() * 8,
    };
  });
  const start = performance.now();
  function frame(t: number) {
    const elapsed = t - start;
    ctx!.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.angle);
      ctx!.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.angle * 2)));
      ctx!.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
