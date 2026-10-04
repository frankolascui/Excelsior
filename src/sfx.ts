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

function play(fn: (ac: AudioContext) => void) {
  const ac = audio();
  if (ac) fn(ac);
}

// Notas (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G4 = 392, A4 = 440, D5 = 587.33;

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
  /** Fin de la cuenta atrás: campana. */
  done: () => play((ac) => {
    note(ac, C6, 0, 0.9, 'sine', 0.16);
    note(ac, G5, 0, 0.9, 'sine', 0.08);
    note(ac, C6, 0.45, 0.9, 'sine', 0.12);
  }),
};
