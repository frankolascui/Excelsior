// Arena: bosses (retos con vida y plazo) y tienda de recompensas pagadas con monedas.
import { useEffect, useState, type FormEvent } from 'react';
import type { Game } from './screens';
import type { Boss, BossSource } from './types';
import {
  addBoss, BOSS_TEMPLATES, bossReward, bossStatus, deleteBoss, MAX_ACTIVE_BOSSES, activeBosses, SOURCE_LABEL, summonTemplate,
} from './bosses';
import { addReward, buyReward, coinBalance, coinsEarned, coinsSpent, deleteReward, refundPurchase } from './economy';
import { dayKey } from './game';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { ConfirmButton, useNow } from './ui';

const BOSS_ICONS = ['🐉', '🐍', '🐂', '🐺', '🦁', '👁️', '🌀', '🌪️', '🦂', '🦅', '🕷️', '💀'];
const REWARD_ICONS = ['🎁', '📺', '🎮', '🍔', '🍕', '🍻', '🏖️', '🎬', '📚', '🛍️', '☕', '😴', '🎧', '⚽'];

function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

export function CoinBadge({ amount }: { amount: number }) {
  return <span className={amount < 0 ? 'coins debt mono' : 'coins mono'}>🪙 {amount}</span>;
}

// Daño ya visto por boss: al volver a la Arena se anima lo que le hiciste mientras tanto.
const SEEN_KEY = 'excelsior:boss-seen';
function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveSeen(id: string, damage: number) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...loadSeen(), [id]: damage }));
  } catch {
    /* ignorado */
  }
}

function BossCard({ boss: b, st, onFlee }: { boss: Boss; st: ReturnType<typeof bossStatus>; onFlee: () => void }) {
  const [shown, setShown] = useState(() => Math.min(loadSeen()[b.id] ?? st.damage, st.damage));
  const [hit, setHit] = useState(0);
  useEffect(() => {
    if (st.damage <= shown) return;
    const dealt = st.damage - shown;
    const t = setTimeout(() => {
      setHit(dealt);
      setShown(st.damage);
      saveSeen(b.id, st.damage);
      sfx.hit();
    }, 450);
    return () => clearTimeout(t);
  }, [st.damage, shown, b.id]);
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(0), 1100);
    return () => clearTimeout(t);
  }, [hit]);
  const pct = (dmg: number) => Math.max(0, 1 - dmg / b.hp) * 100;
  return (
    <article className={hit ? 'boss hit' : 'boss'} aria-label={`${b.name}: ${Math.round(st.hpLeft)} de ${b.hp} de vida`}>
      <span className="boss-stage" aria-hidden="true">
        <span className="boss-icon">{b.icon}</span>
        <span className="boss-shadow" />
        {hit > 0 && <span className="dmg-float mono">−{Math.round(hit * 10) / 10}</span>}
        {hit > 0 && <span className="slash" />}
      </span>
      <div className="boss-body">
        <h4 className="boss-name">{b.name}</h4>
        <p className="muted small-text">{SOURCE_LABEL[b.source].hint} · quedan {timeLeft(st.msLeft)} · botín {b.reward} 🪙</p>
        <div className="hp-bar" role="progressbar" aria-label="Vida restante" aria-valuemin={0} aria-valuemax={b.hp} aria-valuenow={Math.round(st.hpLeft)}>
          <div className="hp-ghost" style={{ width: `${pct(hit ? shown - hit : shown)}%` }} />
          <div className="hp-fill" style={{ width: `${pct(shown)}%` }} />
        </div>
        <p className="mono small-text">{Math.round(st.hpLeft * 10) / 10} / {b.hp} HP · {SOURCE_LABEL[b.source].unit}</p>
      </div>
      <ConfirmButton label="Huir" confirmLabel="Sí, huir" onConfirm={onFlee} />
    </article>
  );
}

