// Avisos sociales en el menú (V2): solicitudes de amistad, invitaciones de gremio y recompensas de gremio por cobrar.
// Al entrar con cuenta se cargan amigos y gremio en segundo plano (y cada 10 min); de paso se entrega la corona semanal.
import { useEffect } from 'react';
import type { Game } from './screens';
import { useCloud } from './cloud';
import { refreshSocial, useSocial } from './social';
import { challengeState, refreshGuild, useGuild } from './guilds';
import { freshMe } from './ranking-ui';
import { crownCheck } from './trophies';

const EVERY = 10 * 60_000;

export function useSocialAlerts(game: Game): { amigos: number; gremios: number } {
  const me = useCloud().userId;
  const social = useSocial();
  const guild = useGuild();
  const online = !!me && !!game.state.profile;

  useEffect(() => {
    if (!online) return;
    const load = () => { void refreshSocial(game.state); void refreshGuild(game.state); };
    load();
    const t = window.setInterval(load, EVERY);
    return () => clearInterval(t);
  }, [me, online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Corona: si ganaste la semana pasada entre tus amigos, va al inventario (una vez por semana).
  const friendIds = social.rows.filter((r) => r.status === 'accepted').map((r) => (r.requester === me ? r.addressee : r.requester));
  const friendsKey = friendIds.map((id) => `${id}:${social.people[id]?.stats?.prev?.key ?? ''}:${social.people[id]?.stats?.prev?.xp ?? ''}`).join('|');
  useEffect(() => {
    if (!me || social.loading || !game.cloudChecked || friendIds.length === 0) return;
    const now = Date.now();
    const people = [freshMe(me, game.state, social.me, now), ...friendIds.map((id) => social.people[id]).filter(Boolean)];
    if (crownCheck(game.state, people, me, now) !== game.state) {
      game.act((s) => crownCheck(s, people, me, now));
      game.toast('{i:crown} ¡Ganaste la semana entre tus amigos! Corona y +50 {i:coin} en tu inventario', 'level');
    }
  }, [me, social.loading, game.cloudChecked, friendsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!online) return { amigos: 0, gremios: 0 };
  const amigos = social.rows.filter((r) => r.status === 'pending' && r.addressee === me).length;
  const now = Date.now();
  const claims = new Set(game.state.guildClaims ?? []);
  const toClaim = guild.challenges.filter((c) => challengeState(c, now) === 'won' && !claims.has(c.id)
    && guild.contributions.some((x) => x.challenge_id === c.id && x.user_id === me && x.deep + x.habits + x.xp > 0)).length;
  return { amigos, gremios: guild.invites.length + toClaim };
}
