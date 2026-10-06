import { describe, expect, it } from 'vitest';
import { addQuest, completeQuest, createProfile, emptyState, startTimer, stopTimer } from './game';
import { ACHIEVEMENTS, pendingAchievements, recordAchievements, stats } from './achievements';

const NOW = new Date(2026, 9, 6, 10, 0).getTime();
const MIN = 60_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('logros', () => {
  it('ids únicos y objetivos con sentido', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
  });

  it('completar la primera misión da «Primer Juramento»', () => {
    let s = addQuest(base(), 'Responder emails', 'daily', NOW);
    s = completeQuest(s, s.quests[0].id, NOW).state;
    expect(pendingAchievements(s, NOW).map((a) => a.id)).toContain('quest-1');
  });

  it('10 h de Deep Work dan «Forja del Enfoque»; y una vez guardado no se repite', () => {
    let s = base();
    for (let i = 0; i < 4; i++) s = stopTimer(startTimer(s, null, 0, NOW + i * 200 * MIN), NOW + i * 200 * MIN + 150 * MIN).state;
    expect(stats(s, NOW).dwMinutes).toBe(600);
    const got = pendingAchievements(s, NOW).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['dw-1h', 'dw-10h', 'dw-session-90', 'dw-day-3h']));
    s = recordAchievements(s, pendingAchievements(s, NOW), NOW);
    expect(pendingAchievements(s, NOW)).toEqual([]);
  });

  it('XP en un solo día: 100 XP dan «Día de Gloria»', () => {
    const s = stopTimer(startTimer(base(), null, 0, NOW), NOW + 100 * MIN).state;
    expect(stats(s, NOW).xpBestDay).toBe(100);
    expect(pendingAchievements(s, NOW).map((a) => a.id)).toContain('xp-day-100');
  });
});
