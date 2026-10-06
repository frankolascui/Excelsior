import { describe, expect, it } from 'vitest';
import { createProfile, emptyState, grantAdminXp, hasSeenTour, markTour } from './game';
import { isUnlocked, unlockedBetween } from './unlocks';

const base = () => createProfile(emptyState(), 'Nico', [], 0);

describe('secciones por nivel', () => {
  it('Reinos en nivel 2, Arena en 3 y Gremios en 5', () => {
    const s = base();
    expect(isUnlocked(s, 'hoy')).toBe(true);
    expect(isUnlocked(s, 'reinos')).toBe(false);
    const l2 = grantAdminXp(s, 100, 1);
    expect(isUnlocked(l2, 'reinos')).toBe(true);
    expect(isUnlocked(l2, 'arena')).toBe(false);
    expect(isUnlocked(grantAdminXp(s, 1000, 1), 'gremios')).toBe(true);
  });

  it('anuncia lo que se abre al subir varios niveles de golpe', () => {
    expect(unlockedBetween(1, 3).map((u) => u.tab)).toEqual(['reinos', 'arena']);
    expect(unlockedBetween(3, 4)).toEqual([]);
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
