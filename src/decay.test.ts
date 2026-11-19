import { describe, expect, it } from 'vitest';
import { addHabit, createProfile, emptyState, levelInfo, toggleHabit, totalXp, xpForLevel } from './game';
import { applyInactivity, decayWarning, DECAY_RULES } from './decay';
import { coinsEarned } from './economy';
import type { GameState } from './types';

const DAY = 86_400_000;
const at = (d: string) => new Date(`${d}T12:00:00`).getTime();
const START = at(DECAY_RULES.since);

/** Partida en nivel 5 con 150 XP de progreso, creada antes del cambio. */
function player(): GameState {
  let s = createProfile(emptyState(), 'N', [], START - 30 * DAY);
  s = { ...s, xp: [{ id: 'x', at: START - 10 * DAY, amount: xpForLevel(5) + 150, source: 'quest', sourceId: 'q', label: 'Antes', attributes: {} }] };
  return addHabit(s, 'Leer', START - 20 * DAY);
}

describe('desgaste por inactividad', () => {
  it('el primer día parado no cuesta; desde el segundo, 5 % del progreso del nivel cada día', () => {
    const s = player();
    expect(applyInactivity(s, START + DAY)).toBe(s); // solo un día parado (el del cambio)
    const two = applyInactivity(s, START + 2 * DAY);
    expect(two.decay).toHaveLength(1);
    expect(two.decay![0].amount).toBe(7); // 5 % de 150
    expect(totalXp(two)).toBe(xpForLevel(5) + 143);
    const four = applyInactivity(two, START + 4 * DAY);
    expect(four.decay!.map((d) => d.amount)).toEqual([7, 7, 6]);
  });

  it('nunca baja de nivel y no quita monedas', () => {
    let s = player();
    const coins = coinsEarned(s, START).fromXp;
    s = applyInactivity(s, START + 200 * DAY);
    expect(levelInfo(totalXp(s)).level).toBe(5);
    expect(coinsEarned(s, START + 200 * DAY).fromXp).toBe(coins);
  });

  it('hacer algo corta el desgaste, y marcar un día a posteriori lo devuelve', () => {
    let s = applyInactivity(player(), START + 3 * DAY);
    expect(s.decay).toHaveLength(2);
    const day2 = s.decay![0].day;
    s = toggleHabit(s, s.habits[0].id, START + 3 * DAY, day2).state; // se le olvidó marcarlo
    s = applyInactivity(s, START + 3 * DAY);
    expect(s.decay!.some((d) => d.day === day2)).toBe(false);
  });

  it('no cobra días anteriores al cambio ni a crear la partida', () => {
    const s = player();
    expect(applyInactivity(s, START)).toBe(s);
    const fresh = createProfile(emptyState(), 'N', [], START + 10 * DAY);
    expect(applyInactivity(fresh, START + 11 * DAY)).toBe(fresh);
  });

  it('avisa hoy si ayer no hiciste nada', () => {
    const s = player();
    expect(decayWarning(s, START + DAY)).toEqual({ lose: 7 });
    const done = toggleHabit(s, s.habits[0].id, START + DAY).state;
    expect(decayWarning(done, START + DAY)).toBeNull();
  });
});
