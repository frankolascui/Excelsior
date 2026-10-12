// Sonido de fondo para el Deep Work: ambientes sintetizados (sin archivos) o un enlace
// (YouTube, Spotify o un audio directo). Estado compartido entre pantallas con un mini-store.
import { useSyncExternalStore } from 'react';
import type { IconName } from './icon-data';

export type AmbientKind = 'lluvia' | 'marron' | 'oceano' | 'fuego' | 'bosque' | 'calma';

export const AMBIENTS: { id: AmbientKind; name: string; icon: IconName }[] = [
  { id: 'lluvia', name: 'Lluvia', icon: 'amb-lluvia' },
  { id: 'oceano', name: 'Océano', icon: 'amb-oceano' },
  { id: 'fuego', name: 'Hoguera', icon: 'amb-fuego' },
  { id: 'bosque', name: 'Bosque', icon: 'amb-bosque' },
  { id: 'calma', name: 'Calma', icon: 'amb-calma' },
  { id: 'marron', name: 'Ruido marrón', icon: 'amb-marron' },
];

export type LinkEmbed = { kind: 'youtube' | 'spotify'; src: string } | { kind: 'audio'; src: string };

interface AmbientState {
  playing: AmbientKind | null;
  /** Posición del deslizador (0..1). El volumen real sigue una curva: abajo del todo se puede dejar casi en un susurro. */
  volume: number;
  link: string;
  linkOn: boolean;
}

const KEY = 'excelsior:ambient';
const CURVE = 2.6;
let state: AmbientState = load();
const listeners = new Set<() => void>();

/** Volumen real (ganancia 0..1) para una posición del deslizador: la mitad del recorrido ya es bastante bajo. */
export const gainFor = (pos: number) => (pos <= 0 ? 0 : Math.min(1, pos) ** CURVE);

function load(): AmbientState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // Antes se guardaba el volumen lineal («volume»); se traduce a la posición equivalente en la curva nueva.
    const pos = typeof raw?.pos === 'number' ? raw.pos : typeof raw?.volume === 'number' ? raw.volume ** (1 / CURVE) : 0.6;
    return { playing: null, linkOn: false, volume: pos, link: typeof raw?.link === 'string' ? raw.link : '' };
  } catch {
    return { playing: null, volume: 0.6, link: '', linkOn: false };
  }
}

function set(patch: Partial<AmbientState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ pos: state.volume, link: state.link }));
  } catch {
    /* ignorado */
  }
  listeners.forEach((l) => l());
}

export function useAmbient(): AmbientState {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);
}

// ---------- Enlaces ----------

/** Convierte un enlace en algo reproducible: YouTube y Spotify como reproductor incrustado; el resto como audio. */
export function parseLink(url: string): LinkEmbed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host === 'youtube.com' || host === 'youtu.be') {
    const list = u.searchParams.get('list');
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]+)/)?.[1];
    if (id) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&enablejsapi=1` };
    if (list) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&enablejsapi=1` };
    return null;
  }
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/\/(track|playlist|album|episode|show)\/(\w+)/);
    return m ? { kind: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}` } : null;
  }
  return { kind: 'audio', src: u.href };
}

export function playLink(link: string) {
  stopSynth();
  set({ link: link.trim(), linkOn: true, playing: null });
}

export function stopLink() {
  set({ linkOn: false });
}

// ---------- Ambientes sintetizados ----------
// Todo lento y suave (low cortisol): sin chasquidos rápidos, cambios de varios segundos y nada agudo de golpe.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let outNode: GainNode | null = null;
const timers = new Set<number>();
const buffers = new Map<string, AudioBuffer>();

type NoiseColor = 'white' | 'pink' | 'brown';

/** Duración del bucle de ruido: larga y sin número redondo, para que no se note que se repite ni coincida con las olas. */
const LOOP_S = 19;
/** Fundido entre el final y el principio del bucle. */
const SEAM_S = 1.5;

/** Ruido de un color, `n` muestras. */
export function noise(color: NoiseColor, n: number, rand: () => number = Math.random): Float32Array {
  const d = new Float32Array(n);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
    if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    } else if (color === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    } else d[i] = white;
  }
  return d;
}

/**
 * Bucle sin costura: `raw` trae `xf` muestras de más; el principio se funde con esas muestras de después del final
 * (a potencia constante). Así la última muestra enlaza con la primera sin clic, y el volumen no baja nunca:
 * antes se fundía a silencio en los bordes y se oía un hueco cada pocos segundos.
 */
export function seamless(raw: Float32Array, xf: number): Float32Array {
  const len = raw.length - xf;
  const d = raw.slice(0, len);
  for (let i = 0; i < xf; i++) {
    const t = ((i + 0.5) / xf) * (Math.PI / 2);
    d[i] = raw[i] * Math.sin(t) + raw[len + i] * Math.cos(t);
  }
  return d;
}

function noiseBuffer(ac: AudioContext, color: NoiseColor): AudioBuffer {
  const key = `${color}@${ac.sampleRate}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const len = Math.floor(ac.sampleRate * LOOP_S);
  const xf = Math.floor(ac.sampleRate * SEAM_S);
  // Se descarta el arranque del filtro (los primeros instantes salen más flojos) generando un poco antes.
  const warm = Math.floor(ac.sampleRate * 0.5);
  const raw = noise(color, warm + len + xf).subarray(warm);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  buf.getChannelData(0).set(seamless(raw, xf));
  buffers.set(key, buf);
  return buf;
}

