import { describe, expect, it } from 'vitest';
import { adminBlocks } from './cloud';

const U = 'https://x.supabase.co';
describe('modo admin: la cuenta real es solo de lectura', () => {
  it('deja leer todo', () => {
    expect(adminBlocks('GET', `${U}/rest/v1/profiles?select=*`)).toBe(false);
    expect(adminBlocks('GET', `${U}/rest/v1/saves`)).toBe(false);
  });
  it('bloquea escribir perfil, gremio, partida, salud y borrar la cuenta', () => {
    for (const [m, p] of [['PATCH', 'profiles'], ['POST', 'profiles'], ['POST', 'guild_contributions'], ['PATCH', 'guild_contributions'],
      ['POST', 'saves'], ['PATCH', 'saves'], ['POST', 'nights'], ['POST', 'settings'], ['DELETE', 'friendships'],
      ['POST', 'rpc/guild_check_victory'], ['POST', 'rpc/delete_my_account']]) {
      expect(adminBlocks(m, `${U}/rest/v1/${p}`), `${m} ${p}`).toBe(true);
    }
  });
  it('deja entrar y salir de la cuenta, buscar recomendados y usar Academy', () => {
    expect(adminBlocks('POST', `${U}/auth/v1/logout`)).toBe(false);
    expect(adminBlocks('POST', `${U}/rest/v1/rpc/recommended_friends`)).toBe(false);
    expect(adminBlocks('POST', `${U}/rest/v1/study_reviews`)).toBe(false);
    expect(adminBlocks('PATCH', `${U}/rest/v1/study_cards?id=eq.1`)).toBe(false);
  });
});
