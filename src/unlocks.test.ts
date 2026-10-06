import { describe, expect, it } from 'vitest';
import { createProfile, dailyCap, emptyState, grantAdminXp, hasSeenTour, markTour } from './game';
import { isUnlocked, unlockedBetween } from './unlocks';

const base = () => createProfile(emptyState(), 'Nico', [], 0);

describe('secciones por nivel', () => {
  it('Reinos en nivel 3, Arena en 5 y Gremios en 7', () => {
    const s = base();
    expect(isUnlocked(s, 'hoy')).toBe(true);
    expect(isUnlocked(s, 'reinos')).toBe(false);
    const l3 = grantAdminXp(s, 300, 1);
    expect(isUnlocked(l3, 'reinos')).toBe(true);
    expect(isUnlocked(l3, 'arena')).toBe(false);
    expect(isUnlocked(grantAdminXp(s, 1000, 1), 'arena')).toBe(true);
    expect(isUnlocked(grantAdminXp(s, 2000, 1), 'gremios')).toBe(false);
    expect(isUnlocked(grantAdminXp(s, 2100, 1), 'gremios')).toBe(true);
  });

  it('el tope diario crece con el nivel con el que empiezas el día', () => {
    const s = base();
    expect(dailyCap(s, 'quest', 0)).toBe(200);
    const lvl5 = grantAdminXp(s, 1000, 0); // ayer
    expect(dailyCap(lvl5, 'quest', 86_400_000 * 2)).toBe(300);
    expect(dailyCap(lvl5, 'habit', 86_400_000 * 2)).toBe(140);
    expect(dailyCap(lvl5, 'quest', 1)).toBe(200); // el XP de hoy no sube el tope de hoy
  });

  it('anuncia lo que se abre al subir varios niveles de golpe', () => {
    expect(unlockedBetween(1, 5).map((u) => u.tab)).toEqual(['reinos', 'arena']);
    expect(unlockedBetween(5, 6)).toEqual([]);
  });
});

describe('tutoriales vistos', () => {
  it('se guardan en la partida y no se duplican', () => {
    const s = markTour(markTour(base(), 'intro'), 'intro');
    expect(hasSeenTour(s, 'intro')).toBe(true);
    expect(s.tours).toEqual(['intro']);
    expect(hasSeenTour(s, 'reinos')).toBe(false);
  });

  it('un personaje nuevo empieza sin hábitos (los elige en el tutorial)', () => {
    expect(base().habits).toEqual([]);
  });
});

describe('herramientas de admin', () => {
  it('saltar a un nivel da el XP justo', async () => {
    const { adminToLevel, levelInfo, totalXp } = await import('./game');
    const s = adminToLevel(base(), 7, 1);
    expect(levelInfo(totalXp(s)).level).toBe(7);
    expect(adminToLevel(s, 3, 1)).toBe(s); // no baja
  });

  it('simular días pasados rellena hábitos y Deep Work sin tocar hoy', async () => {
    const { addHabit, habitStreak, simulatePastDays, dayKey } = await import('./game');
    const now = new Date(2026, 9, 6, 18, 0).getTime();
    let s = addHabit(base(), 'Leer', now);
    s = simulatePastDays(s, 7, now);
    expect(habitStreak(s, s.habits[0].id, now)).toBe(7);
    expect(s.sessions).toHaveLength(7);
    expect(s.habitCompletions.some((c) => c.day === dayKey(now))).toBe(false);
    expect(simulatePastDays(s, 7, now).xp).toHaveLength(s.xp.length); // repetir no duplica
  });
});
