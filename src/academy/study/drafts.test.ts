import { describe, expect, it } from 'vitest';
import { draftFlags, normalize, similarity, type Draft } from './drafts';

const d = (id: string, front: string, back = 'algo'): Draft => ({ id, front, back, source: 'pegado', at: 0 });

describe('bandeja de revisión', () => {
  it('compara preguntas sin tildes, signos ni mayúsculas', () => {
    expect(normalize('¿Qué es la **Mitosis**?')).toBe(normalize('que es la mitosis'));
  });
  it('marca duplicadas (con el tema y dentro del lote), parecidas, largas y sin respuesta', () => {
    const drafts = [
      d('a', '¿Qué es la mitosis?'),
      d('b', '¿Qué es la meiosis?'),
      d('c', 'Que es la meiosis'),
      d('d', 'Fases de la mitosis en células animales y vegetales', 'x'.repeat(300)),
      d('e', 'Pregunta sin respuesta', ''),
    ];
    const f = draftFlags(drafts, [{ front: 'que es la MITOSIS' }]);
    expect(f.get('a')).toEqual(['duplicada']);
    expect(f.get('b')).toEqual([]);
    expect(f.get('c')).toEqual(['duplicada']);
    expect(f.get('d')).toEqual(['larga']);
    expect(f.get('e')).toEqual(['sin-respuesta']);
  });
  it('parecido por palabras en común', () => {
    expect(similarity('Capital de Francia y su población', 'Población y capital de Francia')).toBeGreaterThanOrEqual(0.75);
    expect(similarity('Capital de Francia', 'Ley de Ohm')).toBe(0);
  });
});
