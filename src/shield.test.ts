import { describe, expect, it } from 'vitest';
import { addHabit, dailyStreakInfo, emptyState, habitAtRisk, toggleHabit, updateHabit } from './game';
import { buyShield, coinBalance, shieldableDay, shieldsLeft, spendShield, unusedPurchases } from './economy';
import { weekShareText } from './habits-ui';
import type { GameState } from './types';

const MON = new Date('2026-11-09T10:00:00').getTime(); // lunes, ya sin escudo gratis
const D = 86_400_000;

function rich(s: GameState): GameState {
  return { ...s, xp: [...s.xp, { id: 'x', at: MON - 30 * D, amount: 1000, source: 'admin', sourceId: 'test', label: 'test', attributes: {} }] };
}

function leer(days: string[]): { s: GameState; id: string } {
  let s = rich(addHabit(emptyState(), 'Leer', MON - 20 * D, { minimum: '  1 página ' }));
  const id = s.habits[0].id;
  for (const d of days) s = toggleHabit(s, id, MON, d).state;
  return { s, id };
}

describe('escudo de racha (tienda)', () => {
  it('sin escudo, un fallo rompe la racha; ayer fallado aún se puede salvar hoy', () => {
    let { s, id } = leer(['2026-11-05', '2026-11-06', '2026-11-07']); // falla el domingo 8
    expect(dailyStreakInfo(s, id, MON)).toEqual({ streak: 3, shields: [] }); // pendiente, no es escudo
    expect(habitAtRisk(s, s.habits[0], MON)).toBe('2026-11-08');
    s = toggleHabit(s, id, MON).state; // hoy hecho sin escudo: la racha vuelve a 1
    expect(dailyStreakInfo(s, id, MON).streak).toBe(1);
    expect(habitAtRisk(s, s.habits[0], MON)).toBeNull();
  });

  it('comprar y usar un escudo salva el día; marcarlo después lo devuelve al cofre', () => {
    let { s, id } = leer(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09']);
    const before = coinBalance(s, MON);
    s = buyShield(s, MON).state;
    expect(coinBalance(s, MON)).toBe(before - 50);
    expect(shieldsLeft(s)).toBe(1);
    expect(unusedPurchases(s)).toHaveLength(0); // el escudo no va al cofre de premios
    expect(shieldableDay(s, id, MON)).toBe('2026-11-08');
    s = spendShield(s, id, '2026-11-08', MON).state;
    expect(shieldsLeft(s)).toBe(0);
    expect(dailyStreakInfo(s, id, MON)).toEqual({ streak: 4, shields: ['2026-11-08'] });
    s = toggleHabit(s, id, MON, '2026-11-08').state; // al final sí lo hizo
    expect(shieldsLeft(s)).toBe(1);
    expect(dailyStreakInfo(s, id, MON)).toEqual({ streak: 5, shields: [] });
  });

  it('nunca dos días seguidos: dos fallos no se pueden salvar', () => {
    let { s, id } = leer(['2026-11-05', '2026-11-06']); // falla sábado y domingo
    s = buyShield(buyShield(s, MON).state, MON).state;
    expect(shieldableDay(s, id, MON)).toBeNull();
    expect(spendShield(s, id, '2026-11-08', MON).ok).toBe(false);
  });

  it('sin monedas no se compra', () => {
    expect(buyShield(emptyState(), MON).ok).toBe(false);
  });

  it('las rachas antiguas conservan el escudo gratis hasta el cambio', () => {
    const OCT = new Date('2026-10-26T10:00:00').getTime();
    let s = addHabit(emptyState(), 'Leer', OCT - 20 * D);
    const id = s.habits[0].id;
    for (const d of ['19', '20', '22', '23', '24', '25', '26']) s = toggleHabit(s, id, OCT, `2026-10-${d}`).state;
    expect(dailyStreakInfo(s, id, OCT)).toEqual({ streak: 7, shields: ['2026-10-21'] });
  });
});

describe('mínimo y semana compartida', () => {
  it('guarda el mínimo recortado y se puede quitar', () => {
    let { s, id } = leer([]);
    expect(s.habits[0].minimum).toBe('1 página');
    s = updateHabit(s, id, { minimum: '' });
    expect(s.habits[0].minimum).toBeUndefined();
  });

  it('resumen de la semana con % por hábito', () => {
    const SUN = MON + 6 * D;
    let s = addHabit(emptyState(), 'Leer', MON - 20 * D);
    s = addHabit(s, 'Gimnasio', MON - 20 * D, { perWeek: 4 });
    const [leerId, gymId] = s.habits.map((h) => h.id);
    for (const d of ['09', '10', '11', '12', '13', '14']) s = toggleHabit(s, leerId, SUN, `2026-11-${d}`).state;
    for (const d of ['09', '11']) s = toggleHabit(s, gymId, SUN, `2026-11-${d}`).state;
    const text = weekShareText(s, SUN);
    expect(text).toContain('9 nov – 15 nov');
    expect(text).toContain('- Leer: 6/7 (86 %)');
    expect(text).toContain('- Gimnasio: 2/4 (50 %) · por debajo del 80 %');
    expect(text).toContain('Media: 68 %');
  });
});
