import { describe, expect, it } from 'vitest';
import { academyEventId, addAcademyEvent, simDeadline, simQuestId, syncAcademyExams, syncPlannedSims, syncSimulacros, type SimSummary } from './academy-exams';
import { foundAcademy, recordExam } from './academy-game';
import { eventLabel, eventsOn, updateEvent } from './life';
import { deleteQuest, emptyState } from './game';
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

describe('simulacros como misiones', () => {
  const sim = (id: string, over: Partial<SimSummary> = {}): SimSummary => ({ id, subject_id: 's1', title: 'Derivadas', topic_ids: [], finished_at: null, created_at: `2026-11-0${id.slice(-1)}`, ...over });
  const none = () => undefined;

  it('cada simulacro sin entregar es una misión; se quita si se entrega o se borra en Academy', () => {
    let s = syncSimulacros(emptyState(), [sim('x1'), sim('x2', { finished_at: '2026-11-20' })], subjects, none, NOW);
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0]).toMatchObject({ id: simQuestId('x1'), title: 'Simulacro de Física: Derivadas', impact: 'medio', academy: { simId: 'x1', subjectId: 's1' } });
    expect(syncSimulacros(s, [sim('x1')], subjects, none, NOW)).toBe(s);
    s = syncSimulacros(s, [], subjects, none, NOW);
    expect(s.quests).toHaveLength(0);
  });

  it('borrar la misión la deja fuera para siempre', () => {
    let s = syncSimulacros(emptyState(), [sim('x1')], subjects, none, NOW);
    s = deleteQuest(s, simQuestId('x1'));
    expect(syncSimulacros(s, [sim('x1')], subjects, none, NOW).quests).toHaveLength(0);
  });

  it('entregar el simulacro en Academy completa su misión (con su XP)', () => {
    let s = foundAcademy(syncSimulacros(emptyState(), [sim('x1')], subjects, none, NOW), NOW);
    const r = recordExam(s, { examId: 'x1', label: 'Física', startedAt: NOW, seconds: null }, NOW);
    s = r.state;
    expect(s.quests[0].completedAt).toBe(NOW);
    expect(r.xp).toBeGreaterThan(0);
  });

  it('la fecha límite es el día que el plan da a ese simulacro', () => {
    const today = new Date(2026, 10, 10, 12);
    const all = [sim('x1'), sim('x2'), sim('x3')];
    const dates = [exam('e1', 'Final', '2026-11-22')];
    expect(simDeadline(all[0], all, dates, today)).toBe('2026-11-12'); // D-10
    expect(simDeadline(all[1], all, dates, today)).toBe('2026-11-18'); // D-4
    expect(simDeadline(all[2], all, dates, today)).toBe('2026-11-21'); // D-1
    expect(simDeadline(sim('y', { subject_id: 's2' }), all, dates, today)).toBeUndefined();
  });

  it('los simulacros que pide el plan y aún no existen salen como misiones con su día', () => {
    const now = new Date(2026, 10, 10, 12).getTime();
    const dates = [exam('e1', 'Final', '2026-11-22'), exam('e2', 'Lejano', '2027-02-01')];
    let s = syncPlannedSims(emptyState(), [], dates, subjects, now);
    expect(s.quests.map((q) => [q.title, q.deadline])).toEqual([
      ['Simulacro 1 de Física (Final)', '2026-11-12'],
      ['Simulacro 2 de Física (Final)', '2026-11-18'],
      ['Simulacro 3 de Física (Final)', '2026-11-21'],
    ]); // el de febrero aún queda lejos
    expect(syncPlannedSims(s, [], dates, subjects, now)).toBe(s);
    // creas el primero en Academy: su misión del plan se va (la real la pone syncSimulacros)
    s = syncPlannedSims(s, [sim('x1')], dates, subjects, now);
    expect(s.quests.map((q) => q.academy!.plan!.n)).toEqual([2, 3]);
    // borrada a mano, no vuelve
    s = syncPlannedSims(deleteQuest(s, s.quests[0].id), [sim('x1')], dates, subjects, now);
    expect(s.quests.map((q) => q.academy!.plan!.n)).toEqual([3]);
    // syncSimulacros no toca las del plan
    expect(syncSimulacros(s, [sim('x1')], subjects, none, now).quests.some((q) => q.academy?.plan)).toBe(true);
  });
});
