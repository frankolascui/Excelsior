import { describe, expect, it } from 'vitest';
import { createProfile, emptyState } from './game';
import { escapeLike, makeTag, parseTag, publicFields, relationWith, setBio, setPhoto, tagBase, BIO_MAX, PHOTO_MAX } from './social';

const NOW = new Date(2026, 9, 7, 10, 0).getTime();
const base = () => createProfile(emptyState(), 'Nicolas', [], NOW);

describe('tag de amigo', () => {
  it('nombre + # + 4 cifras', () => {
    expect(makeTag('Nicolas', () => 0.4821)).toBe('Nicolas#4821');
    expect(makeTag('Ana', () => 0.0007)).toBe('Ana#0007');
    expect(tagBase('  El #Rey   de   todo  ')).toBe('El Rey de todo');
    expect(tagBase('###')).toBe('Heroe');
    expect(tagBase('x'.repeat(40))).toHaveLength(24);
  });

  it('entiende el tag escrito de varias formas', () => {
    expect(parseTag('Nicolas#4821')).toBe('Nicolas#4821');
    expect(parseTag('  nicolas #4821 ')).toBe('nicolas#4821');
    expect(parseTag('El Rey#0001')).toBe('El Rey#0001');
    expect(parseTag('Nicolas')).toBeNull();
    expect(parseTag('Nicolas#48')).toBeNull();
    expect(parseTag('#4821')).toBeNull();
  });

  it('los comodines no cuelan en la búsqueda', () => {
    expect(escapeLike('a_b%c\\d#0001')).toBe('a\\_b\\%c\\\\d#0001');
  });
});

describe('perfil público', () => {
  it('biografía recortada y foto con tope', () => {
    let s = setBio(base(), `  ${'a'.repeat(400)}  `);
    expect(s.profile?.bio).toHaveLength(BIO_MAX);
    s = setBio(s, '   ');
    expect(s.profile?.bio).toBeUndefined();
    s = setPhoto(s, 'data:image/jpeg;base64,AAA');
    expect(s.profile?.photo).toBe('data:image/jpeg;base64,AAA');
    expect(setPhoto(s, 'x'.repeat(PHOTO_MAX + 1))).toBe(s);
    expect(setPhoto(s, null).profile?.photo).toBeUndefined();
  });

  it('publica nivel, avatar y estadísticas, no la partida', () => {
    const f = publicFields(setBio(base(), 'Construyo Excelsior'), NOW);
    expect(f).toMatchObject({ name: 'Nicolas', bio: 'Construyo Excelsior', photo: null, level: 1, xp: 0, avatar_index: 0 });
    expect(f.avatar_name).toBeTruthy();
    expect(f.stats).toMatchObject({ achievements: 0, deepHours: 0, bosses: 0 });
    expect(Object.keys(f.stats.attrs)).toHaveLength(5);
    expect(f).not.toHaveProperty('quests');
  });
});

describe('relación con otro jugador', () => {
  const rows = [
    { requester: 'me', addressee: 'ana', status: 'accepted' as const },
    { requester: 'me', addressee: 'leo', status: 'pending' as const },
    { requester: 'eva', addressee: 'me', status: 'pending' as const },
  ];
  it('amigo, enviada, recibida, nada o tú mismo', () => {
    expect(relationWith('me', 'ana', rows)).toBe('friend');
    expect(relationWith('me', 'leo', rows)).toBe('outgoing');
    expect(relationWith('me', 'eva', rows)).toBe('incoming');
    expect(relationWith('me', 'zoe', rows)).toBe('none');
    expect(relationWith('me', 'me', rows)).toBe('self');
  });
});
