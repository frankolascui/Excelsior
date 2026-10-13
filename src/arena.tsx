// Arena: bosses (retos con vida y plazo) por sagas y niveles, y tienda de recompensas pagadas con monedas.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import type { Boss, BossSource, GameState, Reward } from './types';
import {
  abilityText, bestStars, bossLoot, bossStars, combat, CRIT_RULES, STAR_BONUS, weaknessText, type BossAbility, type CombatEvent,
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
import { BossHpBar, EpicName } from './boss-ui';
import type { BarTheme } from './bar-art';
import { Glyph, Icon, tok, type IconName } from './icons';
import { avatarInfo } from './attributes';
import { AvatarPortrait, initialOf } from './portrait';
import './arena.css';

const BOSS_ICONS: IconName[] = ['dragon-head', 'snake', 'bull', 'wolf', 'lion', 'evil-eye', 'vortex', 'tornado', 'scorpion', 'eagle', 'spider', 'death-skull', 'ogre', 'zombie', 'shark', 'octopus'];

function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function CoinBadge({ amount }: { amount: number }) {
  return <span className={amount < 0 ? 'coins debt mono' : 'coins mono'}><Icon name="coin" className="coin-ico" /> {amount}</span>;
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

/** Fila de 3 estrellas, llenas las ganadas. */
export function Stars({ n, size = 'sm' }: { n: number; size?: 'sm' | 'lg' }) {
  return (
    <span className={`stars stars-${size}`} aria-label={`${n} de 3 estrellas`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'star on' : 'star'} aria-hidden="true">★</span>)}
    </span>
  );
}

const PHASE_LABEL = { calma: null, herido: 'Herido', furioso: '¡Furioso!' } as const;

const ABILITY_ICON: Record<BossAbility['kind'], IconName> = { regen: 'heart', armor: 'shield', cap: 'hourglass' };

/** Habilidad y punto débil de un boss de la escalera. El punto débil se revela al dejarlo a media vida. */
function BossTraits({ boss: b, revealed }: { boss: Boss; revealed: boolean }) {
  const t = templateOf(b);
  if (!t || b.rules !== 2) return null;
  return (
    <ul className="boss-traits">
      <li className="trait ability">
        <Icon name={ABILITY_ICON[t.ability.kind]} />
        <span><b>{t.ability.name}.</b> {abilityText(t.ability, b.source)}</span>
      </li>
      <li className={revealed ? 'trait weakness' : 'trait weakness hidden'}>
        <Icon name={revealed ? 'evil-eye' : 'lock'} />
        {revealed
          ? <span><b>Punto débil: {t.weakness.name}.</b> {weaknessText(t.weakness)}</span>
          : <span><b>Punto débil oculto.</b> Se revela cuando le dejes a media vida.</span>}
      </li>
    </ul>
  );
}

const EVENT_TEXT: Record<CombatEvent['kind'], string> = { hit: '', blocked: 'Rebota', capped: 'Tope del día', regen: 'Se regenera' };

