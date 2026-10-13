// Sonido de fondo para el Deep Work: ambientes sintetizados (sin archivos) o un enlace
// (YouTube, Spotify o un audio directo). Estado compartido entre pantallas con un mini-store.
import { useSyncExternalStore } from 'react';
import type { IconName } from './icon-data';

export type AmbientKind = 'lluvia' | 'blanco' | 'oceano' | 'fuego' | 'bosque' | 'calma';

export const AMBIENTS: { id: AmbientKind; name: string; icon: IconName }[] = [
  { id: 'lluvia', name: 'Lluvia', icon: 'amb-lluvia' },
  { id: 'oceano', name: 'Océano', icon: 'amb-oceano' },
  { id: 'fuego', name: 'Hoguera', icon: 'amb-fuego' },
  { id: 'bosque', name: 'Bosque', icon: 'amb-bosque' },
  { id: 'calma', name: 'Calma', icon: 'amb-calma' },
  { id: 'blanco', name: 'Ruido blanco', icon: 'amb-blanco' },
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

/** Chasquido de madera: un golpe de ruido muy corto que se apaga enseguida (más grave y largo = un tronco). */
function crackle(ac: AudioContext, out: AudioNode, freq: number, vol: number, dur = 0.004 + Math.random() * 0.01) {
  const len = Math.max(8, Math.ceil(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  const tau = len * 0.22;
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau) * Math.min(1, i / 6);
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(out);
  src.start();
}

/** Gota contra el cristal: «tic» muy corto con un poco de resonancia (vidrio), con altura y fuerza al azar. */
function windowDrop(ac: AudioContext, out: AudioNode, vol = 1) {
  const f = 1800 + Math.random() * 2600;
  crackle(ac, out, f, (0.035 + Math.random() * 0.05) * vol, 0.003);
  const t0 = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.9, t0);
  o.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.09);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.006 * vol, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.12);
}

/** Crujido de rama: tono grave que se dobla despacio, muy flojo. */
function creak(ac: AudioContext, out: AudioNode) {
  const t0 = ac.currentTime;
  const base = 140 + Math.random() * 120;
  const o = ac.createOscillator();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t0);
  o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.3), t0 + 0.9);
  f.type = 'bandpass';
  f.frequency.value = 600;
  f.Q.value = 3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  o.connect(f).connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 1.2);
}

