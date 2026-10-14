// Sonido de fondo para el Deep Work: ambientes sintetizados (sin archivos) o un enlace
// (YouTube, Spotify o un audio directo). Estado compartido entre pantallas con un mini-store.
import { useSyncExternalStore } from 'react';
import type { IconName } from './icon-data';

export type AmbientKind = 'lluvia' | 'blanco' | 'oceano' | 'fuego' | 'bosque' | 'calma';

/**
 * `yt`: grabación real en YouTube (la que eligió Nicolas) que suena en vez del sintetizado si hay internet;
 * `start`: segundo en el que empieza. La Calma no tiene: es música propia, solo inspirada en los fondos de Opera GX.
 */
export const AMBIENTS: { id: AmbientKind; name: string; icon: IconName; yt?: string; start?: number }[] = [
  { id: 'lluvia', name: 'Lluvia', icon: 'amb-lluvia', yt: 'RvdF_EB64vA' },
  { id: 'oceano', name: 'Océano', icon: 'amb-oceano', yt: 'lFQY0sH1U_c' },
  { id: 'fuego', name: 'Hoguera', icon: 'amb-fuego', yt: '4ApMS8qYWo0' },
  { id: 'bosque', name: 'Bosque', icon: 'amb-bosque', yt: 'xNN7iTA57jM' },
  { id: 'calma', name: 'Calma', icon: 'amb-calma' },
  { id: 'blanco', name: 'Ruido blanco', icon: 'amb-blanco', yt: 'APXp4PGZSiI', start: 65 },
];

export type LinkEmbed = { kind: 'youtube' | 'spotify'; src: string } | { kind: 'audio'; src: string };

interface AmbientState {
  playing: AmbientKind | null;
  /** Posición del deslizador (0..1). El volumen real sigue una curva: abajo del todo se puede dejar casi en un susurro. */
  volume: number;
  link: string;
  linkOn: boolean;
  /** true: los ambientes con grabación suenan desde YouTube; false: sintetizados (funcionan sin internet). */
  real: boolean;
  /** Suena el sintetizado mientras la grabación de YouTube carga; al arrancar esta, le pasa el relevo. */
  loadingReal: boolean;
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
    return { playing: null, linkOn: false, loadingReal: false, volume: pos, link: typeof raw?.link === 'string' ? raw.link : '', real: raw?.real !== false };
  } catch {
    return { playing: null, volume: 0.6, link: '', linkOn: false, real: true, loadingReal: false };
  }
}

function set(patch: Partial<AmbientState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ pos: state.volume, link: state.link, real: state.real }));
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
    const start = parseInt(u.searchParams.get('t') ?? u.searchParams.get('start') ?? '', 10);
    if (id) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&enablejsapi=1${start > 0 ? `&start=${start}` : ''}` };
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
  set({ link: link.trim(), linkOn: true, playing: null, loadingReal: false });
}

export function stopLink() {
  set({ linkOn: false });
}

/** Reproductor de la grabación real del ambiente que suena (si la tiene y está elegido «real»). */
export function ambientEmbed(a: AmbientState): LinkEmbed | null {
  const x = AMBIENTS.find((y) => y.id === a.playing);
  if (!a.real || !x?.yt) return null;
  const e = parseLink(`https://www.youtube.com/watch?v=${x.yt}${x.start ? `&t=${x.start}` : ''}`);
  // Arranca en silencio: el sintetizado suena mientras carga y la grabación entra con un fundido al relevo.
  return e && { ...e, src: `${e.src}&mute=1` };
}

/** Cambia entre grabación real y sintetizado; si algo suena, sigue sonando con la otra fuente. */
export function setAmbientReal(real: boolean) {
  const playing = state.playing;
  // Si el sintetizado ya suena (o sigue haciendo de puente mientras carga YouTube), se queda sin reiniciarse.
  if (playing && nodes.length) {
    set({ real, loadingReal: real && !!AMBIENTS.find((x) => x.id === playing)?.yt });
    return;
  }
  set({ real });
  if (playing) playAmbient(playing);
}

/**
 * La grabación de YouTube ya suena: el sintetizado que hacía de puente se apaga despacio (unos 3 s)
 * mientras el reproductor sube su volumen, así no hay silencio ni golpe al cambiar.
 */
export function realStarted() {
  if (!state.loadingReal) return;
  stopSynth(1);
  set({ loadingReal: false });
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

/** Escala los canales para que su volumen medio (RMS) sea `target`: así cada textura suena igual de fuerte. */
function normalize(chs: Float32Array[], target: number) {
  let sum = 0, n = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) (sum += d[i] * d[i]), n++;
  const k = target / Math.sqrt(sum / n || 1);
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= k;
}

