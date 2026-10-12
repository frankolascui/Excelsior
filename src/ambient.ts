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
let timers: number[] = [];

function noiseBuffer(ac: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const len = ac.sampleRate * 6;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
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
  // Fundido en los bordes para que el bucle no haga «clic» al repetirse.
  const fade = Math.floor(ac.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[len - 1 - i] *= i / fade; }
  return buf;
}

function loop(ac: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
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

/** Repite `fn` con pausas aleatorias entre `min` y `max` ms. */
function every(min: number, max: number, fn: () => void) {
  const tick = () => {
    fn();
    timers.push(window.setTimeout(tick, min + Math.random() * (max - min)));
  };
  timers.push(window.setTimeout(tick, min + Math.random() * (max - min)));
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

function stopSynth() {
  timers.forEach(clearTimeout);
  timers = [];
  nodes.forEach((n) => {
    try {
      if (n instanceof AudioBufferSourceNode || n instanceof OscillatorNode) n.stop();
      n.disconnect();
    } catch {
      /* ya parado */
    }
  });
  nodes = [];
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
  master ??= ac.createGain();
  master.connect(ac.destination);
  // Entra poco a poco (2 s) en vez de golpe.
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setValueAtTime(0.0001, ac.currentTime);
  master.gain.linearRampToValueAtTime(gainFor(state.volume), ac.currentTime + 2);
  const out = gain(ac, 1);
  out.connect(master);

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
      for (let i = 0; i < n; i++) timers.push(window.setTimeout(() => droplet(ac, sparks, 1300 + Math.random() * 1500, 0.04 + Math.random() * 0.06, 0.03), i * (40 + Math.random() * 90)));
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
