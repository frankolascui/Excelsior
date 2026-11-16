import { describe, expect, it } from 'vitest';
import { productiveHours, rateSession, senseOf, sessionProductivity } from './productivity';
import { reportDistraction } from './core';
import type { DeepWorkSession, GameState } from './types';

const base: DeepWorkSession = { id: 'a', questId: null, label: 'Deep Work libre', area: 'general', startedAt: 0, endedAt: 3_000_000, minutes: 50 };

describe('productividad', () => {
  it('sentido según misión, intención o libre', () => {
    expect(senseOf({ questId: 'q', label: 'x' })).toBe(5);
    expect(senseOf({ questId: null, label: 'Leer tema 4' })).toBe(4);
    expect(senseOf({ questId: null, label: 'Deep Work libre' })).toBe(3);
    expect(senseOf({ questId: null, label: 'Deep Work libre', rating: { performance: 5, mindset: 3, sense: 5 } })).toBe(5);
  });
  it('mentalidad 3 es neutra, 5 sube, 1 baja y nunca supera las horas', () => {
    const neutral = productiveHours(1, 4, 5, 3);
    expect(neutral).toBeCloseTo(0.8);
    expect(productiveHours(1, 4, 5, 5)).toBeGreaterThan(neutral);
    expect(productiveHours(1, 4, 5, 1)).toBeLessThan(neutral);
    expect(productiveHours(2, 5, 5, 5)).toBeCloseTo(2);
  });
  it('con 5 en todo, una sesión libre llega al tiempo real entero', () => {
    const s = rateSession({ sessions: [base] } as unknown as GameState, 'a', 5, 5, 5);
    expect(sessionProductivity(s.sessions[0])).toBeCloseTo(50 / 60);
    expect(productiveHours(1, 5, 5, 1)).toBeCloseTo(1);
  });
  it('sin nota no hay índice; valorar lo guarda acotado a 1–5', () => {
    expect(sessionProductivity(base)).toBeNull();
    const s = rateSession({ sessions: [base] } as unknown as GameState, 'a', 9, 0);
    expect(s.sessions[0].rating).toEqual({ performance: 5, mindset: 1 });
    expect(sessionProductivity(s.sessions[0])).toBeCloseTo((50 / 60) * 0.6 ** 3);
  });
  it('la distracción dicha al terminar se resta del foco y del XP, y se puede cambiar', () => {
    const st = { sessions: [base], xp: [{ id: 't', at: 0, amount: 50, source: 'deepwork', sourceId: 'a', label: 'x' }] } as unknown as GameState;
    const r = reportDistraction(st, 'a', 10);
    expect(r.xp).toBe(-10);
    expect(r.state.sessions[0]).toMatchObject({ minutes: 40, distractionMinutes: 10, distractions: 1, distractionReported: 10, focusPct: 80 });
    expect(r.state.xp[0].amount).toBe(40);
    const back = reportDistraction(r.state, 'a', 0);
    expect(back.xp).toBe(10);
    expect(back.state.sessions[0]).toMatchObject({ minutes: 50, distractionMinutes: 0, distractions: 0, focusPct: 100 });
    expect(reportDistraction(st, 'a', 999).state.sessions[0].minutes).toBe(1);
  });
});
