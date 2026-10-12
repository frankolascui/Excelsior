// Pantalla de Gremios (V2): fundar o aceptar invitación, miembros con rangos, encargos con la regla del 30 % y recompensas.
import { useEffect, useState, type FormEvent } from 'react';
import type { Game } from './screens';
import { RequireAccount } from './account';
import { useCloud } from './cloud';
import { Face, ProfileDialog } from './friends';
import { freshMe, Leaderboard } from './ranking-ui';
import { PixelBoss } from './boss-art';
import { BossHpBar, EpicName } from './boss-ui';
import { refreshSocial, useSocial, type PublicProfile } from './social';
import { formatMinutes } from './ui';
import { confetti } from './confetti';
import { sfx } from './sfx';
import {
  acceptInvite, buildGoal, cancelInvite, CHALLENGES, challengeProgress, challengeState, challengeTemplate, claimReward, createGuild,
  declineInvite, EMBLEM_NAME, EMBLEMS, GUILD_MAX, guildLevel, guildXpFrom, invite, kick, leaveGuild, memberShare, METRIC_LABEL, refreshGuild,
  byRank, canCommand, canKick, demote, makeLeader, OFFICER_MAX, promote, RANK_LABEL, rankOf, successor, type Rank,
  startChallenge, useGuild, type ChallengeRow, type ChallengeTemplate, type Contribution, type Goal, type Metric,
  cheer, cheeredToday, cheersReceived, chronicle, mvpCoins, type GuildEvent,
} from './guilds';
import './guilds.css';
import { Glyph, Icon } from './icons';

const fmt = (m: Metric, n: number) => (m === 'deep' ? formatMinutes(n) : `${n}${m === 'xp' ? ' XP' : ''}`);
const DAY = 86_400_000;

function timeLeft(end: string, now: number): string {
  const ms = Date.parse(end) - now;
  if (ms <= 0) return 'terminado';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3_600_000);
  return d ? `quedan ${d} d ${h} h` : `quedan ${h} h`;
}

function goalLine(g: Goal) {
  return (['deep', 'habits', 'xp'] as Metric[]).filter((m) => g[m]).map((m) => `${fmt(m, g[m]!)} de ${METRIC_LABEL[m]}`).join(' + ');
}

function useAct(game: Game) {
  const [busy, setBusy] = useState(false);
  return [busy, async (fn: () => Promise<string | null>, ok?: string) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) game.toast(err, 'info');
    else if (ok) game.toast(ok, 'info');
  }] as const;
}

// ---------- Sin gremio ----------

