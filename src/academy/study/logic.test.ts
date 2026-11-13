import { describe, expect, it } from 'vitest';
import { blockMath, byPosition, daysUntil, nextPosition, parseRoute, routeToHash, swapWithNeighbour, titleFromMarkdown, type Route } from './logic';

const items = [
  { id: 'b', position: 1 },
  { id: 'a', position: 0 },
  { id: 'c', position: 2 },
];

describe('orden', () => {
  it('ordena por posición sin tocar la lista original', () => {
    expect(byPosition(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(items[0].id).toBe('b');
  });
  it('lo nuevo va al final', () => {
    expect(nextPosition(items)).toBe(3);
    expect(nextPosition([])).toBe(0);
  });
  it('mover arriba intercambia con el de encima', () => {
    expect(swapWithNeighbour(items, 'b', -1)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });
  it('no se puede subir el primero ni bajar el último', () => {
    expect(swapWithNeighbour(items, 'a', -1)).toEqual([]);
    expect(swapWithNeighbour(items, 'c', 1)).toEqual([]);
  });
});

describe('titleFromMarkdown', () => {
  it('usa el primer encabezado', () => {
    expect(titleFromMarkdown('x.md', 'intro\n# Sistema digestivo\n## Boca')).toBe('Sistema digestivo');
  });
  it('si no hay encabezado, limpia el nombre del archivo', () => {
    expect(titleFromMarkdown('resumen-tema_3.md', 'texto')).toBe('Resumen tema 3');
  });
});

describe('daysUntil', () => {
  const hoy = new Date(2026, 10, 9); // 9 nov 2026
  it('cuenta los días hasta el examen', () => {
    expect(daysUntil('2026-11-16', hoy)).toBe(7);
    expect(daysUntil('2026-11-09', hoy)).toBe(0);
    expect(daysUntil('2026-11-01', hoy)).toBe(-8);
  });
  it('sin fecha devuelve null', () => {
    expect(daysUntil(null, hoy)).toBeNull();
  });
});

describe('rutas', () => {
  const casos: Route[] = [
    { view: 'simulacros', subjectId: 's1' },
    { view: 'estadisticas' },
    { view: 'ajustar' },
    { view: 'estadisticas', subjectId: 's1' },
    { view: 'simulacro', subjectId: 's1', examId: 'e1' },
    { view: 'estanteria' },
    { view: 'asignatura', subjectId: 's1' },
    { view: 'asignatura', subjectId: 's1', topicId: 't1' },
    { view: 'hoja', subjectId: 's1', topicId: 't1', pageId: 'p1', edit: false },
    { view: 'hoja', subjectId: 's1', topicId: 't1', pageId: 'p1', edit: true },
    { view: 'repasar' },
    { view: 'repasar', subjectId: 's1' },
    { view: 'repasar', subjectId: 's1', topicIds: ['t1'] },
    { view: 'repasar', subjectId: 's1', topicIds: ['t1', 't2', 't3'] },
  ];
  it.each(casos)('ida y vuelta: %o', (r) => {
    expect(parseRoute(routeToHash(r))).toEqual(r);
  });
  it('una dirección rara vuelve a la estantería', () => {
    expect(parseRoute('#/cosas/raras')).toEqual({ view: 'estanteria' });
    expect(parseRoute('')).toEqual({ view: 'estanteria' });
  });
});

describe('blockMath', () => {
  it('pasa $$...$$ de una línea a bloque', () => {
    expect(blockMath('texto\n$$a+b$$\nmás')).toBe('texto\n$$\na+b\n$$\nmás');
  });
  it('no toca fórmulas dentro de una frase', () => {
    expect(blockMath('sea $$a$$ y $b$')).toBe('sea $$a$$ y $b$');
  });
});
