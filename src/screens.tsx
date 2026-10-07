import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { useGame } from './store';
import type { DeepWorkArea, FocusPhase, Quest, QuestType } from './types';
import { addGoal, avatarInfo, DEEP_WORK_AREA_HINT, deepWorkRewards, inferDeepWorkArea, deleteGoal, formatAttrXp, goalProgress, habitRewards, questRewards, updateGoal } from './attributes';
import { CustomizeToggle, RewardEditor, sameRewards, type CustomValue } from './customize';
import { addKingdom, BUILDINGS, buildings, deleteKingdom, kingdomName, kingdomProgress, nextStage } from './kingdoms';
import { CityScene } from './city';
import { kingdomBonus } from './economy';
import { RealmMap } from './realm';
import { AmbientPanel } from './ambient-ui';
import { WeeklyChronicle } from './settings';
import { HeroPath } from './heropath';
import { useCloud } from './cloud';
import { sfx } from './sfx';
import { XpChart } from './charts';
import {
  addHabit, addQuest, cancelTimer, CUSTOM_LIMITS, updateHabit, updateQuest, completeQuest, createProfile, dayKey, deepWorkMinutesOnDay,
  deleteHabit, deleteQuest, focusPercent, habitStreakDays, isHabitDone, levelInfo, pendingQuests, setQuestDeadline, setPhase, timerTotals,
  pomodoroStatus, pomodoroStep, startTimer, stopTimer, suggest, toggleHabit, totalXp, undoQuest, xpOnDay, XP_RULES,
} from './game';
import {
  AttributeList, AvatarCard, ConfirmButton, formatClock, formatMinutes, HabitItem, LevelBar, QuestItem,
  QuickAddQuest, RewardTags, useNow,
} from './ui';
import { HeroJournal, ReviewBanner, TimedGoals } from './ritual';
import { QuestCalendar } from './calendar';
import { AvatarPortrait, initialOf } from './portrait';
import { DayClose, MetricsPanel, UpcomingEvents } from './life-ui';
import { AchievementsPanel } from './achievements-ui';
import { latestMetric, logMetric } from './life';

export type Game = ReturnType<typeof useGame>;
export type Tab = 'hoy' | 'misiones' | 'reinos' | 'arena' | 'gremios' | 'amigos' | 'deepwork' | 'habitos' | 'personaje' | 'ajustes';

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
  const pending = pendingQuests(state, now);
  const doneToday = state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === today);
  const habitsDone = state.habits.filter((h) => isHabitDone(state, h.id, today)).length;
  const s = suggest(state, now);

  return (
    <div className="screen">
      <WeeklyChronicle game={game} guide={guide} now={now} go={go} />
      <ReviewBanner state={state} now={now} guide={guide} />
      <UpcomingEvents state={state} now={now} />
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
                <QuestItem key={q.id} quest={q} kingdom={kingdomName(state, q.kingdomId)} onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), CAP_QUEST, questOpts(q))} onStart={() => focusQuest(q)} onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))} />
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

      <DayClose game={game} now={now} />

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

const VIEW_KEY = 'excelsior:quests-view';

