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
  declineInvite, EMBLEMS, GUILD_MAX, guildLevel, guildXpFrom, invite, kick, leaveGuild, memberShare, METRIC_LABEL, refreshGuild,
  byRank, canCommand, canKick, demote, makeLeader, OFFICER_MAX, promote, RANK_LABEL, rankOf, successor, type Rank,
  startChallenge, useGuild, type ChallengeRow, type ChallengeTemplate, type Contribution, type Goal, type Metric,
} from './guilds';

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
    void act(() => createGuild(form, game.state), `${form.emblem} ${form.name.trim()} ha sido fundado`);
  }
  return (
    <>
      {invites.length > 0 && (
        <section className="panel glow-panel" aria-labelledby="ginv-h">
          <header className="panel-head"><h3 id="ginv-h">Te han invitado</h3><span className="count mono">{invites.length}</span></header>
          <ul className="list">
            {invites.map((i) => (
              <li key={i.guild_id} className="item guild-invite">
                <span className="guild-emblem small" aria-hidden="true">{i.guild?.emblem ?? '🛡️'}</span>
                <span className="item-body">
                  <span className="item-title">{i.guild?.name ?? 'Gremio'}</span>
                  <span className="muted small-text">{i.guild?.motto ? `«${i.guild.motto}» · ` : ''}te invita {i.from?.name ?? 'un amigo'}</span>
                </span>
                <span className="item-actions">
                  <button className="primary small" disabled={busy} onClick={() => act(() => acceptInvite(i.guild_id, game.state), `Bienvenido a ${i.guild?.name ?? 'tu gremio'}`)}>Unirme</button>
                  <button className="ghost small" disabled={busy} onClick={() => act(() => declineInvite(i.guild_id, game.state))}>Rechazar</button>
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
              <button key={e} type="button" role="radio" aria-checked={form.emblem === e} className={form.emblem === e ? 'emblem-opt on' : 'emblem-opt'} onClick={() => setForm({ ...form, emblem: e })}>{e}</button>
            ))}
          </div>
          <input id="guild-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del gremio" maxLength={32} aria-label="Nombre del gremio" />
          <input id="guild-motto" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder="Lema (opcional)" maxLength={80} aria-label="Lema" />
          <button className="primary" disabled={busy || form.name.trim().length < 2}>Fundar gremio</button>
        </form>
      </section>
      <RuleCard />
    </>
  );
}

function RuleCard() {
  return (
    <section className="panel quiet rule-card">
      <h3>⚖️ La regla del 30 %</h3>
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
  function claim() {
    game.act((s) => claimReward(s, c, Date.now()));
    sfx.purchase();
    confetti({ count: 140 });
    game.toast(`+${t?.reward ?? 0} XP para ti · Conexión y Voluntad`, 'level');
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
        <span className="ch-icon" aria-hidden="true">{t?.icon ?? '⚔️'}</span>
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
          <strong>🏆 ¡Encargo cumplido!</strong>
          {canClaim ? <button className="primary small" onClick={claim}>Cobrar +{t?.reward} XP</button>
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
                      <span className="mono small-text">{fmt(s.metric, s.counted)}{s.capped && ' 🔒'}</span>
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

function PickChallenge({ game, members, command, leader }: { game: Game; members: number; command: boolean; leader: string }) {
  const [busy, act] = useAct(game);
  const card = (t: ChallengeTemplate) => (
    <li key={t.id} className={`pick-card ${t.kind}`}>
      <span className="pick-icon" aria-hidden="true">{t.icon}</span>
      <strong>{t.name}</strong>
      <span className="muted small-text">{t.lore}</span>
      <span className="mono small-text">{goalLine(buildGoal(t, members))} · {t.days} días</span>
      <span className="small-text">+{t.reward} XP cada uno · +{t.guildXp} XP de gremio</span>
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
      {!command && <p className="hint rank-note">👑 Solo el líder y los colíderes aceptan encargos. Dile a {leader} cuál os apetece.</p>}
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
                  <span className="item-title">{name}{m.user_id === me && ' (tú)'} <span className={`rank-tag ${rank}`}>{RANK_LABEL[rank].icon} {RANK_LABEL[rank].name}</span></span>
                  <span className="muted small-text">{p ? `Nv ${p.level} · ${p.avatar_name}` : ''}</span>
                </span>
              </span>
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
                        <button className="ghost small" disabled={busy} onClick={() => act(() => promote(m.user_id, game.state), `${name} es colíder`)}>Hacer colíder</button>
                      )}
                      {isLeader && rank === 'officer' && (
                        <button className="ghost small" disabled={busy} onClick={() => act(() => demote(m.user_id, game.state))}>Quitar colíder</button>
                      )}
                      {isLeader && <button className="link" onClick={() => setConfirm(`lead:${m.user_id}`)}>Ceder liderazgo</button>}
                      {canKick(myRankNow, rank) && <button className="link danger-text" onClick={() => setConfirm(`kick:${m.user_id}`)}>Expulsar</button>}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint">👑 El líder nombra hasta {OFFICER_MAX} colíderes. Líder y colíderes aceptan encargos e invitan; todos aportan.</p>
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
                    ? <button className="ghost small" disabled={busy} onClick={() => act(() => cancelInvite(p.user_id, game.state))}>Invitado · cancelar</button>
                    : <button className="primary small" disabled={busy} onClick={() => act(() => invite(p.user_id, game.state), `Invitación enviada a ${p.name}`)}>Invitar</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
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
      <section className="panel guild-card">
        <span className="guild-emblem" aria-hidden="true">{guild.emblem}</span>
        <div className="guild-info">
          <h2>{guild.name}</h2>
          {guild.motto && <p className="guild-motto">«{guild.motto}»</p>}
          <p className="muted small-text">Nivel de gremio <strong className="mono">{lvl.level}</strong> · {gxp} XP de gremio · {wins} {wins === 1 ? 'encargo cumplido' : 'encargos cumplidos'} · {g.members.length}/{GUILD_MAX} miembros</p>
          <span className="g-bar level" aria-hidden="true"><span className="g-fill" style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></span>
        </div>
      </section>

      {active ? <ChallengeCard game={game} c={active} now={now} /> : <PickChallenge game={game} members={g.members.length} command={canCommand(rank)} leader={g.people[guild.owner]?.name ?? 'tu líder'} />}

      <Leaderboard id="lb-guild-h" title="Ranking del gremio" people={ranked} me={me} now={now} onOpen={setOpen}
        hint={g.members.length === 1 ? 'Invita a tus amigos al gremio para competir por la corona de la semana.' : undefined} />

      {past.length > 0 && (
        <section className="panel" aria-labelledby="gpast-h">
          <header className="panel-head"><h3 id="gpast-h">Crónica del gremio</h3></header>
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
        ) : <button className="link danger-text" onClick={() => setLeaving(true)}>Salir del gremio</button>}
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
          <button className="ghost small" onClick={() => void refreshGuild(game.state)}>Reintentar</button>
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
