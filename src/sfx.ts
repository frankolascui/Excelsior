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

let bus: { dry: GainNode; wet: GainNode } | null = null;

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

/**
 * Salida común: un poco de sala (reverberación corta generada aquí), un filtro que quita lo más chillón y un
 * compresor suave para que ningún sonido pegue más fuerte que otro.
 */
function out(ac: AudioContext): { dry: GainNode; wet: GainNode } {
  if (bus) return bus;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const soft = ac.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 9000;
  soft.connect(comp).connect(ac.destination);
  const dry = ac.createGain();
  dry.connect(soft);
  const len = Math.floor(ac.sampleRate * 1.4);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const verb = ac.createConvolver();
  verb.buffer = ir;
  const wet = ac.createGain();
  const back = ac.createGain();
  back.gain.value = 0.32;
  wet.connect(verb).connect(back).connect(soft);
  bus = { dry, wet };
  return bus;
}

/** Envía un nodo a la salida seca y, en parte (`room`), a la sala. */
function send(ac: AudioContext, node: AudioNode, room: number) {
  const o = out(ac);
  node.connect(o.dry);
  if (room > 0) {
    const g = ac.createGain();
    g.gain.value = room;
    node.connect(g).connect(o.wet);
  }
}

/** Una nota con ataque corto y caída suave. `at` y `dur` en segundos. */
function note(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.16, slideTo?: number, room = 0.25) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur * 0.8);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  send(ac, gain, room);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Campanita: nota con su armónico brillante encima (suena «a cristal», nada estridente). */
function chime(ac: AudioContext, freq: number, at: number, dur: number, vol = 0.12, room = 0.4) {
  note(ac, freq, at, dur, 'sine', vol, undefined, room);
  note(ac, freq * 2.01, at, dur * 0.55, 'sine', vol * 0.35, undefined, room);
  note(ac, freq * 3.02, at, dur * 0.3, 'sine', vol * 0.12, undefined, room);
}

