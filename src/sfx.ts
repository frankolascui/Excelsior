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

/** Soplo de ruido con filtro que barre de `from` a `to` Hz (deslizar, pasar página, abrir). */
function swish(ac: AudioContext, at: number, dur: number, from: number, to: number, vol = 0.08) {
  const t0 = ac.currentTime + at;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  src.buffer = buf;
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
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
  /** Tachar algo de la lista: «tic» seco con un brillo encima. */
  check: () => play((ac) => {
    thump(ac, 0, 0.05, 3200, 0.18);
    note(ac, 1318.5, 0.02, 0.09, 'triangle', 0.08);
    note(ac, 1975.5, 0.07, 0.16, 'sine', 0.06);
  }),
  /** Destachar: el mismo «tic» hacia abajo. */
  uncheck: () => play((ac) => note(ac, 900, 0, 0.12, 'sine', 0.06, 520)),
  /** Añadir algo al calendario o a una lista: ficha que se coloca. */
  place: () => play((ac) => {
    thump(ac, 0, 0.07, 1800, 0.22);
    note(ac, G5, 0.04, 0.14, 'triangle', 0.08);
    note(ac, D6, 0.1, 0.2, 'sine', 0.06);
  }),
  /** Coger un evento para moverlo. */
  grab: () => play((ac) => note(ac, 660, 0, 0.06, 'sine', 0.06, 990)),
  /** Soltarlo en su nuevo sitio. */
  drop: () => play((ac) => {
    thump(ac, 0, 0.08, 900, 0.28);
    note(ac, 330, 0, 0.1, 'triangle', 0.07, 247);
  }),
  /** Abrir una hoja o un desplegable. */
  open: () => play((ac) => swish(ac, 0, 0.16, 600, 2600, 0.07)),
  /** Pasar de mes, semana o día. */
  page: () => play((ac) => swish(ac, 0, 0.13, 2400, 900, 0.06)),
  /** Borrar: soplo grave que se va. */
  remove: () => play((ac) => {
    swish(ac, 0, 0.2, 1400, 250, 0.08);
    note(ac, 330, 0, 0.16, 'sine', 0.05, 165);
  }),
  /** Aviso de un recordatorio: campanilla doble. */
  bell: () => play((ac) => {
    [0, 0.22].forEach((t) => {
      note(ac, 1567.98, t, 0.7, 'sine', 0.1);
      note(ac, 2349.3, t, 0.5, 'sine', 0.04);
      note(ac, 3135.9, t, 0.25, 'sine', 0.02);
    });
  }),
  /** Fin de la cuenta atrás: campana. */
  done: () => play((ac) => {
    note(ac, C6, 0, 0.9, 'sine', 0.16);
    note(ac, G5, 0, 0.9, 'sine', 0.08);
    note(ac, C6, 0.45, 0.9, 'sine', 0.12);
  }),
};
