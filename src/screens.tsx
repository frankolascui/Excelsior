import { useEffect, useRef, useState, type FormEvent } from 'react';
import { sureThen } from './confirm';
import type { useGame } from './store';
import type { AttributeId, DeepWorkArea, FocusPhase, GameState, Impact, Quest, QuestType } from './types';
import { addGoal, attributeDef, avatarInfo, DEEP_WORK_AREA_HINT, deepWorkRewards, inferDeepWorkArea, deleteGoal, formatAttrXp, goalProgress, habitRewards, questRewards, updateGoal } from './attributes';
import { CustomizeToggle, RewardEditor, sameRewards, type CustomValue } from './customize';
import { addKingdom, citiesOf, realms, BUILDING_CHOICES, BUILDING_OF, buildings, guessBuildingAttr, KIND_INFO, closeKingdom, deleteKingdom, kingdomIdleDays, kingdomName, kingdomProgress, nextStage, renameKingdom, reopenKingdom, setKingdomDeadline, STALE_KINGDOM_DAYS } from './kingdoms';
import { DatePicker, ImpactPicker, Select } from './pickers';
import { CityScene } from './city';
import { kingdomBonus, spendShield } from './economy';
import { RealmMap } from './realm';
import { HealthKingdom } from './health-ui';
import { healthFounded } from './health';
import { SleepClockCard } from './health-diary-ui';
import { HEALTH_KINGDOM, navState, openSystemHabit } from './nav-state';
import { AmbientPanel } from './ambient-ui';
import { WeeklyChronicle } from './settings';
import { HeroPath } from './heropath';
import { useCloud } from './cloud';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { XpChart } from './charts';
import {
  addHabit, addQuest, IMPACT_TYPE, cancelTimer, CUSTOM_LIMITS, maxPerWeek, updateHabit, updateQuest, completeQuest, createProfile, dayKey, deepWorkMinutesOnDay,
  deleteHabit, deleteQuest, focusPercent, habitStreakDays, levelInfo, pendingQuests, scheduledQuests, setQuestDeadline, setQuestRepeat, setPhase, timerTotals,
  pomodoroStatus, pomodoroStep, startTimer, stopTimer, suggest, questXp, PRIORITY_BONUS, impactOf, toggleHabit, setHabitDayCount, habitCleared, habitsInOrder, reorderHabits, totalXp, undoQuest, XP_RULES,
} from './game';
import {
  AttributeList, AvatarCard, ConfirmButton, deadlineLabel, formatClock, shortDate, formatMinutes, HabitItem, LevelBar, QuestItem,
  QuickAddQuest, RewardTags, useHabitFlip, useNow,
} from './ui';
import { HeroJournal, ReviewBanner, TimedGoals } from './ritual';
import { QuestCalendar } from './calendar';
import { AvatarPortrait, initialOf } from './portrait';
import { DayClose, UpcomingEvents } from './life-ui';
import { RemindersPanel } from './agenda-ui';
import { AchievementsPanel } from './achievements-ui';
import { Inventory } from './inventory';
import { Icon } from './icons';
import { TodayStrip } from './today';
import { QuestNode } from './tree-ui';
import { effectiveDeadline, pathLabel } from './tree';
import { addSubQuest, rootsInOrder, splitIntoSessions } from './tree-actions';
import { SessionEdit } from './session-ui';
import { RateDialog, SessionRating } from './productivity-ui';
import { formatHours, productivityWeek, sessionProductivity } from './productivity';
import { QuestTemplates } from './templates-ui';
import { LadderPanel } from './ladder-ui';
import { DragHandle, draftToProgression, HabitHints, MinimumInput, PerDayInput, ProgressionInput, progressionDraft, RetiredHabits, weekShareText, type ProgressionDraft } from './habits-ui';
import { atMax, levelUp, restoreHabit, retireHabit, setProgression, snoozeHint } from './progression';
import { InfoTip } from './infotip';
import { QuestHistory } from './quest-history';
import { CleanupPanel, PriorityPicker, TomorrowPanel } from './priorities-ui';
import { currentChange, weekFocus } from './review';
import { RitualCTA } from './ritual';
import { IMPACTS, priorityIds, priorityQuests, pushToTomorrow, setQuestImpact } from './priorities';
import { ACHIEVEMENTS } from './achievements';

export type Game = ReturnType<typeof useGame>;

