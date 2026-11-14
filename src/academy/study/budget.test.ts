import { describe, expect, it } from 'vitest';
import { allocateNew, dailyBudget, estimateMinutes, NEW_CARD_COST } from './budget';

describe('minutos al día', () => {
  it('sin presupuesto no limita', () => {
    expect(dailyBudget({ budgetMin: null, dueCards: 500, secPerCard: 10, doneSec: 0 })).toBeNull();
  });
  it('con 20 min, 60 repasos de 10 s (10 min) dejan sitio para 20 nuevas', () => {
    const b = dailyBudget({ budgetMin: 20, dueCards: 60, secPerCard: 10, doneSec: 0 })!;
    expect(b.dueMin).toBe(10);
    expect(b.newCap).toBe(Math.floor((10 * 60) / (10 * NEW_CARD_COST)));
    expect(b.deficitMin).toBe(0);
  });
  it('lo ya repasado hoy cuenta, y si los repasos no caben hay déficit y 0 nuevas', () => {
    const b = dailyBudget({ budgetMin: 15, dueCards: 120, secPerCard: 10, doneSec: 5 * 60 })!;
    expect(b.newCap).toBe(0);
    expect(b.deficitMin).toBe(10); // 5 hechos + 20 de repasos = 25 frente a 15
  });
  it('reparte las nuevas: primero el examen más cercano', () => {
    const m = allocateNew([{ key: 'examen', want: 15 }, { key: 'otra', want: 20 }], 25);
    expect(m.get('examen')).toBe(15);
    expect(m.get('otra')).toBe(10);
    expect(allocateNew([{ key: 'a', want: 7 }], Infinity).get('a')).toBe(7);
  });
  it('estima los minutos de una cola', () => {
    expect(estimateMinutes(60, 10, 10)).toBe(15);
  });
});
