// La lógica de los simulacros, sin pantallas ni base de datos (así se puede probar con tests).
import type { Exam } from './types';

export type ExamStatus = 'pendiente' | 'en-curso' | 'sin-corregir' | 'corregido';

/** En qué punto está: importado → empezado → terminado → corregido. */
export function examStatus(e: Pick<Exam, 'started_at' | 'finished_at' | 'grade'>): ExamStatus {
  if (e.grade !== null) return 'corregido';
  if (e.finished_at) return 'sin-corregir';
  if (e.started_at) return 'en-curso';
  return 'pendiente';
}

/**
 * Busca la nota en la corrección que te da la skill, p. ej. «**Nota: 8,3 / 10.**».
 * Devuelve null si no la encuentra o no está entre 0 y 10.
 */
export function gradeFromCorrection(text: string): number | null {
  const m = text.match(/nota(?:\s+final)?\s*[:=]?\s*\**\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\/\s*10|sobre\s+10)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n >= 0 && n <= 10 ? n : null;
}

/** Minutos de duración si el enunciado los dice («Duración: 50 min», «Tiempo: 1 h 30 min»). */
export function timeLimitFromStatement(text: string): number | null {
  const m = text.match(/(?:duraci[oó]n|tiempo)\s*(?:m[aá]ximo)?\s*[:=]?\s*\**\s*(?:(\d+)\s*h(?:oras?)?)?\s*(?:y\s*)?(?:(\d+)\s*min)?/i);
  if (!m || (!m[1] && !m[2])) return null;
  const total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return total > 0 && total <= 600 ? total : null;
}

/** 8.3 → «8,3». */
export function formatGrade(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/** 3725 → «1 h 02 min»; 59 → «0:59». */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Notas de los simulacros corregidos, del más antiguo al más reciente (para ver la evolución). */
export function gradeTrend(exams: Pick<Exam, 'grade' | 'finished_at' | 'created_at'>[]): number[] {
  return exams
    .filter((e) => e.grade !== null)
    .sort((a, b) => (a.finished_at ?? a.created_at).localeCompare(b.finished_at ?? b.created_at))
    .map((e) => e.grade as number);
}

/** El texto que copias y pegas en el proyecto de Claude para que la skill lo corrija. */
export function correctionPrompt(e: Pick<Exam, 'title' | 'statement' | 'answers' | 'duration_sec' | 'time_limit_min'>, subject: string): string {
  const time = e.duration_sec
    ? `Lo hice en ${Math.round(e.duration_sec / 60)} min${e.time_limit_min ? ` (límite: ${e.time_limit_min} min)` : ''}, sin apuntes.`
    : 'Lo hice en papel; te paso mis respuestas aparte.';
  return [
    `Protocolo Excelsior: corrígeme este simulacro de ${subject} como lo corregiría mi profe. Dame la nota sobre 10 en una línea «Nota: X / 10», qué he fallado y qué repasar.`,
    time,
    '',
    `# Enunciado · ${e.title}`,
    '',
    e.statement.trim(),
    '',
    '# Mis respuestas',
    '',
    e.answers.trim() || '(En papel: te las adjunto en foto.)',
  ].join('\n');
}