/** Partir una misión: submisiones a mano o sesiones repartidas hasta su fecha. */
function treeActions(act: Game['act'], questId: string) {
  return {
    onAddChild: (t: string) => act((st) => addSubQuest(st, questId, t, Date.now())),
    onSplit: (n: number) => act((st) => splitIntoSessions(st, questId, n, Date.now())),
  };
}
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
        {!cloud.email && onBack && <button type="button" className="link" onClick={onBack}><Icon name="arrow-left" /> Entrar con email en vez de como invitado</button>}
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
  const s = suggest(state, now);
  const fresh = totalXp(state) === 0; // partida nueva: se esconde lo que aún estaría vacío
  const prio = priorityIds(state, today);
  const prioQs = priorityQuests(state, today);
  const prioDone = prioQs.filter((q) => q.completedAt).length;
  const [picking, setPicking] = useState(false);
  const habitList = useHabitFlip<HTMLUListElement>();
  const hero = s.kind === 'quest' ? s.quest : null;
  const heroIsPrio = !!hero && prio.includes(hero.id);
  const heroPath = hero ? pathLabel(state, hero) : '';
  const heroDue = hero ? effectiveDeadline(state, hero) : undefined;
  // el resto de «Las 3 de hoy» va debajo de la principal; las demás misiones, en Misiones
  const restPrio = prioQs.filter((q) => q.id !== hero?.id);
  const more = pending.filter((q) => q.id !== hero?.id && !prio.includes(q.id)).length;
  const focus = weekFocus(state, now);
  const change = currentChange(state, now);
  const complete = (q: Quest) => act((st) => completeQuest(st, q.id, Date.now()), CAP_QUEST, questOpts(q));
  // «Pasar a mañana»: sale de Las 3 de hoy y entra en las de mañana (si mañana aún tiene hueco)
  const toTomorrow = (q: Quest) => {
    if (!pushToTomorrow(state, q.id, Date.now()).ok) { game.toast('Mañana ya tiene 3 prioridades. Cámbialas en Misiones → Mañana.', 'info'); return; }
    act((st) => pushToTomorrow(st, q.id, Date.now()).state);
    game.toast('Pasada a mañana', 'info');
  };

  return (
    <div className="screen">
      {!fresh && <TodayStrip state={state} now={now} />}
      <WeeklyChronicle game={game} guide={guide} now={now} go={go} />
      <ReviewBanner state={state} now={now} guide={guide} />
      <UpcomingEvents state={state} now={now} />
      <section className="now" aria-labelledby="now-h" data-tour="now">
        <div className="now-top">
          <p className="eyebrow" id="now-h">
            {heroIsPrio && !picking ? <><Icon name="flag" /> Las 3 de hoy · {prioDone}/{prioQs.length}</> : '¿Qué hago ahora?'}
          </p>
          {prioQs.length > 0 && !picking && <button className="link" onClick={() => setPicking(true)}>Cambiar</button>}
        </div>
        {picking ? (
          <PriorityPicker game={game} day={today} onDone={() => setPicking(false)} compact />
        ) : (
          <>
            {s.kind === 'timer' && (
              <>
                <h2>Tienes una sesión de foco en marcha.</h2>
                <button className="primary big" onClick={() => go('deepwork')}>Volver al temporizador</button>
              </>
            )}
            {hero && (
              <>
                {heroPath && <p className="now-path">{heroPath}</p>}
                <h2>{hero.title}</h2>
                <p className="now-sub">
                  Impacto {IMPACTS.find((x) => x.id === impactOf(hero))!.name.toLowerCase()} · 
                  +{questXp(hero)} XP{heroDue && <> · {deadlineLabel(heroDue, now).text}</>}
                </p>
                <div className="row now-actions">
                  <button className="primary big" onClick={() => focusQuest(hero)}><Icon name="play" /> Empezar Deep Work</button>
                  <button className="secondary big" onClick={() => complete(hero)}><Icon name="check" /> Ya la terminé</button>
                </div>
                {heroIsPrio && <button className="link small now-push" onClick={() => toTomorrow(hero)}><Icon name="sunrise" /> Hoy no llego: pasar a mañana</button>}
              </>
            )}
            {s.kind === 'habit' && (
              <>
                <h2>Hábito pendiente: {s.name}</h2>
                <div className="row">
                  {(() => {
                    const sys = state.habits.find((h) => h.id === s.habitId)?.system;
                    return sys
                      ? <button className="primary big" onClick={() => openSystemHabit(sys)}><Icon name="arrow-right" /> {sys === 'health' ? 'Apuntarla ahora' : 'Repasar ahora'}</button>
                      : <button className="primary big" onClick={() => act((st) => toggleHabit(st, s.habitId, Date.now()), CAP_HABIT, { sound: 'habit' })}><Icon name="check" /> Hecho</button>;
                  })()}
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
                <div className="row">
                  <button className="primary big" onClick={() => focusQuest(null)}><Icon name="play" /> Deep Work libre</button>
                </div>
              </>
            )}
            {restPrio.length > 0 && (
              <ol className="top3-list now-rest">
                {restPrio.map((q) => (
                  <li key={q.id} className={q.completedAt ? 'done' : ''}>
                    {q.completedAt
                      ? <span className="check checked" aria-hidden="true">✓</span>
                      : <button className="check" aria-label={`Completar ${q.title}`} title="Completar misión" onClick={() => complete(q)}>✓</button>}
                    <span className="top3-title">{pathLabel(state, q) && <span className="item-path">{pathLabel(state, q)}</span>}{q.title}</span>
                    {!q.completedAt && <button className="ghost small push-btn" onClick={() => toTomorrow(q)} aria-label={`Pasar a mañana ${q.title}`} title="Pasar a mañana"><Icon name="sunrise" /><span className="push-label"> Mañana</span></button>}
                    {!q.completedAt && <button className="ghost small" onClick={() => focusQuest(q)} title="Hacer Deep Work en esta misión"><Icon name="play" /> Foco</button>}
                  </li>
                ))}
              </ol>
            )}
            {prioQs.length === 3 && prioDone === 3 && <p className="now-note"><Icon name="check" /> Las 3 de hoy, hechas: +{PRIORITY_BONUS} XP.</p>}
            {s.kind !== 'create' && (
              <div className="now-foot">
                {prioQs.length === 0 && pending.length > 0 && <button className="link" onClick={() => setPicking(true)}><Icon name="flag" /> Elegir las 3 de hoy</button>}
                {more > 0 && <button className="link" onClick={() => go('misiones')}>{more} {more === 1 ? 'misión más' : 'misiones más'} <Icon name="arrow-right" /></button>}
                <QuickCapture onAdd={(t) => act((st) => addQuest(st, t, 'daily', Date.now()))} />
              </div>
            )}
            {(focus || change) && (
              <div className="now-week">
                {focus && <p className="top3-change"><Icon name="target" /> Lo importante de la semana: <em>{focus}</em></p>}
                {change && <p className="top3-change"><Icon name="sparkles" /> Esta semana pruebas: <em>{change}</em></p>}
              </div>
            )}
          </>
        )}
      </section>

      {healthFounded(state) && <SleepClockCard onRecord={() => openSystemHabit('health')} />}

      <div className={state.habits.length > 0 ? 'columns' : 'columns one'}>
        <div className="col-stack">
        {(pending.length > 0 || !fresh) && <TomorrowPanel game={game} now={now} />}
        <RemindersPanel game={game} now={now} />
        {/* en escritorio llena el hueco bajo los recordatorios; en el móvil baja tras los hábitos (CSS) */}
        {!fresh && <div className="today-dayclose"><DayClose game={game} now={now} /></div>}
        </div>

        {state.habits.length > 0 && <section className="panel today-habits">
          <header className="panel-head">
            <h3>Hábitos de hoy</h3>
            <button className="link" onClick={() => go('habitos')}>Gestionar <Icon name="arrow-right" /></button>
          </header>
          <ul className="list" ref={habitList}>
            {habitsInOrder(state, now).map((h) => (
              <HabitItem key={h.id} state={state} habit={h} now={now} compact onToggle={() => act((st) => toggleHabit(st, h.id, Date.now()), CAP_HABIT, { sound: 'habit' })}
                onSetCount={(n) => act((st) => setHabitDayCount(st, h.id, n, Date.now()), CAP_HABIT, { sound: 'habit' })}
                onToggleDay={(d) => act((st) => toggleHabit(st, h.id, Date.now(), d), CAP_HABIT, { sound: 'habit' })} onShield={(d) => spendHabitShield(game, h.id, d)} />
            ))}
          </ul>
        </section>}
      </div>

      {!fresh && <HeroLine state={state} now={now} onOpen={() => go('personaje')} />}
    </div>
  );
}

