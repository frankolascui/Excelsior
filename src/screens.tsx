import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { useGame } from './store';
import type { FocusPhase, Quest, QuestType } from './types';
import { addGoal, avatarInfo, deepWorkRewards, deleteGoal, formatAttrXp, goalProgress, habitRewards, questRewards, updateGoal } from './attributes';
import { CustomizeToggle, RewardEditor, sameRewards, type CustomValue } from './customize';
import { addKingdom, BUILDINGS, buildings, deleteKingdom, kingdomName, kingdomProgress } from './kingdoms';
import { CityScene } from './city';
import { kingdomBonus } from './economy';
import { RealmMap } from './realm';
import { AmbientPanel } from './ambient-ui';
import { AvatarLadder, WeeklyChronicle } from './settings';
import { useCloud } from './cloud';
import { sfx } from './sfx';
import { ActivityHeatmap, XpChart } from './charts';
import {
  addHabit, addQuest, cancelTimer, CUSTOM_LIMITS, updateHabit, updateQuest, completeQuest, createProfile, dayKey, deepWorkMinutesOnDay,
  deleteHabit, deleteQuest, focusPercent, habitStreak, isHabitDone, levelInfo, pendingQuests, setPhase, timerTotals,
  startTimer, stopTimer, suggest, toggleHabit, totalXp, undoQuest, xpOnDay, XP_RULES,
} from './game';
import {
  AttributeList, AvatarCard, ConfirmButton, formatClock, formatMinutes, HabitItem, LevelBar, QuestItem,
  QuickAddQuest, RewardTags, useNow,
} from './ui';
import { HeroJournal, TimedGoals } from './ritual';

export type Game = ReturnType<typeof useGame>;
export type Tab = 'hoy' | 'misiones' | 'reinos' | 'arena' | 'gremios' | 'deepwork' | 'habitos' | 'personaje' | 'ajustes';

const CAP_QUEST = 'Tope diario de XP por misiones alcanzado: la misión cuenta igual. Sube de nivel para ampliarlo.';
const CAP_HABIT = 'Tope diario de XP por hábitos alcanzado. Sube de nivel para ampliarlo.';
/** Sonido y confeti al completar: martillazos en los reinos, fiesta en las principales. */
const questOpts = (q: Quest) => ({ party: q.type === 'main', sound: q.kingdomId ? ('build' as const) : ('reward' as const) });

// ---------- Registro ----------

export const STARTER_HABITS = ['Leer', 'Entrenar', 'Meditar', 'Journaling', 'Llamar a alguien', 'Escribir', 'Caminar', 'Dormir bien'];

export function Onboarding({ game, onBack }: { game: Game; onBack?: () => void }) {
  const [name, setName] = useState('');
  const cloud = useCloud();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    game.act((s) => createProfile(s, name, [], Date.now()));
  }
  if (cloud.email && !game.cloudChecked) {
    return (
      <main className="onboarding">
        <div className="onboarding-card"><p className="lede">Cargando tu partida…</p></div>
      </main>
    );
  }
  return (
    <main className="onboarding">
      <div className="onboarding-card">
        <p className="eyebrow">Life RPG</p>
        <h1 className="brand">Excelsior</h1>
        <p className="lede">Un RPG construido alrededor de tu vida real. Cada misión cumplida y cada minuto de foco te hacen subir de nivel.</p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>¿Cómo se llama tu personaje?</span>
            <input id="hero-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={30} autoFocus />
          </label>
          <button type="submit" className="primary big" disabled={!name.trim()}>Crear personaje</button>
        </form>
        {cloud.email && <p className="muted small-text">Conectado como {cloud.email}.</p>}
        {!cloud.email && onBack && <button type="button" className="link" onClick={onBack}>← Entrar con email en vez de como invitado</button>}
        <p className="fineprint">{cloud.email ? 'Tu partida se guarda en la nube.' : 'Tu partida se guarda solo en este navegador.'}</p>
      </div>
    </main>
  );
}

// ---------- Hoy (Dashboard) ----------

