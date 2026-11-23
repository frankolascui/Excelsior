import { describe, expect, it } from 'vitest';
import { academyEventId, addAcademyEvent, syncAcademyExams } from './academy-exams';
import { eventLabel, eventsOn, updateEvent } from './life';
import { emptyState } from './game';
import type { ExamDate } from './academy/study/types';
import type { GameState } from './types';

const exam = (id: string, title: string, date: string, subject_id = 's1'): ExamDate => ({ id, subject_id, title, date, topic_ids: [], created_at: '' });
const subjects = [{ id: 's1', name: 'Física' }, { id: 's2', name: 'Historia' }];
const NOW = Date.UTC(2026, 10, 23, 12);

describe('exámenes de Academy en el calendario', () => {
  it('crea un evento «examen» por cada examen, con su asignatura', () => {
    const s = syncAcademyExams(emptyState(), [exam('e1', 'Parcial 1', '2026-12-01')], subjects, NOW);
    const ev = eventsOn(s, '2026-12-01');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ id: academyEventId('e1'), kind: 'examen', title: 'Parcial 1', academy: { examId: 'e1', subjectId: 's1', subject: 'Física' } });
    expect(eventLabel(ev[0])).toBe('Física · Parcial 1');
  });

  it('sin cambios devuelve el mismo estado (no guarda de más)', () => {
    const s = syncAcademyExams(emptyState(), [exam('e1', 'Parcial 1', '2026-12-01')], subjects, NOW);
    expect(syncAcademyExams(s, [exam('e1', 'Parcial 1', '2026-12-01')], subjects, NOW + 1000)).toBe(s);
  });

  it('nombre y día mandan en Academy; hora y color del calendario se quedan', () => {
    let s = syncAcademyExams(emptyState(), [exam('e1', 'Parcial 1', '2026-12-01')], subjects, NOW);
    s = updateEvent(s, academyEventId('e1'), { time: '09:00', end: '11:00', color: 'rosa' });
    s = syncAcademyExams(s, [exam('e1', 'Final de Física', '2026-12-03')], subjects, NOW);
    expect(s.events).toHaveLength(1);
    expect(s.events![0]).toMatchObject({ title: 'Final de Física', day: '2026-12-03', time: '09:00', end: '11:00', color: 'rosa' });
    expect(eventLabel(s.events![0])).toBe('Final de Física'); // ya dice la asignatura
  });

  it('quita los exámenes borrados en Academy y deja los eventos propios', () => {
    let s: GameState = { ...emptyState(), events: [{ id: 'x', title: 'Examen de conducir', day: '2026-12-02', kind: 'examen' as const, createdAt: 1 }] };
    s = syncAcademyExams(s, [exam('e1', 'Parcial', '2026-12-01'), exam('e2', 'Oral', '2026-12-05', 's2')], subjects, NOW);
    expect(s.events!.map((e) => e.id)).toEqual(['x', 'acad-e1', 'acad-e2']);
    s = syncAcademyExams(s, [exam('e2', 'Oral', '2026-12-05', 's2')], subjects, NOW);
    expect(s.events!.map((e) => e.id)).toEqual(['x', 'acad-e2']);
  });

  it('un examen creado desde el calendario no se duplica al leer Academy', () => {
    let s = addAcademyEvent(emptyState(), exam('e9', 'Test', '2026-12-10', 's2'), 'Historia', { time: '08:00', end: '09:00' }, NOW);
    s = syncAcademyExams(s, [exam('e9', 'Test', '2026-12-10', 's2')], subjects, NOW);
    expect(s.events).toHaveLength(1);
    expect(s.events![0]).toMatchObject({ time: '08:00', academy: { subject: 'Historia' } });
  });
});
