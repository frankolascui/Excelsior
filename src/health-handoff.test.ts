import { describe, expect, it } from 'vitest';
import { decodeHandoff } from './health-handoff';

// Igual que packNights() de la web antigua del Diario de Sueño.
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function pack(data: unknown, zip: boolean) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (!zip) return 'j' + b64url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

describe('traer noches del Diario de Sueño', () => {
  const nights = [{ fecha: '2026-11-01', percibido: { cama: '23:00' }, preguntas: { notas: 'Dormí ñoño' } }, { fecha: '2026-11-02' }];

  it('lee el enlace comprimido y el plano, con acentos', async () => {
    expect(await decodeHandoff(await pack(nights, true))).toEqual(nights);
    expect(await decodeHandoff(await pack(nights, false))).toEqual(nights);
    expect(await decodeHandoff(await pack({ noches: nights }, true))).toEqual(nights);
  });

  it('un enlace roto devuelve null', async () => {
    expect(await decodeHandoff('zno-es-deflate')).toBeNull();
    expect(await decodeHandoff('x' + 'abc')).toBeNull();
    expect(await decodeHandoff(await pack({ hola: 1 }, false))).toBeNull();
  });
});
