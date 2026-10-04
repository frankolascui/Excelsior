// Efectos de sonido sintetizados con Web Audio (sin archivos). Se pueden silenciar;
// la preferencia se guarda en este navegador.

const KEY = 'excelsior:sfx-muted';
let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* ignorado */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Una nota con ataque rápido y caída suave. `at` y `dur` en segundos. */
function note(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.16, slideTo?: number) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Golpe de ruido filtrado (impactos, martillazos). */
function thump(ac: AudioContext, at: number, dur: number, freq: number, vol = 0.25) {
  const t0 = ac.currentTime + at;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

function play(fn: (ac: AudioContext) => void) {
  const ac = audio();
  if (ac) fn(ac);
}

// Notas (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G4 = 392, A4 = 440, D5 = 587.33;
const C4 = 261.63, F4 = 349.23, A5 = 880, B5 = 987.77, D6 = 1174.66, G6 = 1567.98;

export const sfx = {
  /** XP ganado: arpegio corto ascendente. */
  reward: () => play((ac) => {
    note(ac, C5, 0, 0.12);
    note(ac, E5, 0.06, 0.12);
    note(ac, G5, 0.12, 0.18);
    note(ac, C6, 0.18, 0.28, 'sine', 0.12);
  }),
  /** XP retirado (deshacer). */
  undo: () => play((ac) => note(ac, E5, 0, 0.22, 'sine', 0.1, G4)),
  /** Subida de nivel o nuevo avatar: pequeña fanfarria. */
  levelUp: () => play((ac) => {
    [C5, E5, G5, C6].forEach((f, i) => note(ac, f, i * 0.09, 0.2, 'square', 0.07));
    note(ac, E6, 0.38, 0.6, 'triangle', 0.14);
    note(ac, C6, 0.38, 0.6, 'sine', 0.1);
  }),
  /** Empezar Deep Work. */
  start: () => play((ac) => {
    note(ac, A4, 0, 0.14, 'sine', 0.12);
    note(ac, D5, 0.1, 0.3, 'sine', 0.14);
  }),
  /** Volver al foco. */
  focus: () => play((ac) => note(ac, G4, 0, 0.25, 'sine', 0.12, C5)),
  /** Descanso. */
  rest: () => play((ac) => {
    note(ac, G5, 0, 0.2, 'sine', 0.08);
    note(ac, E5, 0.12, 0.35, 'sine', 0.08);
  }),
  /** Distracción: zumbido grave. */
  distraction: () => play((ac) => note(ac, 180, 0, 0.35, 'sawtooth', 0.06, 110)),
  /** Hábito marcado: punteo corto y brillante. */
  habit: () => play((ac) => {
    note(ac, A5, 0, 0.1, 'triangle', 0.13);
    note(ac, E6, 0.05, 0.18, 'sine', 0.1);
  }),
  /** Monedas: «clinc-clinc». */
  coin: () => play((ac) => {
    note(ac, B5, 0, 0.08, 'square', 0.06);
    note(ac, E6, 0.07, 0.35, 'square', 0.06);
  }),
  /** Canjear una recompensa: cascada de monedas. */
  purchase: () => play((ac) => {
    [E6, G6, D6, G6, E6].forEach((f, i) => note(ac, f, i * 0.05, 0.14, 'square', 0.045));
    note(ac, C6, 0.28, 0.5, 'triangle', 0.12);
  }),
  /** Invocar un boss: acorde grave y amenazante. */
  summon: () => play((ac) => {
    note(ac, 110, 0, 1.1, 'sawtooth', 0.07, 82);
    note(ac, 116.5, 0, 1.1, 'sawtooth', 0.05, 87);
    thump(ac, 0, 0.6, 300, 0.35);
  }),
  /** Golpe al boss. */
  hit: () => play((ac) => {
    thump(ac, 0, 0.18, 1200, 0.3);
    note(ac, 220, 0, 0.12, 'square', 0.05, 110);
  }),
  /** Boss derrotado o reino completado: fanfarria épica. */
  victory: () => play((ac) => {
    [C4, F4, A4, C5].forEach((f, i) => note(ac, f, i * 0.12, 0.3, 'square', 0.06));
    [C5, E5, G5, C6].forEach((f) => note(ac, f, 0.55, 1.2, 'triangle', 0.08));
    note(ac, G6, 0.75, 0.9, 'sine', 0.05);
    thump(ac, 0.55, 0.5, 400, 0.3);
  }),
  /** Construir en un reino: dos martillazos. */
  build: () => play((ac) => {
    thump(ac, 0, 0.09, 2500, 0.35);
    thump(ac, 0.16, 0.09, 2500, 0.35);
    note(ac, G5, 0.3, 0.3, 'triangle', 0.1);
  }),
  /** Pasar de paso en el tutorial o abrir algo. */
  tick: () => play((ac) => note(ac, 1400, 0, 0.05, 'sine', 0.05)),
  /** Fin de la cuenta atrás: campana. */
  done: () => play((ac) => {
    note(ac, C6, 0, 0.9, 'sine', 0.16);
    note(ac, G5, 0, 0.9, 'sine', 0.08);
    note(ac, C6, 0.45, 0.9, 'sine', 0.12);
  }),
};
