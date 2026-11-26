import { describe, expect, it } from 'vitest';
import { accessFor, bestRole, canEdit, canInvite, canManage, joinLink, tokenFrom } from './groups';

describe('grupos de estudio', () => {
  it('el mejor papel entre varios grupos', () => {
    expect(bestRole(['reader', 'editor'])).toBe('editor');
    expect(bestRole(['reader', null, 'owner'])).toBe('owner');
    expect(bestRole([])).toBeNull();
  });
  it('acceso a una asignatura', () => {
    expect(accessFor('yo', 'yo', [])).toBe('owner');
    expect(accessFor('otro', 'yo', ['reader'])).toBe('reader');
    expect(accessFor('otro', 'yo', ['reader', 'editor'])).toBe('editor');
    expect(accessFor('otro', 'yo', ['owner'])).toBe('editor'); // el propietario del grupo edita, pero no es dueño
    expect(accessFor('otro', 'yo', [])).toBeNull();
    expect(accessFor('otro', null, ['editor'])).toBeNull();
  });
  it('qué deja hacer cada papel', () => {
    expect([canEdit('owner'), canEdit('editor'), canEdit('reader'), canEdit(null)]).toEqual([true, true, false, false]);
    expect([canInvite('owner'), canInvite('editor'), canInvite('reader')]).toEqual([true, true, false]);
    expect([canManage('owner'), canManage('editor')]).toEqual([true, false]);
  });
  it('enlaces de invitación', () => {
    const t = '0123456789abcdef0123456789abcdef';
    const url = joinLink(t, { origin: 'https://excelsiorapp.netlify.app', pathname: '/' });
    expect(url).toBe(`https://excelsiorapp.netlify.app/#academy/unirse/${t}`);
    expect(tokenFrom(url)).toBe(t);
    expect(tokenFrom(t.toUpperCase())).toBe(t);
    expect(tokenFrom('hola')).toBeNull();
  });
});