function NoGuild({ game }: { game: Game }) {
  const { invites } = useGuild();
  const [form, setForm] = useState({ name: '', emblem: EMBLEMS[0], motto: '' });
  const [busy, act] = useAct(game);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return;
    void act(() => createGuild(form, game.state), `{i:${form.emblem}} ${form.name.trim()} ha sido fundado`);
  }
  return (
    <>
      {invites.length > 0 && (
        <section className="panel glow-panel" aria-labelledby="ginv-h">
          <header className="panel-head"><h3 id="ginv-h">Te han invitado</h3><span className="count mono">{invites.length}</span></header>
          <ul className="list">
            {invites.map((i) => (
              <li key={i.guild_id} className="item guild-invite">
                <span className="guild-emblem small" aria-hidden="true"><Glyph icon={i.guild?.emblem ?? 'round-shield'} /></span>
                <span className="item-body">
                  <span className="item-title">{i.guild?.name ?? 'Gremio'}</span>
                  <span className="muted small-text">{i.guild?.motto ? `«${i.guild.motto}» · ` : ''}te invita {i.from?.name ?? 'un amigo'}</span>
                </span>
                <span className="item-actions">
                  <button className="primary small" disabled={busy} onClick={() => act(() => acceptInvite(i.guild_id, game.state), `Bienvenido a ${i.guild?.name ?? 'tu gremio'}`)}><Icon name="check" /> Unirme</button>
                  <button className="ghost small" disabled={busy} onClick={() => act(() => declineInvite(i.guild_id, game.state))}><Icon name="x" /> Rechazar</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel" aria-labelledby="gnew-h">
        <header className="panel-head"><h3 id="gnew-h">Funda tu gremio</h3></header>
        <p className="hint">Hasta {GUILD_MAX} amigos. Juntos os enfrentáis a misiones y jefes con lo que hacéis de verdad: Deep Work, hábitos y XP.</p>
        <form className="guild-form" onSubmit={submit}>
          <div className="emblem-pick" role="radiogroup" aria-label="Emblema">
            {EMBLEMS.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={form.emblem === e} className={form.emblem === e ? 'emblem-opt on' : 'emblem-opt'} aria-label={EMBLEM_NAME[e] ?? e} title={EMBLEM_NAME[e]} data-emblem={e} onClick={() => setForm({ ...form, emblem: e })}><Icon name={e} /></button>
            ))}
          </div>
          <input id="guild-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del gremio" maxLength={32} aria-label="Nombre del gremio" />
          <input id="guild-motto" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder="Lema (opcional)" maxLength={80} aria-label="Lema" />
          <button className="primary" disabled={busy || form.name.trim().length < 2}><Icon name="plus" /> Fundar gremio</button>
        </form>
      </section>
      <RuleCard />
    </>
  );
}

function RuleCard() {
  return (
    <section className="panel quiet rule-card">
      <h3><Icon name="scale" /> La regla del 30 %</h3>
      <p className="hint">En cada encargo, a nadie le cuenta más del 30 % de la meta. Si haces más, se ve, pero no suma: el gremio gana cuando todos empujan, no cuando uno carga con todo. En gremios de menos de 4, el tope sube a partes iguales (la mitad con 2, un tercio con 3).</p>
    </section>
  );
}

// ---------- Reto ----------

function Bar({ value, goal, cap, extra }: { value: number; goal: number; cap?: number; extra?: number }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <span className="g-bar" aria-hidden="true">
      <span className="g-fill" style={{ width: `${pct}%` }} />
      {extra !== undefined && extra > value && <span className="g-extra" style={{ left: `${pct}%`, width: `${Math.min(100 - pct, ((extra - value) / goal) * 100)}%` }} />}
      {cap !== undefined && <span className="g-cap" style={{ left: `${Math.min(100, (cap / goal) * 100)}%` }} />}
    </span>
  );
}

function ChallengeCard({ game, c, now }: { game: Game; c: ChallengeRow; now: number }) {
  const g = useGuild();
  const me = useCloud().userId!;
  const t = challengeTemplate(c.template);
  const contribs: Contribution[] = g.contributions.filter((x) => x.challenge_id === c.id);
  const p = challengeProgress(c.goal, contribs);
  const st = challengeState(c, now);
  const fight = st === 'active' && t?.kind === 'jefe' && !!t.art;
  const hpLeft = Math.max(0, Math.round((1 - p.fraction) * 100));
  const phase = hpLeft <= 25 ? 'furioso' : hpLeft <= 60 ? 'herido' : 'calma';
  const mine = contribs.find((x) => x.user_id === me);
  const claimed = (game.state.guildClaims ?? []).includes(c.id);
  const canClaim = st === 'won' && !claimed && !!mine && (mine.deep + mine.habits + mine.xp > 0);
  const rows = g.members.map((m) => ({ m, c: contribs.find((x) => x.user_id === m.user_id) ?? { user_id: m.user_id, deep: 0, habits: 0, xp: 0 } }))
    .sort((a, b) => (b.c.deep + b.c.habits * 30 + b.c.xp / 2) - (a.c.deep + a.c.habits * 30 + a.c.xp / 2));
  const mvp = c.mvp ? g.people[c.mvp] : undefined;
  function claim() {
    game.act((s) => claimReward(s, c, Date.now(), { me, guild: g.guild?.name }));
    sfx.purchase();
    confetti({ count: 140 });
    game.toast(`+${t?.reward ?? 0} XP para ti · Conexión y Voluntad · estandarte al inventario`, 'level');
    if (c.mvp === me && t) window.setTimeout(() => game.toast(`{i:medal} ¡Eres el MVP del encargo! +${mvpCoins(t)} {i:coin}`, 'level'), 900);
  }
  return (
    <section className={`panel challenge ${t?.kind ?? ''} st-${st}`} aria-labelledby={`ch-${c.id}`}>
      {fight ? (
        <div className="guild-fight">
          <header className="fight-head">
            <EpicName name={t!.name} epithet={t!.epithet} as="h3" id={`ch-${c.id}`} />
          </header>
          <BossHpBar max={100} left={hpLeft} phase={phase} theme="gremio" label={<><b>{hpLeft}</b> / 100</>} />
          <span className="fight-since mono">Jefe de gremio · {timeLeft(c.ends_at, now)}</span>
          <span className={`fight-stage phase-${phase}`} aria-hidden="true">
            <span className="fight-aura" />
            <span className="fight-ground" />
            <PixelBoss templateId={t!.art} icon={t!.icon} phase={phase} scale={2.4} className="boss-art" />
          </span>
          <p className="muted small-text">{t!.lore}</p>
        </div>
      ) : (
      <div className="ch-head">
        <span className="ch-icon" aria-hidden="true"><Icon name={t?.icon ?? 'crossed-swords'} /></span>
        <div className="ch-title">
          <p className="eyebrow">{t?.kind === 'jefe' ? 'Jefe de gremio' : 'Misión de gremio'} · {st === 'active' ? timeLeft(c.ends_at, now) : st === 'won' ? '¡Victoria!' : 'Se escapó'}</p>
          <h3 id={`ch-${c.id}`}>{t?.name ?? c.template}</h3>
          {t && <p className="muted small-text">{t.lore}</p>}
        </div>
        <span className="ch-pct mono">{Math.round(p.fraction * 100)} %</span>
      </div>
      )}
      {p.per.map((x) => (
        <div key={x.metric} className="ch-metric">
          <span className="ch-label">{METRIC_LABEL[x.metric]} <span className="mono">{fmt(x.metric, x.counted)} / {fmt(x.metric, x.goal)}</span>
            {x.real > x.counted && <span className="muted small-text"> · {fmt(x.metric, x.real)} reales</span>}</span>
          <Bar value={x.counted} goal={x.goal} />
        </div>
      ))}
      <p className="muted small-text">
        Participan <span className="mono">{p.participants}</span> de <span className="mono">{g.members.length}</span>{c.goal.minParticipants > 1 && ` (hacen falta ${c.goal.minParticipants})`}
        {' · '}tope por persona: {Math.round(c.goal.cap * 100)} % · recompensa +{t?.reward ?? 0} XP cada uno
      </p>
      {st === 'won' && (
        <div className="ch-win">
          <strong><Icon name="trophy" /> ¡Encargo cumplido!</strong>
          {c.mvp && <span className="ch-mvp small-text"><Icon name="medal" /> MVP: {c.mvp === me ? 'tú' : mvp?.name ?? 'un miembro'}</span>}
          {canClaim ? <button className="primary small" onClick={claim}><Icon name="sparkles" /> Cobrar +{t?.reward} XP</button>
            : claimed ? <span className="muted small-text">Recompensa cobrada</span>
            : <span className="muted small-text">Solo cobra quien aportó algo</span>}
        </div>
      )}
      {st === 'active' && (
        <ul className="ch-members">
          {rows.map(({ m, c: mc }) => {
            const pp = g.people[m.user_id];
            const share = memberShare(c.goal, mc);
            return (
              <li key={m.user_id} className={m.user_id === me ? 'me' : ''}>
                {pp ? <Face p={pp} size={34} /> : <span />}
                <span className="ch-mname">{pp?.name ?? 'Miembro'}{m.user_id === me && ' (tú)'}</span>
                <span className="ch-mbars">
                  {share.map((s) => (
                    <span key={s.metric} className="ch-mbar" title={`${METRIC_LABEL[s.metric]}: ${fmt(s.metric, s.real)} (cuentan ${fmt(s.metric, s.counted)})`}>
                      <Bar value={s.counted} goal={s.cap} />
                      <span className="mono small-text">{fmt(s.metric, s.counted)}{s.capped && <> <Icon name="lock" className="cap-lock" title="Tope alcanzado" /></>}</span>
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PickChallenge({ game, members, command, leader, level }: { game: Game; members: number; command: boolean; leader: string; level: number }) {
  const [busy, act] = useAct(game);
  const card = (t: ChallengeTemplate) => (t.minLevel ?? 1) > level ? (
    <li key={t.id} className={`pick-card ${t.kind} locked`}>
      <span className="pick-icon" aria-hidden="true"><Icon name={t.icon} /></span>
      <strong>{t.name}</strong>
      <span className="muted small-text">{t.lore}</span>
      <span className="pick-lock small-text"><Icon name="lock" /> Nivel de gremio {t.minLevel}{t.title && ` · da el título «${t.title}»`}</span>
    </li>
  ) : (
    <li key={t.id} className={`pick-card ${t.kind}`}>
      <span className="pick-icon" aria-hidden="true"><Icon name={t.icon} /></span>
      <strong>{t.name}</strong>
      <span className="muted small-text">{t.lore}</span>
      <span className="mono small-text">{goalLine(buildGoal(t, members))} · {t.days} días</span>
      <span className="small-text">+{t.reward} XP cada uno · +{t.guildXp} XP de gremio{t.title && <> · título «{t.title}»</>}</span>
      {command && (
        <button className="primary small" disabled={busy} onClick={() => act(() => startChallenge(t, game.state), `¡${t.name} en marcha!`)}>
          {t.kind === 'jefe' ? 'Invocar jefe' : 'Aceptar encargo'}
        </button>
      )}
    </li>
  );
  return (
    <section className="panel" aria-labelledby="pick-h">
      <header className="panel-head"><h3 id="pick-h">Tablón de encargos</h3></header>
      <p className="hint">Las metas se calculan para {members} {members === 1 ? 'miembro' : 'miembros'}. Cuenta lo que hagáis desde que empieza el encargo.</p>
      {!command && <p className="hint rank-note"><Icon name="crown" /> Solo el líder y los colíderes aceptan encargos. Dile a {leader} cuál os apetece.</p>}
      <p className="eyebrow">Misiones</p>
      <ul className="pick-grid">{CHALLENGES.filter((t) => t.kind === 'mision').map(card)}</ul>
      <p className="eyebrow">Jefes</p>
      <ul className="pick-grid">{CHALLENGES.filter((t) => t.kind === 'jefe').map(card)}</ul>
    </section>
  );
}

// ---------- Con gremio ----------

function Members({ game }: { game: Game }) {
  const g = useGuild();
  const social = useSocial();
  const me = useCloud().userId!;
  const [busy, act] = useAct(game);
  const [confirm, setConfirm] = useState<string | null>(null);
  const owner = g.guild?.owner;
  const mine = g.members.find((m) => m.user_id === me);
  const myRankNow: Rank | null = mine ? rankOf(owner, mine) : null;
  const officers = g.members.filter((m) => rankOf(owner, m) === 'officer').length;
  const cheers = cheersReceived(g.events, Date.now());
  const memberIds = new Set(g.members.map((m) => m.user_id));
  const invited = new Set(g.sent.map((i) => i.user_id));
  const friends: PublicProfile[] = social.rows.filter((r) => r.status === 'accepted')
    .map((r) => social.people[r.requester === me ? r.addressee : r.requester]).filter(Boolean)
    .filter((p) => !memberIds.has(p.user_id));
  const full = g.members.length >= GUILD_MAX;
  const ask = (key: string, label: string, run: () => Promise<string | null>, ok?: string, danger = false) =>
    confirm === key
      ? <button className={`ghost small${danger ? ' danger-text' : ''}`} disabled={busy} onClick={() => { setConfirm(null); void act(run, ok); }}>{label}</button>
      : null;
  return (
    <section className="panel" aria-labelledby="gm-h">
      <header className="panel-head"><h3 id="gm-h">Miembros</h3><span className="count mono">{g.members.length}/{GUILD_MAX}</span></header>
      <ul className="list">
        {byRank(owner, g.members).map((m) => {
          const p = g.people[m.user_id];
          const rank = rankOf(owner, m);
          const name = p?.name ?? 'Miembro';
          const isLeader = myRankNow === 'leader' && m.user_id !== me;
          const pending = confirm?.endsWith(m.user_id) ? confirm : null;
          return (
            <li key={m.user_id} className={`item person rank-${rank}`}>
              <span className="person-main">
                {p && <Face p={p} size={44} />}
                <span className="item-body">
                  <span className="item-title">{name}{m.user_id === me && ' (tú)'} <span className={`rank-tag ${rank}`}><Icon name={RANK_LABEL[rank].icon} /> {RANK_LABEL[rank].name}</span></span>
                  <span className="muted small-text">{p ? `Nv ${p.level} · ${p.avatar_name}` : ''}{p?.stats?.title && <> · <span className="title-tag">{p.stats.title}</span></>}
                    {cheers[m.user_id] ? <> · <span className="cheer-count" title="Ánimos recibidos esta semana"><Icon name="heart" /> {cheers[m.user_id]}</span></> : null}</span>
                </span>
              </span>
              {m.user_id !== me && (
                <button className="ghost small cheer-btn" disabled={busy || cheeredToday(g.events, me, m.user_id, serverDay())}
                  onClick={() => act(() => cheer(m.user_id, game.state), `Has animado a ${name}`).then(() => sfx.reward())}
                  title={cheeredToday(g.events, me, m.user_id, serverDay()) ? 'Ya le has animado hoy' : `Dar ánimos a ${name}`}>
                  <Icon name="heart" /> {cheeredToday(g.events, me, m.user_id, serverDay()) ? 'Animado' : 'Ánimo'}
                </button>
              )}
              {m.user_id !== me && (isLeader || canKick(myRankNow, rank)) && (
                <span className="item-actions">
                  {pending ? (
                    <>
                      {ask(`kick:${m.user_id}`, `Sí, expulsar a ${name}`, () => kick(m.user_id, game.state), undefined, true)}
                      {ask(`lead:${m.user_id}`, `Sí, ${name} será líder`, () => makeLeader(m.user_id, game.state), `${name} es el nuevo líder`)}
                      <button className="link" onClick={() => setConfirm(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      {isLeader && rank === 'member' && officers < OFFICER_MAX && (
                        <button className="ghost small" disabled={busy} onClick={() => act(() => promote(m.user_id, game.state), `${name} es colíder`)}><Icon name="crossed-swords" /> Hacer colíder</button>
                      )}
                      {isLeader && rank === 'officer' && (
                        <button className="ghost small" disabled={busy} onClick={() => act(() => demote(m.user_id, game.state))}><Icon name="x" /> Quitar colíder</button>
                      )}
                      {isLeader && <button className="ghost small" onClick={() => setConfirm(`lead:${m.user_id}`)}><Icon name="crown" /> Ceder liderazgo</button>}
                      {canKick(myRankNow, rank) && <button className="ghost small danger-text" onClick={() => setConfirm(`kick:${m.user_id}`)}><Icon name="log-out" /> Expulsar</button>}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint"><Icon name="crown" /> El líder nombra hasta {OFFICER_MAX} colíderes. Líder y colíderes aceptan encargos e invitan; todos aportan.</p>
      <p className="eyebrow">Invitar amigos</p>
      {!canCommand(myRankNow) ? <p className="hint">Solo el líder y los colíderes pueden invitar. Si quieres traer a un amigo, díselo a ellos.</p>
        : full ? <p className="hint">El gremio está completo.</p> : friends.length === 0
        ? <p className="hint">Añade amigos en la pestaña Amigos para poder invitarlos.</p>
        : (
          <ul className="list">
            {friends.map((p) => (
              <li key={p.user_id} className="item person">
                <span className="person-main"><Face p={p} size={40} /><span className="item-body"><span className="item-title">{p.name}</span><span className="muted small-text">Nv {p.level}</span></span></span>
                <span className="item-actions">
                  {invited.has(p.user_id)
                    ? <button className="ghost small" disabled={busy} onClick={() => act(() => cancelInvite(p.user_id, game.state))}><Icon name="x" /> Cancelar invitación</button>
                    : <button className="primary small" disabled={busy} onClick={() => act(() => invite(p.user_id, game.state), `Invitación enviada a ${p.name}`)}><Icon name="user-plus" /> Invitar</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

// ---------- Estandarte, crónica y ánimos ----------

/** Marco del estandarte según el nivel del gremio: bronce, plata, oro. */
const bannerTier = (level: number) => (level >= 5 ? 3 : level >= 3 ? 2 : 1);
const BANNER: Record<number, string> = { 1: 'bronce', 2: 'plata', 3: 'oro' };

/** Lo próximo que desbloquea subir de nivel: jefes nuevos y marco del estandarte. */
function nextPerk(level: number): string {
  for (const lv of [3, 5]) {
    if (level >= lv) continue;
    const bosses = CHALLENGES.filter((t) => t.minLevel === lv).map((t) => t.name);
    return `En el nivel ${lv}: ${[...bosses, `estandarte de ${BANNER[bannerTier(lv)]}`].join(' y ')}.`;
  }
  return 'Estandarte de oro y todos los jefes de gremio desbloqueados.';
}

/** Día del servidor (UTC), el que cuenta para «un ánimo al día». */
const serverDay = () => new Date().toISOString().slice(0, 10);

function ago(at: string, now: number): string {
  const m = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} d`;
}

const EVENT_ICON: Record<GuildEvent['kind'], string> = {
  join: 'user-plus', leave: 'log-out', kick: 'log-out', promote: 'crossed-swords', demote: 'round-shield', leader: 'crown',
  start: 'scroll', victory: 'trophy', cheer: 'heart',
};

/** Frase de la crónica, en segunda persona cuando eres tú («Animaste a Ana», «Leo te nombró colíder»). */
function eventText(e: GuildEvent, me: string | null, name: (id: string | null) => string): string {
  const t = e.data?.template ? challengeTemplate(e.data.template) : undefined;
  const what = t?.name ?? 'un encargo';
  const you = e.actor === me;
  const subj = (third: string, second: string) => (you ? second : `${name(e.actor)} ${third}`);
  const obj = e.target === me ? 'te' : null;
  const to = (id: string | null) => (id === me ? 'a ti' : `a ${name(id)}`);
  switch (e.kind) {
    case 'join': return subj('se unió al gremio', 'Te uniste al gremio');
    case 'leave': return subj('dejó el gremio', 'Dejaste el gremio');
    case 'kick': return obj ? `${name(e.actor)} te expulsó` : subj(`expulsó ${to(e.target)}`, `Expulsaste ${to(e.target)}`);
    case 'promote': return obj ? `${name(e.actor)} te nombró colíder` : subj(`nombró colíder ${to(e.target)}`, `Nombraste colíder ${to(e.target)}`);
    case 'demote': return obj ? 'Dejaste de ser colíder' : `${name(e.target)} dejó de ser colíder`;
    case 'leader': return obj ? 'Ahora eres el líder' : `${name(e.target)} es ahora el líder`;
    case 'start': return t?.kind === 'jefe' ? subj(`invocó a ${what}`, `Invocaste a ${what}`) : subj(`aceptó «${what}»`, `Aceptaste «${what}»`);
    case 'victory': return `¡Victoria en ${t?.kind === 'jefe' ? 'el combate contra ' : ''}${what}! MVP: ${you ? 'tú' : name(e.actor)}`;
    case 'cheer': return obj ? `${name(e.actor)} te animó` : subj(`animó ${to(e.target)}`, `Animaste ${to(e.target)}`);
  }
}

/** La crónica: lo que ha pasado en el gremio, lo más nuevo arriba. */
function Chronicle({ now }: { now: number }) {
  const g = useGuild();
  const me = useCloud().userId;
  const [all, setAll] = useState(false);
  const name = (id: string | null) => (id && g.people[id]?.name) || 'Alguien';
  const items = chronicle(g.events);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, 8);
  return (
    <section className="panel chronicle" aria-labelledby="gchron-h">
      <header className="panel-head"><h3 id="gchron-h">Crónica del gremio</h3></header>
      <ol className="chron-list">
        {shown.map((e) => (
          <li key={e.id} className={`chron-item k-${e.kind}`}>
            <span className="chron-icon" aria-hidden="true"><Icon name={EVENT_ICON[e.kind] as never} /></span>
            <span className="chron-text">{eventText(e, me, name)}</span>
            <span className="chron-when muted small-text">{ago(e.created_at, now)}</span>
          </li>
        ))}
      </ol>
      {items.length > 8 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver todo (${items.length})`}</button>}
    </section>
  );
}

function InGuild({ game, now }: { game: Game; now: number }) {
  const g = useGuild();
  const me = useCloud().userId!;
  const [busy, act] = useAct(game);
  const [leaving, setLeaving] = useState(false);
  const gxp = guildXpFrom(g.challenges);
  const lvl = guildLevel(gxp);
  const active = g.challenges.find((c) => challengeState(c, now) === 'active');
  const past = g.challenges.filter((c) => c !== active);
  const wins = g.challenges.filter((c) => c.completed_at).length;
  const guild = g.guild!;
  const mine = g.members.find((m) => m.user_id === me);
  const rank: Rank | null = mine ? rankOf(guild.owner, mine) : null;
  const [open, setOpen] = useState<PublicProfile | null>(null);
  const ranked = g.members.map((m) => (m.user_id === me ? freshMe(me, game.state, g.people[me], now) : g.people[m.user_id])).filter(Boolean);
  return (
    <>
      <section className={`panel guild-card tier-${bannerTier(lvl.level)}`}>
        <span className="guild-emblem" aria-hidden="true" title={`Estandarte de ${BANNER[bannerTier(lvl.level)]}`}><Glyph icon={guild.emblem} /></span>
        <div className="guild-info">
          <h2>{guild.name}</h2>
          {guild.motto && <p className="guild-motto">«{guild.motto}»</p>}
          <p className="muted small-text">Nivel de gremio <strong className="mono">{lvl.level}</strong> · {gxp} XP de gremio · {wins} {wins === 1 ? 'encargo cumplido' : 'encargos cumplidos'} · {g.members.length}/{GUILD_MAX} miembros</p>
          <span className="g-bar level" aria-hidden="true"><span className="g-fill" style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></span>
          <p className="muted small-text guild-next">{nextPerk(lvl.level)}</p>
        </div>
      </section>

      {active ? <ChallengeCard game={game} c={active} now={now} /> : <PickChallenge game={game} members={g.members.length} command={canCommand(rank)} leader={g.people[guild.owner]?.name ?? 'tu líder'} level={lvl.level} />}

      <Leaderboard id="lb-guild-h" title="Ranking del gremio" people={ranked} me={me} now={now} onOpen={setOpen}
        hint={g.members.length === 1 ? 'Invita a tus amigos al gremio para competir por la corona de la semana.' : undefined} />

      <Chronicle now={now} />

      {past.length > 0 && (
        <section className="panel" aria-labelledby="gpast-h">
          <header className="panel-head"><h3 id="gpast-h">Encargos pasados</h3></header>
          <div className="guild-past">{past.slice(0, 5).map((c) => <ChallengeCard key={c.id} game={game} c={c} now={now} />)}</div>
        </section>
      )}

      <Members game={game} />
      <RuleCard />

      <section className="panel quiet">
        {leaving ? (
          <div className="row">
            <span>{g.members.length === 1 ? 'Eres el último: el gremio se disolverá. ¿Seguro?'
              : guild.owner === me ? `${g.people[successor(me, g.members)?.user_id ?? '']?.name ?? 'Otro miembro'} será el nuevo líder. ¿Seguro?` : '¿Seguro que quieres salir?'}</span>
            <button className="ghost small danger-text" disabled={busy} onClick={() => act(() => leaveGuild(game.state), 'Has salido del gremio')}>Sí, salir</button>
            <button className="link" onClick={() => setLeaving(false)}>Cancelar</button>
          </div>
        ) : <button className="link danger-text" onClick={() => setLeaving(true)}><Icon name="log-out" /> Salir del gremio</button>}
      </section>
      {open && <ProfileDialog game={game} p={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function GuildBody({ game }: { game: Game }) {
  const g = useGuild();
  const me = useCloud().userId;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    void refreshGuild(game.state);
    void refreshSocial(game.state);
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g.loaded) return <section className="panel"><p className="hint">Cargando tu gremio…</p></section>;
  return (
    <>
      {g.error && (
        <section className="panel">
          <p className="error-text" role="alert">{g.error}</p>
          <button className="ghost small" onClick={() => void refreshGuild(game.state)}><Icon name="rotate-ccw" /> Reintentar</button>
        </section>
      )}
      {g.guild ? <InGuild game={game} now={now} /> : <NoGuild game={game} />}
    </>
  );
}

export function Guilds({ game }: { game: Game }) {
  const userId = useCloud().userId;
  return (
    <div className="screen">
      <h1 className="screen-title">Gremios</h1>
      <RequireAccount feature="unirte a un gremio">
        {userId && <GuildBody game={game} />}
      </RequireAccount>
    </div>
  );
}
