import { describe, expect, it } from 'vitest';
import { addHabit, createProfile, emptyState, startTimer, stopTimer, toggleHabit, totalXp } from './game';
import { attributeXp } from './attributes';
import {
  buildGoal, challengeProgress, challengeState, challengeTemplate, claimReward, contributionFor, guildLevel, guildXpFrom, memberShare,
  type ChallengeRow,
} from './guilds';

const NOW = new Date(2026, 9, 7, 10, 0).getTime();
const MIN = 60_000;
const DAY = 86_400_000;
const c = (user_id: string, deep = 0, habits = 0, xp = 0) => ({ user_id, deep, habits, xp });

describe('meta del reto según los miembros', () => {
  it('el Dragón: 8 h por miembro, con un mínimo de 16 h, y tope del 30 %', () => {
    const dragon = challengeTemplate('dragon')!;
    expect(buildGoal(dragon, 5)).toEqual({ deep: 2400, minParticipants: 3, cap: 0.3 });
    expect(buildGoal(dragon, 1).deep).toBe(960);
  });

  it('con menos de 4 miembros el tope sube a partes iguales para que se pueda ganar', () => {
    expect(buildGoal(challengeTemplate('cien-minutos')!, 2).cap).toBe(0.5);
    expect(buildGoal(challengeTemplate('cien-minutos')!, 3).cap).toBeCloseTo(1 / 3);
    expect(buildGoal(challengeTemplate('cien-minutos')!, 6).cap).toBe(0.3);
  });
});

describe('regla del 30 %', () => {
  it('Boss de 40 h: quien hace 20 h solo cuenta 12', () => {
    const goal = { deep: 2400, minParticipants: 1, cap: 0.3 };
    const p = challengeProgress(goal, [c('a', 1200), c('b', 300)]);
    expect(p.per[0]).toMatchObject({ goal: 2400, cap: 720, real: 1500, counted: 1020, done: false });
    expect(memberShare(goal, c('a', 1200))[0]).toMatchObject({ real: 1200, counted: 720, capped: true });
    expect(p.won).toBe(false);
  });

  it('se gana con todas las metas y los participantes mínimos', () => {
    const goal = { deep: 600, habits: 15, minParticipants: 3, cap: 0.3 };
    const team = [c('a', 180, 5), c('b', 180, 5), c('c', 180, 5), c('d', 100, 1)];
    expect(challengeProgress(goal, team).won).toBe(true);
    expect(challengeProgress(goal, team.slice(0, 2)).won).toBe(false);
    expect(challengeProgress({ ...goal, minParticipants: 5 }, team).won).toBe(false);
    expect(challengeProgress(goal, [c('a', 600, 15)]).fraction).toBeCloseTo(0.317, 2); // 30 % del foco y 5 de 15 hábitos
  });
});

describe('aportación y recompensa', () => {
  it('cuenta foco, hábitos y XP dentro del reto (no las recompensas de gremio)', () => {
    let s = addHabit(createProfile(emptyState(), 'Nico', [], NOW - DAY), 'Leer', NOW - DAY);
    s = stopTimer(startTimer(s, null, 0, NOW - 2 * DAY), NOW - 2 * DAY + 30 * MIN).state; // antes del reto
    s = stopTimer(startTimer(s, null, 0, NOW + MIN), NOW + 41 * MIN).state;
    s = toggleHabit(s, s.habits[0].id, NOW + 2 * MIN).state;
    const got = contributionFor(s, NOW, NOW + 7 * DAY);
    expect(got).toMatchObject({ deep: 40, habits: 1 });
    expect(got.xp).toBe(50);
  });

  it('el reto ganado da XP a Conexión y Voluntad una sola vez', () => {
    const row: ChallengeRow = {
      id: 'r1', guild_id: 'g', template: 'dragon', goal: { deep: 960, minParticipants: 1, cap: 0.5 },
      starts_at: new Date(NOW).toISOString(), ends_at: new Date(NOW + 7 * DAY).toISOString(), completed_at: new Date(NOW + DAY).toISOString(), created_by: 'a',
    };
    const s0 = createProfile(emptyState(), 'Nico', [], NOW);
    const s1 = claimReward(s0, row, NOW + DAY);
    expect(totalXp(s1)).toBe(120);
    expect(attributeXp(s1)).toMatchObject({ conexion: 72, voluntad: 48 });
    expect(claimReward(s1, row, NOW + DAY)).toBe(s1);
    expect(claimReward(s0, { ...row, completed_at: null }, NOW)).toBe(s0);
    expect(contributionFor(s1, NOW, NOW + 7 * DAY).xp).toBe(0);
  });

  it('estado del reto, XP y nivel del gremio', () => {
    const base = { guild_id: 'g', goal: { minParticipants: 1, cap: 0.3 }, starts_at: '', created_by: 'a' };
    const won = { ...base, id: '1', template: 'dragon', ends_at: new Date(NOW - DAY).toISOString(), completed_at: new Date(NOW - 2 * DAY).toISOString() };
    const lost = { ...base, id: '2', template: 'cien-minutos', ends_at: new Date(NOW - DAY).toISOString(), completed_at: null };
    const live = { ...base, id: '3', template: 'cien-minutos', ends_at: new Date(NOW + DAY).toISOString(), completed_at: null };
    expect([won, lost, live].map((x) => challengeState(x, NOW))).toEqual(['won', 'lost', 'active']);
    expect(guildXpFrom([won, lost, live])).toBe(150);
    expect(guildLevel(150).level).toBe(2);
    expect(guildLevel(0).level).toBe(1);
  });
});