export function Dashboard({
  game, go, focusQuest, guide,
}: { game: Game; go: (t: Tab) => void; focusQuest: (q: Quest | null) => void; guide: string }) {
  const { state, act } = game;
  const now = useNow(30_000);
  const today = dayKey(now);
  const pending = pendingQuests(state);
  const doneToday = state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === today);
  const habitsDone = state.habits.filter((h) => isHabitDone(state, h.id, today)).length;
  const s = suggest(state, now);

  return (
    <div className="screen">
      <WeeklyChronicle game={game} guide={guide} now={now} go={go} />
      <section className="now" aria-labelledby="now-h" data-tour="now">
        <p className="eyebrow" id="now-h">¿Qué hago ahora?</p>
        {s.kind === 'timer' && (
          <>
            <h2>Tienes una sesión de foco en marcha.</h2>
            <button className="primary big" onClick={() => go('deepwork')}>Volver al temporizador</button>
          </>
        )}
        {s.kind === 'quest' && (
          <>
            <h2>{s.quest.title}</h2>
            <p className="now-sub">Misión {s.quest.type === 'main' ? 'principal' : s.quest.type === 'daily' ? 'diaria' : 'secundaria'} · +{XP_RULES.quest[s.quest.type]} XP al completarla, +1 XP por minuto de foco</p>
            <div className="row">
              <button className="primary big" onClick={() => focusQuest(s.quest)}>▶ Empezar Deep Work</button>
              <button className="secondary big" onClick={() => act((st) => completeQuest(st, s.quest.id, Date.now()), CAP_QUEST, questOpts(s.quest))}>✓ Ya la terminé</button>
            </div>
          </>
        )}
        {s.kind === 'habit' && (
          <>
            <h2>Hábito pendiente: {s.name}</h2>
            <p className="now-sub">No tienes misiones pendientes. Marca el hábito cuando lo hagas.</p>
            <div className="row">
              <button className="primary big" onClick={() => act((st) => toggleHabit(st, s.habitId, Date.now()), CAP_HABIT, { sound: 'habit' })}>✓ Hecho</button>
              <button className="secondary big" onClick={() => go('misiones')}>+ Crear misión</button>
            </div>
          </>
        )}
        {s.kind === 'create' && (
          <>
            <h2>Crea tu primera misión.</h2>
            <p className="now-sub">Algo concreto que quieras hacer hoy. Una sola línea basta.</p>
            <QuickAddQuest onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />
          </>
        )}
        {s.kind === 'done' && (
          <>
            <h2>Todo hecho por hoy.</h2>
            <p className="now-sub">Una sesión extra de foco sigue sumando XP. O prepara la misión de mañana.</p>
            <div className="row">
              <button className="primary big" onClick={() => focusQuest(null)}>▶ Deep Work libre</button>
              <button className="secondary big" onClick={() => go('misiones')}>+ Nueva misión</button>
            </div>
          </>
        )}
      </section>

      <div className="columns">
        <section className="panel">
          <header className="panel-head">
            <h3>Misiones pendientes</h3>
            <button className="link" onClick={() => go('misiones')}>Ver todas</button>
          </header>
          {pending.length === 0 ? (
            <p className="empty">Sin misiones pendientes.</p>
          ) : (
            <ul className="list">
              {pending.slice(0, 5).map((q) => (
                <QuestItem key={q.id} quest={q} kingdom={kingdomName(state, q.kingdomId)} onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), CAP_QUEST, questOpts(q))} onStart={() => focusQuest(q)} />
              ))}
            </ul>
          )}
          {s.kind !== 'create' && <QuickAddQuest onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h3>Hábitos de hoy</h3>
            <button className="link" onClick={() => go('habitos')}>Gestionar</button>
          </header>
          {state.habits.length === 0 ? (
            <p className="empty">Aún no tienes hábitos.</p>
          ) : (
            <ul className="list">
              {state.habits.map((h) => (
                <HabitItem key={h.id} state={state} habit={h} now={now} onToggle={() => act((st) => toggleHabit(st, h.id, Date.now()), CAP_HABIT, { sound: 'habit' })} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <AvatarCard state={state} now={now} />

      <section className="panel" aria-labelledby="attrs-h">
        <header className="panel-head">
          <h3 id="attrs-h">Atributos</h3>
          <button className="link" onClick={() => go('personaje')}>Detalle</button>
        </header>
        <AttributeList state={state} />
      </section>

      <section className="panel" aria-label="XP y nivel global">
        <LevelBar state={state} />
        <p className="today-line">
          Hoy: <strong className="mono">+{xpOnDay(state, today)} XP</strong> · {formatMinutes(deepWorkMinutesOnDay(state, today))} de Deep Work · {doneToday.length} misiones · {habitsDone}/{state.habits.length} hábitos
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

// ---------- Misiones ----------

export function Quests({ game, focusQuest }: { game: Game; focusQuest: (q: Quest) => void }) {
  const { state, act } = game;
  const pending = pendingQuests(state);
  const done = state.quests.filter((q) => q.completedAt).sort((a, b) => b.completedAt! - a.completedAt!).slice(0, 15);
  return (
    <div className="screen">
      <h1 className="screen-title">Misiones</h1>
      <section className="panel" data-tour="quest-add">
        <QuickAddQuest autoFocus onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />
        <p className="hint">Principal = lo importante. Diaria = para hoy. Secundaria = si sobra tiempo.</p>
      </section>
      <section className="panel">
        <header className="panel-head"><h3>Pendientes</h3><span className="count mono">{pending.length}</span></header>
        {pending.length === 0 ? <p className="empty">Nada pendiente. Crea una misión arriba.</p> : (
          <ul className="list">
            {pending.map((q) => (
              <QuestItem
                key={q.id}
                quest={q}
                kingdom={kingdomName(state, q.kingdomId)}
                onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), CAP_QUEST, questOpts(q))}
                onStart={() => focusQuest(q)}
                onEdit={(t, v) => act((st) => updateQuest(st, q.id, { title: t, ...v }))}
                onDelete={() => act((st) => deleteQuest(st, q.id))}
              />
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="panel">
          <header className="panel-head"><h3>Completadas</h3></header>
          <ul className="list">
            {done.map((q) => <QuestItem key={q.id} quest={q} kingdom={kingdomName(state, q.kingdomId)} onUndo={() => act((st) => ({ state: undoQuest(st, q.id), xp: 0 }))} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Deep Work ----------

const TARGETS = [25, 45, 60, 90];

interface SessionResult {
  minutes: number;
  xp: number;
  questId: string | null;
  label: string;
  breakMinutes: number;
  distractionMinutes: number;
  distractions: number;
  focusPct: number;
}

const PHASE_LABEL = { focus: 'Foco', break: 'Descanso', distraction: 'Distracción' } as const;

export function DeepWork({ game, preselect, clearPreselect }: { game: Game; preselect: string | null; clearPreselect: () => void }) {
  const { state, act } = game;
  const now = useNow(250);
  const [questId, setQuestId] = useState<string | null>(preselect);
  const [target, setTarget] = useState(25);
  const [result, setResult] = useState<SessionResult | null>(null);
  const today = dayKey(now);
  const sessionsToday = state.sessions.filter((x) => dayKey(x.endedAt) === today).reverse();
  const timer = state.activeTimer;
  const linkedQuest = questId ? state.quests.find((q) => q.id === questId && !q.completedAt) : null;
  const finishing = useRef(false);

  function start(minutes: number) {
    act((s) => startTimer(s, linkedQuest?.id ?? null, minutes, Date.now()));
    sfx.start();
    setResult(null);
    clearPreselect();
    finishing.current = false;
  }

  function stop() {
    act((s) => {
      const r = stopTimer(s, Date.now());
      const x = r.session;
      setResult(x
        ? {
          minutes: x.minutes, xp: r.xp, questId: x.questId, label: x.label, breakMinutes: x.breakMinutes ?? 0,
          distractionMinutes: x.distractionMinutes ?? 0, distractions: x.distractions ?? 0, focusPct: x.focusPct ?? 100,
        }
        : { minutes: 0, xp: 0, questId: null, label: '', breakMinutes: 0, distractionMinutes: 0, distractions: 0, focusPct: 100 });
      return r;
    }, `Sesión limitada a ${XP_RULES.maxSessionMinutes} min.`);
  }

  function phase(p: FocusPhase) {
    act((s) => setPhase(s, p, Date.now()));
    if (p === 'focus') sfx.focus();
    else if (p === 'break') sfx.rest();
    else sfx.distraction();
  }

  const totals = timer ? timerTotals(timer, now) : null;
  const targetMs = timer ? timer.targetMinutes * 60000 : 0;

  // Cuenta atrás: al llegar a 0 de foco, suena y se registra sola.
  useEffect(() => {
    if (timer && totals && targetMs > 0 && totals.focusMs >= targetMs && !finishing.current) {
      finishing.current = true;
      sfx.done();
      stop();
    }
  });

  if (timer && totals) {
    const countdown = targetMs > 0;
    const shown = countdown ? Math.max(0, targetMs - totals.focusMs) : totals.focusMs;
    const progress = countdown ? Math.min(1, totals.focusMs / targetMs) : (totals.focusMs % 60000) / 60000;
    const quest = timer.questId ? state.quests.find((q) => q.id === timer.questId) : null;
    const pct = focusPercent(totals.focusMs, totals.distractionMs);
    const R = 120;
    const C = 2 * Math.PI * R;
    return (
      <div className={`screen focus-screen phase-${totals.phase}`}>
        <p className="eyebrow">{countdown ? `Cuenta atrás · ${timer.targetMinutes} min` : 'Sesión libre'}</p>
        {quest && <h1 className="focus-label">{quest.title}</h1>}
        <div className="ring" role="timer" aria-live="off">
          <svg viewBox="0 0 280 280" aria-hidden="true">
            <defs>
              <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--c1)" />
                <stop offset="55%" stopColor="var(--c2)" />
                <stop offset="100%" stopColor="var(--c3)" />
              </linearGradient>
            </defs>
            <circle cx="140" cy="140" r={R} className="ring-track" />
            <circle cx="140" cy="140" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 140 140)" />
          </svg>
          <div className="ring-center">
            <span className="phase-pill">{PHASE_LABEL[totals.phase]}</span>
            <span className="ring-time mono">{formatClock(shown)}</span>
            <span className="ring-sub">{countdown ? 'quedan de foco' : 'de foco'} · +{Math.floor(totals.focusMs / 60000)} XP</span>
          </div>
        </div>

        <div className="focus-stats" aria-label="Tiempo de la sesión">
          <div><span className="mono">{formatClock(totals.breakMs)}</span><span>Descanso</span></div>
          <div><span className="mono">{formatClock(totals.distractionMs)}</span><span>Distracción{totals.distractions ? ` ×${totals.distractions}` : ''}</span></div>
          <div className={pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'bad'}><span className="mono">{pct} %</span><span>Foco real</span></div>
        </div>

        <div className="row center">
          {totals.phase === 'focus' ? (
            <>
              <button className="phase-btn rest" onClick={() => phase('break')}>☕ Descanso</button>
              <button className="phase-btn distract" onClick={() => phase('distraction')}>⚠ Me distraje</button>
            </>
          ) : (
            <button className="primary big" onClick={() => phase('focus')}>▶ Volver al foco</button>
          )}
        </div>
        <button className="ghost" onClick={stop}>■ Terminar sesión</button>
        <ConfirmButton label="Descartar sin guardar" confirmLabel="Sí, descartar" onConfirm={() => act(cancelTimer)} />
        <AmbientPanel />
      </div>
    );
  }

  const linked = result?.questId ? state.quests.find((q) => q.id === result.questId && !q.completedAt) : null;

  return (
    <div className="screen">
      <h1 className="screen-title">Deep Work</h1>

      {result && (
        <section className="panel result" aria-live="polite">
          {result.minutes > 0 ? (
            <>
              <p className="eyebrow">Sesión registrada</p>
              <h2>{formatMinutes(result.minutes)} de foco · +{result.xp} XP</h2>
              <div className="focus-stats left">
                <div className={result.focusPct >= 80 ? 'good' : result.focusPct >= 60 ? 'mid' : 'bad'}><span className="mono">{result.focusPct} %</span><span>Foco real</span></div>
                <div><span className="mono">{formatMinutes(result.breakMinutes)}</span><span>Descanso</span></div>
                <div><span className="mono">{formatMinutes(result.distractionMinutes)}</span><span>Distracción{result.distractions ? ` ×${result.distractions}` : ''}</span></div>
              </div>
              <p className="now-sub">{result.label} <RewardTags rewards={deepWorkRewards(result.minutes)} /></p>
              {linked && (
                <div className="row">
                  <button className="primary" onClick={() => { act((s) => completeQuest(s, linked.id, Date.now()), CAP_QUEST, questOpts(linked)); setResult({ ...result, questId: null }); }}>
                    ✓ Completar «{linked.title}» (+{XP_RULES.quest[linked.type]} XP)
                  </button>
                </div>
              )}
            </>
          ) : (
            <p>La sesión tuvo menos de un minuto de foco y no se ha guardado.</p>
          )}
        </section>
      )}

      {linkedQuest && (
        <p className="linked">Para la misión <strong>{linkedQuest.title}</strong> <button className="link" onClick={() => setQuestId(null)}>Quitar</button></p>
      )}

      <div className="modes" data-tour="modes">
        <button className="mode-card" onClick={() => start(0)}>
          <span className="mode-icon" aria-hidden="true">⏱</span>
          <span className="mode-title">Sesión libre</span>
          <span className="mode-sub">Cronómetro. Paras cuando quieras.</span>
        </button>
        <div className="mode-card as-div">
          <span className="mode-icon" aria-hidden="true">⏳</span>
          <span className="mode-title">Con minutos</span>
          <div className="segmented" role="radiogroup" aria-label="Minutos de foco">
            {TARGETS.map((t) => (
              <button key={t} role="radio" aria-checked={target === t} className={target === t ? 'seg on' : 'seg'} onClick={() => setTarget(t)}>
                {t}
              </button>
            ))}
          </div>
          <button className="primary wide" onClick={() => start(target)}>▶ Empezar {target} min</button>
        </div>
      </div>
      <AmbientPanel />
      <p className="hint">Durante la sesión puedes marcar Descanso o Me distraje. Solo el foco da XP (1 XP, +1 Maestría y +0,5 Voluntad por minuto). Foco real = foco ÷ (foco + distracción) × 100.</p>

      <section className="panel">
        <header className="panel-head"><h3>Sesiones de hoy</h3><span className="count mono">{formatMinutes(deepWorkMinutesOnDay(state, today))}</span></header>
        {sessionsToday.length === 0 ? <p className="empty">Todavía ninguna.</p> : (
          <ul className="list plain">
            {sessionsToday.map((x) => (
              <li key={x.id} className="row-between">
                <span>{x.label}</span>
                <span className="mono muted">
                  {new Date(x.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {formatMinutes(x.minutes)}
                  {x.focusPct !== undefined && ` · ${x.focusPct} % foco`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Hábitos ----------

export function Habits({ game }: { game: Game }) {
  const { state, act } = game;
  const now = useNow(30_000);
  const [name, setName] = useState('');
  const [custom, setCustom] = useState<CustomValue>({});
  const [open, setOpen] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, habitRewards(name)) ? custom.rewards : undefined;
    act((s) => addHabit(s, name, Date.now(), { xp: custom.xp, rewards }));
    setName('');
    setCustom({});
    setOpen(false);
  }
  return (
    <div className="screen">
      <h1 className="screen-title">Hábitos</h1>
      <div className="stack-gap" data-tour="habits">
      <section className="panel">
        <form className="quick-add inline" onSubmit={submit}>
          <input id="new-habit" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Nuevo hábito diario (ej. Leer 10 páginas)" maxLength={60} aria-label="Nombre del nuevo hábito" />
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={custom.xp !== undefined || custom.rewards !== undefined} />
          <button type="submit" className="primary" disabled={!name.trim()}>Añadir</button>
        </form>
        {open && <RewardEditor autoXp={XP_RULES.habit} autoRewards={habitRewards(name)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.habitXp} idPrefix="new-habit" />}
        <p className="hint">+{XP_RULES.habit} XP cada día que lo completes. Los puntos de la derecha son los últimos 7 días.</p>
      </section>
      <section className="panel">
        {state.habits.length === 0 ? (
          <div>
            <p className="empty">Aún no tienes hábitos. Escribe uno arriba o elige alguno:</p>
            <div className="chips">
              {STARTER_HABITS.map((h) => <button key={h} className="pick" onClick={() => act((s) => addHabit(s, h, Date.now()))}>+ {h}</button>)}
            </div>
          </div>
        ) : (
          <ul className="list">
            {state.habits.map((h) => (
              <HabitItem key={h.id} state={state} habit={h} now={now} onToggle={() => act((s) => toggleHabit(s, h.id, Date.now()), CAP_HABIT, { sound: 'habit' })} onDelete={() => act((s) => deleteHabit(s, h.id))} onEdit={(n, v) => act((s) => updateHabit(s, h.id, { name: n, ...v }))} />
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

// ---------- Personaje y progreso ----------

export function Character({ game }: { game: Game }) {
  const { state } = game;
  const now = useNow(60_000);
  const xp = totalXp(state);
  const info = levelInfo(xp);
  const dwTotal = state.sessions.reduce((n, x) => n + x.minutes, 0);
  const questsDone = state.quests.filter((q) => q.completedAt).length;
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, habitStreak(state, h.id, now)), 0);
  const activeDays = new Set(state.xp.map((t) => dayKey(t.at))).size;
  const history = [...state.xp].reverse().slice(0, 15);
  const SOURCE = { quest: 'Misión', habit: 'Hábito', deepwork: 'Deep Work', admin: 'Admin' } as const;

  return (
    <div className="screen">
      <h1 className="screen-title">Personaje</h1>
      <section className="panel hero-card">
        <div className="emblem" aria-hidden="true"><span className="mono">{info.level}</span></div>
        <div className="stack tight">
          <h2 className="hero-name">{state.profile?.name}</h2>
          <p className="hero-title">Nivel global {info.level}</p>
          <p className="muted">{xp} XP global en total</p>
        </div>
        <LevelBar state={state} compact />
      </section>

      <AvatarCard state={state} now={now} showRequirements />

      <AvatarLadder game={game} now={now} />

      <TimedGoals game={game} />

      <GoalsPanel game={game} now={now} />

      <HeroJournal state={state} />

      <section className="panel" aria-labelledby="attrs-detail-h" data-tour="attrs">
        <h3 id="attrs-detail-h">Atributos</h3>
        <AttributeList state={state} detailed />
      </section>

      <section className="stats" aria-label="Progreso acumulado">
        <Stat label="Deep Work total" value={formatMinutes(dwTotal)} />
        <Stat label="Misiones completadas" value={`${questsDone}`} />
        <Stat label="Mejor racha activa" value={`${bestStreak} d`} />
        <Stat label="Días con progreso" value={`${activeDays}`} />
      </section>

      <XpChart state={state} now={now} />

      <ActivityHeatmap state={state} now={now} />

      <section className="panel">
        <header className="panel-head"><h3>Historial</h3></header>
        {history.length === 0 ? <p className="empty">Aquí aparecerá cada XP que ganes.</p> : (
          <ul className="list plain">
            {history.map((t) => (
              <li key={t.id} className="row-between">
                <span><span className="muted">{SOURCE[t.source]} · </span>{t.label}</span>
                <span className="mono"><RewardTags rewards={t.attributes ?? {}} /> +{t.amount} <span className="muted">{new Date(t.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}

// ---------- Reinos ----------

const BUILDING_TYPES: QuestType[] = ['side', 'daily', 'main'];

export function Kingdoms({ game, focusQuest }: { game: Game; focusQuest: (q: Quest) => void }) {
  const { state, act } = game;
  const [name, setName] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    act((s) => addKingdom(s, name, Date.now()));
    setName('');
  }
  function showKingdom(id: string) {
    const el = document.getElementById(`kingdom-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('flash');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('flash');
  }
  return (
    <div className="screen">
      <h1 className="screen-title">Reinos</h1>
      <p className="hint">Un reino es un proyecto. Cada tarea es una construcción y tu ciudad crece al completarlas: campamento, aldea, villa, ciudad amurallada y reino glorioso.</p>
      <RealmMap state={state} onSelect={showKingdom} />
      <section className="panel" data-tour="kingdom-add">
        <form className="quick-add inline" onSubmit={submit}>
          <input id="new-kingdom" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Fundar un reino (ej. Reino de la Programación)" maxLength={50} aria-label="Nombre del nuevo reino" />
          <button type="submit" className="primary" disabled={!name.trim()}>Fundar</button>
        </form>
      </section>
      {state.kingdoms.length === 0 && <p className="empty">Aún no has fundado ningún reino.</p>}
      {state.kingdoms.map((k) => (
        <KingdomCard key={k.id} game={game} kingdomId={k.id} focusQuest={focusQuest} />
      ))}
    </div>
  );
}

function KingdomCard({ game, kingdomId, focusQuest }: { game: Game; kingdomId: string; focusQuest: (q: Quest) => void }) {
  const { state, act } = game;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId)!;
  const p = kingdomProgress(state, kingdomId);
  const all = buildings(state, kingdomId).sort((a, b) => a.createdAt - b.createdAt);
  const pending = all.filter((q) => !q.completedAt);
  const built = all.filter((q) => q.completedAt);
  const bonus = kingdomBonus(state, kingdomId);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<QuestType>('side');
  const [custom, setCustom] = useState<CustomValue>({});
  const [open, setOpen] = useState(false);
  const [showBuilt, setShowBuilt] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, questRewards(type, title)) ? custom.rewards : undefined;
    act((s) => addQuest(s, title, type, Date.now(), { kingdomId, xp: custom.xp, rewards }));
    setTitle('');
    setCustom({});
    setOpen(false);
  }
  return (
    <section id={`kingdom-${kingdomId}`} className={p.complete ? 'panel kingdom complete' : 'panel kingdom'} aria-labelledby={`k-${kingdomId}`}>
      <header className="kingdom-head">
        <div>
          <h2 id={`k-${kingdomId}`} className="kingdom-name">{kingdom.name}</h2>
          <p className="kingdom-stage">{p.stage} · {p.built}/{p.total} construcciones{bonus > 0 && ` · tributo +${bonus} 🪙`}</p>
        </div>
        <span className="kingdom-pct mono">{Math.round(p.progress * 100)} %</span>
      </header>
      <CityScene quests={all} progress={p.progress} complete={p.complete} stage={p.stage} icon={p.icon} />
      {pending.length > 0 && (
        <ul className="list">
          {pending.map((q) => (
            <QuestItem
              key={q.id} quest={q}
              onComplete={() => act((s) => completeQuest(s, q.id, Date.now()), CAP_QUEST, questOpts(q))}
              onStart={() => focusQuest(q)}
              onDelete={() => act((s) => deleteQuest(s, q.id))}
              onEdit={(t, v) => act((s) => updateQuest(s, q.id, { title: t, ...v }))}
            />
          ))}
        </ul>
      )}
      {built.length > 0 && (
        <>
          <button className="link" onClick={() => setShowBuilt(!showBuilt)} aria-expanded={showBuilt}>
            {showBuilt ? 'Ocultar' : 'Ver'} lo construido ({built.length})
          </button>
          {showBuilt && (
            <ul className="list">
              {built.map((q) => <QuestItem key={q.id} quest={q} onUndo={() => act((s) => ({ state: undoQuest(s, q.id), xp: 0 }))} />)}
            </ul>
          )}
        </>
      )}
      <form className="quick-add" onSubmit={submit}>
        <input id={`b-${kingdomId}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Nueva construcción (ej. Terminar una calculadora)" maxLength={80} aria-label="Nueva construcción" />
        <div className="quick-add-row">
          <div className="segmented" role="radiogroup" aria-label="Tipo de construcción">
            {BUILDING_TYPES.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={type === t} className={type === t ? 'seg on' : 'seg'} onClick={() => setType(t)}>
                {BUILDINGS[t].icon} {BUILDINGS[t].name} <span className="mono">{XP_RULES.quest[t]}</span>
              </button>
            ))}
          </div>
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={custom.xp !== undefined || custom.rewards !== undefined} />
          <button type="submit" className="primary" disabled={!title.trim()}>Construir</button>
        </div>
        {open && <RewardEditor autoXp={XP_RULES.quest[type]} autoRewards={questRewards(type, title)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.questXp} idPrefix={`b-${kingdomId}`} />}
      </form>
      <ConfirmButton label="Borrar reino" confirmLabel="Sí, borrar (lo construido se conserva)" onConfirm={() => act((s) => deleteKingdom(s, kingdomId))} />
    </section>
  );
}

// ---------- Metas del siguiente avatar ----------

function GoalsPanel({ game, now }: { game: Game; now: number }) {
  const { state, act } = game;
  const next = avatarInfo(state, now).next;
  const [form, setForm] = useState({ name: '', unit: '', start: '', target: '' });
  if (!next) return null;
  const goals = state.goals.filter((g) => g.avatarId === next.id && !g.deadline); // los de 3 meses tienen su panel
  const valid = form.name.trim() && form.start !== '' && form.target !== '' && !Number.isNaN(Number(form.start)) && !Number.isNaN(Number(form.target));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !next) return;
    act((s) => addGoal(s, { name: form.name, unit: form.unit, start: Number(form.start), target: Number(form.target), avatarId: next.id }, Date.now()));
    setForm({ name: '', unit: '', start: '', target: '' });
  }
  return (
    <section className="panel" aria-labelledby="goals-h">
      <header className="panel-head"><h3 id="goals-h">Metas para {next.name}</h3></header>
      <p className="hint">Metas de tu vida real que también exiges para subir de avatar: dinero, peso, personas nuevas…</p>
      {goals.length > 0 && (
        <ul className="list">
          {goals.map((g) => {
            const p = goalProgress(g);
            return (
              <li key={g.id} className={p >= 1 ? 'item goal done-goal' : 'item goal'}>
                <div className="item-body">
                  <span className="item-title">{g.name}</span>
                  <div className="attr-bar"><div style={{ width: `${p * 100}%` }} /></div>
                  <span className="mono muted small-text">{formatAttrXp(g.current)} / {formatAttrXp(g.target)} {g.unit} · {Math.floor(p * 100)} %</span>
                </div>
                <div className="item-actions goal-actions">
                  <input
                    type="number" step="any" className="goal-input" aria-label={`Valor actual de ${g.name}`}
                    value={g.current}
                    onChange={(e) => e.target.value !== '' && act((s) => updateGoal(s, g.id, Number(e.target.value)))}
                  />
                  <button className="ghost small" onClick={() => act((s) => updateGoal(s, g.id, g.current + (g.target >= g.start ? 1 : -1)))}>
                    {g.target >= g.start ? '+1' : '−1'}
                  </button>
                  <button className="icon-btn" onClick={() => act((s) => deleteGoal(s, g.id))} aria-label={`Borrar ${g.name}`}>×</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="goal-form" onSubmit={submit}>
        <input id="goal-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Meta (ej. Hablar con desconocidos)" maxLength={60} aria-label="Nombre de la meta" />
        <input id="goal-start" type="number" step="any" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} placeholder="Ahora" aria-label="Valor actual" />
        <input id="goal-target" type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="Objetivo" aria-label="Objetivo" />
        <input id="goal-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unidad (€, kg…)" maxLength={12} aria-label="Unidad" />
        <button type="submit" className="primary" disabled={!valid}>Añadir</button>
      </form>
    </section>
  );
}