/** Nota «de metal» (fanfarrias): diente de sierra con filtro, para que suene a trompa y no a zumbido. */
function brass(ac: AudioContext, freq: number, at: number, dur: number, vol = 0.07) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const f = ac.createBiquadFilter();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 1.5, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 5, t0 + 0.06);
  f.frequency.exponentialRampToValueAtTime(freq * 2, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(vol * 0.6, t0 + dur * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(f).connect(gain);
  send(ac, gain, 0.3);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
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
  src.connect(filter).connect(gain);
  send(ac, gain, 0.1);
  src.start(t0);
}

/** Golpe de ruido filtrado (impactos, martillazos, el «tac» de un botón). */
function thump(ac: AudioContext, at: number, dur: number, freq: number, vol = 0.25, room = 0.15) {
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
  src.connect(filter).connect(gain);
  send(ac, gain, room);
  src.start(t0);
}

function play(fn: (ac: AudioContext) => void) {
  const ac = audio();
  if (ac) fn(ac);
}

// Notas (Hz)
const C4 = 261.63, F4 = 349.23, G4 = 392, A4 = 440;
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, B5 = 987.77;
const C6 = 1046.5, D6 = 1174.66, E6 = 1318.5, G6 = 1567.98, C7 = 2093;

export const sfx = {
  /** XP ganado (misión): arpegio mayor que sube y se queda brillando. */
  reward: () => play((ac) => {
    note(ac, C5, 0, 0.16, 'triangle', 0.12);
    note(ac, E5, 0.065, 0.16, 'triangle', 0.12);
    note(ac, G5, 0.13, 0.2, 'triangle', 0.12);
    chime(ac, C6, 0.2, 0.7, 0.1);
  }),
  /** Deshacer: las mismas notas hacia abajo, más bajito. */
  undo: () => play((ac) => {
    note(ac, G5, 0, 0.14, 'sine', 0.08);
    note(ac, C5, 0.08, 0.3, 'sine', 0.08, G4);
  }),
  /** Subida de nivel o nuevo avatar: fanfarria corta y acorde de campanas. */
  levelUp: () => play((ac) => {
    [C5, E5, G5].forEach((f, i) => brass(ac, f, i * 0.09, 0.22, 0.06));
    brass(ac, C6, 0.27, 0.7, 0.06);
    [C6, E6, G6].forEach((f) => chime(ac, f, 0.3, 1.1, 0.06));
  }),
  /** Logro desbloqueado: medalla que tintinea (tres campanitas en escalera y un brillo). */
  achievement: () => play((ac) => {
    chime(ac, G5, 0, 0.5, 0.1);
    chime(ac, C6, 0.1, 0.55, 0.1);
    chime(ac, E6, 0.2, 0.9, 0.11);
    note(ac, C7, 0.32, 0.6, 'sine', 0.03, undefined, 0.6);
  }),
  /** Empezar Deep Work: quinta ascendente tranquila, como un gong pequeño. */
  start: () => play((ac) => {
    chime(ac, A4, 0, 0.9, 0.11, 0.5);
    chime(ac, E5, 0.18, 1.2, 0.1, 0.5);
  }),
  /** Volver al foco: nota que sube y se asienta. */
  focus: () => play((ac) => {
    note(ac, G4, 0, 0.3, 'sine', 0.1, C5, 0.35);
    chime(ac, C5, 0.22, 0.6, 0.07);
  }),
  /** Descanso: dos notas que bajan, suaves. */
  rest: () => play((ac) => {
    chime(ac, E5, 0, 0.6, 0.07, 0.5);
    chime(ac, C5, 0.2, 0.9, 0.07, 0.5);
  }),
  /** Distracción: aviso grave y corto, sin castigar (dos «bom» que bajan). */
  distraction: () => play((ac) => {
    note(ac, 233, 0, 0.16, 'triangle', 0.1, 220);
    note(ac, 196, 0.13, 0.28, 'triangle', 0.1, 175);
  }),
  /** Hábito marcado: punteo corto con un brillo. */
  habit: () => play((ac) => {
    thump(ac, 0, 0.03, 4000, 0.08, 0);
    note(ac, A5, 0, 0.14, 'triangle', 0.11);
    chime(ac, E6, 0.05, 0.4, 0.07);
  }),
  /** Monedas: «clinc-clinc». */
  coin: () => play((ac) => {
    note(ac, B5, 0, 0.09, 'square', 0.035, undefined, 0.15);
    note(ac, B5, 0, 0.09, 'sine', 0.06);
    note(ac, E6, 0.075, 0.4, 'square', 0.03, undefined, 0.2);
    chime(ac, E6, 0.075, 0.45, 0.06);
  }),
  /** Canjear una recompensa: lluvia de monedas que acaba en un acorde. */
  purchase: () => play((ac) => {
    [E6, G6, D6, G6, E6, C7].forEach((f, i) => note(ac, f, i * 0.045, 0.16, 'triangle', 0.05));
    [C5, E5, G5].forEach((f) => chime(ac, f * 2, 0.3, 0.8, 0.05));
  }),
  /** Invocar un boss: acorde grave que crece y un golpe. */
  summon: () => play((ac) => {
    brass(ac, 110, 0, 1.3, 0.07);
    brass(ac, 116.5, 0.02, 1.3, 0.05);
    brass(ac, 82.4, 0.1, 1.3, 0.05);
    thump(ac, 0, 0.7, 220, 0.4, 0.4);
  }),
  /** Golpe al boss: impacto seco con cuerpo. */
  hit: () => play((ac) => {
    thump(ac, 0, 0.16, 1400, 0.3, 0.2);
    note(ac, 196, 0, 0.14, 'triangle', 0.09, 98);
  }),
  /** Boss derrotado o reino completado: fanfarria épica. */
  victory: () => play((ac) => {
    [C4, F4, A4, C5].forEach((f, i) => brass(ac, f, i * 0.12, 0.32, 0.06));
    [C5, E5, G5].forEach((f) => brass(ac, f, 0.55, 1.3, 0.045));
    [C6, E6, G6].forEach((f) => chime(ac, f, 0.6, 1.4, 0.045));
    thump(ac, 0.55, 0.5, 300, 0.3, 0.4);
  }),
  /** Construir en un reino: dos martillazos y una nota de «listo». */
  build: () => play((ac) => {
    thump(ac, 0, 0.08, 2600, 0.3);
    note(ac, 1900, 0, 0.06, 'triangle', 0.04);
    thump(ac, 0.15, 0.08, 2600, 0.3);
    note(ac, 1900, 0.15, 0.06, 'triangle', 0.04);
    chime(ac, G5, 0.3, 0.55, 0.09);
  }),
  /** Elegir algo (opción, pestaña, paso del tutorial): «tic» suave. */
  tick: () => play((ac) => {
    thump(ac, 0, 0.018, 5000, 0.06, 0);
    note(ac, 1320, 0, 0.05, 'sine', 0.04, undefined, 0);
  }),
  /** Tachar algo de la lista: «tic» con un brillo encima. */
  check: () => play((ac) => {
    thump(ac, 0, 0.04, 3200, 0.16, 0);
    note(ac, E6, 0.015, 0.1, 'triangle', 0.07);
    chime(ac, B5 * 2, 0.06, 0.35, 0.05);
  }),
  /** Destachar: el mismo «tic» hacia abajo. */
  uncheck: () => play((ac) => note(ac, 880, 0, 0.14, 'sine', 0.06, 520, 0.1)),
  /** Añadir algo (al calendario, a una lista, a la tienda): ficha que se coloca. */
  place: () => play((ac) => {
    thump(ac, 0, 0.06, 1800, 0.2);
    note(ac, G5, 0.03, 0.14, 'triangle', 0.08);
    chime(ac, D6, 0.09, 0.35, 0.05);
  }),
  /** Coger un evento para moverlo. */
  grab: () => play((ac) => note(ac, 660, 0, 0.07, 'sine', 0.06, 990, 0)),
  /** Soltarlo en su nuevo sitio. */
  drop: () => play((ac) => {
    thump(ac, 0, 0.07, 900, 0.24);
    note(ac, 330, 0, 0.12, 'triangle', 0.07, 262);
  }),
  /** Abrir una hoja o un desplegable. */
  open: () => play((ac) => swish(ac, 0, 0.16, 600, 2600, 0.06)),
  /** Pasar de mes, semana o día. */
  page: () => play((ac) => swish(ac, 0, 0.13, 2400, 900, 0.05)),
  /** Borrar: soplo grave que se va. */
  remove: () => play((ac) => {
    swish(ac, 0, 0.2, 1400, 250, 0.07);
    note(ac, 330, 0, 0.18, 'sine', 0.05, 165, 0.1);
  }),
  /** Aviso de un recordatorio: campanilla doble. */
  bell: () => play((ac) => {
    [0, 0.24].forEach((t) => chime(ac, G6, t, 0.8, 0.08, 0.45));
  }),
  /** Fin de la cuenta atrás: campana que resuena. */
  done: () => play((ac) => {
    chime(ac, C6, 0, 1.4, 0.13, 0.5);
    chime(ac, G5, 0, 1.4, 0.06, 0.5);
    chime(ac, C6, 0.5, 1.6, 0.1, 0.5);
  }),
};
