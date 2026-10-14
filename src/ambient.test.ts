import { describe, expect, it } from 'vitest';
import { AMBIENTS, ambientEmbed, noise, oceanTexture, parseLink, rainTexture, seamless } from './ambient';

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

describe('texturas de lluvia y océano', () => {
  const sr = 8000;
  const maxStep = (d: Float32Array) => {
    let m = 0;
    for (let i = 1; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1]));
    return m;
  };

  it('son estéreo, enlazan el final con el principio y no tienen silencios', () => {
    for (const [chs, secs] of [[rainTexture(sr, 6, seeded(1)), 6], [oceanTexture(sr, 40, seeded(2)), 40]] as const) {
      expect(chs).toHaveLength(2);
      expect(chs[0]).not.toEqual(chs[1]);
      for (const d of chs) {
        expect(d.length).toBe(sr * secs);
        expect(Math.abs(d[0] - d[d.length - 1])).toBeLessThanOrEqual(maxStep(d));
        const all = rms(d, 0, d.length);
        for (let at = 0; at < d.length; at += sr) expect(rms(d, at, at + sr) / all).toBeGreaterThan(0.2);
      }
    }
  });

  it('la lluvia suena pareja y las olas suben y bajan', () => {
    const spread = (d: Float32Array) => {
      const per = Array.from({ length: Math.floor(d.length / sr) }, (_, s) => rms(d, s * sr, (s + 1) * sr));
      return Math.max(...per) / Math.min(...per);
    };
    expect(spread(rainTexture(sr, 6, seeded(4))[0])).toBeLessThan(1.4);
    expect(spread(oceanTexture(sr, 40, seeded(5))[0])).toBeGreaterThan(2);
  });
});

describe('grabaciones reales', () => {
  it('un enlace con minuto de inicio empieza ahí', () => {
    expect(parseLink('https://www.youtube.com/watch?v=APXp4PGZSiI&t=65s')?.src).toContain('&start=65');
  });

  it('cada ambiente salvo la Calma tiene su grabación; con «Sintetizado» no hay reproductor', () => {
    expect(AMBIENTS.filter((x) => !x.yt).map((x) => x.id)).toEqual(['calma']);
    const base = { volume: 0.5, link: '', linkOn: false, loadingReal: false };
    expect(ambientEmbed({ ...base, playing: 'lluvia', real: true })?.src).toContain('RvdF_EB64vA');
    // arranca en silencio: el sintetizado suena mientras carga y le pasa el relevo
    expect(ambientEmbed({ ...base, playing: 'lluvia', real: true })?.src).toContain('&mute=1');
    expect(ambientEmbed({ ...base, playing: 'lluvia', real: false })).toBeNull();
    expect(ambientEmbed({ ...base, playing: 'calma', real: true })).toBeNull();
  });
});