export function Arena({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const now = useNow(30_000);
  const balance = coinBalance(state, now);
  const earned = coinsEarned(state, now);
  const active = activeBosses(state, now);
  const canSummon = active.length < MAX_ACTIVE_BOSSES;
  const finished = state.bosses
    .map((b) => ({ b, st: bossStatus(state, b, now) }))
    .filter(({ st }) => !st.active)
    .sort((x, y) => y.b.deadline - x.b.deadline)
    .slice(0, 6);

  function summon(id: string) {
    act((s) => summonTemplate(s, id, Date.now()));
    sfx.summon();
  }

  function buy(rewardId: string) {
    const r = buyReward(state, rewardId, Date.now());
    if (!r.ok) return;
    act(() => r.state);
    const reward = state.rewards.find((x) => x.id === rewardId)!;
    sfx.purchase();
    confetti({ count: 90 });
    toast(`${reward.icon} ¡Disfrútalo! −${reward.cost} 🪙`, 'level');
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Arena</h1>

      <section className="panel treasury" aria-labelledby="treasury-h">
        <div>
          <p className="eyebrow" id="treasury-h">Tesoro</p>
          <p className="treasury-amount"><CoinBadge amount={balance} /> <span className="muted">monedas</span></p>
          <p className="muted small-text">
            {earned.fromXp} por XP (1 cada 5 XP) · {earned.fromBosses} por bosses · {earned.fromKingdoms} por reinos · −{coinsSpent(state)} gastadas
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="bosses-h" data-tour="bosses">
        <header className="panel-head">
          <h3 id="bosses-h">Bosses</h3>
          <span className="count mono">{active.length}/{MAX_ACTIVE_BOSSES} activos</span>
        </header>
        <p className="hint">Un boss es un reto con plazo. Le haces daño con lo que hagas desde que lo invocas; si cae a tiempo, te llevas su botín.</p>
        {active.length > 0 && (
          <div className="boss-list">
            {active.map((b) => {
              const st = bossStatus(state, b, now);
              return (
                <BossCard key={b.id} boss={b} st={st} onFlee={() => act((s) => deleteBoss(s, b.id))} />
              );
            })}
          </div>
        )}
        {canSummon ? (
          <>
            <h4 className="sub-h">Invocar</h4>
            <div className="boss-templates">
              {BOSS_TEMPLATES.filter((t) => !active.some((b) => b.name === t.name)).map((t) => (
                <article key={t.id} className="boss-template">
                  <span className="boss-icon small" aria-hidden="true">{t.icon}</span>
                  <h5>{t.name}</h5>
                  <p className="muted small-text">{t.lore}</p>
                  <p className="mono small-text">{t.hp} {SOURCE_LABEL[t.source].unit} · {t.days} días · {bossReward(t.source, t.hp)} 🪙</p>
                  <button className="secondary" onClick={() => summon(t.id)}>Invocar</button>
                </article>
              ))}
            </div>
            <CustomBossForm onCreate={(b) => { act((s) => addBoss(s, b, Date.now())); sfx.summon(); }} />
          </>
        ) : (
          <p className="muted">Ya tienes {MAX_ACTIVE_BOSSES} bosses activos. Derrota alguno antes de invocar más.</p>
        )}
        {finished.length > 0 && (
          <>
            <h4 className="sub-h">Últimos combates</h4>
            <ul className="list plain">
              {finished.map(({ b, st }) => (
                <li key={b.id} className="row-between">
                  <span>{b.icon} {b.name}</span>
                  <span className={st.defeated ? 'mono win' : 'mono muted'}>{st.defeated ? `Derrotado · +${b.reward} 🪙` : 'Escapó'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="shop-h" data-tour="shop">
        <header className="panel-head"><h3 id="shop-h">Tienda de recompensas</h3><CoinBadge amount={balance} /></header>
        <p className="hint">Date caprichos con lo que te has ganado. Pon tú los precios: si algo te cuesta poco, no lo valoras.</p>
        <div className="shop">
          {state.rewards.map((r) => {
            const missing = r.cost - balance;
            return (
              <article key={r.id} className={missing > 0 ? 'reward locked' : 'reward'}>
                <button className="icon-btn reward-del" onClick={() => act((s) => deleteReward(s, r.id))} aria-label={`Borrar ${r.name}`} title="Borrar">×</button>
                <span className="reward-icon" aria-hidden="true">{r.icon}</span>
                <span className="reward-name">{r.name}</span>
                <button className="primary" disabled={missing > 0} onClick={() => buy(r.id)} aria-label={`Canjear ${r.name} por ${r.cost} monedas`}>
                  🪙 {r.cost}
                </button>
                {missing > 0 && <span className="muted small-text">te faltan {missing}</span>}
              </article>
            );
          })}
        </div>
        <RewardForm onCreate={(r) => act((s) => addReward(s, r, Date.now()))} />
        {state.purchases.length > 0 && (
          <>
            <h4 className="sub-h">Canjes</h4>
            <ul className="list plain">
              {[...state.purchases].reverse().slice(0, 8).map((p) => (
                <li key={p.id} className="row-between">
                  <span>{p.icon} {p.name} <span className="muted small-text">{new Date(p.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></span>
                  <span className="mono">
                    −{p.cost} 🪙{' '}
                    {dayKey(p.at) === dayKey(now) && (
                      <button className="link" onClick={() => { act((s) => refundPurchase(s, p.id)); sfx.coin(); }}>Devolver</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function RewardForm({ onCreate }: { onCreate: (r: { name: string; icon: string; cost: number }) => void }) {
  const [form, setForm] = useState({ name: '', icon: '🎁', cost: '' });
  const valid = form.name.trim() && Number(form.cost) > 0;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onCreate({ name: form.name, icon: form.icon, cost: Number(form.cost) });
    setForm({ name: '', icon: '🎁', cost: '' });
  }
  return (
    <form className="reward-form" onSubmit={submit}>
      <select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} aria-label="Icono" className="attr-select">
        {REWARD_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <input id="reward-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nueva recompensa (ej. Ir al cine)" maxLength={50} aria-label="Nombre de la recompensa" />
      <input id="reward-cost" type="number" min={1} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Precio" aria-label="Precio en monedas" />
      <button type="submit" className="primary" disabled={!valid}>Añadir</button>
    </form>
  );
}

const SOURCES: BossSource[] = ['xp', 'deepwork', 'habits', 'voluntad', 'sabiduria', 'maestria', 'conexion', 'creacion'];

function CustomBossForm({ onCreate }: { onCreate: (b: { name: string; icon: string; source: BossSource; hp: number; days: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', icon: '🦂', source: 'xp' as BossSource, hp: '500', days: '7' });
  const hp = Number(form.hp);
  const days = Number(form.days);
  const valid = form.name.trim() && hp > 0 && days >= 1 && days <= 90;
  if (!open) return <button className="ghost" onClick={() => setOpen(true)}>+ Crear un boss propio</button>;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onCreate({ name: form.name, icon: form.icon, source: form.source, hp, days });
    setOpen(false);
    setForm({ ...form, name: '' });
  }
  return (
    <form className="boss-form" onSubmit={submit}>
      <select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} aria-label="Icono del boss" className="attr-select">
        {BOSS_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <input id="boss-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. El Examen de Física)" maxLength={50} aria-label="Nombre del boss" />
      <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as BossSource })} aria-label="Qué le hace daño" className="attr-select">
        {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s].name}</option>)}
      </select>
      <input id="boss-hp" type="number" min={1} value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} aria-label="Vida" title="Vida" />
      <input id="boss-days" type="number" min={1} max={90} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} aria-label="Días de plazo" title="Días" />
      <span className="muted small-text">Vida en {SOURCE_LABEL[form.source].unit} · botín {valid ? bossReward(form.source, hp) : 0} 🪙</span>
      <span className="boss-form-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="primary" disabled={!valid}>Invocar</button>
      </span>
    </form>
  );
}
