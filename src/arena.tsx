// Arena: bosses (retos con vida y plazo) por sagas y niveles, y tienda de recompensas pagadas con monedas.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import type { Boss, BossSource, GameState, Reward } from './types';
import {
  activeBosses, addBoss, BOSS_TEMPLATES, bossLock, bossPhase, bossReward, bossStatus, deleteBoss, MAX_ACTIVE_BOSSES, nextInSaga,
  SAGAS, sagaOf, SOURCE_LABEL, summonBoss, templateOf, TIERS, timesDefeated, isActiveTemplate, type BossTemplate, type BossTier,
} from './bosses';
import {
  addReward, buyReward, coinBalance, coinsEarned, coinsSpent, COIN_RULES, deleteReward, nextReward, purchaseCounts, refundPurchase, consumePurchase, unusedPurchases,
  REWARD_CATEGORIES, REWARD_ICONS, rewardCategory, updateReward, type RewardCategory,
} from './economy';
import { dayKey, levelInfo, totalXp } from './game';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { ConfirmButton, useNow } from './ui';
import { BossArt, PixelBoss, TIER_COLOR } from './boss-art';
import './arena.css';

const BOSS_ICONS = ['🐉', '🐍', '🐂', '🐺', '🦁', '👁️', '🌀', '🌪️', '🦂', '🦅', '🕷️', '💀', '👹', '🧟', '🦈', '🐙'];

function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function CoinBadge({ amount }: { amount: number }) {
  return <span className={amount < 0 ? 'coins debt mono' : 'coins mono'}>🪙 {amount}</span>;
}

// ---------- Memoria local de la Arena (por navegador): daño ya visto, intros y victorias ya celebradas ----------

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) ?? fallback);
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignorado */
  }
}

// Daño ya visto por boss: al volver a la Arena se anima lo que le hiciste mientras tanto.
const SEEN_KEY = 'excelsior:boss-seen';
const loadSeen = () => loadJson<Record<string, number>>(SEEN_KEY, {});
const saveSeen = (id: string, damage: number) => saveJson(SEEN_KEY, { ...loadSeen(), [id]: damage });

const INTRO_KEY = 'excelsior:boss-intro';
const CELEBRATED_KEY = 'excelsior:boss-celebrated';
const remember = (key: string, id: string) => saveJson(key, [...loadJson<string[]>(key, []), id].slice(-60));

