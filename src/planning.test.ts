import { describe, expect, it } from 'vitest';
import { addQuest, createProfile, daysUntil, emptyState, pendingQuests, setQuestDeadline } from './game';
import { completeRitual, dueReview, extendGoal, recordReview, reviewDays } from './attributes';
import { monthGrid } from './calendar';

const NOW = new Date(2026, 9, 6, 10, 0).getTime();
const DAY = 86_400_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('fechas límite', () => {
  it('cuenta los días que faltan (negativo si está vencida)', () => {
    expect(daysUntil('2026-10-06', NOW)).toBe(0);
    expect(daysUntil('2026-10-09', NOW)).toBe(3);
    expect(daysUntil('2026-10-04', NOW)).toBe(-2);
    expect(daysUntil(undefined, NOW)).toBeNull();
  });

  it('lo urgente (vencido o en 2 días) va antes que la misión principal', () => {
    let s = addQuest(base(), 'Principal', 'main', NOW);
    s = addQuest(s, 'Examen', 'side', NOW, { deadline: '2026-10-07' });
    s = addQuest(s, 'Lejana', 'side', NOW, { deadline: '2026-11-30' });
    expect(pendingQuests(s, NOW).map((q) => q.title)).toEqual(['Examen', 'Principal', 'Lejana']);
    const id = s.quests[1].id;
    expect(setQuestDeadline(s, id, null).quests[1].deadline).toBeUndefined();
    expect(setQuestDeadline(s, id, '2026-12-01').quests[1].deadline).toBe('2026-12-01');
  });

  it('el calendario empieza en lunes y cubre semanas completas', () => {
    const days = monthGrid(2026, 9); // octubre 2026: empieza en jueves
    expect(days[0]).toBe('2026-09-28');
    expect(days.length % 7).toBe(0);
    expect(days).toContain('2026-10-31');
  });
});

describe('revisiones de los objetivos a 3 meses', () => {
  const sworn = () => completeRitual(base(), 'iniciado', {
    answers: [], oath: 'Juro', goals: [{ name: 'Ahorrar', unit: '€', start: 0, target: 1500, avatarId: 'forjador', deadline: NOW + 90 * DAY }],
  }, NOW);

  it('toca revisar en los días 30, 60 y 90', () => {
    const s = sworn();
    expect(reviewDays(s.goals)).toEqual([30, 60, 90]);
    expect(dueReview(s, NOW + 29 * DAY)).toBeNull();
    expect(dueReview(s, NOW + 31 * DAY)).toMatchObject({ day: 30, final: false });
    const r30 = recordReview(s, NOW, 30, 'Voy lento', NOW + 31 * DAY);
    expect(dueReview(r30, NOW + 40 * DAY)).toBeNull();
    expect(dueReview(r30, NOW + 91 * DAY)).toMatchObject({ day: 90, final: true }); // si te saltas la del 60, va a la última
  });

  it('dar más plazo crea una nueva revisión al final', () => {
    let s = recordReview(sworn(), NOW, 90, '', NOW + 91 * DAY);
    s = extendGoal(s, s.goals[0].id, 30);
    expect(reviewDays(s.goals)).toEqual([30, 60, 90, 120]);
    expect(dueReview(s, NOW + 100 * DAY)).toBeNull();
    expect(dueReview(s, NOW + 121 * DAY)).toMatchObject({ day: 120, final: true });
  });
});