/**
 * Lluvia de verdad: miles de gotas diminutas por segundo (un golpe de ruido de menos de 1 ms cada una, casi
 * todas flojas y alguna más fuerte), distintas en cada oído. Las que caen al final dan la vuelta al principio,
 * así el bucle no tiene costura. Devuelve dos canales (estéreo).
 */
export function rainTexture(sr: number, seconds: number, rand: () => number = Math.random): Float32Array[] {
  const len = Math.floor(sr * seconds);
  const chs = [0, 1].map(() => {
    const d = new Float32Array(len);
    const drops = Math.floor(seconds * 2600);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(rand() * len);
      const amp = 0.04 + rand() ** 4 * 0.9;
      const tau = sr * (0.00015 + rand() * 0.0006);
      const n = Math.ceil(tau * 5);
      for (let i = 0; i < n; i++) d[(at + i) % len] += (rand() * 2 - 1) * amp * Math.exp(-i / tau);
    }
    return d;
  });
  normalize(chs, 0.25);
  return chs;
}

/** Ola de una textura: dónde empieza (en muestras), cuánto tarda en subir y en retirarse, y su tamaño. */
interface Wave { at: number; rise: number; fall: number; size: number }

/**
 * Orilla del mar: olas cada 9-15 s, de distinto tamaño. Cada una crece despacio (ruido grave que se va abriendo),
 * rompe (se abre a agudos) y deja espuma que se retira siseando. Debajo, un fondo grave continuo.
 * Todo da la vuelta al bucle, que no tiene costura. Devuelve dos canales.
 */
export function oceanTexture(sr: number, seconds: number, rand: () => number = Math.random): Float32Array[] {
  const len = Math.floor(sr * seconds);
  const waves: Wave[] = [];
  for (let t = rand() * 3; t < seconds - 4; t += 9 + rand() * 6) {
    waves.push({ at: Math.floor(t * sr), rise: (3 + rand() * 2.5) * sr, fall: (5 + rand() * 4) * sr, size: 0.55 + rand() * 0.45 });
  }
  // Envolventes: fuerza de la ola (también abre el filtro) y espuma.
  const body = new Float32Array(len);
  const foam = new Float32Array(len);
  for (const w of waves) {
    const n = Math.floor(w.rise + w.fall * 2.5);
    for (let i = 0; i < n; i++) {
      const j = (w.at + i) % len;
      const up = i < w.rise ? (i / w.rise) ** 2 : Math.exp(-(i - w.rise) / (w.fall / 2.2));
      body[j] = Math.max(body[j], up * w.size);
      if (i >= w.rise) {
        const k = i - w.rise;
        foam[j] = Math.max(foam[j], Math.min(1, k / (0.25 * sr)) * Math.exp(-k / (w.fall / 1.6)) * w.size);
      }
    }
  }
  // Cuánto se abre el filtro en cada momento (se calcula cada 32 muestras: cambia despacio y así va rápido).
  const coef = new Float32Array(Math.ceil(len / 32));
  for (let b = 0; b < coef.length; b++) coef[b] = 1 - Math.exp((-2 * Math.PI * (140 + body[b * 32] ** 1.6 * 2200)) / sr);
  const kRumble = 1 - Math.exp((-2 * Math.PI * 30) / sr);
  const kHiss = 1 - Math.exp((-2 * Math.PI * 2000) / sr);
  const warm = Math.min(len, sr);
  const chs = [0, 1].map(() => {
    const d = new Float32Array(len);
    // Primero se calientan los filtros con el último segundo del bucle, así el final enlaza con el principio.
    let lp = 0, rumble = 0, hissLp = 0;
    for (let n = len - warm; n < len + len; n++) {
      const i = n % len;
      const w = rand() * 2 - 1;
      lp += coef[i >> 5] * (w - lp);
      rumble += kRumble * (w - rumble);
      hissLp += kHiss * (w - hissLp);
      const hiss = w - hissLp; // agudos: el siseo de la espuma
      if (n >= len) d[i] = lp * (0.12 + body[i] * 1.1) + rumble * 2.2 + hiss * foam[i] * 0.09;
    }
    return d;
  });
  normalize(chs, 0.22);
  return chs;
}

const textures = new Map<'rain' | 'ocean', Float32Array[]>();
/** Las texturas se calculan a 22 kHz (sobra: se filtran por debajo de 7 kHz) y el navegador las adapta; así tardan la mitad. */
const TEXTURE_SR = 22050;

function textureData(name: 'rain' | 'ocean'): Float32Array[] {
  let chs = textures.get(name);
  if (!chs) textures.set(name, (chs = name === 'rain' ? rainTexture(TEXTURE_SR, 23) : oceanTexture(TEXTURE_SR, 61)));
  return chs;
}

