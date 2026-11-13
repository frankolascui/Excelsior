import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, createProfile, dayKey, emptyState, impactOf, pendingQuests, PRIORITY_BONUS, shiftDay, suggest, undoQuest } from './game';
import { keepQuest, postponeQuest, priorityQuests, priorityWeek, pushToTomorrow, setPriorities, setQuestImpact, staleQuests, tomorrowQuests } from './priorities';
import { currentChange, previousReview, reviewWeekKey, saveWeeklyReview, weekFocus } from './review';
import { weekStart } from './summary';
import type { GameState } from './types';

const NOW = new Date(2026, 10, 7, 10, 0).getTime(); // sábado
const DAY = 86_400_000;
const TODAY = dayKey(NOW);

function withQuests(...titles: string[]): GameState {
  let s = createProfile(emptyState(), 'Nico', [], NOW);
  titles.forEach((t, i) => { s = addQuest(s, t, 'daily', NOW + i); });
  return s;
}
const idOf = (s: GameState, t: string) => s.quests.find((q) => q.title === t)!.id;

describe('impacto', () => {
  it('ordena las pendientes por impacto', () => {
    let s = withQuests('A', 'B', 'C');
    s = setQuestImpact(s, idOf(s, 'A'), 'bajo');
    s = setQuestImpact(s, idOf(s, 'C'), 'alto');
    expect(pendingQuests(s, NOW).map((q) => q.title)).toEqual(['C', 'B', 'A']);
  });

  it('lo urgente sigue antes que el impacto, salvo tus prioridades del día', () => {
    let s = withQuests('Urgente', 'Importante');
    s = { ...s, quests: s.quests.map((q) => (q.title === 'Urgente' ? { ...q, deadline: TODAY } : q)) };
    s = setQuestImpact(s, idOf(s, 'Importante'), 'alto');
    expect(pendingQuests(s, NOW)[0].title).toBe('Urgente');
    s = setPriorities(s, TODAY, [idOf(s, 'Importante')], NOW);
    expect(pendingQuests(s, NOW)[0].title).toBe('Importante');
    const sug = suggest(s, NOW);
    expect(sug.kind === 'quest' && sug.quest.title).toBe('Importante');
  });

  it('el impacto es el tipo: decide el XP y las misiones antiguas lo sacan de su tipo', () => {
    let s = withQuests('A');
    s = setQuestImpact(s, idOf(s, 'A'), 'alto');
    expect(s.quests[0].type).toBe('main');
    expect(completeQuest(s, idOf(s, 'A'), NOW).xp).toBe(50);
    const old = { ...s.quests[0], impact: undefined, type: 'side' as const };
    expect(impactOf(old)).toBe('bajo');
    expect(addQuest(s, 'B', 'daily', NOW).quests[1].impact).toBe('medio');
    expect(addQuest(s, 'C', 'daily', NOW, { impact: 'alto' }).quests[1].type).toBe('main');
  });
});

describe('Las 3 de hoy', () => {
  it('guarda como máximo 3, sin repetir ni ids que no existen', () => {
    const s0 = withQuests('A', 'B', 'C', 'D');
    const ids = s0.quests.map((q) => q.id);
    const s = setPriorities(s0, TODAY, [ids[0], ids[0], 'x', ids[1], ids[2], ids[3]], NOW);
    expect(priorityQuests(s, TODAY).map((q) => q.title)).toEqual(['A', 'B', 'C']);
  });

  it('cerrar las tres da un bonus una vez, y deshacer lo retira', () => {
    let s = withQuests('A', 'B', 'C');
    const [a, b, c] = s.quests.map((q) => q.id);
    s = setPriorities(s, TODAY, [a, b, c], NOW);
    s = completeQuest(s, a, NOW).state;
    s = completeQuest(s, b, NOW).state;
    const r = completeQuest(s, c, NOW);
    expect(r.xp).toBe(20 + PRIORITY_BONUS);
    expect(r.state.xp.filter((t) => t.sourceId === `prio:${TODAY}`)).toHaveLength(1);
    const undone = undoQuest(r.state, a);
    expect(undone.xp.some((t) => t.sourceId === `prio:${TODAY}`)).toBe(false);
    // volver a cerrarla no duplica el bonus
    const again = completeQuest(undone, a, NOW);
    expect(again.state.xp.filter((t) => t.sourceId === `prio:${TODAY}`)).toHaveLength(1);
  });

  it('con menos de 3 elegidas no hay bonus', () => {
    let s = withQuests('A');
    s = setPriorities(s, TODAY, [s.quests[0].id], NOW);
    expect(completeQuest(s, s.quests[0].id, NOW).xp).toBe(20);
  });

  it('cuenta los días de la semana con las 3 cerradas', () => {
    let s = withQuests('A', 'B', 'C', 'D');
    const ids = s.quests.map((q) => q.id);
    const monday = weekStart(NOW);
    const d0 = dayKey(monday);
    s = setPriorities(s, d0, ids.slice(0, 3), NOW);
    s = setPriorities(s, dayKey(monday + DAY), [ids[3], ids[0], ids[1]], NOW);
    for (const id of ids.slice(0, 3)) s = completeQuest(s, id, monday + 3600_000).state;
    expect(priorityWeek(s, monday)).toEqual({ planned: 2, closed: 1 });
  });
});

