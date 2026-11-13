import { describe, expect, it } from 'vitest';
import { toAnkiRevlog, validParams } from './optimize';

describe('optimizador: formato de Anki', () => {
  it('agrupa por tarjeta, ordena por hora y traduce el estado', () => {
    const r = toAnkiRevlog([
      { card_id: 'b', rating: 3, state: 0, reviewed_at: '2026-11-01T10:00:00Z' },
      { card_id: 'a', rating: 1, state: 2, reviewed_at: '2026-11-05T10:00:00Z' },
      { card_id: 'a', rating: 3, state: 0, reviewed_at: '2026-11-01T09:00:00Z' },
      { card_id: 'a', rating: 3, state: 3, reviewed_at: '2026-11-05T10:10:00Z' },
    ]);
    expect(r.cards).toBe(2);
    expect(r.cids).toEqual([1n, 1n, 1n, 2n]);
    expect(r.eases).toEqual([3, 1, 3, 3]);
    expect(r.types).toEqual([0, 1, 2, 0]);
    expect(r.ids[0]).toBe(BigInt(Date.parse('2026-11-01T09:00:00Z')));
    expect(r.ids[3]).toBe(BigInt(Date.parse('2026-11-01T10:00:00Z'))); // otra tarjeta: conserva su hora
  });
  it('valida los 21 parámetros', () => {
    expect(validParams(Array(21).fill(1))).toBe(true);
    expect(validParams(Array(19).fill(1))).toBe(false);
    expect(validParams([...Array(20).fill(1), NaN])).toBe(false);
  });
});