/** Apuntar una misión en una línea (sin opciones): se completa en Misiones si hace falta. */
function QuickCapture({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <form className="capture" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; onAdd(title); setTitle(''); }}>
      <input id="capture" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="+ Apuntar una misión" aria-label="Apuntar una misión" />
      {title.trim() && <button type="submit" className="primary small"><Icon name="plus" /> Añadir</button>}
    </form>
  );
}

/** Tu personaje en una fila: avatar, nivel y el ritual si toca. El detalle vive en Personaje. */
function HeroLine({ state, now, onOpen }: { state: GameState; now: number; onOpen: () => void }) {
  const a = avatarInfo(state, now);
  const info = levelInfo(totalXp(state));
  return (
    <section className={a.ready ? 'panel hero-line ritual-ready' : 'panel hero-line'} aria-label="Tu personaje" data-tour="avatar">
      <button className="hero-line-main" onClick={onOpen} title="Ver tu personaje">
        <AvatarPortrait tier={a.index} photo={state.profile?.photo} label={initialOf(state.profile?.name)} size={44} title={a.current.name} />
        <span className="hero-line-txt">
          <span className="hero-line-name"><b>{a.current.name}</b> · Nv {info.level}</span>
          <span className="xpbar" aria-hidden="true"><span className="xpbar-fill" style={{ width: `${Math.min(100, info.progress * 100)}%` }} /></span>
          <span className="levelbar-foot mono">{info.current} / {info.needed} XP</span>
        </span>
        <Icon name="arrow-right" />
      </button>
      <RitualCTA state={state} now={now} />
    </section>
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

export function Quests({ game, focusQuest, startFocus }: { game: Game; focusQuest: (q: Quest) => void; startFocus?: (label: string) => void }) {
  const { state, act } = game;
  const now = useNow(60_000);
  const pending = pendingQuests(state, now);
  const roots = rootsInOrder(state, now);
  const scheduled = scheduledQuests(state, now);
  const prio = priorityIds(state, dayKey(now));
  const [showScheduled, setShowScheduled] = useState(false);
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
          {v === 'list' ? <><Icon name="list" /> Lista</> : <><Icon name="calendar" /> Calendario</>}
        </button>
      ))}
    </div>
  );
  const title = (
    <div className="title-row">
      <div className="with-info">
        <h1 className="screen-title">Misiones</h1>
        <InfoTip label="Cómo funcionan las misiones"><p>El impacto decide el orden y el XP: alto (50) mueve de verdad un objetivo, medio (20) ayuda, bajo (15) se podría posponer o eliminar. Con «Misiones prehechas» las añades ya listas.</p></InfoTip>
      </div>
      {toggle}
    </div>
  );
  if (view === 'calendar') {
    return (
      <div className="screen">
        {title}
        <QuestCalendar game={game} now={now} focusQuest={focusQuest} startFocus={startFocus} capNote={CAP_QUEST} questOpts={questOpts} />
      </div>
    );
  }
  return (
    <div className="screen">
      {title}
      <section className="panel" data-tour="quest-add">
        <QuickAddQuest autoFocus onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />
        <QuestTemplates game={game} />
      </section>
      <CleanupPanel game={game} now={now} />
      <TomorrowPanel game={game} now={now} />
      <section className="panel">
        <header className="panel-head"><h3>Pendientes</h3><span className="count mono">{pending.length}</span></header>
        {roots.length === 0 ? <p className="empty">Nada pendiente. Crea una misión arriba.</p> : (
          <ul className="list">
            {roots.map((root) => (
              <QuestNode key={root.id} state={state} quest={root} render={(q, extra) => (
                <QuestItem
                  key={q.id}
                  quest={q}
                  {...extra}
                  kingdom={kingdomName(state, q.kingdomId)}
                  onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), CAP_QUEST, questOpts(q))}
                  onUndo={() => act((st) => undoQuest(st, q.id))}
                  onStart={() => focusQuest(q)}
                  onEdit={(t, v) => act((st) => updateQuest(st, q.id, { title: t, ...v }))}
                  onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
                  onRepeat={q.kingdomId ? undefined : (d) => act((st) => setQuestRepeat(st, q.id, d))}
                  onImpact={(v) => act((st) => setQuestImpact(st, q.id, v))}
                  priority={prio.includes(q.id)}
                  {...treeActions(act, q.id)}
                  onDelete={() => act((st) => deleteQuest(st, q.id))}
                />
              )} />
            ))}
          </ul>
        )}
      </section>
      {scheduled.length > 0 && (
        <section className="panel">
          <header className="panel-head">
            <button className="link" onClick={() => setShowScheduled(!showScheduled)} aria-expanded={showScheduled}><Icon name="repeat" /> Próximas repeticiones ({scheduled.length})</button>
          </header>
          {showScheduled && (
            <>
              <p className="hint">Aparecen en pendientes el día que toca. Bórrala para dejar de repetirla.</p>
              <ul className="list scheduled-list">
                {scheduled.map((q) => (
                  <QuestItem key={q.id} quest={q}
                    onRepeat={(d) => act((st) => setQuestRepeat(st, q.id, d))}
                    onDelete={() => act((st) => deleteQuest(st, q.id))} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <QuestHistory state={state} onUndo={(id) => act((st) => ({ state: undoQuest(st, id), xp: 0 }))} />
    </div>
  );
}

// ---------- Deep Work ----------


interface SessionResult {
  id?: string;
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

export function DeepWork({ game, preselect, presetIntent = '', clearPreselect }: { game: Game; preselect: string | null; presetIntent?: string; clearPreselect: () => void }) {
  const { state, act } = game;
  const now = useNow(250);
  const [questId, setQuestId] = useState<string | null>(preselect);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [intent, setIntent] = useState(presetIntent);
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
      setAsking(x?.id ?? null);
      setResult(x
        ? {
          id: x.id, minutes: x.minutes, xp: r.xp, questId: x.questId, label: x.label, breakMinutes: x.breakMinutes ?? 0,
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
      <div className={`screen dw-screen focus-screen phase-${totals.phase}`}>
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
              <button className="phase-btn rest" onClick={() => phase('break')}><Icon name="coffee" /> Descanso</button>
            </>
          ) : (
            <button className="primary big" onClick={() => phase('focus')}><Icon name="play" /> {resting ? 'Siguiente pomodoro' : 'Volver al foco'}</button>
          )}
        </div>
        <button className="ghost" onClick={stop}><Icon name="stop" /> Terminar sesión</button>
        <ConfirmButton label="Descartar sin guardar" confirmLabel="Sí, descartar" onConfirm={() => act(cancelTimer)} />
        <AmbientPanel />
      </div>
    );
  }

  const week = productivityWeek(state, now);
  const linked = result?.questId ? state.quests.find((q) => q.id === result.questId && !q.completedAt) : null;
  // si corriges o borras la sesión recién guardada, la tarjeta lo refleja
  const live = result?.id ? state.sessions.find((x) => x.id === result.id) : undefined;
  const shown = result && result.id && !live ? null : result && live
    ? {
      ...result, minutes: live.minutes, xp: live.minutes * XP_RULES.deepWorkPerMinute,
      focusPct: live.focusPct ?? 100, distractionMinutes: live.distractionMinutes ?? 0, distractions: live.distractions ?? 0,
    }
    : result;

  return (
    <div className="screen dw-screen">
      {asking && !game.levelUp && <RateDialog game={game} id={asking} onClose={() => setAsking(null)} />}
      <div className="with-info">
        <h1 className="screen-title">Deep Work</h1>
        <InfoTip label="Cómo funciona el Deep Work">
          <p>Durante la sesión puedes marcar Descanso. Al terminar te pregunta si te distrajiste y cuánto: esos minutos se restan del foco. Solo el foco da 1 XP por minuto.</p>
          <p>Si dices qué vas a hacer, lo práctico (ejercicios, programar, crear) sube Maestría y lo teórico (estudiar, leer, repasar) sube Sabiduría; si no, un poco de las dos. Siempre sube algo de Voluntad.</p>
          <p>Foco real = foco ÷ (foco + distracción) × 100.</p>
        </InfoTip>
      </div>

      {result && shown && (
        <section className="panel result" aria-live="polite">
          {result.minutes > 0 ? (
            <>
              <p className="eyebrow">Sesión registrada</p>
              <h2>{formatMinutes(shown.minutes)} de foco · +{shown.xp} XP</h2>
              <div className="focus-stats left">
                <div className={shown.focusPct >= 80 ? 'good' : shown.focusPct >= 60 ? 'mid' : 'bad'}><span className="mono">{shown.focusPct} %</span><span>Foco real</span></div>
                <div><span className="mono">{formatMinutes(shown.breakMinutes)}</span><span>Descanso</span></div>
                <div><span className="mono">{formatMinutes(shown.distractionMinutes)}</span><span>Distracción{shown.distractions ? ` ×${shown.distractions}` : ''}</span></div>
              </div>
              <p className="now-sub">{result.label} <RewardTags rewards={deepWorkRewards(shown.minutes, result.area)} /></p>
              {result.id && asking !== result.id && <SessionRating key={result.id} game={game} id={result.id} />}
              {result.id && (editing === result.id
                ? <SessionEdit game={game} id={result.id} onDone={() => setEditing(null)} />
                : <button className="link session-fix" onClick={() => setEditing(result.id!)}><Icon name="clock" /> ¿Se te olvidó pararlo? Corregir la hora de fin</button>)}
              {linked && (
                <div className="row">
                  <button className="primary" onClick={() => { act((s) => completeQuest(s, linked.id, Date.now()), CAP_QUEST, questOpts(linked)); setResult({ ...result, questId: null }); }}>
                    <Icon name="check" /> Completar «{linked.title}» (+{questXp(linked)} XP)
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
        <p className="linked">Para la misión <strong>{linkedQuest.title}</strong> <button className="link" onClick={() => setQuestId(null)}>Desvincular</button></p>
      )}

      {!linkedQuest && (
        <label className="dw-intent">
          <span>¿Qué vas a hacer en esta sesión? <span className="muted">(opcional)</span></span>
          <input id="dw-intent" value={intent} onChange={(e) => setIntent(e.target.value)} maxLength={80} placeholder="Ej. Ejercicios de derivadas, leer el tema 4…" />
        </label>
      )}
      <p className="mono muted small-text dw-area">Sube {DEEP_WORK_AREA_HINT[inferDeepWorkArea(linkedQuest?.title ?? intent)]} y Voluntad</p>

      <div className="modes" data-tour="modes">
        <button className="mode-card" onClick={() => start()}>
          <span className="mode-icon" aria-hidden="true"><Icon name="timer" /></span>
          <span className="mode-title">Sesión libre</span>
          <span className="mode-sub">Cronómetro. Paras cuando quieras.</span>
        </button>
        <div className="mode-card as-div">
          <span className="mode-icon" aria-hidden="true"><Icon name="repeat" /></span>
          <span className="mode-title">Pomodoro</span>
          <div className="segmented" role="radiogroup" aria-label="Pomodoro: foco y descanso">
            {POMODOROS.map((p, i) => (
              <button key={p.focus} role="radio" aria-checked={pomo === i} className={pomo === i ? 'seg on' : 'seg'} onClick={() => pickPomo(i)}>
                {p.focus} / {p.rest}
              </button>
            ))}
          </div>
          <span className="mode-sub">Bloques largos para entrar en flow: {POMODOROS[pomo].focus} min de foco y {POMODOROS[pomo].rest} de descanso.</span>
          <button className="primary wide" onClick={() => start(POMODOROS[pomo])}><Icon name="play" /> Empezar Pomodoro</button>
        </div>
      </div>
      <AmbientPanel />

      <section className="panel">
        <header className="panel-head"><h3>Sesiones de hoy</h3><span className="count mono">{formatMinutes(deepWorkMinutesOnDay(state, today))}</span></header>
        {week.rated > 0 && <p className="muted small-text">Últimos 7 días: <b className="mono">{formatHours(week.productive)}</b> productivas de {formatHours(week.focus)} valoradas</p>}
        {sessionsToday.length === 0 ? <p className="empty">Todavía ninguna.</p> : (
          <ul className="list plain">
            {sessionsToday.map((x) => (
              <li key={x.id} className={editing === x.id || rating === x.id ? 'session-row editing' : 'row-between session-row'}>
                <span>{x.label}</span>
                <span className="mono muted">
                  {new Date(x.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {formatMinutes(x.minutes)}
                  {x.focusPct !== undefined && ` · ${x.focusPct} % foco`}
                  {x.rating && ` · ${formatHours(sessionProductivity(x)!)} prod.`}
                  {x.measured && ' · corregida'}
                  {editing !== x.id && rating !== x.id && <button className="icon-btn" onClick={() => setRating(x.id)} aria-label={`Valorar ${x.label}`} title={x.rating ? 'Ajustar la valoración' : 'Valorar la sesión'}><Icon name="sliders" /></button>}
                  {editing !== x.id && <button className="icon-btn" onClick={() => setEditing(x.id)} aria-label={`Corregir ${x.label}`} title="Corregir hora de fin"><Icon name="pencil" /></button>}
                </span>
                {editing === x.id && <SessionEdit game={game} id={x.id} onDone={() => setEditing(null)} />}
                {rating === x.id && <SessionRating game={game} id={x.id} start="edit" onDone={() => setRating(null)} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Hábitos ----------

/** Gasta un escudo de racha del cofre en un día fallado. */
function spendHabitShield(game: Game, habitId: string, day: string) {
  const r = spendShield(game.state, habitId, day, Date.now());
  if (!r.ok) return;
  game.act(() => r.state);
  sfx.purchase();
  game.toast('{i:snowflake} Ayer queda congelado: la racha sigue viva.', 'level');
}

const HABITS_IDEAL = { min: 4, max: 7 };

export function Habits({ game, guide }: { game: Game; guide: string }) {
  const { state, act } = game;
  const now = useNow(30_000);
  const [name, setName] = useState('');
  const [custom, setCustom] = useState<CustomValue>({});
  const [open, setOpen] = useState(false);
  const [perWeek, setPerWeek] = useState(7); // 7 = cada día
  const [minimum, setMinimum] = useState('');
  const [prog, setProg] = useState<ProgressionDraft>(() => progressionDraft());
  const [perDay, setPerDay] = useState(1);
  const ordered = habitsInOrder(state, now);
  const habitList = useHabitFlip<HTMLUListElement>();
  const doneIds = new Set(ordered.filter((h) => habitCleared(state, h, now)).map((h) => h.id));
  async function shareWeek() {
    const text = weekShareText(state, Date.now());
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: 'Mi semana en Excelsior', text });
      else { await navigator.clipboard.writeText(text); game.toast('Resumen copiado: pégalo en el chat de tu amigo.', 'info'); }
    } catch { /* cancelado */ }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, habitRewards(name)) ? custom.rewards : undefined;
    const p = draftToProgression(prog, perWeek, perDay);
    act((s) => {
      const next = addHabit(s, name, Date.now(), { xp: custom.xp, rewards, perWeek, minimum, perDay });
      return p ? setProgression(next, next.habits.at(-1)!.id, p, Date.now()) : next;
    });
    setName('');
    setMinimum('');
    setProg(progressionDraft());
    setPerDay(1);
    if (perWeek > 7) setPerWeek(7);
    setCustom({});
    setOpen(false);
    if (state.habits.length + 1 > HABITS_IDEAL.max) game.toast(`Ya llevas ${state.habits.length + 1}. Más de ${HABITS_IDEAL.max} a la vez cuesta sostenerlos: retira uno consolidado cuando puedas.`, 'info');
  }
  return (
    <div className="screen">
      <div className="with-info">
        <h1 className="screen-title">Hábitos</h1>
        <InfoTip label="Cómo funcionan los hábitos">
          <p>+{XP_RULES.habit} XP cada vez que lo completes. Los diarios hacen racha de días; los de «N veces por semana», racha de semanas cumplidas (de lunes a domingo).</p>
          <p>Los puntos son los últimos 7 días: pulsa uno para marcar un día que se te olvidó, o el nombre para ver su historial. Arrastra el asa para ordenarlos.</p>
          <p>Mejor entre {HABITS_IDEAL.min} y {HABITS_IDEAL.max} hábitos a la vez: sostenibles con tu día a día y que de verdad cambien tu productividad o tu bienestar. Cuando uno ya te salga solo, retíralo desde «XP y atributos» y pon en su lugar el siguiente que necesites.</p>
          <p>Manda cada domingo tu % de la semana a un amigo con «Compartir mi semana»: cumplir delante de alguien ayuda.</p>
          <p>Veces al día y sobrecarga progresiva (en «Veces, meta y XP» al crear, o en el botón de ajustes del hábito): ponle una meta que sube poco a poco, como minutos, una hora de dormir o veces por semana. Tras 14 días al 80 % Hiperión te propone subirla. Con un 90 % de constancia en 30 días te dirá que ya lo has automatizado y que puedes retirarlo para centrarte en otro.</p>
        </InfoTip>
      </div>
      <div className="stack-gap" data-tour="habits">
      <HabitHints state={state} now={now} guide={guide}
        onLevel={(id) => {
          const p = levelUp(state, id, Date.now()).habits.find((h) => h.id === id)?.progression;
          act((s) => levelUp(s, id, Date.now()));
          sfx.confirm();
          game.toast(p && atMax(p) ? '{i:trophy} Has llegado a tu meta final. Ahora a mantenerla.' : '{i:trend} Meta subida. Paso a paso.', 'level');
        }}
        onRetire={(id) => { act((s) => retireHabit(s, id, Date.now())); sfx.victory(); confetti({ count: 120 }); game.toast('{i:trophy} Hábito automatizado. A por el siguiente.', 'level'); }}
        onSnooze={(id, kind) => act((s) => snoozeHint(s, id, kind, Date.now()))} />
      <section className="panel">
        <form className="quick-add inline" onSubmit={submit}>
          <input id="new-habit" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Nuevo hábito (ej. Leer 10 páginas)" maxLength={60} aria-label="Nombre del nuevo hábito" />
          <Select id="new-habit-freq" label="Frecuencia" icon="repeat" value={perWeek} onChange={setPerWeek}
            options={[{ value: 7, label: 'Cada día' }, ...Array.from({ length: maxPerWeek(perDay) }, (_, i) => i + 1).filter((n) => n !== 7).map((n) => ({ value: n, label: `${n} ${n === 1 ? 'vez' : 'veces'} por semana` }))]} />
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={custom.xp !== undefined || custom.rewards !== undefined || perDay > 1 || prog.kind !== 'none'} label="Veces, meta y XP" />
          <button type="submit" className="primary" disabled={!name.trim()}><Icon name="plus" /> Añadir</button>
        </form>
        {open && (
          <>
            <PerDayInput id="new-habit-perday" value={perDay} onChange={(n) => { setPerDay(n); if (perWeek > maxPerWeek(n) && perWeek !== 7) setPerWeek(maxPerWeek(n)); }} />
            <ProgressionInput id="new-habit-prog" value={prog} onChange={setProg} perWeek={perWeek} perDay={perDay} />
            <MinimumInput id="new-habit-min" value={minimum} onChange={setMinimum} />
            <RewardEditor autoXp={XP_RULES.habit} autoRewards={habitRewards(name)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.habitXp} idPrefix="new-habit" />
          </>
        )}
      </section>
      <section className="panel">
        {state.habits.length > 0 && (
          <div className="share-week">
            <span className={`habit-count mono${state.habits.length > HABITS_IDEAL.max ? ' over' : ''}`} title="Lo ideal son entre 4 y 7 hábitos a la vez">
              {state.habits.length} {state.habits.length === 1 ? 'hábito' : 'hábitos'} · ideal {HABITS_IDEAL.min}–{HABITS_IDEAL.max}
            </span>
            <button type="button" className="ghost" onClick={shareWeek}><Icon name="send" /> Compartir mi semana</button>
          </div>
        )}
        {state.habits.length === 0 ? (
          <div>
            <p className="empty">Aún no tienes hábitos. Escribe uno arriba o elige alguno:</p>
            <div className="chips">
              {STARTER_HABITS.map((h) => <button key={h} className="pick" onClick={() => act((s) => addHabit(s, h, Date.now()))}><Icon name="plus" /> {h}</button>)}
            </div>
          </div>
        ) : (
          <ul className="list" ref={habitList}>
            {ordered.map((h) => {
              // solo se ordena entre los del mismo grupo (pendientes o ya hechos)
              const group = ordered.filter((x) => doneIds.has(x.id) === doneIds.has(h.id)).map((x) => x.id);
              return (
                <HabitItem key={h.id} state={state} habit={h} now={now} onToggle={() => act((s) => toggleHabit(s, h.id, Date.now()), CAP_HABIT, { sound: 'habit' })}
                  onSetCount={(n) => act((s) => setHabitDayCount(s, h.id, n, Date.now()), CAP_HABIT, { sound: 'habit' })} onToggleDay={(d) => act((s) => toggleHabit(s, h.id, Date.now(), d), CAP_HABIT, { sound: 'habit' })} onDelete={() => act((s) => deleteHabit(s, h.id))} onEdit={(n, v, m, d, pd) => act((s) => {
                  const next = updateHabit(s, h.id, { name: n, ...v, minimum: m, perDay: pd });
                  const hh = next.habits.find((x) => x.id === h.id)!;
                  return setProgression(next, h.id, draftToProgression(d, hh.frequency === 'weekly' ? hh.perWeek ?? 1 : 7, hh.perDay), Date.now());
                })}
                  onShield={(d) => spendHabitShield(game, h.id, d)}
                  onRetire={() => { act((s) => retireHabit(s, h.id, Date.now())); sfx.victory(); game.toast('{i:trophy} Hábito consolidado. Elige el siguiente que quieras desarrollar.', 'level'); }}
                  handle={<DragHandle name={h.name} group={group} onDrop={(order) => act((s) => reorderHabits(s, order))} />} />
              );
            })}
          </ul>
        )}
      </section>
      <LadderPanel state={state} act={act} toast={game.toast} guide={guide} now={now} />
      <RetiredHabits state={state} onRestore={(id) => act((s) => restoreHabit(s, id))} />
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
  const [showAchv, setShowAchv] = useState(false);

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
          <p className="hero-title"><Icon name={avatar.current.icon} /> {avatar.current.name} · Nivel global {info.level}</p>
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

      <button type="button" className="secondary achv-open" aria-expanded={showAchv} onClick={() => setShowAchv(!showAchv)}>
        <Icon name="trophy" /> Logros <span className="mono">{(state.achievements ?? []).length}/{ACHIEVEMENTS.length}</span> <Icon name={showAchv ? 'chevron-down' : 'chevron-right'} />
      </button>
      {showAchv && <AchievementsPanel state={state} now={now} />}

      <TimedGoals game={game} />

      <GoalsPanel game={game} now={now} />

      <HeroJournal state={state} />

      <Inventory game={game} />


    </div>
  );
}

// ---------- Reinos ----------


// Reino abierto: se recuerda al cambiar de pestaña (p. ej. al volver de Deep Work) mientras dure la sesión.
export function Kingdoms({ game, focusQuest }: { game: Game; focusQuest: (q: Quest) => void }) {
  const { state, act } = game;
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(navState.kingdom);
  const open = (id: string | null) => { navState.kingdom = id; setOpenId(id); window.scrollTo({ top: 0 }); };
  const current = state.kingdoms.find((k) => k.id === openId);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const next = addKingdom(state, name, Date.now());
    act(() => next);
    setName('');
    open(next.kingdoms.at(-1)!.id);
  }
  if (openId === HEALTH_KINGDOM) {
    return (
      <div className="screen">
        <div className="kingdom-back">
          <button className="ghost" onClick={() => open(null)}><Icon name="chevron-left" /> Mapa del reino</button>
          {state.kingdoms.length > 0 && (
            <div className="kingdom-tabs" role="tablist" aria-label="Tus reinos">
              <button type="button" role="tab" aria-selected className="chip-btn on"><Icon name="caduceus" /> Salud</button>
              {realms(state).map((k) => (
                <button key={k.id} type="button" role="tab" aria-selected={false} className="chip-btn" onClick={() => open(k.id)}>{k.name}</button>
              ))}
            </div>
          )}
        </div>
        <HealthKingdom game={game} />
      </div>
    );
  }
  if (current?.parentId) {
    // Una ciudad: su escena y sus construcciones; arriba, la vuelta a su reino y sus ciudades hermanas.
    const realm = state.kingdoms.find((k) => k.id === current.parentId);
    const siblings = realm ? citiesOf(state, realm.id) : [];
    return (
      <div className="screen">
        <div className="kingdom-back">
          <button className="ghost" onClick={() => open(realm?.id ?? null)}><Icon name="chevron-left" /> {realm?.name ?? 'Mapa del reino'}</button>
          {siblings.length > 1 && (
            <div className="kingdom-tabs" role="tablist" aria-label={`Ciudades de ${realm?.name ?? 'este reino'}`}>
              {siblings.map((k) => (
                <button key={k.id} type="button" role="tab" aria-selected={k.id === current.id} className={k.id === current.id ? 'chip-btn on' : 'chip-btn'} onClick={() => open(k.id)}>{k.name}</button>
              ))}
            </div>
          )}
        </div>
        <KingdomCard key={current.id} game={game} kingdomId={current.id} focusQuest={focusQuest} />
      </div>
    );
  }
  if (current) {
    // Un reino: su mapa con las ciudades alrededor de la capital, fundar ciudades y la capital con sus construcciones.
    const cities = citiesOf(state, current.id);
    return (
      <div className="screen">
        <div className="kingdom-back">
          <button className="ghost" onClick={() => open(null)}><Icon name="chevron-left" /> Mapa del reino</button>
          <div className="kingdom-tabs" role="tablist" aria-label="Tus reinos">
            <button type="button" role="tab" aria-selected={false} className="chip-btn" onClick={() => open(HEALTH_KINGDOM)}><Icon name="caduceus" /> Salud</button>
            {realms(state).map((k) => (
              <button key={k.id} type="button" role="tab" aria-selected={k.id === current.id} className={k.id === current.id ? 'chip-btn on' : 'chip-btn'} onClick={() => open(k.id)}>{k.name}</button>
            ))}
          </div>
        </div>
        <RealmMap state={state} realmId={current.id} onSelect={(id) => open(id)} />
        <section className="panel city-list" aria-label={`Ciudades de ${current.name}`}>
          {cities.length > 0 && (
            <div className="kingdom-tabs kingdom-pick">
              {cities.map((k) => (
                <button key={k.id} type="button" className={k.closedAt ? 'chip-btn monument-chip' : 'chip-btn'} onClick={() => open(k.id)}><Icon name={k.closedAt ? 'laurel-crown' : 'village'} /> {k.name}</button>
              ))}
            </div>
          )}
          {!current.closedAt && <CityForm onCreate={(n) => { const next = addKingdom(state, n, Date.now(), current.id); act(() => next); open(next.kingdoms.at(-1)!.id); }} />}
        </section>
        <KingdomCard key={current.id} game={game} kingdomId={current.id} focusQuest={focusQuest} capital={cities.length > 0} />
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="with-info">
        <h1 className="screen-title">Reinos</h1>
        <InfoTip label="Cómo funcionan los reinos"><p>Un reino es un área grande (Programación) y sus ciudades son proyectos concretos (Calculadora, Temporizador). Cada tarea es una construcción y la ciudad crece al completarlas: aldea (1), villa (3), ciudad amurallada (6) y reino glorioso (10). Desde villa, cada construcción levantada paga 10 monedas de tributo. Cuando un proyecto acabe, ciérralo y quedará como monumento. Pulsa un reino en el mapa para entrar y ver sus ciudades.</p></InfoTip>
      </div>
      <RealmMap state={state} onSelect={(id) => open(id)} />
      <div className="kingdom-tabs kingdom-pick" aria-label="Entrar en un reino">
        <button type="button" className="chip-btn health-chip" onClick={() => open(HEALTH_KINGDOM)} data-testid="open-health" data-tour="health"><Icon name="caduceus" /> Reino de la Salud{!healthFounded(state) && <span className="muted small-text"> · nuevo</span>}</button>
        {realms(state).map((k) => (
          <button key={k.id} type="button" className={k.closedAt ? 'chip-btn monument-chip' : 'chip-btn'} onClick={() => open(k.id)}><Icon name={k.closedAt ? 'laurel-crown' : 'castle'} /> {k.name}</button>
        ))}
      </div>
      <section className="panel" data-tour="kingdom-add">
        <form className="quick-add inline" onSubmit={submit}>
          <input id="new-kingdom" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Fundar un reino (ej. Reino de la Programación)" maxLength={50} aria-label="Nombre del nuevo reino" />
          <button type="submit" className="primary" disabled={!name.trim()}><Icon name="plus" /> Fundar</button>
        </form>
      </section>
      {state.kingdoms.length === 0 && !healthFounded(state) && <p className="empty">Aún no has fundado ningún reino.</p>}
    </div>
  );
}

function CityForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form className="quick-add inline" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name); setName(''); } }}>
      <input id="new-city" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Fundar una ciudad (ej. Calculadora)" maxLength={50} aria-label="Nombre de la nueva ciudad" />
      <button type="submit" className="primary" disabled={!name.trim()}><Icon name="plus" /> Fundar ciudad</button>
    </form>
  );
}

function KingdomCard({ game, kingdomId, focusQuest, capital = false }: { game: Game; kingdomId: string; focusQuest: (q: Quest) => void; capital?: boolean }) {
  const { state, act } = game;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId)!;
  const p = kingdomProgress(state, kingdomId);
  const all = buildings(state, kingdomId).sort((a, b) => a.createdAt - b.createdAt);
  const pending = all.filter((q) => !q.completedAt);
  const built = all.filter((q) => q.completedAt);
  const bonus = kingdomBonus(state, kingdomId);
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState<Impact>('medio');
  const [picked, setPicked] = useState<AttributeId | null>(null);
  const attr = picked ?? guessBuildingAttr(title); // el edificio se propone solo por el nombre; tocarlo lo fija
  const type: QuestType = IMPACT_TYPE[impact];
  const [custom, setCustom] = useState<CustomValue>({});
  const [open, setOpen] = useState(false);
  const [showBuilt, setShowBuilt] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const due = kingdom.deadline ? deadlineLabel(kingdom.deadline, Date.now()) : null;
  const closed = !!kingdom.closedAt;
  const isCity = !!kingdom.parentId;
  const noun = isCity ? 'ciudad' : 'reino';
  const idle = closed ? 0 : kingdomIdleDays(state, kingdomId, Date.now());
  function close() {
    const msg = pending.length
      ? `Las ${pending.length} ${pending.length === 1 ? 'construcción pendiente se quita' : 'construcciones pendientes se quitan'}; lo construido queda en el mapa como monumento.`
      : 'Lo construido queda en el mapa como monumento. Puedes reabrirlo cuando quieras.';
    sureThen({ title: `¿Cerrar ${kingdom.name}?`, message: msg, confirmLabel: 'Cerrar como monumento', icon: 'laurel-crown' }, () => {
      act((s) => closeKingdom(s, kingdomId, Date.now()));
      sfx.victory();
      confetti({ count: 120 });
    });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, questRewards(type, title, attr)) ? custom.rewards : undefined;
    act((s) => addQuest(s, title, type, Date.now(), { kingdomId, impact, focus: attr, xp: custom.xp, rewards }));
    setPicked(null);
    setTitle('');
    setCustom({});
    setOpen(false);
  }
  return (
    <section id={`kingdom-${kingdomId}`} className={`panel kingdom${p.complete || closed ? ' complete' : ''}${closed ? ' monument' : ''}`} aria-labelledby={`k-${kingdomId}`}>
      <header className="kingdom-head">
        <div className="kingdom-head-main">
          {renaming ? (
            <form className="kingdom-rename" onSubmit={(e) => { e.preventDefault(); act((s) => renameKingdom(s, kingdomId, newName)); setRenaming(false); }}>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} aria-label="Nuevo nombre del reino" onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)} />
              <button type="submit" className="primary small" disabled={!newName.trim()}>Guardar</button>
              <button type="button" className="ghost small" onClick={() => setRenaming(false)}>Cancelar</button>
            </form>
          ) : (
            <h2 id={`k-${kingdomId}`} className="kingdom-name">
              {capital && <span className="eyebrow kingdom-capital">Capital del reino</span>}
              {kingdom.name}
              <button className="icon-btn kingdom-edit" onClick={() => { setNewName(kingdom.name); setRenaming(true); }} aria-label={`Renombrar ${kingdom.name}`} title="Renombrar"><Icon name="pencil" /></button>
            </h2>
          )}
          <p className="kingdom-stage"><Icon name={p.icon} /> {p.stage}{bonus > 0 && <> · tributo +{bonus} <Icon name="coin" className="coin-ico" /></>}</p>
          {closed ? (
            <p className="kingdom-monument"><Icon name="laurel-crown" /> Monumento desde el {new Date(kingdom.closedAt!).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          ) : (() => {
            const n = nextStage(p.built);
            return n ? (
              <div className="kingdom-next">
                <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${n.ratio * 100}%` }} /></span>
                <span className="muted small-text"><Icon name={n.icon} /> {n.name} con {n.missing} {n.missing === 1 ? 'construcción' : 'construcciones'} más</span>
              </div>
            ) : <p className="muted small-text">Tu reino ya es glorioso. Cada construcción nueva lo hace aún más grande.</p>;
          })()}
          {!closed && <div className="kingdom-due">
            <DatePicker value={kingdom.deadline ?? null} onChange={(d) => act((s) => setKingdomDeadline(s, kingdomId, d))} label={`Fecha objetivo de ${kingdom.name}`} clearLabel="Quitar fecha objetivo" className={due ? `due due-${due.tone}` : 'kingdom-due-add'}>
              <Icon name="calendar" /> {due ? (p.complete ? `objetivo: ${shortDate(kingdom.deadline!)}` : due.text.replace('vence', 'objetivo')) : 'Fecha objetivo'}
            </DatePicker>
          </div>}
        </div>
        <div className="kingdom-count" aria-label={`${p.built} construcciones levantadas, ${pending.length} por construir`}>
          <span className="kingdom-pct mono">{p.built}</span>
          <span className="muted small-text">{p.built === 1 ? 'construcción' : 'construcciones'}{pending.length > 0 && <><br />{pending.length} por construir</>}</span>
        </div>
      </header>
      {idle >= STALE_KINGDOM_DAYS && (
        <div className="kingdom-idle" role="status">
          <span><Icon name="hourglass" /> {isCity ? 'Esta ciudad lleva' : 'Este reino lleva'} {idle} días parado{isCity ? 'a' : ''}. Si el proyecto ya acabó o no va a seguir, ciérralo.</span>
          {p.built > 0
            ? <button type="button" className="ghost small" onClick={close}><Icon name="laurel-crown" /> Cerrar como monumento</button>
            : <span className="muted small-text">Sin nada construido, mejor bórralo abajo.</span>}
        </div>
      )}
      <CityScene quests={all} progress={p.progress} complete={p.complete || closed} stage={closed ? 'Monumento' : p.stage} icon={closed ? 'laurel-crown' : p.icon} />
      {pending.length > 0 && (
        <ul className="list">
          {pending.map((root) => (
            <QuestNode key={root.id} state={state} quest={root} render={(q, extra) => (
              <QuestItem
                key={q.id} quest={q} {...extra}
                onComplete={() => act((s) => completeQuest(s, q.id, Date.now()), CAP_QUEST, questOpts(q))}
                onUndo={() => act((s) => undoQuest(s, q.id))}
                onStart={() => focusQuest(q)}
                onDelete={() => act((s) => deleteQuest(s, q.id))}
                onEdit={(t, v) => act((s) => updateQuest(s, q.id, { title: t, ...v }))}
                onDeadline={q.kingdomId ? undefined : (d) => act((s) => setQuestDeadline(s, q.id, d))}
                {...treeActions(act, q.id)}
              />
            )} />
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
      {closed ? (
        <div className="kingdom-actions">
          <button type="button" className="ghost" onClick={() => act((s) => reopenKingdom(s, kingdomId))}><Icon name="anvil" /> Reabrir para seguir construyendo</button>
        </div>
      ) : <>
      <form className="quick-add" onSubmit={submit}>
        <input id={`b-${kingdomId}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Nueva construcción (ej. Terminar una calculadora)" maxLength={80} aria-label="Nueva construcción" />
        <div className="quick-add-row">
          <div className="segmented building-pick" role="radiogroup" aria-label="Edificio (según el atributo que trabaja)">
            {BUILDING_CHOICES.map((a) => {
              const k = KIND_INFO[BUILDING_OF[a]];
              return (
                <button type="button" key={a} role="radio" aria-checked={attr === a} className={attr === a ? 'seg on' : 'seg'} onClick={() => setPicked(a)} title={`${k.name}: ${attributeDef(a).name}`}>
                  <Icon name={k.icon} /> {k.name}
                </button>
              );
            })}
          </div>
          <ImpactPicker value={impact} onChange={setImpact} label="Tamaño de la construcción" />
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={custom.xp !== undefined || custom.rewards !== undefined} />
          <button type="submit" className="primary" disabled={!title.trim()}><Icon name="plus" /> Construir</button>
        </div>
        {open && <RewardEditor autoXp={XP_RULES.quest[type]} autoRewards={questRewards(type, title, attr)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.questXp} idPrefix={`b-${kingdomId}`} />}
      </form>
      <div className="kingdom-actions">
        {p.built > 0 && <button type="button" className="ghost" onClick={close}><Icon name="laurel-crown" /> Cerrar como monumento</button>}
        <ConfirmButton label={`Borrar ${noun}`} confirmLabel={isCity || !citiesOf(state, kingdomId).length ? 'Sí, borrar (lo construido se conserva)' : 'Sí, borrar el reino y sus ciudades'} onConfirm={() => act((s) => deleteKingdom(s, kingdomId))} />
      </div>
      </>}
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
      <header className="panel-head">
        <div className="with-info">
          <h3 id="goals-h">Metas para {next.name}</h3>
          <InfoTip label="Qué son las metas"><p>Metas de tu vida real que también exiges para subir de avatar: personas nuevas, libros leídos, proyectos acabados…</p></InfoTip>
        </div>
      </header>
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
                  <button className="icon-btn" onClick={() => sureThen({ title: `¿Borrar la meta «${g.name}»?`, confirmLabel: 'Borrar meta' }, () => act((s) => deleteGoal(s, g.id)))} aria-label={`Borrar ${g.name}`} title="Borrar"><Icon name="trash" /></button>
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
        <input id="goal-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unidad (libros, personas…)" maxLength={12} aria-label="Unidad" />
        <button type="submit" className="primary" disabled={!valid}><Icon name="plus" /> Añadir</button>
      </form>
    </section>
  );
}