/** Últimos golpes y curaciones del combate, el más reciente arriba. */
function CombatLog({ events }: { events: CombatEvent[] }) {
  const last = events.slice(-6).reverse();
  if (!last.length) return <p className="combat-log empty muted small-text">Aún no le has hecho nada. Tu próximo golpe aparecerá aquí.</p>;
  return (
    <ol className="combat-log" aria-label="Registro del combate">
      {last.map((e, i) => {
        const when = new Date(e.at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace(/\./g, '');
        return (
          <li key={`${e.at}-${i}`} className={`log-row ${e.kind}${e.crit ? ' crit' : ''}${e.weak ? ' weak' : ''}`}>
            <span className="log-when mono">{when}</span>
            <span className="log-what">
              {e.label}
              {e.crit && <span className="log-tag crit">¡Crítico!</span>}
              {e.weak && <span className="log-tag weak">Punto débil</span>}
              {EVENT_TEXT[e.kind] && <span className={`log-tag ${e.kind}`}>{EVENT_TEXT[e.kind]}</span>}
            </span>
            <span className="log-amount mono">{e.kind === 'regen' ? `+${fmtNum(e.amount)}` : e.amount > 0 ? `−${fmtNum(e.amount)}` : '0'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tu héroe en el combate: tu aro de avatar con tu foto o inicial, frente al boss. */
export interface Hero { tier: number; photo?: string; initial: string; name: string }

function BossCard({ boss: b, st, events, hero, onFlee }: { boss: Boss; st: ReturnType<typeof bossStatus>; events: CombatEvent[]; hero: Hero; onFlee: () => void }) {
  const t = templateOf(b);
  const [shown, setShown] = useState(() => Math.min(loadSeen()[b.id] ?? st.damage, st.damage));
  const [hit, setHit] = useState(0);
  const [crit, setCrit] = useState(false);
  useEffect(() => {
    if (st.damage === shown) return;
    if (st.damage < shown) {
      // Se ha regenerado mientras no estabas: la barra sube sin golpe.
      setShown(st.damage);
      saveSeen(b.id, st.damage);
      return;
    }
    const dealt = st.damage - shown;
    const lastHit = [...events].reverse().find((e) => e.kind !== 'regen' && e.amount > 0);
    const timer = setTimeout(() => {
      setHit(dealt);
      setCrit(!!lastHit?.crit);
      setShown(st.damage);
      saveSeen(b.id, st.damage);
      sfx.hit();
    }, 450);
    return () => clearTimeout(timer);
  }, [st.damage, shown, b.id, events]);
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
      className={`boss boss-fight phase-${phase}${hit ? ' hit' : ''}${hit && crit ? ' crit' : ''}`}
      style={t ? { ['--tier' as string]: TIER_COLOR[t.tier] } : undefined}
      aria-label={`${b.name}: ${Math.round(st.hpLeft)} de ${b.hp} de vida`}
    >
      <div className="boss-actions">
        <ConfirmButton label="Huir" confirmLabel="Sí, huir" onConfirm={onFlee} />
      </div>
      <header className="fight-head">
        <EpicName name={b.name} epithet={t?.epithet ?? 'Boss propio'} split={!!t} />
      </header>
      <BossHpBar max={b.hp} left={b.hp - shown} trail={hit ? b.hp - shown + hit : undefined} phase={phase} theme={(t?.saga ?? 'heroe') as BarTheme}
        label={<><b>{fmtNum(st.hpLeft)}</b> / {b.hp}</>} />
      <span className="fight-since mono">En combate desde el {since}</span>
      <span className="fight-scene" aria-hidden="true">
        <span className="fight-hero">
          <span className="fight-hero-ground" />
          <AvatarPortrait tier={hero.tier} photo={hero.photo} label={hero.initial} size={96} />
          <span className="fight-hero-name">{hero.name}</span>
        </span>
        <span className={`boss-stage fight-stage phase-${phase}`}>
          <span className="fight-aura" />
          <span className="fight-ground" />
          <PixelBoss templateId={t?.id} icon={b.icon} phase={phase} scale={3} className="boss-art" />
          {hit > 0 && <span className="dmg-float mono">{crit && <small>¡Crítico!</small>}−{fmtNum(hit)}</span>}
          {hit > 0 && <span className="slash" />}
        </span>
      </span>
      <div className="boss-body">
        <div className="boss-tags">
          {t ? <TierBadge tier={t.tier} /> : <span className="tier-badge custom">Boss propio</span>}
          {t && <span className="saga-tag">{sagaOf(t).name}</span>}
          {phaseLabel && <span className={`phase-tag ${phase}`}>{phaseLabel}</span>}
        </div>
        {t && <p className="boss-lore">«{t.lore}»</p>}
        <BossTraits boss={b} revealed={phase !== 'calma'} />
        <p className="boss-meta">
          <span><Icon name="crossed-swords" /> {SOURCE_LABEL[b.source].hint}</span>
          <span className={urgent ? 'urgent' : ''}><Icon name="hourglass" /> quedan {timeLeft(st.msLeft)}</span>
          <span className="loot"><Icon name="coin" className="coin-ico" /> botín {b.reward}</span>
        </p>
        {b.rules === 2 && <CombatLog events={events} />}
      </div>
    </article>
  );
}

function TemplateCard({ t, state, now, full, onSummon }: { t: BossTemplate; state: GameState; now: number; full: boolean; onSummon: () => void }) {
  const lock = bossLock(state, t.id, now);
  const fighting = !lock && isActiveTemplate(state, t.id, now);
  const wins = timesDefeated(state, t.id, now);
  const stars = bestStars(state, t.id, now);
  const cls = ['boss-template', lock ? 'locked' : fighting ? 'fighting' : 'ready', wins ? 'beaten' : ''].filter(Boolean).join(' ');
  return (
    <article className={cls} style={{ ['--tier' as string]: TIER_COLOR[t.tier] }} aria-label={lock ? `${t.name}: bloqueado, ${lock.label}` : t.name}>
      <div className="tpl-art">
        <PixelBoss templateId={t.id} icon={t.icon} scale={1.4} silhouette={!!lock} className="boss-art" />
        {lock && <span className="tpl-lock" aria-hidden="true"><Icon name="lock" /></span>}
        {wins > 0 && <span className="tpl-wins mono" title={`Derrotado ${wins} ${wins === 1 ? 'vez' : 'veces'}`}><Icon name="check" />{wins > 1 ? ` ×${wins}` : ''}</span>}
      </div>
      <div className="tpl-body">
        <TierBadge tier={t.tier} />
        {stars > 0 && <Stars n={stars} />}
        <EpicName name={t.name} epithet={t.epithet} as="h5" size="sm" />
        {lock ? (
          <p className="lock-reason"><Icon name="lock" /> {lock.label}</p>
        ) : (
          <p className="muted small-text tpl-lore">{t.lore}</p>
        )}
        <p className="tpl-ability small-text" title={abilityText(t.ability, t.source)}><Icon name={ABILITY_ICON[t.ability.kind]} /> {t.ability.name}</p>
        <p className="mono small-text tpl-stats">
          {t.hp} {SOURCE_LABEL[t.source].unit} · {t.days} días · <span className="loot">{t.reward} <Icon name="coin" className="coin-ico" /></span>
        </p>
        {!lock && (fighting ? (
          <span className="tpl-state"><Icon name="crossed-swords" /> En combate</span>
        ) : (
          <button className="primary summon-btn" onClick={onSummon} disabled={full} title={full ? `Máximo ${MAX_ACTIVE_BOSSES} a la vez` : undefined}>
            <Icon name="crossed-swords" /> {wins ? 'Invocar de nuevo' : 'Invocar'}
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
      <div className="intro-name-wrap"><EpicName name={boss.name} epithet={t?.epithet} split={!!t} as="h2" size="lg" /></div>
      {t && <p className="intro-lore">«{t.lore}»</p>}
      {t && boss.rules === 2 && (
        <p className="intro-ability"><Icon name={ABILITY_ICON[t.ability.kind]} /> <b>{t.ability.name}.</b> {abilityText(t.ability, boss.source)}</p>
      )}
      <p className="intro-stats mono">
        <span><Icon name="hp" className="hp-ico" /> {boss.hp} {SOURCE_LABEL[boss.source].unit}</span>
        <span><Icon name="hourglass" /> {days} {days === 1 ? 'día' : 'días'}</span>
        <span className="loot"><Icon name="coin" className="coin-ico" /> {boss.reward}</span>
      </p>
      <p className="muted small-text">{SOURCE_LABEL[boss.source].hint[0].toUpperCase() + SOURCE_LABEL[boss.source].hint.slice(1)}.</p>
      <button className="primary big" onClick={onClose}><Icon name="crossed-swords" /> ¡Al combate!</button>
    </Overlay>
  );
}

const STAR_NOTE: Record<number, string> = {
  1: 'Cayó al final del plazo. Más rápido, más estrellas.',
  2: 'Antes del 80 % del plazo. Tumbarlo en la primera mitad da 3 estrellas.',
  3: `En la primera mitad del plazo: botín +${Math.round(STAR_BONUS * 100)} %.`,
};

function VictoryOverlay({ boss, state, now, onClose }: { boss: Boss; state: GameState; now: number; onClose: () => void }) {
  const t = templateOf(boss);
  const next = t ? nextInSaga(t.id) : [];
  const stars = bossStars(boss, bossStatus(state, boss, now).defeatedAt);
  const loot = bossLoot(state, boss, now);
  return (
    <Overlay className="victory" label={`Victoria sobre ${boss.name}`} onClose={onClose} autoMs={12000}>
      <div className="intro-rays gold" aria-hidden="true" />
      <p className="eyebrow intro-eyebrow">{t ? sagaOf(t).name : 'Boss propio'}</p>
      <div className="intro-art fallen">
        <PixelBoss templateId={t?.id} icon={boss.icon} phase="furioso" scale={2.4} className="boss-art is-defeated" />
      </div>
      <p className="victory-title">¡Victoria!</p>
      <h2 className="intro-name">Has derrotado a {t ? t.short : boss.name}</h2>
      {stars > 0 && <Stars n={stars} size="lg" />}
      {stars > 0 && <p className="victory-stars-note muted small-text">{STAR_NOTE[stars]}</p>}
      <p className="victory-loot mono" aria-label={`Botín: ${loot} monedas`}>+{loot} <Icon name="coin" className="coin-ico" /></p>
      {next.map((n) => {
        const lock = bossLock(state, n.id, now);
        return (
          <p key={n.id} className={lock ? 'victory-next muted' : 'victory-next'}>
            {lock ? <>Siguiente en la saga: <strong>{n.name}</strong> · {lock.label}</> : <><Icon name="unlock" /> Nuevo boss desbloqueado: <strong>{n.name}</strong></>}
          </p>
        );
      })}
      {t && next.length === 0 && <p className="victory-next"><Icon name="crown" /> Has completado la {sagaOf(t).name}.</p>}
      <button className="primary big" onClick={onClose}><Icon name="coin" /> Reclamar botín</button>
    </Overlay>
  );
}

/** Vitrina: un trofeo por boss de la escalera, con sus mejores estrellas. Los no vencidos, en sombra. */
function TrophyShelf({ state, now }: { state: GameState; now: number }) {
  return (
    <details className="trophy-shelf">
      <summary><Icon name="trophy" /> Vitrina de trofeos</summary>
      <ul className="trophies">
        {BOSS_TEMPLATES.map((t) => {
          const wins = timesDefeated(state, t.id, now);
          const stars = bestStars(state, t.id, now);
          return (
            <li key={t.id} className={wins ? 'trophy won' : 'trophy'} style={{ ['--tier' as string]: TIER_COLOR[t.tier] }}
              title={wins ? `${t.name}: derrotado ${wins} ${wins === 1 ? 'vez' : 'veces'}` : `${t.name}: aún sin vencer`}>
              <span className="trophy-plinth"><PixelBoss templateId={t.id} icon={t.icon} scale={0.7} silhouette={!wins} className="boss-art" /></span>
              <span className="trophy-name">{t.short.replace(/^(el|la|las|los) /i, '')}</span>
              {wins > 0 && <Stars n={stars} />}
            </li>
          );
        })}
      </ul>
      <p className="muted small-text">Las estrellas premian la rapidez: 3 si cae en la primera mitad del plazo (con +{Math.round(STAR_BONUS * 100)} % de botín), 2 antes del 80 %, 1 si cae al final.</p>
    </details>
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
  const avatar = avatarInfo(state, now);
  const hero: Hero = { tier: avatar.index, photo: state.profile?.photo, initial: initialOf(state.profile?.name), name: state.profile?.name ?? 'Tú' };
  const unlockedCount = BOSS_TEMPLATES.filter((t) => !bossLock(state, t.id, now)).length;
  const beatenCount = BOSS_TEMPLATES.filter((t) => timesDefeated(state, t.id, now) > 0).length;
  const starCount = BOSS_TEMPLATES.reduce((n, t) => n + bestStars(state, t.id, now), 0);
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
      sfx.error();
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
            {earned.fromXp} por XP (1 cada {COIN_RULES.xpPerCoin} XP) · {earned.fromBosses} por bosses · {earned.fromKingdoms} por reinos{earned.fromSocial > 0 && ` · ${earned.fromSocial} por trofeos`} · −{coinsSpent(state)} gastadas
          </p>
        </div>
      </section>

      <section className="panel bosses-panel" aria-labelledby="bosses-h" data-tour="bosses">
        <header className="panel-head">
          <h3 id="bosses-h">Bosses</h3>
          <span className="count mono">{active.length}/{MAX_ACTIVE_BOSSES} activos</span>
        </header>
        <p className="hint">Un boss es un reto con plazo: le haces daño con lo que hagas desde que lo invocas y, si cae a tiempo, te llevas su botín. Subir de nivel y vencer a cada bestia abre las siguientes de su saga. Cada boss tiene una habilidad y un punto débil que se revela a media vida.</p>
        <p className="hint crit-hint"><Icon name="sparkles" /> {CRIT_RULES}</p>
        <div className="arena-progress">
          <span><b className="mono">Nv {level}</b> nivel global</span>
          <span><b className="mono">{unlockedCount}/{BOSS_TEMPLATES.length}</b> bosses desbloqueados</span>
          <span><b className="mono">{beatenCount}/{BOSS_TEMPLATES.length}</b> vencidos</span>
          <span><b className="mono">{starCount}/{BOSS_TEMPLATES.length * 3}</b> estrellas</span>
        </div>
        <TrophyShelf state={state} now={now} />
        {active.length > 0 && (
          <div className="boss-list">
            {active.map((b) => (
              <BossCard key={b.id} boss={b} st={bossStatus(state, b, now)} events={combat(state, b, now).events} hero={hero} onFlee={() => act((s) => deleteBoss(s, b.id))} />
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
                  <span className="mono saga-count">{won}/{list.length}{won === list.length && <> <Icon name="crown" /></>}</span>
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
                    <span className={st.defeated ? 'mono win' : 'mono muted'}>{st.defeated ? <>{bossStars(b, st.defeatedAt) > 0 && <Stars n={bossStars(b, st.defeatedAt)} />} Derrotado · +{bossLoot(state, b, now)} <Icon name="coin" className="coin-ico" /></> : 'Escapó'}</span>
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
    toast(`${tok(reward.icon)} ${reward.name} guardado en tu cofre. −${reward.cost} {i:coin}`, 'level');
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
          <span className="shop-next-icon" aria-hidden="true"><Glyph icon={next.reward.icon} /></span>
          <div className="shop-next-body">
            <p>Tu próximo premio: <strong>{next.reward.name}</strong></p>
            <div className="afford-bar" aria-hidden="true"><div style={{ width: `${Math.max(0, Math.min(100, (balance / next.reward.cost) * 100))}%` }} /></div>
            <p className="muted small-text">Te faltan <b className="mono">{next.missing} <Icon name="coin" className="coin-ico" /></b> · unos {next.xp} XP más</p>
          </div>
        </div>
      ) : (
        <div className="shop-next ready">
          <span className="shop-next-icon" aria-hidden="true"><Icon name="sparkles" /></span>
          <p>Puedes permitirte cualquier premio de la tienda. Te lo has ganado.</p>
        </div>
      ))}

      {cats.length > 1 && (
        <div className="shop-filter" role="group" aria-label="Categorías">
          <button className={cat === 'todo' ? 'chip-btn on' : 'chip-btn'} aria-pressed={cat === 'todo'} onClick={() => setCat('todo')}>Todo</button>
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'chip-btn on' : 'chip-btn'} aria-pressed={cat === c.id} onClick={() => setCat(c.id)} title={c.hint}>
              <Icon name={c.icon} /> {c.name}
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

      <RewardForm onCreate={(r) => { act((s) => addReward(s, r, Date.now())); sfx.place(); }} />

      {history.length > 0 && (
        <>
          <h4 className="sub-h">Historial de canjes</h4>
          <p className="muted small-text">{history.length} {history.length === 1 ? 'premio canjeado' : 'premios canjeados'} · {coinsSpent(state)} <Icon name="coin" className="coin-ico" /> en total</p>
          <ul className="list plain purchases">
            {history.slice(0, showAll ? 50 : 6).map((p) => (
              <li key={p.id} className="purchase">
                <span className="purchase-icon" aria-hidden="true"><Glyph icon={p.icon} /></span>
                <span className="purchase-body">
                  <span className="purchase-name">{p.name}</span>
                  <span className="muted small-text">
                    Canjeado el {fmtWhen(p.at)}
                    {p.usedAt === null ? <> · <Icon name="chest" /> en el cofre</> : p.usedAt ? ` · usado el ${fmtWhen(p.usedAt)}` : ''}
                  </span>
                </span>
                <span className="mono purchase-cost">
                  −{p.cost} <Icon name="coin" className="coin-ico" />
                  {dayKey(p.at) === dayKey(now) && !p.usedAt && (
                    <button className="link" onClick={() => { act((s) => refundPurchase(s, p.id)); sfx.coin(); }}><Icon name="rotate-ccw" /> Devolver</button>
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
export function Chest({ game }: { game: Game }) {
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
    toast(`${tok(p.icon)} ¡A disfrutar de ${p.name}! Te lo has ganado.`, 'level');
  }
  return (
    <div className="chest" aria-labelledby="chest-h">
      <h4 id="chest-h" className="sub-h"><Icon name="chest" /> Tu cofre <span className="count mono">{items.length}</span></h4>
      <p className="muted small-text">Lo que has canjeado y aún no has usado. Úsalo cuando vayas a disfrutarlo.</p>
      <ul className="chest-items">
        {[...groups.values()].map((g) => (
          <li key={g[0].id} className="chest-item">
            <span className="chest-icon" aria-hidden="true"><Glyph icon={g[0].icon} /></span>
            <span className="chest-name">{g[0].name}{g.length > 1 && <b className="mono"> ×{g.length}</b>}</span>
            <button className="primary small" onClick={() => use(g[0].id)}><Icon name="sparkles" /> Usar</button>
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
      <button className="icon-btn reward-edit" onClick={onEdit} aria-label={`Editar ${r.name}`} title="Editar"><Icon name="pencil" /></button>
      {count > 0 && <span className="reward-count mono" title={`Canjeado ${count} ${count === 1 ? 'vez' : 'veces'}`}>×{count}</span>}
      <span className="reward-icon" aria-hidden="true"><Glyph icon={r.icon} /></span>
      <span className={`reward-cat cat-${category.id}`}><Icon name={category.icon} /> {category.name}</span>
      <span className="reward-name">{r.name}</span>
      <span className="reward-cost mono"><Icon name="coin" className="coin-ico" /> {r.cost}</span>
      {missing > 0 ? (
        <>
          <div className="afford-bar small" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
          <span className="reward-missing small-text">te faltan {missing} <Icon name="coin" className="coin-ico" /></span>
        </>
      ) : (
        <span className="reward-ok small-text">Lo puedes pagar</span>
      )}
      <button className="primary reward-buy" disabled={missing > 0} onClick={onBuy} aria-label={`Canjear ${r.name} por ${r.cost} monedas`}>
        <Icon name="coin" /> Canjear
      </button>
    </article>
  );
}

/** Rejilla de símbolos para elegir el de una recompensa o un boss propio. */
function IconPicker({ value, onChange, icons = REWARD_ICONS, label = 'Símbolo' }: { value: string; onChange: (v: IconName) => void; icons?: IconName[]; label?: string }) {
  return (
    <div className="icon-picker" role="radiogroup" aria-label={label}>
      {icons.map((i) => (
        <button type="button" key={i} role="radio" className={value === i ? 'icon-pick on' : 'icon-pick'} aria-checked={value === i} aria-label={i} onClick={() => onChange(i)}><Icon name={i} /></button>
      ))}
    </div>
  );
}

function CategorySelect({ value, onChange, id }: { value: RewardCategory | ''; onChange: (v: RewardCategory | '') => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as RewardCategory | '')} aria-label="Categoría" className="attr-select">
      <option value="">Categoría: auto</option>
      {REWARD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
    onSave({ name: form.name, icon: form.icon || 'present', cost: Number(form.cost), category: form.category || undefined });
  }
  return (
    <form className="reward reward-editing" onSubmit={submit} aria-label={`Editar ${reward.name}`}>
      <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={50} aria-label="Nombre de la recompensa" />
      <input type="number" min={1} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} aria-label="Precio en monedas" />
      <CategorySelect id={`cat-${reward.id}`} value={form.category} onChange={(category) => setForm({ ...form, category })} />
      <span className="reward-edit-actions">
        <ConfirmButton label="Borrar" confirmLabel="Sí, borrar" onConfirm={onDelete} />
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary" disabled={!valid}><Icon name="save" /> Guardar</button>
      </span>
    </form>
  );
}

function RewardForm({ onCreate }: { onCreate: (r: { name: string; icon: string; cost: number; category?: RewardCategory }) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', icon: 'present', cost: '', category: '' as RewardCategory | '' });
  const valid = form.name.trim() && Number(form.cost) > 0;
  const autoCat = REWARD_CATEGORIES.find((c) => c.id === rewardCategory({ name: form.name, cost: Number(form.cost) || 0 }))!;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onCreate({ name: form.name, icon: form.icon || 'present', cost: Number(form.cost), category: form.category || undefined });
    setForm({ name: '', icon: 'present', cost: '', category: '' });
  }
  if (!open) return <button className="ghost new-reward-btn" onClick={() => setOpen(true)}><Icon name="plus" /> Crear una recompensa propia</button>;
  return (
    <form className="reward-form" onSubmit={submit}>
      <p className="reward-form-title">
        <span className="reward-preview" aria-hidden="true"><Glyph icon={form.icon || 'present'} /></span>
        <span><strong>{form.name.trim() || 'Nueva recompensa'}</strong><br /><span className="muted small-text">{Number(form.cost) > 0 && <><Icon name="coin" className="coin-ico" /> {form.cost} · </>}{form.category ? REWARD_CATEGORIES.find((c) => c.id === form.category)!.name : `${autoCat.name} (automática)`}</span></span>
      </p>
      <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
      <div className="reward-form-row">
        <input id="reward-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. Ir al cine)" maxLength={50} aria-label="Nombre de la recompensa" />
        <input id="reward-cost" type="number" min={1} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Precio" aria-label="Precio en monedas" />
        <CategorySelect id="reward-cat" value={form.category} onChange={(category) => setForm({ ...form, category })} />
      </div>
      <p className="muted small-text">Referencia: 1 <Icon name="coin" className="coin-ico" /> = {COIN_RULES.xpPerCoin} XP. Un episodio ~25, salir con amigos ~100, un día libre ~350.</p>
      <span className="boss-form-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cerrar</button>
        <button type="submit" className="primary" disabled={!valid}><Icon name="plus" /> Añadir a la tienda</button>
      </span>
    </form>
  );
}

const SOURCES: BossSource[] = ['xp', 'deepwork', 'habits', 'voluntad', 'sabiduria', 'maestria', 'conexion', 'creacion'];

function CustomBossForm({ onCreate }: { onCreate: (b: { name: string; icon: string; source: BossSource; hp: number; days: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', icon: 'scorpion' as string, source: 'xp' as BossSource, hp: '500', days: '7' });
  const hp = Number(form.hp);
  const days = Number(form.days);
  const valid = form.name.trim() && hp > 0 && days >= 1 && days <= 90;
  if (!open) return <button className="ghost custom-boss-btn" onClick={() => setOpen(true)}><Icon name="plus" /> Crear un boss propio</button>;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onCreate({ name: form.name, icon: form.icon, source: form.source, hp, days });
    setOpen(false);
    setForm({ ...form, name: '' });
  }
  return (
    <form className="boss-form" onSubmit={submit}>
      <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} icons={BOSS_ICONS} label="Símbolo del boss" />
      <input id="boss-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. El Examen de Física)" maxLength={50} aria-label="Nombre del boss" />
      <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as BossSource })} aria-label="Qué le hace daño" className="attr-select">
        {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s].name}</option>)}
      </select>
      <input id="boss-hp" type="number" min={1} value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} aria-label="Vida" title="Vida" />
      <input id="boss-days" type="number" min={1} max={90} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} aria-label="Días de plazo" title="Días" />
      <span className="muted small-text">Vida en {SOURCE_LABEL[form.source].unit} · botín {valid ? bossReward(form.source, hp) : 0} <Icon name="coin" className="coin-ico" /></span>
      <span className="boss-form-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="primary" disabled={!valid}><Icon name="crossed-swords" /> Invocar</button>
      </span>
    </form>
  );
}
