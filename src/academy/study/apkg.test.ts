/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { ankiSchedule, clozeBack, clozeFront, isCloze, openCollection, readApkg } from './apkg';

const require = createRequire(import.meta.url);
const wasm = require.resolve('sql.js/dist/sql-wasm.wasm');
const SQL = await initSqlJs({ locateFile: () => wasm });
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const now = new Date('2026-11-09T12:00:00Z');

describe('huecos (cloze)', () => {
  const t = 'La {{c1::mitosis}} da {{c2::dos::número}} células';
  it('detecta notas de huecos', () => {
    expect(isCloze(t)).toBe(true);
    expect(isCloze('Sin huecos')).toBe(false);
  });
  it('tapa solo el hueco que toca y usa la pista si la hay', () => {
    expect(clozeFront(t, 1)).toBe('La <b>[…]</b> da dos células');
    expect(clozeFront(t, 2)).toBe('La mitosis da <b>[número]</b> células');
    expect(clozeBack(t, 2)).toBe('La mitosis da <b>dos</b> células');
  });
});

describe.each(['viejo.apkg', 'nuevo.apkg'])('leer %s', (file) => {
  const { decks, cards } = readApkg(openCollection(fixture(file), SQL), now);

  it('lista los mazos con tarjetas y su número', () => {
    expect(decks).toEqual([
      { id: '10', name: 'Lengua::Tema 1', count: 3 },
      { id: '20', name: 'Lengua::Tema 2', count: 2 },
    ]);
  });
  it('convierte notas básicas, inversas y huecos', () => {
    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ['¿Qué es el <b>emisor</b>?', 'Quien envía el mensaje'],
      ['Canal', 'Medio físico<br>(aire, pantalla)'],
      ['Medio físico<br>(aire, pantalla)', 'Canal'],
      ['La <b>[…]</b> da dos células', 'La <b>mitosis</b> da dos células'],
      ['La mitosis da <b>[número]</b> células', 'La mitosis da <b>dos</b> células'],
    ]);
  });
  it('marca las suspendidas y conserva el progreso', () => {
    expect(cards.map((c) => c.suspended)).toEqual([false, false, false, false, true]);
    // La inversa y su original son hermanas, igual que los dos huecos de la misma frase.
    const keys = cards.map((c) => c.noteKey);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).toBe(keys[4]);
    expect(new Set(keys).size).toBe(3);
    expect(cards[0].sched).toBeNull(); // nueva
    expect(cards[1].sched).toMatchObject({ state: 2, stability: 12.5, difficulty: 6.2, reps: 4, lapses: 1, scheduled_days: 10 });
    expect(cards[2].sched).toMatchObject({ state: 2, stability: 5, difficulty: 5 }); // sin FSRS: aproximación
  });
});

describe('ankiSchedule', () => {
  const base = { id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 10, ivl: 4, factor: 2500, reps: 2, lapses: 0, odue: 0, odid: 0, data: '' };
  const crt = Date.UTC(2026, 0, 1) / 1000;
  it('la fecha de repaso son días contados desde crt', () => {
    expect(ankiSchedule(base, crt, now)!.due).toBe('2026-01-11T00:00:00.000Z');
    expect(ankiSchedule(base, crt, now)!.last_review).toBe('2026-01-07T00:00:00.000Z');
  });
  it('en un mazo filtrado usa la fecha original (odue)', () => {
    expect(ankiSchedule({ ...base, odid: 5, odue: 20, due: -100 }, crt, now)!.due).toBe('2026-01-21T00:00:00.000Z');
  });
  it('aprendiendo: due son segundos desde 1970', () => {
    const s = ankiSchedule({ ...base, type: 1, queue: 1, due: 1_800_000_000, ivl: 0 }, crt, now)!;
    expect(s.state).toBe(1);
    expect(s.due).toBe(new Date(1_800_000_000_000).toISOString());
  });
  it('datos de FSRS rotos no rompen la importación', () => {
    expect(ankiSchedule({ ...base, data: '{roto' }, crt, now)!.stability).toBe(4);
  });
});

it('un archivo que no es de Anki da un error claro', async () => {
  const { zipSync } = await import('fflate');
  expect(() => openCollection(zipSync({ 'hola.txt': new Uint8Array([1]) }), SQL)).toThrow(/no parece un mazo/);
});
