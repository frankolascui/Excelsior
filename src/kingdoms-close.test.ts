import { describe, expect, it } from 'vitest';
import { emptyState, addQuest, completeQuest, createProfile } from './game';
import { addKingdom, closeKingdom, kingdomFinished, kingdomIdleDays, reopenKingdom, staleKingdoms } from './kingdoms';
import { coinBalance, kingdomBonus } from './economy';
import type { GameState } from './types';

const NOW = new Date(2026, 10, 17, 12).getTime();
const DAY = 86_400_000;

function withKingdom(builtN: number, pendingN: number): { s: GameState; k: string } {
  let s: GameState = createProfile(emptyState(), 'Nico', [], NOW);
  s = addKingdom(s, 'R', NOW);
  const k = s.kingdoms[0].id;
  for (let i = 0; i < builtN + pendingN; i++) s = addQuest(s, `t${i}`, 'side', NOW, { kingdomId: k });
  for (const q of s.quests.slice(0, builtN)) s = completeQuest(s, q.id, NOW).state;
  return { s, k };
}

describe('tributo de los reinos', () => {
  it('empieza en Villa (3 levantadas) y no depende de lo pendiente', () => {
    expect(kingdomBonus(withKingdom(2, 0).s, withKingdom(2, 0).k)).toBe(0);
    const { s, k } = withKingdom(3, 0);
    expect(kingdomBonus(s, k)).toBe(30);
    const more = addQuest(s, 'nueva', 'side', NOW, { kingdomId: k });
    expect(kingdomBonus(more, k)).toBe(30);
    expect(coinBalance(more, NOW)).toBe(coinBalance(s, NOW));
  });
  it('un reino a medias ya cobra por lo levantado', () => {
    const { s, k } = withKingdom(4, 5);
    expect(kingdomBonus(s, k)).toBe(40);
  });
});

describe('cerrar un reino como monumento', () => {
  it('quita lo pendiente, conserva lo construido y cuenta como terminado', () => {
    const { s, k } = withKingdom(2, 3);
    expect(kingdomFinished(s, k)).toBe(false);
    const c = closeKingdom(s, k, NOW);
    expect(c.kingdoms[0].closedAt).toBe(NOW);
    expect(c.quests.filter((q) => q.kingdomId === k)).toHaveLength(2);
    expect(kingdomFinished(c, k)).toBe(true);
    const r = reopenKingdom(c, k);
    expect(r.kingdoms[0].closedAt).toBeUndefined();
  });
  it('avisa de reinos abiertos parados 14 días', () => {
    const { s, k } = withKingdom(1, 1);
    expect(kingdomIdleDays(s, k, NOW + 3 * DAY)).toBe(3);
    expect(staleKingdoms(s, NOW + 13 * DAY)).toHaveLength(0);
    expect(staleKingdoms(s, NOW + 14 * DAY)).toHaveLength(1);
    expect(staleKingdoms(closeKingdom(s, k, NOW), NOW + 30 * DAY)).toHaveLength(0);
  });
});