export function Quests({ game, focusQuest }: { game: Game; focusQuest: (q: Quest) => void }) {
  const { state, act } = game;
  const now = useNow(60_000);
  const pending = pendingQuests(state, now);
  const done = state.quests.filter((q) => q.completedAt).sort((a, b) => b.completedAt! - a.completedAt!).slice(0, 15);
  const [view, setView] = useState<'list' | 'calendar'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list';
    } catch {
      return 'list';
    }
  });
  function pickView(v: 'list' | 'calendar') {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignorado */
    }
  }
  const toggle = (
    <div className="segmented view-toggle" role="radiogroup" aria-label="Vista de misiones">
      {(['list', 'calendar'] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'seg on' : 'seg'} onClick={() => pickView(v)}>
          {v === 'list' ? '☰ Lista' : '📅 Calendario'}
        </button>
      ))}
    </div>
  );
  if (view === 'calendar') {
    return (
      <div className="screen">
        <div className="title-row"><h1 className="screen-title">Misiones</h1>{toggle}</div>
        <QuestCalendar game={game} now={now} focusQuest={focusQuest} capNote={CAP_QUEST} questOpts={questOpts} />
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="title-row"><h1 className="screen-title">Misiones</h1>{toggle}</div>
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
                onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
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


interface SessionResult {
  minutes: number;
  xp: number;
  questId: string | null;
  label: string;
  breakMinutes: number;
  distractionMinutes: number;
  distractions: number;
  focusPct: number;
  area: DeepWorkArea;
}

const POMO_KEY = 'excelsior:pomodoro';
const POMODOROS = [{ focus: 50, rest: 10 }, { focus: 90, rest: 30 }];

const PHASE_LABEL = { focus: 'Foco', break: 'Descanso', distraction: 'Distracción' } as const;

export function DeepWork({ game, preselect, clearPreselect }: { game: Game; preselect: string | null; clearPreselect: () => void }) {
  const { state, act } = game;
  const now = useNow(250);
  const [questId, setQuestId] = useState<string | null>(preselect);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [intent, setIntent] = useState('');
  const [pomo, setPomo] = useState(() => {
    try {
      return localStorage.getItem(POMO_KEY) === '90' ? 1 : 0;
    } catch {
      return 0;
    }
  });
  function pickPomo(i: number) {
    setPomo(i);
    try {
      localStorage.setItem(POMO_KEY, String(POMODOROS[i].focus));
    } catch {
      /* ignorado */
    }
  }
  const today = dayKey(now);
  const sessionsToday = state.sessions.filter((x) => dayKey(x.endedAt) === today).reverse();
  const timer = state.activeTimer;
  const linkedQuest = questId ? state.quests.find((q) => q.id === questId && !q.completedAt) : null;
  const finishing = useRef(false);

  function start(pomodoro?: { focus: number; rest: number }) {
    act((s) => startTimer(s, linkedQuest?.id ?? null, 0, Date.now(), { intent, pomodoro }));
    sfx.start();
    setResult(null);
    setIntent('');
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
          distractionMinutes: x.distractionMinutes ?? 0, distractions: x.distractions ?? 0, focusPct: x.focusPct ?? 100, area: x.area,
        }
        : { minutes: 0, xp: 0, questId: null, label: '', breakMinutes: 0, distractionMinutes: 0, distractions: 0, focusPct: 100, area: 'general' });
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
  const pomoSt = timer ? pomodoroStatus(timer, now) : null;
  const restOver = pomoSt?.restLeft === 0;

  // Cuenta atrás (sesiones antiguas con minutos): al llegar a 0 de foco, suena y se registra sola.
  useEffect(() => {
    if (timer && totals && targetMs > 0 && totals.focusMs >= targetMs && !finishing.current) {
      finishing.current = true;
      sfx.done();
      stop();
    }
  });
  // Pomodoro: al acabar el foco, suena y empieza el descanso; al acabar el descanso, avisa.
  useEffect(() => {
    if (pomoSt && totals?.phase === 'focus' && pomoSt.focusLeft === 0) {
      act((s) => pomodoroStep(s, Date.now()));
      sfx.done();
    }
  });
  const restAlarm = useRef(false);
  useEffect(() => {
    if (restOver && !restAlarm.current) sfx.focus();
    restAlarm.current = restOver;
  }, [restOver]);

  if (timer && totals) {
    const countdown = targetMs > 0;
    const pomoMs = timer.pomodoro ? timer.pomodoro.focus * 60_000 : 0;
    const resting = pomoSt?.restLeft != null;
    let shown = countdown ? Math.max(0, targetMs - totals.focusMs) : totals.focusMs;
    let progress = countdown ? Math.min(1, totals.focusMs / targetMs) : (totals.focusMs % 60000) / 60000;
    if (pomoSt) {
      shown = resting ? pomoSt.restLeft! : pomoSt.focusLeft;
      progress = resting ? 1 - pomoSt.restLeft! / timer.restMs! : 1 - pomoSt.focusLeft / pomoMs;
    }
    const eyebrow = timer.pomodoro
      ? `Pomodoro ${pomoSt!.done + (resting ? 0 : 1)} · ${timer.pomodoro.focus}/${timer.pomodoro.rest}`
      : countdown ? `Cuenta atrás · ${timer.targetMinutes} min` : 'Sesión libre';
    const title = timer.questId ? state.quests.find((q) => q.id === timer.questId)?.title : timer.intent;
    const pct = focusPercent(totals.focusMs, totals.distractionMs);
    const R = 120;
    const C = 2 * Math.PI * R;
    return (
      <div className={`screen focus-screen phase-${totals.phase}`}>
        <p className="eyebrow">{eyebrow}</p>
        {title && <h1 className="focus-label">{title}</h1>}
        {timer.pomodoro && (
          <div className="pomo-dots" aria-label={`${pomoSt!.done} pomodoros completados`}>
            {Array.from({ length: Math.max(3, pomoSt!.done + 1) }, (_, i) => <i key={i} className={i < pomoSt!.done ? 'on' : ''} />)}
          </div>
        )}
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
            <span className="phase-pill">{resting ? (pomoSt!.restLeft === 0 ? 'Descanso terminado' : 'Descanso') : PHASE_LABEL[totals.phase]}</span>
            <span className="ring-time mono">{formatClock(shown)}</span>
            <span className="ring-sub">{resting ? 'de descanso' : countdown || pomoSt ? 'quedan de foco' : 'de foco'} · +{Math.floor(totals.focusMs / 60000)} XP</span>
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
            <button className="primary big" onClick={() => phase('focus')}>{resting ? '▶ Siguiente pomodoro' : '▶ Volver al foco'}</button>
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
              <p className="now-sub">{result.label} <RewardTags rewards={deepWorkRewards(result.minutes, result.area)} /></p>
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

      {!linkedQuest && (
        <label className="dw-intent">
          <span>¿Qué vas a hacer en esta sesión? <span className="muted">(opcional)</span></span>
          <input id="dw-intent" value={intent} onChange={(e) => setIntent(e.target.value)} maxLength={80} placeholder="Ej. Ejercicios de derivadas, leer el tema 4…" />
        </label>
      )}
      <p className="mono muted small-text dw-area">Sube {DEEP_WORK_AREA_HINT[inferDeepWorkArea(linkedQuest?.title ?? intent)]} y ⚔️ Voluntad</p>

      <div className="modes" data-tour="modes">
        <button className="mode-card" onClick={() => start()}>
          <span className="mode-icon" aria-hidden="true">⏱</span>
          <span className="mode-title">Sesión libre</span>
          <span className="mode-sub">Cronómetro. Paras cuando quieras.</span>
        </button>
        <div className="mode-card as-div">
          <span className="mode-icon" aria-hidden="true">🍅</span>
          <span className="mode-title">Pomodoro</span>
          <div className="segmented" role="radiogroup" aria-label="Pomodoro: foco y descanso">
            {POMODOROS.map((p, i) => (
              <button key={p.focus} role="radio" aria-checked={pomo === i} className={pomo === i ? 'seg on' : 'seg'} onClick={() => pickPomo(i)}>
                {p.focus} / {p.rest}
              </button>
            ))}
          </div>
          <span className="mode-sub">Bloques largos para entrar en flow: {POMODOROS[pomo].focus} min de foco y {POMODOROS[pomo].rest} de descanso.</span>
          <button className="primary wide" onClick={() => start(POMODOROS[pomo])}>▶ Empezar Pomodoro</button>
        </div>
      </div>
      <AmbientPanel />
      <p className="hint">Durante la sesión puedes marcar Descanso o Me distraje. Solo el foco da 1 XP por minuto. Si dices qué vas a hacer, lo práctico (ejercicios, programar, crear) sube Maestría y lo teórico (estudiar, leer, repasar) sube Sabiduría; si no, un poco de las dos. Siempre sube algo de Voluntad. Foco real = foco ÷ (foco + distracción) × 100.</p>

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
  const [perWeek, setPerWeek] = useState(7); // 7 = cada día
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, habitRewards(name)) ? custom.rewards : undefined;
    act((s) => addHabit(s, name, Date.now(), { xp: custom.xp, rewards, perWeek }));
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
          <input id="new-habit" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Nuevo hábito (ej. Leer 10 páginas)" maxLength={60} aria-label="Nombre del nuevo hábito" />
          <select id="new-habit-freq" className="freq-select" value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))} aria-label="Frecuencia">
            <option value={7}>Cada día</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'vez' : 'veces'} por semana</option>)}
          </select>
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={custom.xp !== undefined || custom.rewards !== undefined} />
          <button type="submit" className="primary" disabled={!name.trim()}>Añadir</button>
        </form>
        {open && <RewardEditor autoXp={XP_RULES.habit} autoRewards={habitRewards(name)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.habitXp} idPrefix="new-habit" />}
        <p className="hint">+{XP_RULES.habit} XP cada vez que lo completes. Los diarios hacen racha de días; los de «N veces por semana», racha de semanas cumplidas (de lunes a domingo). Los puntos son los últimos 7 días.</p>
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
  const avatar = avatarInfo(state, now);
  const dwTotal = state.sessions.reduce((n, x) => n + x.minutes, 0);
  const questsDone = state.quests.filter((q) => q.completedAt).length;
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, habitStreakDays(state, h.id, now)), 0);
  const activeDays = new Set(state.xp.map((t) => dayKey(t.at))).size;
  const history = [...state.xp].reverse().slice(0, 15);
  const SOURCE = { quest: 'Misión', habit: 'Hábito', deepwork: 'Deep Work', admin: 'Admin', guild: 'Gremio' } as const;

  return (
    <div className="screen">
      <h1 className="screen-title">Personaje</h1>
      <section className="panel hero-card">
        <div className="hero-portrait">
          <AvatarPortrait tier={avatar.index} photo={state.profile?.photo} label={initialOf(state.profile?.name)} size={132} title={`Aro de ${avatar.current.name}`} />
          <span className="hero-level mono" aria-label={`Nivel ${info.level}`}>{info.level}</span>
        </div>
        <div className="stack tight">
          <h2 className="hero-name">{state.profile?.name}</h2>
          <p className="hero-title">{avatar.current.icon} {avatar.current.name} · Nivel global {info.level}</p>
          <p className="muted">{xp} XP global en total</p>
        </div>
        <LevelBar state={state} compact />
      </section>

      <HeroPath state={state} now={now} />

      <section className="panel" aria-labelledby="attrs-detail-h" data-tour="attrs">
        <h3 id="attrs-detail-h">Atributos</h3>
        <AttributeList state={state} detailed />
      </section>

      <XpChart state={state} now={now} />

      <AvatarCard state={state} now={now} showRequirements />

      <section className="stats" aria-label="Progreso acumulado">
        <Stat label="Deep Work total" value={formatMinutes(dwTotal)} />
        <Stat label="Misiones completadas" value={`${questsDone}`} />
        <Stat label="Mejor racha activa" value={`${bestStreak} d`} />
        <Stat label="Días con progreso" value={`${activeDays}`} />
      </section>

      <MetricsPanel game={game} />

      <TimedGoals game={game} />

      <GoalsPanel game={game} now={now} />

      <HeroJournal state={state} />

      <AchievementsPanel state={state} now={now} />

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
          <p className="kingdom-stage">{p.icon} {p.stage} · {p.built}/{p.total} construcciones{bonus > 0 && ` · tributo +${bonus} 🪙`}</p>
          <p className="muted small-text">{(() => { const n = nextStage(p.built); return n ? `${n.icon} ${n.name} con ${n.missing} ${n.missing === 1 ? 'construcción' : 'construcciones'} más` : 'Tu reino ya es glorioso. Cada construcción nueva lo hace aún más grande.'; })()}</p>
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
  const [form, setForm] = useState({ name: '', unit: '', start: '', target: '', metricId: '' });
  const metrics = state.metrics ?? [];
  const pickMetric = (id: string) => {
    const m = metrics.find((x) => x.id === id);
    if (!m) return setForm({ ...form, metricId: '' });
    const last = latestMetric(state, id);
    setForm({ ...form, metricId: id, name: form.name || m.name, unit: m.unit, start: last !== null ? String(last) : form.start });
  };
  if (!next) return null;
  const goals = state.goals.filter((g) => g.avatarId === next.id && !g.deadline); // los de 3 meses tienen su panel
  const valid = form.name.trim() && form.start !== '' && form.target !== '' && !Number.isNaN(Number(form.start)) && !Number.isNaN(Number(form.target));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !next) return;
    act((s) => addGoal(s, { name: form.name, unit: form.unit, start: Number(form.start), target: Number(form.target), avatarId: next.id, metricId: form.metricId || undefined }, Date.now()));
    setForm({ name: '', unit: '', start: '', target: '', metricId: '' });
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
                  <span className="mono muted small-text">{formatAttrXp(g.current)} / {formatAttrXp(g.target)} {g.unit} · {Math.floor(p * 100)} %{g.metricId ? ' · sigue tu medida' : ''}</span>
                </div>
                <div className="item-actions goal-actions">
                  <input
                    type="number" step="any" className="goal-input" aria-label={`Valor actual de ${g.name}`}
                    value={g.current}
                    onChange={(e) => e.target.value !== '' && act((s) => (g.metricId ? logMetric(s, g.metricId, Number(e.target.value), Date.now()) : updateGoal(s, g.id, Number(e.target.value))))}
                  />
                  <button className="ghost small" onClick={() => act((s) => (g.metricId ? logMetric(s, g.metricId, g.current + (g.target >= g.start ? 1 : -1), Date.now()) : updateGoal(s, g.id, g.current + (g.target >= g.start ? 1 : -1))))}>
                    {g.target >= g.start ? '+1' : '−1'}
                  </button>
                  <button className="icon-btn" onClick={() => act((s) => deleteGoal(s, g.id))} aria-label={`Borrar ${g.name}`}>×</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {metrics.length > 0 && (
        <label className="goal-metric small-text muted">
          Seguir una medida de «Tu estado actual»:
          <select id="goal-metric" className="freq-select" value={form.metricId} onChange={(e) => pickMetric(e.target.value)}>
            <option value="">Ninguna (la actualizo a mano)</option>
            {metrics.map((m) => <option key={m.id} value={m.id}>📈 {m.name}</option>)}
          </select>
        </label>
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
