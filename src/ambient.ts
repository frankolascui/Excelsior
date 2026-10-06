// Sonido de fondo para el Deep Work: ambientes sintetizados (sin archivos) o un enlace
// (YouTube, Spotify o un audio directo). Estado compartido entre pantallas con un mini-store.
import { useSyncExternalStore } from 'react';

export type AmbientKind = 'lluvia' | 'marron' | 'oceano' | 'fuego';

export const AMBIENTS: { id: AmbientKind; name: string; icon: string }[] = [
  { id: 'lluvia', name: 'Lluvia', icon: '🌧️' },
  { id: 'oceano', name: 'Océano', icon: '🌊' },
  { id: 'fuego', name: 'Hoguera', icon: '🔥' },
  { id: 'marron', name: 'Ruido marrón', icon: '🟤' },
];

export type LinkEmbed = { kind: 'youtube' | 'spotify'; src: string } | { kind: 'audio'; src: string };

interface AmbientState {
  playing: AmbientKind | null;
  volume: number; // 0..1
  link: string;
  linkOn: boolean;
}

const KEY = 'excelsior:ambient';
let state: AmbientState = load();
const listeners = new Set<() => void>();

function load(): AmbientState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { playing: null, linkOn: false, volume: typeof raw?.volume === 'number' ? raw.volume : 0.5, link: typeof raw?.link === 'string' ? raw.link : '' };
  } catch {
    return { playing: null, volume: 0.5, link: '', linkOn: false };
  }
}

function set(patch: Partial<AmbientState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ volume: state.volume, link: state.link }));
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

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let timers: number[] = [];

function noiseBuffer(ac: AudioContext, brown: boolean): AudioBuffer {
  const len = ac.sampleRate * 3;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = white;
  }
  return buf;
}

function loop(ac: AudioContext, brown: boolean): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, brown);
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

/** Chasquido corto (gotas, brasas) cada cierto tiempo aleatorio. */
function sparkles(ac: AudioContext, out: AudioNode, everyMs: number, freq: number, vol: number) {
  const tick = () => {
    const len = Math.ceil(ac.sampleRate * 0.03);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * (0.6 + Math.random() * 0.8);
    g.gain.value = vol * (0.3 + Math.random() * 0.7);
    src.buffer = buf;
    src.connect(f).connect(g).connect(out);
    src.start();
    timers.push(window.setTimeout(tick, everyMs * (0.3 + Math.random() * 1.4)));
  };
  tick();
}

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
  master.gain.value = state.volume;
  master.connect(ac.destination);
  const out = master;

  if (kind === 'marron') {
    loop(ac, true).connect(filter(ac, 'lowpass', 600)).connect(out);
  } else if (kind === 'lluvia') {
    const g = ac.createGain();
    g.gain.value = 0.35;
    nodes.push(g);
    loop(ac, false).connect(filter(ac, 'highpass', 500)).connect(filter(ac, 'lowpass', 6000)).connect(g).connect(out);
    sparkles(ac, out, 60, 3500, 0.5);
  } else if (kind === 'oceano') {
    const g = ac.createGain();
    g.gain.value = 0.6;
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 0.09; // una ola cada ~11 s
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(g.gain);
    lfo.start();
    nodes.push(g, lfo, depth);
    loop(ac, true).connect(filter(ac, 'lowpass', 900)).connect(g).connect(out);
  } else if (kind === 'fuego') {
    const g = ac.createGain();
    g.gain.value = 0.5;
    nodes.push(g);
    loop(ac, true).connect(filter(ac, 'lowpass', 350)).connect(g).connect(out);
    sparkles(ac, out, 140, 2500, 0.8);
  }
  set({ playing: kind, linkOn: false });
}

export function stopAmbient() {
  stopSynth();
  set({ playing: null });
}

export function setAmbientVolume(v: number) {
  if (master) master.gain.value = v;
  set({ volume: v });
}