/** Nota pulsada suave (seno con algo de triángulo), para el arpegio de la Calma. */
function pluck(ac: AudioContext, out: AudioNode, hz: number) {
  const t0 = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
  g.connect(out);
  for (const [type, mul, v] of [['sine', 1, 1], ['triangle', 2, 0.15]] as const) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = type;
    o.frequency.value = hz * mul;
    og.gain.value = v;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + 1.7);
  }
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

  if (kind === 'blanco') {
    // Ruido blanco suavizado: sin los agudos que cansan y con una respiración muy lenta.
    const g = gain(ac, 0.22);
    drift(ac, g.gain, 0.02, 0.04);
    const shelf = filter(ac, 'highshelf', 2500);
    shelf.gain.value = -9;
    loop(ac, 'white').connect(filter(ac, 'lowpass', 5200, 0.5)).connect(shelf).connect(g).connect(out);
  } else if (kind === 'lluvia') {
    // Lluvia vista desde dentro, junto a una ventana: el aguacero de fuera llega apagado por el cristal
    // y, de vez en cuando, una gota choca contra el vidrio (un «tic» limpio con un poco de resonancia).
    const outside = gain(ac, 0.3);
    drift(ac, outside.gain, 0.018, 0.04);
    loop(ac, 'pink').connect(filter(ac, 'highpass', 120)).connect(filter(ac, 'lowpass', 900, 0.5)).connect(outside).connect(out);
    const glass = gain(ac, 4);
    glass.connect(filter(ac, 'lowpass', 4200)).connect(out);
    every(700, 2600, () => windowDrop(ac, glass));
    // a veces dos o tres gotas casi juntas, como cuando resbala un hilo de agua
    every(6000, 15000, () => { for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) later(i * (120 + Math.random() * 200), () => windowDrop(ac, glass, 0.6)); });
  } else if (kind === 'oceano') {
    // Olas muy lentas (una cada ~25 s): sube, rompe abriendo el filtro y se retira despacio.
    const g = gain(ac, 0.3);
    const f = filter(ac, 'lowpass', 380);
    drift(ac, g.gain, 0.04, 0.28);
    drift(ac, f.frequency, 0.04, 200);
    drift(ac, g.gain, 0.013, 0.08); // olas de distinto tamaño
    loop(ac, 'brown').connect(f).connect(g).connect(out);
    const foam = gain(ac, 0.05); // espuma al romper, muy al fondo
    drift(ac, foam.gain, 0.04, 0.05);
    loop(ac, 'pink').connect(filter(ac, 'bandpass', 1400, 0.6)).connect(foam).connect(out);
  } else if (kind === 'fuego') {
    // Solo la hoguera: crepitar de la madera en rachas, algún «toc» grave de un tronco y un rescoldo bajo y quieto
    // (sin ruido que suba y baje: sonaba a viento).
    const ember = gain(ac, 0.1);
    loop(ac, 'brown').connect(filter(ac, 'lowpass', 150)).connect(ember).connect(out);
    const fire = gain(ac, 6);
    fire.connect(filter(ac, 'lowpass', 3400)).connect(out);
    every(200, 1100, () => {
      const n = 1 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) later(i * (20 + Math.random() * 100), () => crackle(ac, fire, 1200 + Math.random() * 2400, 0.05 + Math.random() * 0.08));
    });
    every(2500, 7000, () => crackle(ac, fire, 240 + Math.random() * 260, 0.14, 0.05));
  } else if (kind === 'bosque') {
    // Brisa entre las hojas (rachas lentas de susurro), algún crujido de rama y pájaros a lo lejos.
    const breeze = gain(ac, 0.2);
    const f = filter(ac, 'lowpass', 650, 0.5);
    drift(ac, breeze.gain, 0.022, 0.08);
    drift(ac, f.frequency, 0.016, 150);
    loop(ac, 'pink').connect(f).connect(breeze).connect(out);
    const leaves = gain(ac, 0.05);
    drift(ac, leaves.gain, 0.022, 0.04); // las hojas se oyen cuando sube la brisa
    loop(ac, 'white').connect(filter(ac, 'bandpass', 3200, 0.7)).connect(filter(ac, 'lowpass', 6000)).connect(leaves).connect(out);
    const life = gain(ac, 0.8);
    life.connect(filter(ac, 'lowpass', 4200)).connect(out);
    every(4000, 11000, () => bird(ac, life));
    every(14000, 30000, () => creak(ac, life));
  } else if (kind === 'calma') {
    // Acordes lentos y graves, con un arpegio suave con eco por encima (aire de los fondos de Opera GX, sin copiarlos)
    // y un pulso de bajo muy tenue.
    const pad = gain(ac, 0.09);
    const warm = filter(ac, 'lowpass', 650);
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
    // eco: retardo con realimentación y filtro, para que las notas se queden flotando
    const arp = gain(ac, 0.05);
    const echo = ac.createDelay(2);
    echo.delayTime.value = 0.75;
    const fb = gain(ac, 0.42);
    const dark = filter(ac, 'lowpass', 1800);
    nodes.push(echo);
    arp.connect(dark).connect(out);
    dark.connect(echo).connect(fb).connect(dark);
    let step = 0;
    let note = 0;
    every(22000, 22000, () => {
      step = (step + 1) % CHORDS.length;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[step][i], ac.currentTime, 2.4));
    });
    every(1500, 1500, () => {
      // dos de cada tres pulsos suena una nota del acorde, una octava arriba; el resto deja respirar
      if (Math.random() < 0.34) return;
      const ch = CHORDS[step];
      pluck(ac, arp, ch[1 + (note++ % 3)] * 2);
    });
    const air = gain(ac, 0.03);
    loop(ac, 'pink').connect(filter(ac, 'lowpass', 500)).connect(air).connect(out);
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