function loop(ac: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, color);
  src.loop = true;
  src.start();
  nodes.push(src);
  return src;
}

function filter(ac: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  nodes.push(f);
  return f;
}

function gain(ac: AudioContext, v: number): GainNode {
  const g = ac.createGain();
  g.gain.value = v;
  nodes.push(g);
  return g;
}

/** Oscilación lenta de un parámetro (respiración del sonido): `hz` vueltas por segundo, ± `depth`. */
function drift(ac: AudioContext, param: AudioParam, hz: number, depth: number) {
  const lfo = ac.createOscillator();
  const amt = ac.createGain();
  lfo.frequency.value = hz;
  amt.gain.value = depth;
  lfo.connect(amt).connect(param);
  lfo.start();
  nodes.push(lfo, amt);
}

/** Ejecuta `fn` dentro de `ms` (y se cancela al parar el sonido). */
function later(ms: number, fn: () => void) {
  const id = window.setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

/** Repite `fn` con pausas aleatorias entre `min` y `max` ms. */
function every(min: number, max: number, fn: () => void) {
  const tick = () => {
    fn();
    later(min + Math.random() * (max - min), tick);
  };
  later(min + Math.random() * (max - min), tick);
}

/** Gota o chispa suave: ruido corto filtrado, con ataque y caída redondeados. */
function droplet(ac: AudioContext, out: AudioNode, freq: number, vol: number, dur = 0.07) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len) ** 2;
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 2.5;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(out);
  src.start();
}

/** Pájaro lejano: dos o tres silbidos suaves. */
function bird(ac: AudioContext, out: AudioNode) {
  const base = 2200 + Math.random() * 1200;
  const notes = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < notes; i++) {
    const t0 = ac.currentTime + i * (0.16 + Math.random() * 0.08);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base * (1 + i * 0.06), t0);
    o.frequency.exponentialRampToValueAtTime(base * (1.18 + i * 0.05), t0 + 0.11);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.2);
  }
}

// Acordes de la «Calma» (La mayor: I – vi – IV – V), graves y abiertos.
const CHORDS = [
  [110, 164.81, 220, 277.18],
  [92.5, 138.59, 220, 277.18],
  [73.42, 146.83, 220, 293.66],
  [82.41, 123.47, 207.65, 246.94],
];

/** Para el ambiente que suena: baja en un instante (sin clic) y después desmonta sus nodos. */
function stopSynth() {
  timers.forEach(clearTimeout);
  timers.clear();
  const old = nodes;
  const oldOut = outNode;
  nodes = [];
  outNode = null;
  if (!old.length || !ctx) return;
  const t = ctx.currentTime;
  oldOut?.gain.cancelScheduledValues(t);
  oldOut?.gain.setTargetAtTime(0, t, 0.06);
  old.forEach((n) => {
    try {
      if (n instanceof AudioScheduledSourceNode) n.stop(t + 0.4);
    } catch {
      /* ya parado */
    }
  });
  window.setTimeout(() => old.forEach((n) => {
    try {
      n.disconnect();
    } catch {
      /* ya desconectado */
    }
  }), 600);
}

