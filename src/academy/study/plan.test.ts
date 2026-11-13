import { describe, expect, it } from 'vitest';
import { buildPlan, finalReview, pacedNewPerDay, topicPriority, upcoming } from './plan';
import type { CardRow, ExamDate } from './types';

const today = new Date(2026, 10, 10, 12); // 10 nov 2026
const exam = (id: string, date: string, topic_ids: string[] = [], subject_id = 's1'): ExamDate => ({ id, subject_id, title: id, date, topic_ids, created_at: '' });

describe('plan de examen', () => {
  it('solo cuenta los exámenes que no han pasado, el más cercano primero', () => {
    const u = upcoming([exam('b', '2026-11-20'), exam('pasado', '2026-11-01'), exam('a', '2026-11-12')], today);
    expect(u.map((e) => [e.id, e.daysLeft])).toEqual([['a', 2], ['b', 10]]);
  });

  it('cada tema toma los días de su examen más cercano; sin temas marcados = toda la asignatura', () => {
    const p = topicPriority([exam('lejos', '2026-11-30', ['t1']), exam('cerca', '2026-11-13', ['t1']), exam('todo', '2026-11-15', [], 's2')], (s) => (s === 's2' ? ['t8', 't9'] : []), today);
    expect([...p]).toEqual([['t1', 3], ['t8', 5], ['t9', 5]]);
  });

  it('reparte las nuevas para acabarlas la víspera', () => {
    expect(pacedNewPerDay(60, 6)).toBe(10);
    expect(pacedNewPerDay(61, 6)).toBe(11);
    expect(pacedNewPerDay(500, 1)).toBe(80); // tope
    expect(pacedNewPerDay(30, 0)).toBe(0); // el día del examen, nada nuevo
  });

  it('plan con simulacros a 6 y 3 días y nada nuevo el día del examen', () => {
    const plan = buildPlan(7, 35, today);
    expect(plan).toHaveLength(8);
    expect(plan[0].items[0]).toBe('5 tarjetas nuevas');
    expect(plan[1].items).toContain('Simulacro 1 sin apuntes');
    expect(plan[4].items).toContain('Simulacro 2 sin apuntes');
    expect(plan[6].items).toContain('Repasa los fallos del último simulacro y duerme bien');
    expect(plan[7].items[0]).toBe('Examen');
    expect(plan.flatMap((d) => d.items).filter((i) => i.includes('nuevas')).length).toBe(7);
  });

  it('si tu nivel va más rápido que el reparto, se usa tu nivel', () => {
    const plan = buildPlan(9, 25, today, 10);
    expect(plan.slice(0, 4).map((d) => d.items[0])).toEqual(['10 tarjetas nuevas', '10 tarjetas nuevas', '5 tarjetas nuevas', 'Repasos del día']);
  });

  it('repaso final: adelanta lo que olvidarías antes del examen', () => {
    const base = { topic_id: 't1', front: '', back: '', elapsed_days: 0, learning_steps: 0, reps: 3, lapses: 0, state: 2 as const, created_at: '' };
    const flojo: CardRow = { ...base, id: 'flojo', stability: 1, difficulty: 6, scheduled_days: 2, due: '2026-11-12T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    const fuerte: CardRow = { ...base, id: 'fuerte', stability: 60, difficulty: 3, scheduled_days: 60, due: '2027-01-09T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    // Nivel mínimo (80 %): una tarjeta que el día del examen recordarías al ~88 % se adelanta igualmente.
    const justa: CardRow = { ...base, id: 'justa', stability: 2.4, difficulty: 5, scheduled_days: 9, due: '2026-11-19T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    const out = finalReview([fuerte, justa, flojo], '2026-11-13', today, 'minimo');
    expect(out.map((c) => c.id)).toEqual(['flojo', 'justa']);
  });
});
