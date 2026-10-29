import { describe, expect, it } from 'vitest';
import { productiveHours, rateSession, senseOf, sessionProductivity } from './productivity';
import type { DeepWorkSession, GameState } from './types';

const base: DeepWorkSession = { id: 'a', questId: null, label: 'Deep Work libre', area: 'general', startedAt: 0, endedAt: 3_000_000, minutes: 50 };

describe('productividad', () => {
  it('sentido según misión, intención o libre', () => {
    expect(senseOf({ questId: 'q', label: 'x' })).toBe(1);
    expect(senseOf({ questId: null, label: 'Leer tema 4' })).toBe(0.8);
    expect(senseOf({ questId: null, label: 'Deep Work libre' })).toBe(0.6);
  });
  it('mentalidad 3 es neutra, 5 sube, 1 baja y nunca supera las horas', () => {
    const neutral = productiveHours(1, 4, 1, 3);
    expect(neutral).toBeCloseTo(0.8);
    expect(productiveHours(1, 4, 1, 5)).toBeGreaterThan(neutral);
    expect(productiveHours(1, 4, 1, 1)).toBeLessThan(neutral);
    expect(productiveHours(2, 5, 1, 5)).toBeCloseTo(2);
  });
  it('sin nota no hay índice; valorar lo guarda acotado a 1–5', () => {
    expect(sessionProductivity(base)).toBeNull();
    const s = rateSession({ sessions: [base] } as unknown as GameState, 'a', 9, 0);
    expect(s.sessions[0].rating).toEqual({ performance: 5, mindset: 1 });
    expect(sessionProductivity(s.sessions[0])).toBeCloseTo((50 / 60) * 0.6 ** 3);
  });
});