export function playAmbient(kind: AmbientKind) {
  stopSynth();
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return;
  }
  const ac = ctx;
  if (!master) {
    master = ac.createGain();
    master.gain.value = gainFor(state.volume);
    master.connect(ac.destination);
  }
  // Entra poco a poco (2 s) en vez de golpe; el anterior se apaga por su lado, sin cortes.
  const out = gain(ac, 1);
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.linearRampToValueAtTime(1, ac.currentTime + 2);
  out.connect(master);
  outNode = out;

  if (kind === 'marron') {
    const g = gain(ac, 0.8);
    drift(ac, g.gain, 0.03, 0.12); // respira muy despacio
    loop(ac, 'brown').connect(filter(ac, 'lowpass', 420)).connect(g).connect(out);
  } else if (kind === 'lluvia') {
    // Cortina de lluvia suave y continua + alguna gota cercana, sin prisa.
    const bed = gain(ac, 0.28);
    drift(ac, bed.gain, 0.05, 0.05);
    loop(ac, 'pink').connect(filter(ac, 'highpass', 250)).connect(filter(ac, 'lowpass', 2400)).connect(bed).connect(out);
    const near = gain(ac, 1);
    near.connect(out);
    every(220, 900, () => droplet(ac, near, 900 + Math.random() * 1400, 0.05 + Math.random() * 0.08, 0.05 + Math.random() * 0.05));
  } else if (kind === 'oceano') {
    // Olas largas (una cada ~15 s): sube el volumen y se abre el filtro en la cresta.
    const g = gain(ac, 0.42);
    const f = filter(ac, 'lowpass', 520);
    drift(ac, g.gain, 0.066, 0.3);
    drift(ac, f.frequency, 0.066, 260);
    drift(ac, g.gain, 0.021, 0.08); // olas de distinto tamaño
    loop(ac, 'brown').connect(f).connect(g).connect(out);
  } else if (kind === 'fuego') {
    // Brasas graves y cálidas; chispas espaciadas y suaves.
    const g = gain(ac, 0.55);
    drift(ac, g.gain, 0.08, 0.1);
    loop(ac, 'brown').connect(filter(ac, 'lowpass', 260)).connect(g).connect(out);
    const sparks = gain(ac, 1);
    sparks.connect(out);
    every(500, 2200, () => {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) later(i * (40 + Math.random() * 90), () => droplet(ac, sparks, 1300 + Math.random() * 1500, 0.04 + Math.random() * 0.06, 0.03));
    });
  } else if (kind === 'bosque') {
    // Viento entre los árboles y algún pájaro lejano cada pocos segundos.
    const g = gain(ac, 0.4);
    const f = filter(ac, 'bandpass', 520, 0.6);
    drift(ac, g.gain, 0.04, 0.18);
    drift(ac, f.frequency, 0.027, 180);
    loop(ac, 'pink').connect(f).connect(g).connect(out);
    const birds = gain(ac, 1);
    birds.connect(filter(ac, 'lowpass', 5000)).connect(out);
    every(5000, 14000, () => bird(ac, birds));
  } else if (kind === 'calma') {
    // Acordes lentos y graves que cambian cada 16 s, con un velo de ruido muy bajo.
    const pad = gain(ac, 0.11);
    const warm = filter(ac, 'lowpass', 900);
    pad.connect(warm).connect(out);
    const oscs = CHORDS[0].map((hz, i) => {
      const o = ac.createOscillator();
      const g = gain(ac, i === 0 ? 0.9 : 0.55);
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = hz;
      o.detune.value = (i - 1.5) * 3;
      drift(ac, g.gain, 0.05 + i * 0.023, 0.18);
      o.connect(g).connect(pad);
      o.start();
      nodes.push(o);
      return o;
    });
    let step = 0;
    every(16000, 16000, () => {
      step = (step + 1) % CHORDS.length;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[step][i], ac.currentTime, 1.6));
    });
    const air = gain(ac, 0.05);
    loop(ac, 'pink').connect(filter(ac, 'lowpass', 700)).connect(air).connect(out);
  }
  set({ playing: kind, linkOn: false });
}

export function stopAmbient() {
  stopSynth();
  set({ playing: null });
}

/** `pos` es la posición del deslizador (0..1); el volumen real sigue la curva de `gainFor`. */
export function setAmbientVolume(pos: number) {
  if (master && ctx) master.gain.setTargetAtTime(gainFor(pos), ctx.currentTime, 0.05);
  set({ volume: pos });
}