describe('limpieza', () => {
  it('saca lo de impacto bajo con más de 14 días y lo medio con más de 30', () => {
    let s = withQuests('Bajo', 'Sin marcar', 'Alto');
    s = setQuestImpact(s, idOf(s, 'Bajo'), 'bajo');
    s = setQuestImpact(s, idOf(s, 'Alto'), 'alto');
    expect(staleQuests(s, NOW + 13 * DAY)).toHaveLength(0);
    expect(staleQuests(s, NOW + 15 * DAY).map((q) => q.title)).toEqual(['Bajo']);
    expect(staleQuests(s, NOW + 31 * DAY).map((q) => q.title)).toEqual(['Bajo', 'Sin marcar']);
  });

  it('«La hago» calla 14 días y «Posponer» la quita una semana', () => {
    let s = withQuests('Bajo');
    const id = s.quests[0].id;
    s = setQuestImpact(s, id, 'bajo');
    const later = NOW + 20 * DAY;
    const kept = keepQuest(s, id, later);
    expect(staleQuests(kept, later + 13 * DAY)).toHaveLength(0);
    expect(staleQuests(kept, later + 15 * DAY)).toHaveLength(1);
    const post = postponeQuest(s, id, later);
    expect(pendingQuests(post, later)).toHaveLength(0);
    expect(post.quests[0].startsOn).toBe(dayKey(shiftDay(later, 7)));
  });
});

describe('revisión semanal', () => {
  it('guarda la revisión de la semana pasada y su cambio manda esta semana', () => {
    const week = reviewWeekKey(NOW);
    let s = withQuests();
    s = saveWeeklyReview(s, week, { worked: ' foco por la mañana ', change: 'Móvil fuera', focus: 'Terminar el tema 4' }, NOW);
    expect(s.weeklyReviews?.[0]).toMatchObject({ week, worked: 'foco por la mañana', change: 'Móvil fuera' });
    expect(currentChange(s, NOW)).toBe('Móvil fuera');
    expect(weekFocus(s, NOW)).toBe('Terminar el tema 4');
    const next = reviewWeekKey(NOW + 7 * DAY);
    expect(previousReview(s, next)?.change).toBe('Móvil fuera');
    s = saveWeeklyReview(s, next, { prevVerdict: 'si' }, NOW + 7 * DAY);
    expect(s.weeklyReviews?.map((r) => r.week)).toEqual([week, next]);
  });
});

describe('pasar a mañana', () => {
  it('la mueve de hoy a mañana y respeta el máximo de 3', () => {
    let s = withQuests('A', 'B', 'C', 'D', 'E');
    const [a, b, c, d, e] = s.quests.map((q) => q.id);
    const tomorrow = dayKey(NOW + DAY);
    s = setPriorities(s, TODAY, [a, b], NOW);
    s = setPriorities(s, tomorrow, [c, d], NOW);
    const r = pushToTomorrow(s, a, NOW);
    expect(r.ok).toBe(true);
    expect(priorityQuests(r.state, TODAY).map((q) => q.title)).toEqual(['B']);
    expect(priorityQuests(r.state, tomorrow).map((q) => q.title)).toEqual(['C', 'D', 'A']);
    const full = pushToTomorrow(setPriorities(r.state, TODAY, [b, e], NOW), b, NOW);
    expect(full.ok).toBe(false);
  });

  it('lista lo que vence y lo que vuelve mañana', () => {
    let s = withQuests('Vence', 'Vuelve', 'Otra');
    const tomorrow = dayKey(NOW + DAY);
    s = { ...s, quests: s.quests.map((q) => (q.title === 'Vence' ? { ...q, deadline: tomorrow } : q.title === 'Vuelve' ? { ...q, startsOn: tomorrow } : q)) };
    const t = tomorrowQuests(s, NOW);
    expect(t.due.map((q) => q.title)).toEqual(['Vence']);
    expect(t.back.map((q) => q.title)).toEqual(['Vuelve']);
  });
});
