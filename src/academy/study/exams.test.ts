import { describe, expect, it } from 'vitest';
import { correctionPrompt, examStatus, formatClock, formatGrade, gradeFromCorrection, gradeTrend, timeLimitFromStatement } from './exams';

describe('simulacros', () => {
  it('estado según lo que se ha hecho', () => {
    const base = { started_at: null, finished_at: null, grade: null };
    expect(examStatus(base)).toBe('pendiente');
    expect(examStatus({ ...base, started_at: 'x' })).toBe('en-curso');
    expect(examStatus({ ...base, started_at: 'x', finished_at: 'y' })).toBe('sin-corregir');
    expect(examStatus({ ...base, finished_at: 'y', grade: 8.3 })).toBe('corregido');
  });

  it('lee la nota de la corrección de la skill', () => {
    expect(gradeFromCorrection('# Corrección\n\n**Nota: 8,3 / 10.** Corregido con…')).toBe(8.3);
    expect(gradeFromCorrection('Nota final: 7.5')).toBe(7.5);
    expect(gradeFromCorrection('nota 6 sobre 10')).toBe(6);
    expect(gradeFromCorrection('Sin nota todavía')).toBeNull();
    expect(gradeFromCorrection('Nota: 85 / 100')).toBeNull();
  });

  it('lee la duración del enunciado', () => {
    expect(timeLimitFromStatement('**Duración:** 50 min')).toBe(50);
    expect(timeLimitFromStatement('Tiempo: 1 h 30 min')).toBe(90);
    expect(timeLimitFromStatement('Tiempo máximo: 2 horas')).toBe(120);
    expect(timeLimitFromStatement('**Total: 10 puntos.** Sin apuntes y cronometrado.')).toBeNull();
  });

  it('formatos', () => {
    expect(formatGrade(8.3)).toBe('8,3');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('evolución en orden de fecha y sin los no corregidos', () => {
    expect(gradeTrend([
      { grade: 8.3, finished_at: '2026-10-22T12:00', created_at: '2026-10-22' },
      { grade: null, finished_at: null, created_at: '2026-10-23' },
      { grade: 6.9, finished_at: '2026-10-22T10:00', created_at: '2026-10-22' },
    ])).toEqual([6.9, 8.3]);
  });

  it('el texto para corregir lleva enunciado y respuestas', () => {
    const t = correctionPrompt({ title: 'Sim 2', statement: '## 1. Pregunta', answers: 'Mi respuesta', duration_sec: 3000, time_limit_min: 60 }, 'Lengua');
    expect(t).toContain('simulacro de Lengua');
    expect(t).toContain('Lo hice en 50 min (límite: 60 min)');
    expect(t.indexOf('## 1. Pregunta')).toBeLessThan(t.indexOf('Mi respuesta'));
  });
});
