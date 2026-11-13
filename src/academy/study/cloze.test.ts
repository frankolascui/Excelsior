import { describe, expect, it } from 'vitest';
import { clozeCards, clozeNumbers, isCloze } from './cloze';

describe('huecos (cloze)', () => {
  const t = 'La mitocondria produce {{c1::ATP::molécula}} en la {{c2::respiración celular}}. Otra vez {{c1::ATP}}.';
  it('detecta los huecos', () => {
    expect(isCloze(t)).toBe(true);
    expect(isCloze('sin huecos {c1}')).toBe(false);
    expect(clozeNumbers(t)).toEqual([1, 2]);
  });
  it('una tarjeta por hueco: tapa ese y enseña los demás', () => {
    const [a, b] = clozeCards(t, 'Tema 3');
    expect(a.front).toBe('La mitocondria produce **[molécula]** en la respiración celular. Otra vez **[…]**.');
    expect(a.back).toBe('La mitocondria produce **ATP** en la respiración celular. Otra vez **ATP**.\n\nTema 3');
    expect(b.front).toBe('La mitocondria produce ATP en la **[…]**. Otra vez ATP.');
  });
});
