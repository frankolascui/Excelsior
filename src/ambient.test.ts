import { describe, expect, it } from 'vitest';
import { noise, seamless } from './ambient';

/** Aleatorio con semilla, para que la prueba dé siempre lo mismo. */
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const rms = (d: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += d[i] * d[i];
  return Math.sqrt(sum / (to - from));
};

describe('bucle del sonido de fondo', () => {
  const len = 40000;
  const xf = 6000;

  it('el final enlaza con el principio sin salto (no hace clic al repetirse)', () => {
    for (const color of ['brown', 'pink'] as const) {
      const raw = noise(color, len + xf, seeded());
      const d = seamless(raw, xf);
      expect(d.length).toBe(len);
      // El salto en la costura es del tamaño de un paso normal entre dos muestras seguidas.
      let maxStep = 0;
      for (let i = 1; i < len; i++) maxStep = Math.max(maxStep, Math.abs(d[i] - d[i - 1]));
      expect(Math.abs(d[0] - d[len - 1])).toBeLessThanOrEqual(maxStep * 1.05);
    }
  });

  it('el volumen no baja en la costura (antes había un hueco en cada vuelta)', () => {
    const d = seamless(noise('white', len + xf, seeded(3)), xf);
    const middle = rms(d, len / 2 - 2000, len / 2 + 2000);
    for (const at of [0, xf / 4, xf / 2, (3 * xf) / 4]) {
      expect(rms(d, at, at + 1000) / middle).toBeGreaterThan(0.85);
    }
    expect(rms(d, len - 1000, len) / middle).toBeGreaterThan(0.85);
  });
});
