// El diario de sueño completo (lo que hacía la web de Excelsior Health), sin pantalla: cálculos de cada noche,
// avisos de datos que no cuadran, metas del plan de sueño, comparación semanal y exportar a JSON/CSV.
// Mismas reglas y mismo formato que la web de Health, para que las noches sigan siendo las mismas.
import { addDays, bedtimeGoal, span, toMin, weekStart, type HealthSettings, type Night } from './health';

/** Metas del plan de sueño: latencia ≤30 min, eficiencia ≥85 %, descanso ≥4/5, cama y levantarse ±15 min, 8 h de sueño, 7 noches seguidas. */
export const META = { latencia: 30, eficiencia: 85, descanso: 4, regularidad: 15, sueno: 480, noches: 7 };
export const PHASES = [
  { k: 'despierto', n: 'Despierto' },
  { k: 'rem', n: 'REM' },
  { k: 'ligero', n: 'Ligero' },
  { k: 'profundo', n: 'Profundo' },
] as const;
/** «Lo que tú crees» solo se pregunta las primeras noches: con eso ya se sabe cuánto falla tu percepción. */
export const PERC_NOCHES = 14;

/** Diferencia con signo entre dos horas (−720…720): positivo = la segunda es más tarde. */
export function diffClock(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  let d = toMin(b) - toMin(a);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

export function fmtHm(m: number | null | undefined): string {
  if (m == null || isNaN(m)) return '—';
  const a = Math.abs(m);
  return `${m < 0 ? '-' : ''}${Math.floor(a / 60)}h ${String(Math.round(a % 60)).padStart(2, '0')}m`;
}

export interface Derived {
  sueno_real_min: number | null;
  tiempo_en_cama_min: number | null;
  eficiencia_pct: number | null;
  latencia_real_min: number | null;
  latencia_percibida_min: number | null;
  sueno_percibido_min: number | null;
  error_hora_dormido_min: number | null;
  error_hora_despertar_min: number | null;
  pct: Record<string, number | null>;
  avisos: string[];
}

const n0 = (v: unknown) => (typeof v === 'number' ? v : null);

/** Todo lo que se calcula de una noche y los avisos si algo no cuadra. */
export function derive(r: Night): Derived {
  const p = r.percibido, w = r.reloj, f = w.fases_min, q = r.preguntas;
  const sum = (ks: string[]) => (ks.some((k) => f[k] != null) ? ks.reduce((s, k) => s + (f[k] ?? 0), 0) : null);
  const fasesDormido = sum(['rem', 'ligero', 'profundo']);
  const fasesTodas = sum(['despierto', 'rem', 'ligero', 'profundo']);
  const ventana = span(w.dormido, w.despertar);
  const sueno = w.total_dormido_min || fasesDormido || (ventana == null ? null : ventana - (f.despierto ?? 0));
  const enCama = span(p.cama, p.levantado);
  const percibido = span(p.dormido, p.despertar);
  const c: Derived = {
    sueno_real_min: sueno,
    tiempo_en_cama_min: enCama,
    eficiencia_pct: sueno && enCama ? Math.round((sueno / enCama) * 100) : null,
    latencia_real_min: span(p.cama, w.dormido),
    latencia_percibida_min: span(p.cama, p.dormido),
    sueno_percibido_min: percibido == null ? null : Math.max(0, percibido - (n0(q.despierto_noche_min) ?? 0)),
    error_hora_dormido_min: diffClock(w.dormido, p.dormido),
    error_hora_despertar_min: diffClock(w.despertar, p.despertar),
    pct: {},
    avisos: [],
  };
  for (const ph of PHASES) c.pct[ph.k] = fasesTodas ? Math.round(((f[ph.k] ?? 0) / fasesTodas) * 100) : null;

  const a = c.avisos;
  const chain = (pts: [string, string | null][]) => {
    const xs = pts.filter((x): x is [string, string] => !!x[1]);
    for (let i = 1; i < xs.length; i++) {
      // Margen de 20 min: el reloj y tus horas apuntadas a mano no coinciden al minuto.
      const d = span(xs[i - 1][1], xs[i][1])!;
      if (d > 720 && d < 1440 - 20) a.push(`«${xs[i][0]}» (${xs[i][1]}) parece anterior a «${xs[i - 1][0]}» (${xs[i - 1][1]}). Revisa el orden o si es AM/PM.`);
    }
  };
  chain([['Me metí en la cama', p.cama], ['Me dormí (real)', w.dormido], ['Me desperté (real)', w.despertar], ['Me levanté', p.levantado]]);
  chain([['Me metí en la cama', p.cama], ['Creo que me dormí', p.dormido], ['Creo que me desperté', p.despertar], ['Me levanté', p.levantado]]);
  if (fasesTodas && ventana != null && Math.abs(ventana - fasesTodas) > 15) {
    a.push(`Las fases suman ${fmtHm(fasesTodas)}, pero de «me dormí» a «me desperté» hay ${fmtHm(ventana)} (${Math.abs(ventana - fasesTodas)} min de diferencia). Revisa en Salud que hayas copiado todas las fases.`);
  }
  if (w.total_dormido_min && fasesDormido && Math.abs(w.total_dormido_min - fasesDormido) > 5) {
    a.push(`El total de Salud (${fmtHm(w.total_dormido_min)}) no coincide con REM + ligero + profundo (${fmtHm(fasesDormido)}).`);
  }
  if (c.eficiencia_pct != null && c.eficiencia_pct > 100) a.push('Sale más sueño que tiempo en la cama: revisa las horas de cama y de levantarte.');
  if (enCama != null && enCama > 14 * 60) a.push(`${fmtHm(enCama)} en la cama es mucho: ¿están bien las horas?`);
  return c;
}

/** Avisos del peso (dependen de las otras noches). `raw` es lo que escribiste, para detectar un número imposible. */
export function weightAvisos(r: Night, nights: Night[], raw: string): string[] {
  const kg = r.cuerpo.peso_kg, a: string[] = [];
  if (raw.trim() !== '' && kg == null) a.push('El peso tiene que estar entre 25 y 250 kg (usa punto o coma para los decimales).');
  const prev = kg == null ? null : [...nights].sort((x, y) => y.fecha.localeCompare(x.fecha)).find((n) => n.fecha < r.fecha && n.cuerpo.peso_kg != null);
  if (prev && kg != null && Math.abs(kg - prev.cuerpo.peso_kg!) > 2) a.push(`El peso (${kg} kg) cambia más de 2 kg respecto al ${prev.fecha} (${prev.cuerpo.peso_kg} kg). ¿Es un error al escribirlo?`);
  if (kg != null && r.cuerpo.mismas_condiciones === false) a.push('Pesaje en condiciones distintas: se guarda, pero no cuenta para la tendencia.');
  return a;
}

// ---------- Metas del plan ----------

export interface Check { v: string; ok: boolean | null }
export interface PlanCheck { cama: Check; levantado: Check; latencia: Check; eficiencia: Check; sueno: Check; descanso: Check; todo: boolean }

/** Comprueba una noche contra las metas del plan. ok null = falta el dato. */
export function planCheck(n: Night, s: HealthSettings): PlanCheck {
  const c = derive(n), lev = n.percibido.levantado, cama = n.percibido.cama;
  const reg = lev ? Math.abs(diffClock(s.levantar, lev)!) : null;
  const regC = cama ? Math.abs(diffClock(bedtimeGoal(s), cama)!) : null;
  const d = n0(n.preguntas.descanso);
  const t = {
    cama: { v: cama ?? '—', ok: regC == null ? null : regC <= META.regularidad },
    levantado: { v: lev ?? '—', ok: reg == null ? null : reg <= META.regularidad },
    latencia: { v: c.latencia_real_min == null ? '—' : `${c.latencia_real_min}'`, ok: c.latencia_real_min == null ? null : c.latencia_real_min <= META.latencia },
    eficiencia: { v: c.eficiencia_pct == null ? '—' : `${c.eficiencia_pct}%`, ok: c.eficiencia_pct == null ? null : c.eficiencia_pct >= META.eficiencia },
    sueno: { v: c.sueno_real_min == null ? '—' : `${Math.floor(c.sueno_real_min / 60)}:${String(c.sueno_real_min % 60).padStart(2, '0')}`, ok: c.sueno_real_min == null ? null : c.sueno_real_min >= META.sueno },
    descanso: { v: d == null ? '—' : String(d), ok: d == null ? null : d >= META.descanso },
  };
  return { ...t, todo: Object.values(t).every((x) => x.ok === true) };
}

/** Noches seguidas (hasta la última apuntada) cumpliendo todas las metas del plan. */
export function planRun(nights: Night[], s: HealthSettings): number {
  const ns = [...nights].sort((a, b) => b.fecha.localeCompare(a.fecha));
  let run = 0;
  for (let i = 0; i < ns.length; i++) {
    if (i > 0 && ns[i].fecha !== addDays(ns[i - 1].fecha, -1)) break;
    if (!planCheck(ns[i], s).todo) break;
    run++;
  }
  return run;
}

// ---------- Semanas ----------

/** Entrenos de una semana (lunes a domingo). Cada noche guarda los del día anterior. offset 0 = esta, −1 = la pasada. */
export function trainingWeek(nights: Night[], today: string, offset: number) {
  const start = addDays(weekStart(today), offset * 7), end = addDays(start, 6);
  const byDay = new Map(nights.map((n) => [addDays(n.fecha, -1), n0(n.preguntas.entrenos_ayer)]));
  let total = 0, dias = 0, sinDato = 0;
  for (let x = start; x <= end && x < today; x = addDays(x, 1)) {
    dias++;
    const v = byDay.get(x);
    if (v == null) sinDato++; else total += v;
  }
  return { total, dias, sinDato };
}

const avgOf = <T>(arr: T[], fn: (x: T) => number | null | undefined) => {
  const v = arr.map(fn).filter((x): x is number => x != null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export interface WeekRow { name: string; now: string; prev: string; change: string; tone: 'ok' | 'no' | 'na' }

/** Esta semana frente a la anterior: sueño, hora de cama, eficiencia, descanso, entrenos y peso. */
export function weekCompare(nights: Night[], s: HealthSettings, today: string): { rows: WeekRow[]; now: number; prev: number } {
  const sem = (o: number) => {
    const start = addDays(weekStart(today), o * 7), end = addDays(start, 6);
    return nights.filter((n) => n.fecha >= start && n.fecha <= end);
  };
  const a = sem(0), b = sem(-1), bed = bedtimeGoal(s);
  const sign = (d: number) => (d > 0 ? '+' : '−');
  const defs: [string, (w: Night[], o: number) => number | null, (v: number) => string, number, (d: number) => string][] = [
    ['Sueño real', (w) => avgOf(w, (n) => derive(n).sueno_real_min), fmtHm, 1, (d) => `${sign(d)}${Math.abs(Math.round(d))} min`],
    ['Desviación hora de cama', (w) => avgOf(w, (n) => (n.percibido.cama ? Math.abs(diffClock(bed, n.percibido.cama)!) : null)), (v) => `±${Math.round(v)} min`, -1, (d) => `${sign(d)}${Math.abs(Math.round(d))} min`],
    ['Eficiencia', (w) => avgOf(w, (n) => derive(n).eficiencia_pct), (v) => `${Math.round(v)}%`, 1, (d) => `${sign(d)}${Math.abs(Math.round(d))} pts`],
    ['Descanso', (w) => avgOf(w, (n) => n0(n.preguntas.descanso)), (v) => `${v.toFixed(1)}/5`, 1, (d) => `${sign(d)}${Math.abs(d).toFixed(1)}`],
    ['Entrenos', (_w, o) => trainingWeek(nights, today, o).total, (v) => String(v), 1, (d) => `${sign(d)}${Math.abs(d)}`],
    ['Peso medio', (w) => avgOf(w.filter((n) => n.cuerpo.mismas_condiciones !== false), (n) => n.cuerpo.peso_kg), (v) => `${v.toFixed(1)} kg`, 0, (d) => `${sign(d)}${Math.abs(d).toFixed(1)} kg`],
  ];
  const rows = defs.map(([name, get, show, better, diff]) => {
    const x = get(a, 0), y = get(b, -1);
    const d = x != null && y != null ? x - y : null;
    const tone: WeekRow['tone'] = d == null || Math.abs(d) < 1e-9 || !better ? 'na' : d * better > 0 ? 'ok' : 'no';
    return { name, now: x == null ? '—' : show(x), prev: y == null ? '—' : show(y), change: d == null ? '—' : Math.abs(d) < 1e-9 ? '=' : diff(d), tone };
  });
  return { rows, now: a.length, prev: b.length };
}

/** Consejo del plan de sueño para esta hora del día, y cuánto falta para acostarse o levantarse. */
export function clockAdvice(s: HealthSettings, at: Date) {
  const nm = at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
  const bed = toMin(bedtimeGoal(s)), wake = toMin(s.levantar);
  const dayLen = (bed - wake + 1440) % 1440 || 1440;
  const sinceWake = (nm - wake + 1440) % 1440;
  const awake = sinceWake < dayLen;
  const left = awake ? dayLen - sinceWake : 1440 - sinceWake;
  const ratio = awake ? sinceWake / dayLen : (sinceWake - dayLen) / (1440 - dayLen);
  const tip = !awake ? 'Hora de dormir. Si no tienes sueño, luz tenue y algo tranquilo hasta que se te cierren los ojos.'
    : sinceWake < 30 ? 'Luz intensa ahora: 20–30 min de luz fuerte, y sal fuera en cuanto amanezca.'
      : left <= 30 ? 'Empieza tu rutina: ducha templada, leer en papel y apuntar lo pendiente de mañana.'
        : left <= 60 ? 'Última hora: sin pantallas.'
          : left <= 120 ? 'Luces bajas y cálidas desde ya.'
            : at.getHours() < 12 ? 'Si tomas café, que sea antes de las 12:00.'
              : 'Sin café desde las 12:00. Ejercicio intenso, mejor antes de las 18:00.';
  return { awake, left: Math.floor(left), ratio, tip };
}

// ---------- Exportar ----------

const oldestFirst = (ns: Night[]) => [...ns].sort((a, b) => a.fecha.localeCompare(b.fecha));

/** El mismo JSON que exportaba la web de Health (para que Claude lo analice o como copia). */
export function exportJson(nights: Night[], s: HealthSettings): string {
  return JSON.stringify({
    app: 'Diario de Sueño', version: 1, exportado: new Date().toISOString(),
    objetivo: { acostarse: bedtimeGoal(s), levantarse: s.levantar, horas_en_cama: s.horas, entrenos_semana: s.entrenosPlan, entrenos_minimo: s.entrenosMin, metas: META },
    unidades: {
      fases_min: 'minutos', horas: 'HH:MM local',
      sueno_real_min: 'total de Salud si existe; si no, REM + ligero + profundo',
      tiempo_en_cama_min: 'de «me metí en la cama» a «me levanté»',
      eficiencia_pct: 'sueño real / tiempo en cama × 100',
      latencia_real_min: 'de «me metí en la cama» a «me dormí» del reloj',
      sueno_percibido_min: 'de «creo que me dormí» a «creo que me desperté», menos los minutos despierto que crees',
      error_hora_dormido_min: 'percibido menos real; positivo = crees que te dormiste más tarde',
      avisos: 'incoherencias detectadas al guardar',
      entrenos_ayer: 'entrenos del día anterior a la fecha de la noche',
      cuerpo: 'peso_kg al levantarte; mismas_condiciones = misma hora, ropa y báscula, tras ir al baño y antes de comer',
    },
    noches: oldestFirst(nights).map((n) => ({ ...n, calculado: derive(n) })),
  }, null, 2);
}

export function exportCsv(nights: Night[]): string {
  const cols = ['fecha', 'cama', 'dormido_percibido', 'despertar_percibido', 'levantado', 'dormido_real', 'despertar_real', 'total_dormido_salud_min', 'despierto_min', 'rem_min', 'ligero_min', 'profundo_min', 'sueno_real_min', 'tiempo_en_cama_min', 'eficiencia_pct', 'latencia_real_min', 'sueno_percibido_min', 'latencia_percibida_min', 'error_hora_dormido_min', 'error_hora_despertar_min', 'calidad', 'descanso', 'estres', 'entrenos_ayer', 'despertares', 'despierto_noche_min', 'siesta_min', 'ultima_cafeina', 'ultima_comida', 'pantalla_ultima_hora', 'ejercicio', 'luz_natural', 'suenos', 'notas', 'peso_kg', 'peso_mismas_condiciones', 'avisos'];
  const rows = oldestFirst(nights).map((n) => {
    const p = n.percibido, r = n.reloj, f = r.fases_min, q = n.preguntas, c = derive(n);
    return [n.fecha, p.cama, p.dormido, p.despertar, p.levantado, r.dormido, r.despertar, r.total_dormido_min, f.despierto, f.rem, f.ligero, f.profundo, c.sueno_real_min, c.tiempo_en_cama_min, c.eficiencia_pct, c.latencia_real_min, c.sueno_percibido_min, c.latencia_percibida_min, c.error_hora_dormido_min, c.error_hora_despertar_min, q.calidad, q.descanso, q.estres, q.entrenos_ayer, q.despertares, q.despierto_noche_min, q.siesta_min, q.ultima_cafeina, q.ultima_comida, q.pantalla_ultima_hora, q.ejercicio, q.luz_natural, q.suenos, q.notas, n.cuerpo.peso_kg, n.cuerpo.mismas_condiciones == null ? null : n.cuerpo.mismas_condiciones ? 'si' : 'no', c.avisos.join(' | ')];
  });
  const cell = (v: unknown) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '﻿' + [cols, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
