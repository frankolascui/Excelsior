import { describe, expect, it } from 'vitest';
import { cmpVersion, latestVersion, NEWS, newsGroups, newsToAnnounce } from './news';

describe('novedades', () => {
  it('ordena versiones por partes (1.18 < 2.0 < 2.1)', () => {
    expect(cmpVersion('1.18', '2.0')).toBeLessThan(0);
    expect(cmpVersion('2.1', '2.0')).toBeGreaterThan(0);
    expect(cmpVersion('1.9', '1.18')).toBeLessThan(0);
  });

  it('anuncia la versión actual una sola vez, y nunca las marcadas como ya publicadas', () => {
    expect(newsToAnnounce(null, '2.0')?.title).toBe('La era social');
    expect(newsToAnnounce('1.18', '2.0')?.version).toBe('2.0');
    expect(newsToAnnounce('2.0', '2.0')).toBeNull();
    expect(newsToAnnounce(null, '1.18')).toBeNull();
    expect(newsToAnnounce(null, '9.9')).toBeNull();
  });

  it('si ya viste una versión más nueva (web de prueba), la web normal no anuncia la suya', () => {
    expect(newsToAnnounce('3.1', '3.0')).toBeNull();
    expect(newsToAnnounce('3.0', '3.1')?.version).toBe('3.1');
    expect(latestVersion('3.0', undefined, '3.1', null)).toBe('3.1');
    expect(latestVersion(undefined, null)).toBeNull();
  });

  it('agrupa por versión entera con sus actualizaciones', () => {
    const g = newsGroups();
    expect(g.map((x) => x.major.version)).toEqual(['3.0', '2.0', '1.0']);
    expect(g[0].updates.map((n) => n.version)).toEqual(['3.5', '3.1']);
    expect(g[1].updates.map((n) => n.version)).toEqual(['2.2', '2.1']);
    expect(g[2].updates.length).toBe(18);
  });

  it('la lista va de la más nueva a la más vieja', () => {
    for (let i = 1; i < NEWS.length; i++) expect(cmpVersion(NEWS[i - 1].version, NEWS[i].version)).toBeGreaterThan(0);
  });
});
