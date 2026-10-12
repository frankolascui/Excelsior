import { describe, expect, it } from 'vitest';
import { createProfile, emptyState } from './game';
import { coinBalance } from './economy';
import { claimReward, cheeredToday, cheersReceived, chronicle, challengeTemplate, mvpCoins, type ChallengeRow, type GuildEvent } from './guilds';
import { addTrophy, CROWN_COINS, crownCheck, equipTitle, unlockedTitles } from './trophies';
import { publicFields, type PublicProfile } from './social';

const NOW = new Date(2026, 9, 14, 10, 0).getTime(); // miércoles; la semana pasada empezó el lunes 5
const DAY = 86_400_000;
const fresh = () => createProfile(emptyState(), 'Nicolas', [], NOW - 30 * DAY);

const won = (template: string, mvp: string | null = null): ChallengeRow => ({
  id: `c-${template}`, guild_id: 'g', template, goal: { deep: 100, minParticipants: 1, cap: 0.5 },
  starts_at: new Date(NOW - 3 * DAY).toISOString(), ends_at: new Date(NOW + 4 * DAY).toISOString(),
  completed_at: new Date(NOW - DAY).toISOString(), created_by: 'a', mvp,
});

function person(id: string, prevXp: number): PublicProfile {
  return {
    user_id: id, tag: `${id}#0001`, name: id, bio: '', photo: null, level: 1, xp: 0, avatar_index: 0, avatar_name: 'Aprendiz',
    stats: { prev: { key: '2026-10-05', xp: prevXp, deep: 0, habits: 0 } },
  };
}

describe('trofeos de gremio', () => {
  it('cobrar un jefe da su estandarte con título; el MVP se lleva además monedas', () => {
    const s0 = fresh();
    const s1 = claimReward(s0, won('dragon', 'me'), NOW, { me: 'me', guild: 'Orden del Alba' });
    expect(s1.trophies?.map((t) => t.kind)).toEqual(['guild', 'mvp']);
    expect(s1.trophies?.[0]).toMatchObject({ name: 'El Dragón de la Procrastinación', detail: 'Orden del Alba', title: 'Matadragones' });
    expect(coinBalance(s1, NOW) - coinBalance(s0, NOW)).toBe(Math.floor(120 / 5) + mvpCoins(challengeTemplate('dragon')!));
    expect(unlockedTitles(s1)).toEqual(expect.arrayContaining(['Matadragones', 'MVP del gremio']));
  });

  it('una misión da estandarte sin título, y quien no es MVP no se lleva el suyo', () => {
    const s1 = claimReward(fresh(), won('cien-minutos', 'otro'), NOW, { me: 'me' });
    expect(s1.trophies).toHaveLength(1);
    expect(s1.trophies?.[0].title).toBeUndefined();
  });

  it('no se duplica el mismo trofeo', () => {
    const t = { kind: 'crown' as const, sourceId: '2026-10-05', name: 'Corona', icon: 'crown', at: NOW };
    const s1 = addTrophy(fresh(), t);
    expect(addTrophy(s1, t)).toBe(s1);
  });
});

describe('corona de la semana', () => {
  it('la gana quien acabó primero la semana pasada entre amigos, una sola vez', () => {
    const s0 = fresh();
    const s1 = crownCheck(s0, [person('me', 300), person('ana', 200)], 'me', NOW);
    expect(s1.trophies?.[0]).toMatchObject({ kind: 'crown', sourceId: '2026-10-05', coins: CROWN_COINS, title: 'Corona de la semana' });
    expect(crownCheck(s1, [person('me', 300), person('ana', 200)], 'me', NOW)).toBe(s1);
  });

  it('nada si otro ganó, si hay empate o si estás solo', () => {
    const s0 = fresh();
    expect(crownCheck(s0, [person('me', 100), person('ana', 200)], 'me', NOW)).toBe(s0);
    expect(crownCheck(s0, [person('me', 200), person('ana', 200)], 'me', NOW)).toBe(s0);
    expect(crownCheck(s0, [person('me', 200)], 'me', NOW)).toBe(s0);
  });
});

describe('títulos', () => {
  it('solo se equipa un título desbloqueado, y se publica en el perfil', () => {
    const s1 = claimReward(fresh(), won('hidra-rota'), NOW, { me: 'me' });
    expect(equipTitle(s1, 'Matadragones')).toBe(s1);
    const s2 = equipTitle(s1, 'Cazahidras');
    expect(s2.title).toBe('Cazahidras');
    expect(publicFields(s2, NOW).stats).toMatchObject({ title: 'Cazahidras', trophies: 1 });
    expect(equipTitle(s2, null).title).toBeNull();
  });
});

describe('crónica y ánimos', () => {
  const ev = (id: number, kind: GuildEvent['kind'], actor: string | null, target: string | null, at: number, day = '2026-10-14'): GuildEvent =>
    ({ id, kind, actor, target, data: {}, day, created_at: new Date(at).toISOString() });

  it('al heredar el liderazgo no sale el «deja de ser colíder» de ese momento', () => {
    const list = [ev(3, 'leader', 'a', 'b', NOW + 1000), ev(2, 'demote', 'a', 'b', NOW), ev(1, 'demote', 'a', 'c', NOW - DAY)];
    expect(chronicle(list).map((e) => e.id)).toEqual([3, 1]);
  });

  it('un ánimo al día por compañero y recuento de la semana', () => {
    const list = [ev(1, 'cheer', 'me', 'ana', NOW), ev(2, 'cheer', 'leo', 'ana', NOW), ev(3, 'cheer', 'me', 'ana', NOW - 8 * DAY, '2026-10-06')];
    expect(cheeredToday(list, 'me', 'ana', '2026-10-14')).toBe(true);
    expect(cheeredToday(list, 'me', 'leo', '2026-10-14')).toBe(false);
    expect(cheersReceived(list, NOW)).toEqual({ ana: 2 });
  });
});
