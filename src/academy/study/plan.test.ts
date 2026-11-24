import { describe, expect, it } from 'vitest';
import { buildPlan, finalReview, pacedNewPerDay, simDay, topicPriority, upcoming, type PlanDay, type PlanInput } from './plan';
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

  const topics = [{ id: 't1', title: 'Tema 1' }, { id: 't2', title: 'Tema 2' }, { id: 't3', title: 'Tema 3' }];
  const input = (daysLeft: number, over: Partial<PlanInput> = {}): PlanInput => ({
    daysLeft, today, topics, newByTopic: new Map(), levelPerDay: 0, dueByDay: Array(daysLeft + 1).fill(0), secPerCard: 10, sims: [], ...over,
  });
  const kinds = (d: PlanDay) => d.items.map((x) => x.kind);
  const at = (p: { days: PlanDay[] }, rest: number) => p.days.find((d) => d.daysLeft === rest)!;

  it('12 días: simulacros en D-10, D-4 y D-1, y fallos al día siguiente de cada uno', () => {
    const p = buildPlan(input(12));
    expect(p.days.filter((d) => kinds(d).includes('simulacro')).map((d) => d.daysLeft)).toEqual([10, 4, 1]);
    expect(kinds(at(p, 9))).toContain('fallos');
    expect(kinds(at(p, 3))).toContain('fallos');
    expect(kinds(at(p, 1))).toEqual(expect.arrayContaining(['simulacro', 'fallos', 'descanso']));
    expect(p.note).toBeUndefined();
  });

  it('6 días: S1 hoy, S2 en D-3, S3 en D-1 y aviso de plan comprimido', () => {
    const p = buildPlan(input(6));
    expect(p.days.filter((d) => kinds(d).includes('simulacro')).map((d) => d.daysLeft)).toEqual([6, 3, 1]);
    expect(p.note).toBe('Plan comprimido: faltan 6 días');
  });

  it('ningún día repite tarea y dos días seguidos no son iguales', () => {
    const p = buildPlan(input(14, { dueByDay: Array(15).fill(12), newByTopic: new Map([['t1', 30], ['t2', 30]]) }));
    for (const d of p.days) expect(new Set(d.items.map((x) => x.text)).size).toBe(d.items.length);
    for (let i = 1; i < p.days.length; i++) expect(p.days[i].items.map((x) => x.text)).not.toEqual(p.days[i - 1].items.map((x) => x.text));
  });

  it('los temas rotan en los días sin simulacro', () => {
    const p = buildPlan(input(14));
    const order = p.days.flatMap((d) => d.items.filter((x) => x.kind === 'tema').map((x) => x.topicId));
    expect(order.slice(0, 4)).toEqual(['t1', 't2', 't3', 't1']);
  });

  it('nota baja → dos días de fallos; simulacro con nota → hecho y con la nota', () => {
    const p = buildPlan(input(12, { sims: [{ id: 's1', title: 'S1', grade: 5, finishedAt: '2026-11-11' }] }));
    expect(kinds(at(p, 9))).toContain('fallos');
    expect(kinds(at(p, 8))).toContain('fallos');
    const s1 = at(p, 10).items.find((x) => x.kind === 'simulacro')!;
    expect(s1).toMatchObject({ done: true, examId: 's1' });
    expect(s1.text).toContain('5');
    const good = buildPlan(input(12, { sims: [{ id: 's1', title: 'S1', grade: 8, finishedAt: '2026-11-11' }] }));
    expect(kinds(at(good, 8))).not.toContain('fallos');
  });

  it('3 días: S1 hoy, tema al día siguiente y fallos solo la víspera', () => {
    const p = buildPlan(input(3));
    expect(kinds(at(p, 3))).toContain('simulacro');
    expect(kinds(at(p, 2))).not.toContain('fallos');
    expect(kinds(at(p, 2))).toContain('tema');
    expect(kinds(at(p, 1))).toEqual(expect.arrayContaining(['fallos', 'descanso']));
  });

  it('simulacro sin importar: pide importarlo', () => {
    expect(at(buildPlan(input(6)), 6).items[0].text).toContain('pídelo a Claude');
  });

  it('ninguna nueva desde D-2; el día del examen solo el examen', () => {
    const p = buildPlan(input(8, { newByTopic: new Map([['t1', 600]]) }));
    for (const d of p.days.filter((x) => x.daysLeft <= 2)) expect(kinds(d)).not.toContain('nuevas');
    expect(kinds(at(p, 0))).toEqual(['examen']);
    expect(p.warn).toBeDefined(); // 600 nuevas en 6 días: más de 80 al día, no caben
  });

  it('minutos = tarjetas × segundos por tarjeta', () => {
    const p = buildPlan(input(12, { dueByDay: Array(13).fill(30), secPerCard: 12 }));
    expect(p.days[0].items.find((x) => x.kind === 'repaso')).toMatchObject({ text: '~30 tarjetas de repaso · 6 min', minutes: 6 });
  });

  it('el día que el plan da a cada simulacro', () => {
    expect(simDay('2026-11-22', 1, today)).toBe('2026-11-12');
    expect(simDay('2026-11-22', 3, today)).toBe('2026-11-21');
    expect(simDay('2026-11-14', 3, today)).toBeUndefined();
  });

  it('repaso final: adelanta lo que olvidarías antes del examen', () => {
    const base = { topic_id: 't1', front: '', back: '', elapsed_days: 0, learning_steps: 0, reps: 3, lapses: 0, state: 2 as const, created_at: '' };
    const flojo: CardRow = { ...base, id: 'flojo', stability: 1, difficulty: 6, scheduled_days: 2, due: '2026-11-12T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    const fuerte: CardRow = { ...base, id: 'fuerte', stability: 60, difficulty: 3, scheduled_days: 60, due: '2027-01-09T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    // Nivel mínimo (80 %): una tarjeta que el día del examen recordarías al ~88 % se adelanta igualmente.
    const justa: CardRow = { ...base, id: 'justa', stability: 2.4, difficulty: 5, scheduled_days: 9, due: '2026-11-19T10:00:00Z', last_review: '2026-11-10T09:00:00Z' };
    const out = finalReview([fuerte, justa, flojo], '2026-11-13', today, 'minimo');
    expect(out.map((c) => c.id)).toEqual(['flojo', 'justa']);
    // A 2 días del examen solo sale hoy la mitad, la que más olvidarías.
    expect(finalReview([fuerte, justa, flojo], '2026-11-13', today, 'minimo', 2).map((c) => c.id)).toEqual(['flojo']);
  });
});