/** Victorias aún sin celebrar en la Arena. La primera vez se dan por celebradas las que ya había (partidas antiguas). */
function uncelebrated(s: GameState, now: number): Boss[] {
  const defeated = s.bosses.filter((b) => bossStatus(s, b, now).defeated);
  const known = loadJson<string[] | null>(CELEBRATED_KEY, null);
  if (known === null) {
    saveJson(CELEBRATED_KEY, defeated.map((b) => b.id));
    return [];
  }
  return defeated.filter((b) => !known.includes(b.id));
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Piezas ----------

export function TierBadge({ tier }: { tier: BossTier }) {
  return (
    <span className={`tier-badge tier-${tier}`} style={{ ['--tier' as string]: TIER_COLOR[tier] }}>
      <span aria-hidden="true">{'◆'.repeat(tier)}</span> {TIERS[tier].name}
    </span>
  );
}

function HpBar({ hp, shown, ghost }: { hp: number; shown: number; ghost: number }) {
  const pct = (dmg: number) => Math.max(0, 1 - dmg / hp) * 100;
  const left = Math.max(0, hp - shown);
  return (
    <div className="hp-bar big" role="progressbar" aria-label="Vida restante" aria-valuemin={0} aria-valuemax={hp} aria-valuenow={Math.round(left)}>
      <div className="hp-ghost" style={{ width: `${pct(ghost)}%` }} />
      <div className="hp-fill" style={{ width: `${pct(shown)}%` }} />
      <span className="hp-notch" style={{ left: '50%' }} />
      <span className="hp-notch" style={{ left: '25%' }} />
    </div>
  );
}

const PHASE_LABEL = { calma: null, herido: 'Herido', furioso: '¡Furioso!' } as const;

function BossCard({ boss: b, st, onFlee }: { boss: Boss; st: ReturnType<typeof bossStatus>; onFlee: () => void }) {
  const t = templateOf(b);
  const [shown, setShown] = useState(() => Math.min(loadSeen()[b.id] ?? st.damage, st.damage));
  const [hit, setHit] = useState(0);
  useEffect(() => {
    if (st.damage <= shown) return;
    const dealt = st.damage - shown;
    const timer = setTimeout(() => {
      setHit(dealt);
      setShown(st.damage);
      saveSeen(b.id, st.damage);
      sfx.hit();
    }, 450);
    return () => clearTimeout(timer);
  }, [st.damage, shown, b.id]);
  useEffect(() => {
    if (!hit) return;
    const timer = setTimeout(() => setHit(0), 1100);
    return () => clearTimeout(timer);
  }, [hit]);
  const phase = bossPhase(b.hp - shown, b.hp);
  const phaseLabel = PHASE_LABEL[phase];
  const urgent = st.msLeft < 86_400_000;
  const since = new Date(b.createdAt).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return (
    <article
      className={`boss boss-fight phase-${phase}${hit ? ' hit' : ''}`}
      style={t ? { ['--tier' as string]: TIER_COLOR[t.tier] } : undefined}
      aria-label={`${b.name}: ${Math.round(st.hpLeft)} de ${b.hp} de vida`}
    >
      <div className="boss-actions">
        <ConfirmButton label="Huir" confirmLabel="Sí, huir" onConfirm={onFlee} />
      </div>
      <header className="fight-head">
        <span className="fight-eyebrow mono">— Boss</span>
        <h4 className="boss-name">{b.name}</h4>
        <span className="fight-since mono">desde {since}</span>
      </header>
      <div className="fight-hp">
        <span className="fight-hp-label mono">HP</span>
        <HpBar hp={b.hp} shown={shown} ghost={hit ? shown - hit : shown} />
        <span className="mono boss-hp">{fmtNum(st.hpLeft)} / {b.hp}</span>
      </div>
      <span className="boss-stage" aria-hidden="true">
        <span className="fight-aura" />
        <PixelBoss templateId={t?.id} icon={b.icon} phase={phase} scale={3} className="boss-art" />
        <span className="boss-shadow" />
        {hit > 0 && <span className="dmg-float mono">−{fmtNum(hit)}</span>}
        {hit > 0 && <span className="slash" />}
      </span>
      <div className="boss-body">
        <div className="boss-tags">
          {t ? <TierBadge tier={t.tier} /> : <span className="tier-badge custom">Boss propio</span>}
          {t && <span className="saga-tag">{sagaOf(t).name}</span>}
          {phaseLabel && <span className={`phase-tag ${phase}`}>{phaseLabel}</span>}
        </div>
        {t && <p className="boss-lore">«{t.lore}»</p>}
        <p className="boss-meta">
          <span>⚔️ {SOURCE_LABEL[b.source].hint}</span>
          <span className={urgent ? 'urgent' : ''}>⏳ quedan {timeLeft(st.msLeft)}</span>
          <span className="loot">🪙 botín {b.reward}</span>
        </p>
      </div>
    </article>
  );
}

function TemplateCard({ t, state, now, full, onSummon }: { t: BossTemplate; state: GameState; now: number; full: boolean; onSummon: () => void }) {
  const lock = bossLock(state, t.id, now);
  const fighting = !lock && isActiveTemplate(state, t.id, now);
  const wins = timesDefeated(state, t.id, now);
  const cls = ['boss-template', lock ? 'locked' : fighting ? 'fighting' : 'ready', wins ? 'beaten' : ''].filter(Boolean).join(' ');
  return (
    <article className={cls} style={{ ['--tier' as string]: TIER_COLOR[t.tier] }} aria-label={lock ? `${t.name}: bloqueado, ${lock.label}` : t.name}>
      <div className="tpl-art">
        <BossArt templateId={t.id} icon={t.icon} tier={t.tier} size={64} silhouette={!!lock} full />
        {lock && <span className="tpl-lock" aria-hidden="true">🔒</span>}
        {wins > 0 && <span className="tpl-wins mono" title={`Derrotado ${wins} ${wins === 1 ? 'vez' : 'veces'}`}>✓{wins > 1 ? ` ×${wins}` : ''}</span>}
      </div>
      <div className="tpl-body">
        <TierBadge tier={t.tier} />
        <h5>{t.name}</h5>
        {lock ? (
          <p className="lock-reason"><span aria-hidden="true">🔒</span> {lock.label}</p>
        ) : (
          <p className="muted small-text tpl-lore">{t.lore}</p>
        )}
        <p className="mono small-text tpl-stats">
          {t.hp} {SOURCE_LABEL[t.source].unit} · {t.days} días · <span className="loot">{t.reward} 🪙</span>
        </p>
        {!lock && (fighting ? (
          <span className="tpl-state">⚔️ En combate</span>
        ) : (
          <button className="primary summon-btn" onClick={onSummon} disabled={full} title={full ? `Máximo ${MAX_ACTIVE_BOSSES} a la vez` : undefined}>
            {wins ? 'Invocar de nuevo' : 'Invocar'}
          </button>
        ))}
      </div>
    </article>
  );
}

/** Pantalla completa para la invocación y la victoria. Escape o el botón la cierran; se cierra sola al rato. */
function Overlay({ className, label, onClose, autoMs, children }: { className: string; label: string; onClose: () => void; autoMs: number; children: ReactNode }) {
  const btn = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    btn.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    const timer = setTimeout(() => close.current(), autoMs);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [autoMs]);
  return (
    <div className={`arena-overlay ${className}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="arena-overlay-card" ref={btn}>{children}</div>
    </div>
  );
}

function SummonIntro({ boss, onClose }: { boss: Boss; onClose: () => void }) {
  const t = templateOf(boss);
  const days = Math.round((boss.deadline - boss.createdAt) / 86_400_000);
  return (
    <Overlay className="summon-intro" label={`Invocación: ${boss.name}`} onClose={onClose} autoMs={9000}>
      <div className="intro-rays" aria-hidden="true" style={t ? { ['--tier' as string]: TIER_COLOR[t.tier] } : undefined} />
      <p className="eyebrow intro-eyebrow">{t ? `${sagaOf(t).name} · Rango ${TIERS[t.tier].roman}` : 'Boss propio'}</p>
      <div className="intro-art">
        <PixelBoss templateId={t?.id} icon={boss.icon} scale={3} className="boss-art" />
      </div>
      <p className="intro-cry">¡Ha aparecido!</p>
      <h2 className="intro-name">{boss.name}</h2>
      {t && <p className="intro-lore">«{t.lore}»</p>}
      <p className="intro-stats mono">
        <span>❤️ {boss.hp} {SOURCE_LABEL[boss.source].unit}</span>
        <span>⏳ {days} {days === 1 ? 'día' : 'días'}</span>
        <span className="loot">🪙 {boss.reward}</span>
      </p>
      <p className="muted small-text">{SOURCE_LABEL[boss.source].hint[0].toUpperCase() + SOURCE_LABEL[boss.source].hint.slice(1)}.</p>
      <button className="primary big" onClick={onClose}>¡Al combate!</button>
    </Overlay>
  );
}

function VictoryOverlay({ boss, state, now, onClose }: { boss: Boss; state: GameState; now: number; onClose: () => void }) {
  const t = templateOf(boss);
  const next = t ? nextInSaga(t.id) : [];
  return (
    <Overlay className="victory" label={`Victoria sobre ${boss.name}`} onClose={onClose} autoMs={12000}>
      <div className="intro-rays gold" aria-hidden="true" />
      <p className="eyebrow intro-eyebrow">{t ? sagaOf(t).name : 'Boss propio'}</p>
      <div className="intro-art fallen">
        <PixelBoss templateId={t?.id} icon={boss.icon} phase="furioso" scale={2.4} className="boss-art is-defeated" />
      </div>
      <p className="victory-title">¡Victoria!</p>
      <h2 className="intro-name">Has derrotado a {t ? t.short : boss.name}</h2>
      <p className="victory-loot mono" aria-label={`Botín: ${boss.reward} monedas`}>+{boss.reward} <span aria-hidden="true">🪙</span></p>
      {next.map((n) => {
        const lock = bossLock(state, n.id, now);
        return (
          <p key={n.id} className={lock ? 'victory-next muted' : 'victory-next'}>
            {lock ? <>Siguiente en la saga: <strong>{n.name}</strong> · {lock.label}</> : <>🔓 Nuevo boss desbloqueado: <strong>{n.name}</strong></>}
          </p>
        );
      })}
      {t && next.length === 0 && <p className="victory-next">👑 Has completado la {sagaOf(t).name}.</p>}
      <button className="primary big" onClick={onClose}>Reclamar botín</button>
    </Overlay>
  );
}

// ---------- Pantalla ----------

export function Arena({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const now = useNow(30_000);
  const balance = coinBalance(state, now);
  const earned = coinsEarned(state, now);
  const active = activeBosses(state, now);
  const full = active.length >= MAX_ACTIVE_BOSSES;
  const level = levelInfo(totalXp(state)).level;
  const unlockedCount = BOSS_TEMPLATES.filter((t) => !bossLock(state, t.id, now)).length;
  const beatenCount = BOSS_TEMPLATES.filter((t) => timesDefeated(state, t.id, now) > 0).length;
  const finished = state.bosses
    .map((b) => ({ b, st: bossStatus(state, b, now) }))
    .filter(({ st }) => !st.active)
    .sort((x, y) => y.b.deadline - x.b.deadline)
    .slice(0, 6);

  // Invocación: al invocar aquí o al llegar con un boss recién invocado (p. ej. el reto de la crónica).
  const [introId, setIntroId] = useState<string | null>(() => {
    const seen = loadJson<string[]>(INTRO_KEY, []);
    const fresh = state.bosses.find((b) => Date.now() - b.createdAt < 15_000 && !seen.includes(b.id));
    if (fresh) remember(INTRO_KEY, fresh.id);
    return fresh?.id ?? null;
  });
  const introBoss = state.bosses.find((b) => b.id === introId) ?? null;

  // Victoria: la primera derrota aún sin celebrar en la Arena.
  const [victoryId, setVictoryId] = useState<string | null>(null);
  useEffect(() => {
    if (victoryId || introId) return;
    const pending = uncelebrated(state, Date.now())[0];
    if (!pending) return;
    remember(CELEBRATED_KEY, pending.id);
    setVictoryId(pending.id);
    setTimeout(() => sfx.victory(), 250);
    confetti({ big: true, count: 220 });
  }, [state, victoryId, introId]);
  const victoryBoss = state.bosses.find((b) => b.id === victoryId) ?? null;

  function showIntro(id: string) {
    remember(INTRO_KEY, id);
    setIntroId(id);
    sfx.summon();
    if (!reducedMotion()) setTimeout(() => sfx.hit(), 520);
  }

  function summon(templateId: string) {
    const r = summonBoss(state, templateId, Date.now());
    if (!r.ok) {
      if (r.reason) toast(r.reason, 'info');
      return;
    }
    act(() => r.state);
    showIntro(r.state.bosses.at(-1)!.id);
  }

  function summonCustom(b: { name: string; icon: string; source: BossSource; hp: number; days: number }) {
    const next = addBoss(state, b, Date.now());
    act(() => next);
    showIntro(next.bosses.at(-1)!.id);
  }

  return (
    <div className="screen arena">
      <h1 className="screen-title">Arena</h1>

      <section className="panel treasury" aria-labelledby="treasury-h">
        <div>
          <p className="eyebrow" id="treasury-h">Tesoro</p>
          <p className="treasury-amount"><CoinBadge amount={balance} /> <span className="muted">monedas</span></p>
          <p className="muted small-text">
            {earned.fromXp} por XP (1 cada {COIN_RULES.xpPerCoin} XP) · {earned.fromBosses} por bosses · {earned.fromKingdoms} por reinos · −{coinsSpent(state)} gastadas
          </p>
        </div>
      </section>

      <section className="panel bosses-panel" aria-labelledby="bosses-h" data-tour="bosses">
        <header className="panel-head">
          <h3 id="bosses-h">Bosses</h3>
          <span className="count mono">{active.length}/{MAX_ACTIVE_BOSSES} activos</span>
        </header>
        <p className="hint">Un boss es un reto con plazo: le haces daño con lo que hagas desde que lo invocas y, si cae a tiempo, te llevas su botín. Subir de nivel y vencer a cada bestia abre las siguientes de su saga.</p>
        <div className="arena-progress">
          <span><b className="mono">Nv {level}</b> nivel global</span>
          <span><b className="mono">{unlockedCount}/{BOSS_TEMPLATES.length}</b> bosses desbloqueados</span>
          <span><b className="mono">{beatenCount}/{BOSS_TEMPLATES.length}</b> vencidos</span>
        </div>
        {active.length > 0 && (
          <div className="boss-list">
            {active.map((b) => (
              <BossCard key={b.id} boss={b} st={bossStatus(state, b, now)} onFlee={() => act((s) => deleteBoss(s, b.id))} />
            ))}
          </div>
        )}

        <h4 className="sub-h">Sagas</h4>
        {full && <p className="muted small-text full-note">Ya tienes {MAX_ACTIVE_BOSSES} bosses activos. Derrota alguno antes de invocar más.</p>}
        <div className="sagas">
          {SAGAS.map((saga) => {
            const list = BOSS_TEMPLATES.filter((t) => t.saga === saga.id);
            const won = list.filter((t) => timesDefeated(state, t.id, now) > 0).length;
            return (
              <section key={saga.id} className={won === list.length ? 'saga done' : 'saga'} aria-label={saga.name}>
                <header className="saga-head">
                  <h5>{saga.name}</h5>
                  <span className="mono saga-count">{won}/{list.length}{won === list.length ? ' 👑' : ''}</span>
                  <p className="muted small-text">{saga.blurb}</p>
                </header>
                <ol className="saga-chain">
                  {list.map((t) => (
                    <li key={t.id}>
                      <TemplateCard t={t} state={state} now={now} full={full} onSummon={() => summon(t.id)} />
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
        {!full && <CustomBossForm onCreate={summonCustom} />}

        {finished.length > 0 && (
          <>
            <h4 className="sub-h">Últimos combates</h4>
            <ul className="list plain combats">
              {finished.map(({ b, st }) => {
                const t = templateOf(b);
                return (
                  <li key={b.id} className={st.defeated ? 'combat win-row' : 'combat'}>
                    <BossArt templateId={t?.id} icon={b.icon} tier={t?.tier} size={34} defeated={st.defeated} />
                    <span className="combat-name">{b.name}</span>
                    <span className={st.defeated ? 'mono win' : 'mono muted'}>{st.defeated ? `Derrotado · +${b.reward} 🪙` : 'Escapó'}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <Shop game={game} balance={balance} now={now} />

      {introBoss && <SummonIntro boss={introBoss} onClose={() => setIntroId(null)} />}
      {!introBoss && victoryBoss && <VictoryOverlay boss={victoryBoss} state={state} now={now} onClose={() => { setVictoryId(null); sfx.coin(); }} />}
    </div>
  );
}

// ---------- Tienda ----------

function Shop({ game, balance, now }: { game: Game; balance: number; now: number }) {
  const { state, act, toast } = game;
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const counts = purchaseCounts(state);
  const next = nextReward(state, now);
  const history = [...state.purchases].reverse();

  function buy(rewardId: string) {
    const r = buyReward(state, rewardId, Date.now());
    if (!r.ok) return;
    act(() => r.state);
    const reward = state.rewards.find((x) => x.id === rewardId)!;
    sfx.purchase();
    confetti({ count: 90 });
    toast(`${reward.icon} ${reward.name} guardado en tu cofre. −${reward.cost} 🪙`, 'level');
  }

  const [cat, setCat] = useState<RewardCategory | 'todo'>('todo');
  const order = (r: Reward) => REWARD_CATEGORIES.findIndex((c) => c.id === rewardCategory(r));
  const cats = REWARD_CATEGORIES.filter((c) => state.rewards.some((r) => rewardCategory(r) === c.id));
  const shown = state.rewards
    .filter((r) => cat === 'todo' || rewardCategory(r) === cat)
    .sort((a, b) => order(a) - order(b) || a.cost - b.cost);

  return (
    <section className="panel shop-panel" aria-labelledby="shop-h" data-tour="shop">
      <header className="panel-head"><h3 id="shop-h">Tienda de recompensas</h3><CoinBadge amount={balance} /></header>
      <p className="hint">Date caprichos con lo que te has ganado. Pon tú los precios: si algo te cuesta poco, no lo valoras.</p>

      <Chest game={game} />

      {state.rewards.length > 0 && (next ? (
        <div className="shop-next">
          <span className="shop-next-icon" aria-hidden="true">{next.reward.icon}</span>
          <div className="shop-next-body">
            <p>Tu próximo premio: <strong>{next.reward.name}</strong></p>
            <div className="afford-bar" aria-hidden="true"><div style={{ width: `${Math.max(0, Math.min(100, (balance / next.reward.cost) * 100))}%` }} /></div>
            <p className="muted small-text">Te faltan <b className="mono">{next.missing} 🪙</b> · unos {next.xp} XP más</p>
          </div>
        </div>
      ) : (
        <div className="shop-next ready">
          <span className="shop-next-icon" aria-hidden="true">✨</span>
          <p>Puedes permitirte cualquier premio de la tienda. Te lo has ganado.</p>
        </div>
      ))}

      {cats.length > 1 && (
        <div className="shop-filter" role="group" aria-label="Categorías">
          <button className={cat === 'todo' ? 'chip-btn on' : 'chip-btn'} aria-pressed={cat === 'todo'} onClick={() => setCat('todo')}>Todo</button>
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'chip-btn on' : 'chip-btn'} aria-pressed={cat === c.id} onClick={() => setCat(c.id)} title={c.hint}>
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="shop">
        {shown.map((r) => editing === r.id ? (
          <RewardEditor key={r.id} reward={r}
            onSave={(patch) => { act((s) => updateReward(s, r.id, patch)); setEditing(null); }}
            onDelete={() => { act((s) => deleteReward(s, r.id)); setEditing(null); }}
            onCancel={() => setEditing(null)} />
        ) : (
          <RewardCard key={r.id} reward={r} balance={balance} count={counts[r.id] ?? 0} onBuy={() => buy(r.id)} onEdit={() => setEditing(r.id)} />
        ))}
      </div>

      <RewardForm onCreate={(r) => { act((s) => addReward(s, r, Date.now())); sfx.coin(); }} />

      {history.length > 0 && (
        <>
          <h4 className="sub-h">Historial de canjes</h4>
          <p className="muted small-text">{history.length} {history.length === 1 ? 'premio canjeado' : 'premios canjeados'} · {coinsSpent(state)} 🪙 en total</p>
          <ul className="list plain purchases">
            {history.slice(0, showAll ? 50 : 6).map((p) => (
              <li key={p.id} className="purchase">
                <span className="purchase-icon" aria-hidden="true">{p.icon}</span>
                <span className="purchase-body">
                  <span className="purchase-name">{p.name}</span>
                  <span className="muted small-text">
                    Canjeado el {fmtWhen(p.at)}
                    {p.usedAt === null ? ' · 🎁 en el cofre' : p.usedAt ? ` · usado el ${fmtWhen(p.usedAt)}` : ''}
                  </span>
                </span>
                <span className="mono purchase-cost">
                  −{p.cost} 🪙
                  {dayKey(p.at) === dayKey(now) && !p.usedAt && (
                    <button className="link" onClick={() => { act((s) => refundPurchase(s, p.id)); sfx.coin(); }}>Devolver</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {history.length > 6 && (
            <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `Ver los ${history.length}`}</button>
          )}
        </>
      )}
    </section>
  );
}

const fmtWhen = (t: number) =>
  `${new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

/** El cofre: premios canjeados que aún no has usado. Usarlo es el momento de disfrutarlo. */
function Chest({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const items = unusedPurchases(state);
  if (items.length === 0) return null;
  const groups = new Map<string, typeof items>();
  for (const p of items) groups.set(p.rewardId + p.name, [...(groups.get(p.rewardId + p.name) ?? []), p]);
  function use(id: string) {
    const p = items.find((x) => x.id === id)!;
    act((s) => consumePurchase(s, id, Date.now()));
    sfx.purchase();
    confetti({ count: 120 });
    toast(`${p.icon} ¡A disfrutar de ${p.name}! Te lo has ganado.`, 'level');
  }
  return (
    <div className="chest" aria-labelledby="chest-h">
      <h4 id="chest-h" className="sub-h">🎁 Tu cofre <span className="count mono">{items.length}</span></h4>
      <p className="muted small-text">Lo que has canjeado y aún no has usado. Úsalo cuando vayas a disfrutarlo.</p>
      <ul className="chest-items">
        {[...groups.values()].map((g) => (
          <li key={g[0].id} className="chest-item">
            <span className="chest-icon" aria-hidden="true">{g[0].icon}</span>
            <span className="chest-name">{g[0].name}{g.length > 1 && <b className="mono"> ×{g.length}</b>}</span>
            <button className="primary small" onClick={() => use(g[0].id)}>Usar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RewardCard({ reward: r, balance, count, onBuy, onEdit }: { reward: Reward; balance: number; count: number; onBuy: () => void; onEdit: () => void }) {
  const missing = r.cost - balance;
  const pct = Math.max(0, Math.min(100, (balance / r.cost) * 100));
  const category = REWARD_CATEGORIES.find((c) => c.id === rewardCategory(r))!;
  return (
    <article className={missing > 0 ? 'reward locked' : 'reward affordable'}>
      <button className="icon-btn reward-edit" onClick={onEdit} aria-label={`Editar ${r.name}`} title="Editar">✎</button>
      {count > 0 && <span className="reward-count mono" title={`Canjeado ${count} ${count === 1 ? 'vez' : 'veces'}`}>×{count}</span>}
      <span className="reward-icon" aria-hidden="true">{r.icon}</span>
      <span className={`reward-cat cat-${category.id}`}>{category.icon} {category.name}</span>
      <span className="reward-name">{r.name}</span>
      <span className="reward-cost mono">🪙 {r.cost}</span>
      {missing > 0 ? (
        <>
          <div className="afford-bar small" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
          <span className="reward-missing small-text">te faltan {missing} 🪙</span>
        </>
      ) : (
        <span className="reward-ok small-text">Lo puedes pagar</span>
      )}
      <button className="primary reward-buy" disabled={missing > 0} onClick={onBuy} aria-label={`Canjear ${r.name} por ${r.cost} monedas`}>
        Canjear
      </button>
    </article>
  );
}

function IconPicker({ value, onChange, idPrefix }: { value: string; onChange: (v: string) => void; idPrefix: string }) {
  return (
    <div className="icon-picker" role="group" aria-label="Icono">
      {REWARD_ICONS.map((i) => (
        <button type="button" key={i} className={value === i ? 'icon-pick on' : 'icon-pick'} aria-pressed={value === i} onClick={() => onChange(i)}>{i}</button>
      ))}
      <label className="icon-own" htmlFor={`${idPrefix}-own`}>
        <span className="muted small-text">o el tuyo</span>
        <input id={`${idPrefix}-own`} value={REWARD_ICONS.includes(value) ? '' : value} onChange={(e) => onChange([...e.target.value].slice(0, 2).join(''))} placeholder="🙂" aria-label="Emoji propio" />
      </label>
    </div>
  );
}

function CategorySelect({ value, onChange, id }: { value: RewardCategory | ''; onChange: (v: RewardCategory | '') => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as RewardCategory | '')} aria-label="Categoría" className="attr-select">
      <option value="">Categoría: auto</option>
      {REWARD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
    </select>
  );
}

function RewardEditor({ reward, onSave, onDelete, onCancel }: {
  reward: Reward;
  onSave: (patch: { name: string; icon: string; cost: number; category?: RewardCategory }) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ name: reward.name, icon: reward.icon, cost: String(reward.cost), category: rewardCategory(reward) as RewardCategory | '' });
  const valid = form.name.trim() && Number(form.cost) > 0;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSave({ name: form.name, icon: form.icon || '🎁', cost: Number(form.cost), category: form.category || undefined });
  }
  return (
    <form className="reward reward-editing" onSubmit={submit} aria-label={`Editar ${reward.name}`}>
      <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} idPrefix={`edit-${reward.id}`} />
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={50} aria-label="Nombre de la recompensa" />
      <input type="number" min={1} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} aria-label="Precio en monedas" />
      <CategorySelect id={`cat-${reward.id}`} value={form.category} onChange={(category) => setForm({ ...form, category })} />
      <span className="reward-edit-actions">
        <ConfirmButton label="Borrar" confirmLabel="Sí, borrar" onConfirm={onDelete} />
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary" disabled={!valid}>Guardar</button>
      </span>
    </form>
  );
}

function RewardForm({ onCreate }: { onCreate: (r: { name: string; icon: string; cost: number; category?: RewardCategory }) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', icon: '🎁', cost: '', category: '' as RewardCategory | '' });
  const valid = form.name.trim() && Number(form.cost) > 0;
  const autoCat = REWARD_CATEGORIES.find((c) => c.id === rewardCategory({ name: form.name, cost: Number(form.cost) || 0 }))!;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onCreate({ name: form.name, icon: form.icon || '🎁', cost: Number(form.cost), category: form.category || undefined });
    setForm({ name: '', icon: '🎁', cost: '', category: '' });
  }
  if (!open) return <button className="ghost new-reward-btn" onClick={() => setOpen(true)}>+ Crear una recompensa propia</button>;
  return (
    <form className="reward-form" onSubmit={submit}>
      <p className="reward-form-title">
        <span className="reward-preview" aria-hidden="true">{form.icon || '🎁'}</span>
        <span><strong>{form.name.trim() || 'Nueva recompensa'}</strong><br /><span className="muted small-text">{Number(form.cost) > 0 ? `🪙 ${form.cost} · ` : ''}{form.category ? REWARD_CATEGORIES.find((c) => c.id === form.category)!.name : `${autoCat.name} (automática)`}</span></span>
      </p>
      <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} idPrefix="new-reward" />
      <div className="reward-form-row">
        <input id="reward-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. Ir al cine)" maxLength={50} aria-label="Nombre de la recompensa" />
        <input id="reward-cost" type="number" min={1} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Precio" aria-label="Precio en monedas" />
        <CategorySelect id="reward-cat" value={form.category} onChange={(category) => setForm({ ...form, category })} />
      </div>
      <p className="muted small-text">Referencia: 1 🪙 = {COIN_RULES.xpPerCoin} XP. Un episodio ~25, salir con amigos ~100, un día libre ~350.</p>
      <span className="boss-form-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cerrar</button>
        <button type="submit" className="primary" disabled={!valid}>Añadir a la tienda</button>
      </span>
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
  if (!open) return <button className="ghost custom-boss-btn" onClick={() => setOpen(true)}>+ Crear un boss propio</button>;
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