/** Calcula las texturas en un rato libre (al abrir el Deep Work), para que luego suenen sin esperar nada. */
export function warmAmbient() {
  const idle = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 800));
  idle(() => {
    textureData('rain');
    idle(() => textureData('ocean'));
  });
}

/** Reproduce en bucle una textura estéreo. */
function texture(ac: AudioContext, name: 'rain' | 'ocean'): AudioBufferSourceNode {
  const chs = textureData(name);
  const buf = ac.createBuffer(2, chs[0].length, TEXTURE_SR);
  for (let i = 0; i < 2; i++) buf.getChannelData(i).set(chs[i]);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  nodes.push(src);
  return src;
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

// Acordes de la «Calma» en La menor (Am9 – Fmaj7 – Cmaj7 – Em7): oscuros y abiertos, como los fondos de
// Opera GX, pero propios. Primera nota = bajo; el resto, el colchón.
const CHORDS = [
  [55, 220, 261.63, 329.63, 493.88],
  [43.65, 174.61, 220, 261.63, 329.63],
  [65.41, 196, 246.94, 261.63, 329.63],
  [41.2, 164.81, 196, 246.94, 293.66],
];
/** Pulso de la Calma: 84 pulsos por minuto, el arpegio va a corcheas. */
const BEAT_S = 60 / 84;

/** Para el ambiente que suena: baja en `fade` s (por defecto un instante, sin clic) y después desmonta sus nodos. */
function stopSynth(fade = 0.06) {
  timers.forEach(clearTimeout);
  timers.clear();
  const old = nodes;
  const oldOut = outNode;
  nodes = [];
  outNode = null;
  if (!old.length || !ctx) return;
  const t = ctx.currentTime;
  oldOut?.gain.cancelScheduledValues(t);
  oldOut?.gain.setTargetAtTime(0, t, fade);
  old.forEach((n) => {
    try {
      if (n instanceof AudioScheduledSourceNode) n.stop(t + fade * 7);
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
  }), fade * 7000 + 200);
}

export function playAmbient(kind: AmbientKind) {
  stopSynth();
  // Siempre arranca el sintetizado al momento; con «Grabación real», hace de puente hasta que YouTube suene.
  const loadingReal = state.real && !!AMBIENTS.find((x) => x.id === kind)?.yt;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Sin audio en el navegador: si hay grabación, que suene al menos esa.
    if (loadingReal) set({ playing: kind, linkOn: false, loadingReal: false });
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
    // Lluvia vista desde dentro, junto a una ventana: miles de gotas finas (la textura, en estéreo) un poco apagadas
    // por el cristal, un fondo grave del aguacero y, de vez en cuando, una gota que choca contra el vidrio.
    const drops = gain(ac, 0.55);
    const shelf = filter(ac, 'highshelf', 3500);
    shelf.gain.value = -8;
    texture(ac, 'rain').connect(filter(ac, 'highpass', 350)).connect(filter(ac, 'lowpass', 6500, 0.5)).connect(shelf).connect(drops).connect(out);
    const outside = gain(ac, 0.22);
    drift(ac, outside.gain, 0.018, 0.04);
    loop(ac, 'pink').connect(filter(ac, 'highpass', 90)).connect(filter(ac, 'lowpass', 700, 0.5)).connect(outside).connect(out);
    const glass = gain(ac, 3);
    glass.connect(filter(ac, 'lowpass', 4200)).connect(out);
    every(900, 3200, () => windowDrop(ac, glass));
    // a veces dos o tres gotas casi juntas, como cuando resbala un hilo de agua
    every(6000, 15000, () => { for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) later(i * (120 + Math.random() * 200), () => windowDrop(ac, glass, 0.6)); });
  } else if (kind === 'oceano') {
    // Orilla: olas que crecen, rompen y se retiran con espuma (textura de un minuto, en estéreo y sin costura).
    const g = gain(ac, 0.9);
    texture(ac, 'ocean').connect(filter(ac, 'lowpass', 7000, 0.5)).connect(g).connect(out);
  } else if (kind === 'fuego') {
    // Solo la hoguera: crepitar seco de la madera en rachas (cada chasquido en un lado distinto), algún «toc»
    // grave de un tronco, un siseo corto de savia muy de vez en cuando y un rescoldo bajo y quieto
    // (sin ruido que suba y baje: sonaba a viento).
    const ember = gain(ac, 0.1);
    loop(ac, 'brown').connect(filter(ac, 'lowpass', 150)).connect(ember).connect(out);
    const flame = gain(ac, 0.035); // el aire de la llama, quieto y muy flojo
    loop(ac, 'pink').connect(filter(ac, 'bandpass', 500, 0.6)).connect(flame).connect(out);
    const fire = gain(ac, 6);
    fire.connect(filter(ac, 'lowpass', 5200)).connect(out);
    const sides = [-0.6, -0.25, 0.1, 0.45, 0.7].map((p) => {
      const pan = ac.createStereoPanner();
      pan.pan.value = p;
      pan.connect(fire);
      nodes.push(pan);
      return pan;
    });
    const side = () => sides[Math.floor(Math.random() * sides.length)];
    every(180, 1000, () => {
      const n = 1 + Math.floor(Math.random() * 6);
      const at = side();
      for (let i = 0; i < n; i++) later(i * (15 + Math.random() * 90), () => crackle(ac, at, 1500 + Math.random() * 3000, 0.04 + Math.random() * 0.09, 0.002 + Math.random() * 0.006));
    });
    every(2500, 7000, () => crackle(ac, side(), 240 + Math.random() * 260, 0.14, 0.05));
    every(20000, 45000, () => crackle(ac, side(), 4500, 0.006, 0.35 + Math.random() * 0.4));
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
    // Inspirada en los fondos de Opera GX (sin copiarlos): colchón de sintetizador que «respira» a tempo,
    // arpegio a corcheas con eco y un filtro que se abre y se cierra muy despacio, sobre un bajo redondo.
    const pad = gain(ac, 0.07);
    const padTone = filter(ac, 'lowpass', 900, 0.9);
    drift(ac, padTone.frequency, 0.03, 450); // el filtro sube y baja en ~30 s
    const pump = gain(ac, 0.8);
    drift(ac, pump.gain, 1 / BEAT_S, 0.18); // respiración a cada pulso, suave
    pad.connect(padTone).connect(pump).connect(out);
    const voices = CHORDS[0].slice(1).map((hz, i) => {
      const g = gain(ac, 0.5);
      drift(ac, g.gain, 0.04 + i * 0.017, 0.12);
      g.connect(pad);
      // dos dientes de sierra un poco desafinados por voz: el sonido ancho típico de sintetizador
      return [-7, 7].map((cents) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz;
        o.detune.value = cents;
        o.connect(g);
        o.start();
        nodes.push(o);
        return o;
      });
    });
    const sub = ac.createOscillator();
    const subG = gain(ac, 0.07);
    sub.type = 'sine';
    sub.frequency.value = CHORDS[0][0];
    sub.connect(subG).connect(out);
    sub.start();
    nodes.push(sub);
    // arpegio: notas cortas con eco a tresillo de corchea y filtro que también respira
    const arp = gain(ac, 0.045);
    const arpTone = filter(ac, 'lowpass', 1600, 2);
    drift(ac, arpTone.frequency, 0.021, 700);
    const echo = ac.createDelay(2);
    echo.delayTime.value = BEAT_S * 0.75;
    const fb = gain(ac, 0.38);
    const dark = filter(ac, 'lowpass', 2200);
    nodes.push(echo);
    arp.connect(arpTone).connect(out);
    arpTone.connect(echo).connect(dark).connect(fb).connect(echo);
    dark.connect(out);
    const PATTERN = [0, 1, 2, 3, 2, 1, 3, 1];
    let step = 0;
    let beat = 0;
    every(BEAT_S * 16 * 1000, BEAT_S * 16 * 1000, () => {
      step = (step + 1) % CHORDS.length;
      const t = ac.currentTime;
      voices.forEach((pair, i) => pair.forEach((o) => o.frequency.setTargetAtTime(CHORDS[step][i + 1], t, 0.8)));
      sub.frequency.setTargetAtTime(CHORDS[step][0], t, 0.3);
    });
    every(BEAT_S * 500, BEAT_S * 500, () => {
      const ch = CHORDS[step];
      const i = PATTERN[beat++ % PATTERN.length];
      // cada 4 compases el arpegio descansa uno, para que no canse
      if (Math.floor(beat / 8) % 4 === 3) return;
      pluck(ac, arp, ch[1 + i] * 2);
    });
    const air = gain(ac, 0.025);
    loop(ac, 'pink').connect(filter(ac, 'lowpass', 500)).connect(air).connect(out);
  }
  set({ playing: kind, linkOn: false, loadingReal });
}

export function stopAmbient() {
  stopSynth();
  set({ playing: null, loadingReal: false });
}

/** `pos` es la posición del deslizador (0..1); el volumen real sigue la curva de `gainFor`. */
export function setAmbientVolume(pos: number) {
  if (master && ctx) master.gain.setTargetAtTime(gainFor(pos), ctx.currentTime, 0.05);
  set({ volume: pos });
}
