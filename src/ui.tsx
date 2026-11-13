// Piezas de interfaz compartidas entre pantallas.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AttributeRewards, GameState, Habit, Impact, Quest, QuestType } from './types';
import { ATTRIBUTES, attributeHistory, attributeLevel, attributeXp, avatarInfo, formatAttrXp, habitRewards, questRewards } from './attributes';
import {
  daysUntil, CUSTOM_LIMITS, dayKey, habitAtRisk, impactOf, TYPE_IMPACT, habitDayCount, habitStreak, habitWeekCount, habitXp, isHabitDone, levelInfo, QUEST_LABEL, repeatLabel, questXp, shiftDay, totalXp, XP_RULES,
} from './game';
import { CustomizeToggle, InlineEdit, RewardEditor, sameRewards, type CustomValue } from './customize';
import { RitualCTA } from './ritual';
import { DatePicker, dayWords, ImpactPicker, RepeatPicker } from './pickers';
import { IMPACTS } from './priorities';

const impactName = (v: Impact) => IMPACTS.find((x) => x.id === v)!.name;
import './core.css';
import { HabitHistory, habitShields, MinimumInput, PerDayInput, ProgressionInput, progressionDraft, type ProgressionDraft } from './habits-ui';
import { progressionText } from './progression';
import { shieldableDay, shieldsLeft } from './economy';
import { SubAdd } from './tree-ui';
import { AvatarPortrait, initialOf } from './portrait';
import { openSystemHabit } from './nav-state';
import { Icon } from './icons';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Al ganar XP la barra brilla un momento ('gain') y, si cambia el nivel, la insignia late ('lvl'). Ver motion.css. */
function useXpPulse(xp: number, level: number): string {
  const prev = useRef({ xp, level });
  const [pulse, setPulse] = useState('');
  useEffect(() => {
    const p = prev.current;
    prev.current = { xp, level };
    if (xp <= p.xp) return;
    setPulse(level > p.level ? ' gain lvl' : ' gain');
    const t = setTimeout(() => setPulse(''), 950);
    return () => clearTimeout(t);
  }, [xp, level]);
  return pulse;
}

export function LevelBar({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const xp = totalXp(state);
  const info = levelInfo(xp);
  const pulse = useXpPulse(xp, info.level);
  return (
    <div className={`${compact ? 'levelbar compact' : 'levelbar'}${pulse}`}>
      <div className="level-badge" aria-label={`Nivel ${info.level}`}>
        <span className="level-badge-label">Nv</span>
        <span className="level-badge-num">{info.level}</span>
      </div>
      <div className="levelbar-body">
        <div className="levelbar-head">
          <span className="levelbar-name">{state.profile?.name}</span>
        </div>
        <div className="xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={info.needed} aria-valuenow={info.current}>
          <div className="xpbar-fill" style={{ width: `${Math.min(100, info.progress * 100)}%` }} />
        </div>
        <div className="levelbar-foot mono">
          Nivel global · {info.current} / {info.needed} XP · faltan {info.needed - info.current} para nivel {info.level + 1}
        </div>
      </div>
    </div>
  );
}

export function TypeChip({ type }: { type: QuestType }) {
  return <span className={`chip chip-${type}`}>{QUEST_LABEL[type]}</span>;
}

/** Fecha corta: «12 oct». */
export function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** «hoy», «mañana», «en 3 días», «vencida hace 2 días» o la fecha si queda lejos. */
export function deadlineLabel(day: string, now: number): { text: string; tone: 'late' | 'soon' | 'later' } {
  const d = daysUntil(day, now)!;
  if (d < 0) return { text: `vencida hace ${-d} ${d === -1 ? 'día' : 'días'}`, tone: 'late' };
  if (d === 0) return { text: 'vence hoy', tone: 'soon' };
  if (d === 1) return { text: 'vence mañana', tone: 'soon' };
  if (d <= 7) return { text: `vence en ${d} días`, tone: d <= 2 ? 'soon' : 'later' };
  return { text: `vence el ${shortDate(day)}`, tone: 'later' };
}

export function QuestItem({
  quest, kingdom, onComplete, onStart, onDelete, onUndo, onEdit, onDeadline, onRepeat, onImpact, priority,
  path, progress, inherited, onAddChild, onSplit, children,
}: {
  quest: Quest;
  kingdom?: string;
  onComplete?: () => void;
  onStart?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onEdit?: (title: string, v: CustomValue) => void;
  onDeadline?: (day: string | null) => void;
  onRepeat?: (days: number[] | null) => void;
  /** Con él, el impacto (y con él el XP) se puede cambiar. */
  onImpact?: (v: Impact) => void;
  /** Es una de «Las 3 de hoy». */
  priority?: boolean;
  /** «Mates › Examen tema 4»: de dónde cuelga (en listas planas). */
  path?: string;
  /** Con él es una misión con submisiones: hojas hechas / total. Solo se cierra cuando todas están hechas. */
  progress?: { done: number; total: number };
  /** Fecha heredada de la misión de arriba (si no tiene una propia). */
  inherited?: string;
  /** Con ellos se puede partir en submisiones o repartir sesiones. */
  onAddChild?: (title: string) => void;
  onSplit?: (n: number) => void;
  /** Las submisiones, debajo de la fila. */
  children?: ReactNode;
}) {
  const done = !!quest.completedAt;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tools, setTools] = useState(false);
  const [open, setOpen] = useState(true);
  const container = !!progress && progress.total > 0;
  const blocked = container && progress.done < progress.total; // con hojas pendientes no se cierra
  const due = quest.deadline && !done ? deadlineLabel(quest.deadline, Date.now()) : null;
  const inheritedDue = !quest.deadline && inherited && !done ? deadlineLabel(inherited, Date.now()) : null;
  const imp = impactOf(quest);
  const impLabel = <><Icon name="target" /> {impactName(imp)} · +{questXp(quest)} XP</>;
  const canSplit = !done && !!onAddChild;
  const hasTools = !done && !!(onDeadline || canSplit || onRepeat || onEdit || onDelete);
  if (editing && onEdit) {
    const initial: CustomValue = { xp: quest.xp, rewards: quest.rewards ?? (quest.focus ? questRewards(quest.type, quest.title, quest.focus) : undefined) };
    return (
      <li className="item editing">
        <InlineEdit
          name={quest.title} label="Nombre de la misión" autoXp={XP_RULES.quest[quest.type]} autoRewards={(t) => questRewards(quest.type, t)}
          initial={initial} maxXp={CUSTOM_LIMITS.questXp} idPrefix={`edit-${quest.id}`}
          onSave={(t, v) => { onEdit(t, v); setEditing(false); }} onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li className={`item${done ? ' done' : ''}${container ? ' has-sub' : ''}`}>
      {done ? (
        <span className="check checked" aria-hidden="true">✓</span>
      ) : blocked ? (
        <button className="check tree-count mono" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? 'Plegar' : 'Desplegar'} ${quest.title}: ${progress.done} de ${progress.total} hechas`} title="Se cierra cuando todas sus submisiones estén hechas">
          {progress.done}/{progress.total}
        </button>
      ) : (
        <button className="check" onClick={onComplete} aria-label={`Completar ${quest.title}`} title={container ? 'Todas sus submisiones están hechas: ciérrala' : 'Completar misión'}>✓</button>
      )}
      <div className="item-body">
        {path && <span className="item-path">{path}</span>}
        <span className="item-title">{quest.title}</span>
        <span className="item-meta">
          {priority && !done && <span className="prio-tag" title="Una de las 3 de hoy"><Icon name="flag" /> Hoy</span>}
          {onImpact && !done
            ? <ImpactPicker value={imp} onChange={onImpact} label={`Impacto de ${quest.title}`} className={`impact-tag imp-${imp}`}>{impLabel}</ImpactPicker>
            : <span className={`impact-tag imp-${imp}`}>{impLabel}</span>}
          {due && (onDeadline
            ? <DatePicker value={quest.deadline ?? null} onChange={onDeadline} label={`Fecha límite de ${quest.title}`} clearLabel="Quitar fecha límite" className={`due due-${due.tone}`}><Icon name="calendar" /> {due.text}</DatePicker>
            : <span className={`due due-${due.tone}`}><Icon name="calendar" /> {due.text}</span>)}
          {inheritedDue && path && <span className={`due inherited due-${inheritedDue.tone}`} title="Fecha de la misión de la que cuelga"><Icon name="calendar" /> {inheritedDue.text}</span>}
          {container && !blocked && !done && <span className="steps-tag full"><Icon name="check" /> todo hecho: ciérrala o añade más</span>}
          {quest.repeat && !done && (onRepeat
            ? <RepeatPicker value={quest.repeat} onChange={onRepeat} label={`Repetición de ${quest.title}`} describe={repeatLabel} className="repeat-tag"><Icon name="repeat" /> {repeatLabel(quest.repeat)}</RepeatPicker>
            : <span className="repeat-tag"><Icon name="repeat" /> {repeatLabel(quest.repeat)}</span>)}
          {quest.startsOn && !done && quest.startsOn > dayKey(Date.now()) && <span className="starts">sale {dayWords(quest.startsOn).toLowerCase()}</span>}
          {kingdom && <span className="kingdom-tag"><Icon name="castle" /> {kingdom}</span>}
        </span>
        {tools && hasTools && (
          <div className="item-tools" role="group" aria-label={`Acciones de ${quest.title}`}>
            {onDeadline && !quest.deadline && (
              <DatePicker value={null} onChange={onDeadline} label={`Poner fecha límite a ${quest.title}`} className="ghost small due-add"><Icon name="calendar-plus" /> Fecha</DatePicker>
            )}
            {canSplit && (
              <button className="ghost small split-btn" onClick={() => { setAdding(true); setOpen(true); setTools(false); }} aria-label={`Partir ${quest.title} en submisiones`}><Icon name="list" /> {container ? 'Submisión' : 'Partir'}</button>
            )}
            {onRepeat && !quest.repeat && !container && (
              <RepeatPicker value={null} onChange={onRepeat} label={`Repetir ${quest.title}`} describe={repeatLabel} className="ghost small repeat-add"><Icon name="repeat" /> Repetir</RepeatPicker>
            )}
            {onEdit && (
              <button className="ghost small edit-btn" onClick={() => setEditing(true)} aria-label={`Editar ${quest.title}`}><Icon name="pencil" /> Editar</button>
            )}
            {onDelete && (
              <button className="ghost small danger" onClick={onDelete} aria-label={`Borrar ${quest.title}`}><Icon name="trash" /> Borrar</button>
            )}
          </div>
        )}
        {adding && canSplit && !container && <SubAdd quest={quest} inherited={quest.deadline ?? inherited} onAdd={onAddChild} onSplit={onSplit} onClose={() => setAdding(false)} />}
      </div>
      <div className="item-actions">
        {onStart && !done && !container && (
          <button className="ghost small" onClick={onStart} title="Hacer Deep Work en esta misión"><Icon name="play" /> Foco</button>
        )}
        {onUndo && done && <button className="ghost small" onClick={onUndo}><Icon name="rotate-ccw" /> Deshacer</button>}
        {hasTools && (
          <button className={tools ? 'icon-btn more-btn on' : 'icon-btn more-btn'} onClick={() => setTools(!tools)} aria-expanded={tools} aria-label={`Más acciones de ${quest.title}`} title="Fecha, partir, repetir, editar o borrar">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          </button>
        )}
      </div>
      {container && open && (
        <div className="sub">
          {children}
          {canSplit && (adding
            ? <SubAdd quest={quest} inherited={quest.deadline ?? inherited} onAdd={onAddChild} onSplit={onSplit} onClose={() => setAdding(false)} />
            : <button type="button" className="link small sub-more" onClick={() => setAdding(true)} aria-label={`Añadir submisión a ${quest.title}`}><Icon name="plus" /> Submisión</button>)}
        </div>
      )}
    </li>
  );
}

const TYPES: QuestType[] = ['main', 'daily', 'side'];

export function QuickAddQuest({
  onAdd, autoFocus = false, fixedDeadline,
}: { onAdd: (title: string, type: QuestType, custom: CustomValue & { deadline?: string; repeat?: number[]; impact?: Impact }) => void; autoFocus?: boolean; fixedDeadline?: string }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [repeat, setRepeat] = useState<number[] | null>(null);
  const [type, setType] = useState<QuestType>('daily');
  const [custom, setCustom] = useState<CustomValue>({});
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(false);
  const isCustom = custom.xp !== undefined || custom.rewards !== undefined;
  const extras = !!deadline || !!repeat || isCustom;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, questRewards(type, title)) ? custom.rewards : undefined;
    onAdd(title, type, { xp: custom.xp, rewards, deadline: fixedDeadline ?? (deadline || undefined), repeat: repeat ?? undefined, impact: TYPE_IMPACT[type] });
    setTitle('');
    setDeadline('');
    setRepeat(null);
    setCustom({});
    setOpen(false);
    setMore(false);
  }
  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        id="new-quest"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="+ Nueva misión (ej. Terminar el tema 3)"
        maxLength={80}
        autoFocus={autoFocus}
        aria-label="Nombre de la nueva misión"
      />
      <div className="quick-add-row">
        <div className="segmented" role="radiogroup" aria-label="Impacto de la misión" title="¿Cuánto te acerca a lo que de verdad quieres?">
          {TYPES.map((t) => (
            <button type="button" key={t} role="radio" aria-checked={type === t} className={type === t ? 'seg on' : 'seg'} onClick={() => setType(t)}>
              {QUEST_LABEL[t]} <span className="mono">{XP_RULES.quest[t]}</span>
            </button>
          ))}
        </div>
        <button type="button" className={`ghost small more-opts${extras ? ' set' : ''}`} aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="sliders" /> {extras ? 'Opciones puestas' : 'Más opciones'}
        </button>
        <button type="submit" className="primary" disabled={!title.trim()}><Icon name="plus" /> Crear</button>
      </div>
      {more && (
        <div className="quick-add-row quick-add-more">
          {!fixedDeadline && (
            <DatePicker id="new-quest-deadline" value={deadline || null} onChange={(d) => setDeadline(d ?? '')} label="Fecha límite (opcional)" clearLabel="Sin fecha límite" placeholder="Fecha límite" />
          )}
          <RepeatPicker id="new-quest-repeat" value={repeat} onChange={setRepeat} label="Repetir" describe={repeatLabel} />
          <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={isCustom} />
        </div>
      )}
      {more && open && (
        <RewardEditor autoXp={XP_RULES.quest[type]} autoRewards={questRewards(type, title)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.questXp} idPrefix="new-quest" />
      )}
    </form>
  );
}

/**
 * Lista de hábitos que se reordena sola (los hechos bajan al final): cada fila que cambia de puesto se desliza
 * hasta el nuevo en vez de saltar. Solo se animan las filas que cambian de orden, no las que se mueven porque
 * otra se abre.
 */
export function useHabitFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const prev = useRef<{ order: string[]; tops: Map<string, number> }>({ order: [], tops: new Map() });
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-habit]')];
    const order = rows.map((r) => r.dataset.habit!);
    const tops = new Map(rows.map((r) => [r.dataset.habit!, r.getBoundingClientRect().top]));
    const before = prev.current;
    const moved = before.order.length === order.length && before.order.some((id, i) => order[i] !== id);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dropped = list.dataset.dropped === '1';
    delete list.dataset.dropped;
    if (moved && !still && !dropped) {
      rows.forEach((r, i) => {
        const id = order[i];
        const was = before.tops.get(id);
        if (was == null || before.order.indexOf(id) === i) return;
        const dy = was - tops.get(id)!;
        if (Math.abs(dy) < 2 || typeof r.animate !== 'function') return;
        r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      });
      // Mientras se recoloca, la fila que sube no se puede marcar sin querer con un segundo toque.
      // (Reloj del navegador, no setTimeout: así no depende de temporizadores.)
      const t = Number(document.timeline?.currentTime ?? 0);
      if (t) list.dataset.settleUntil = String(t + 340);
    }
    prev.current = { order, tops };
  });
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const guard = (e: MouseEvent) => {
      const until = Number(list.dataset.settleUntil ?? 0);
      if (until && e.timeStamp < until && (e.target as Element | null)?.closest?.('button.check')) { e.preventDefault(); e.stopPropagation(); }
    };
    list.addEventListener('click', guard, true);
    return () => list.removeEventListener('click', guard, true);
  }, []);
  return ref;
}

export function HabitItem({
  state, habit, now, onToggle, onDelete, onEdit, onToggleDay, onShield, onRetire, handle, compact = false,
}: {
  state: GameState;
  habit: Habit;
  now: number;
  onToggle: () => void;
  /** Con él, los puntos de la semana se pueden pulsar y el nombre abre el historial. */
  onToggleDay?: (day: string) => void;
  onDelete?: () => void;
  onEdit?: (name: string, v: CustomValue, minimum: string, progression: ProgressionDraft, perDay: number) => void;
  /** Usa un escudo de racha del cofre en ese día fallado. */
  onShield?: (day: string) => void;
  /** Retirarlo a mano porque ya está consolidado (va a «Hábitos automatizados» con su historial). */
  onRetire?: () => void;
  /** Asa para ordenar arrastrando (la pone la lista). */
  handle?: ReactNode;
  /** En Hoy: sin XP ni atributos (están en Hábitos). */
  compact?: boolean;
}) {
  // Hábitos del sistema (apuntar la noche, repasar): no se marcan ni se editan; pulsarlos te lleva a hacerlos.
  if (habit.system) {
    const kind = habit.system;
    onToggle = () => openSystemHabit(kind);
    if (onToggleDay) onToggleDay = () => openSystemHabit(kind);
    onEdit = onDelete = onRetire = undefined;
  }
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimum, setMinimum] = useState(habit.minimum ?? '');
  const [prog, setProg] = useState(() => progressionDraft(habit));
  const [perDayDraft, setPerDayDraft] = useState(habit.perDay ?? 1);
  if (editing && onEdit) {
    const auto = habitRewards(habit.name);
    return (
      <li className="item editing">
        <InlineEdit
          name={habit.name} label="Nombre del hábito" autoXp={XP_RULES.habit} autoRewards={(n) => habitRewards(n)}
          initial={{ xp: habit.xp, rewards: sameRewards(habit.rewards, auto) ? undefined : habit.rewards }}
          maxXp={CUSTOM_LIMITS.habitXp} idPrefix={`edit-${habit.id}`}
          extra={<>
            <MinimumInput id={`edit-${habit.id}-min`} value={minimum} onChange={setMinimum} />
            <ProgressionInput id={`edit-${habit.id}-prog`} value={prog} onChange={setProg} perWeek={habit.frequency === 'weekly' ? habit.perWeek ?? 1 : 7} perDay={perDayDraft} />
            <PerDayInput id={`edit-${habit.id}-perday`} value={perDayDraft} onChange={setPerDayDraft} />
            {onRetire && <button type="button" className="link retire-now" onClick={() => { setEditing(false); onRetire(); }}><Icon name="trophy" /> Ya lo tengo consolidado: retirarlo del seguimiento</button>}
          </>}
          onSave={(n, v) => { onEdit(n, v, minimum, prog, perDayDraft); setEditing(false); }} onCancel={() => { setMinimum(habit.minimum ?? ''); setProg(progressionDraft(habit)); setPerDayDraft(habit.perDay ?? 1); setEditing(false); }}
        />
      </li>
    );
  }
  const today = dayKey(now);
  const done = isHabitDone(state, habit.id, today);
  const perDay = habit.perDay ?? 1;
  const todayCount = perDay > 1 ? habitDayCount(state, habit.id, today) : 0;
  const more = perDay > 1 && todayCount < perDay;
  const streak = habitStreak(state, habit.id, now);
  const weekly = habit.frequency === 'weekly';
  const weekCount = weekly ? habitWeekCount(state, habit.id, now) : 0;
  const weekDone = weekly && weekCount >= (habit.perWeek ?? 1);
  const week = Array.from({ length: 7 }, (_, i) => dayKey(shiftDay(now, i - 6)));
  const shields = habitShields(state, habit, now);
  const risk = habitAtRisk(state, habit, now);
  const savable = onShield ? shieldableDay(state, habit.id, now) : null;
  const stock = shieldsLeft(state);
  return (
    <li className={done && !more ? 'item done' : risk ? 'item at-risk' : 'item'} data-habit={habit.id}>
      <button
        className={done ? 'check checked' : 'check'}
        onClick={onToggle}
        aria-pressed={done}
        aria-label={more && done ? `Marcar otra vez ${habit.name} (${todayCount}/${perDay} hoy)` : done ? `Desmarcar ${habit.name}` : `Completar ${habit.name}`}
        title={more && done ? `Otra vez (${todayCount}/${perDay} hoy)` : done ? 'Desmarcar' : 'Completado'}
      >
        ✓
      </button>
      <div className="item-body">
        {onToggleDay
          ? <button type="button" className="habit-open" aria-expanded={open} onClick={() => setOpen(!open)} title="Ver historial"><span className="item-title">{habit.name}</span><Icon name="chevron-down" /></button>
          : <span className="item-title">{habit.name}</span>}
        <span className="item-meta">
          {habit.progression && habit.progression.kind !== 'freq' && <span className="freq-tag goal-tag" title="Meta actual (sobrecarga progresiva)"><Icon name="trend" /> {progressionText(habit)}</span>}
          {perDay > 1 && <span className="freq-tag" title={`Se puede marcar hasta ${perDay} veces al día`}>{todayCount}/{perDay} hoy</span>}
          {weekly && <span className={weekDone ? 'freq-tag done' : 'freq-tag'}>{weekCount}/{habit.perWeek} esta semana{weekDone && <> <Icon name="check" /></>}</span>}
          <span className="week" aria-label="Últimos 7 días">
            {week.map((d) => {
              const on = isHabitDone(state, habit.id, d);
              const cls = on ? 'dot on' : shields.includes(d) ? 'dot shield' : 'dot';
              const tip = `${dayWords(d)}${on ? ': hecho' : shields.includes(d) ? ': salvado por el escudo' : ''}`;
              return onToggleDay && d !== today
                ? <button type="button" key={d} className={cls} title={tip} aria-label={`${on ? 'Desmarcar' : 'Marcar'} ${habit.name} (${dayWords(d).toLowerCase()})`} aria-pressed={on} onClick={() => onToggleDay(d)} />
                : <span key={d} className={cls} title={tip} />;
            })}
          </span>
          <span className="mono streak">{streak > 0 ? `racha ${streak}${weekly ? ' sem' : ''}` : 'sin racha'}</span>
          {!compact && <span className="mono xp-tag">+{habitXp(habit)} XP</span>}
          {!compact && <RewardTags rewards={habit.rewards} />}
        </span>
        {(risk || (savable && stock > 0)) && (
          <p className="habit-risk small-text">
            {risk && <span><Icon name="alert" /> Ayer fallaste: nunca dos días seguidos. {habit.minimum ? <>Si hoy es un día malo, vale con lo mínimo: <b>{habit.minimum}</b>.</> : 'Hoy cuenta aunque sea poco.'}</span>}
            {savable && (stock > 0
              ? <button type="button" className="link" onClick={() => onShield!(savable)}><Icon name="shield" /> Salvar {dayWords(savable) === 'Ayer' ? 'ayer' : `el ${dayWords(savable)}`} con un escudo (tienes {stock})</button>
              : risk && <span className="muted"> O compra un escudo de racha en la Tienda de la Arena.</span>)}
          </p>
        )}
        {open && onToggleDay && <HabitHistory state={state} habit={habit} now={now} onToggleDay={onToggleDay} />}
      </div>
      <div className="item-actions">
        {handle}
        {onEdit && <button className="icon-btn edit-btn" onClick={() => setEditing(true)} aria-label={`Editar ${habit.name}`} title="Editar XP y atributos"><Icon name="sliders" /></button>}
        {onDelete && <button className="icon-btn" onClick={onDelete} aria-label={`Borrar ${habit.name}`} title="Borrar"><Icon name="trash" /></button>}
      </div>
    </li>
  );
}

/** Confirmación en la propia página (los diálogos nativos no siempre están disponibles). */
export function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className="ghost danger" onClick={() => setAsking(true)}><Icon name="trash" /> {label}</button>;
  return (
    <span className="confirm">
      <button className="danger-solid" onClick={onConfirm}>{confirmLabel}</button>
      <button className="ghost" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}

/** Símbolos compactos del XP de atributo que da una acción (p. ej. [puño]+5 [martillo]+5). */
export function RewardTags({ rewards }: { rewards: AttributeRewards }) {
  const items = ATTRIBUTES.filter((a) => (rewards[a.id] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <span className="rewards mono" aria-label={items.map((a) => `+${formatAttrXp(rewards[a.id]!)} ${a.name}`).join(', ')}>
      {items.map((a) => (
        <span key={a.id}>
          <Icon name={a.icon} className={`attr-ico a-${a.id}`} />+{formatAttrXp(rewards[a.id]!)}
        </span>
      ))}
    </span>
  );
}

export function AvatarCard({ state, now, showRequirements = false }: { state: GameState; now: number; showRequirements?: boolean }) {
  const a = avatarInfo(state, now);
  return (
    <section className={a.ready ? 'panel avatar-card ritual-ready' : 'panel avatar-card'} aria-labelledby="avatar-h" data-tour="avatar">
      <AvatarPortrait tier={a.index} photo={state.profile?.photo} label={initialOf(state.profile?.name)} size={92} title={`Aro de ${a.current.name}`} />
      <div className="avatar-body">
        <p className="eyebrow">Avatar actual</p>
        <h3 id="avatar-h" className="avatar-name">{a.current.name}</h3>
        <div className="xpbar" role="progressbar" aria-label="Progreso hacia el siguiente avatar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(a.progress * 100)}>
          <div className="xpbar-fill" style={{ width: `${Math.min(100, a.progress * 100)}%` }} />
        </div>
        <p className="levelbar-foot mono">
          {a.next
            ? a.ready ? `Cumples todo lo que pide ${a.next.name}` : `${Math.floor(a.progress * 100)} % hacia ${a.next.name} · ${a.met} de ${a.requirements.length} requisitos`
            : 'Avatar máximo alcanzado'}
        </p>
        <RitualCTA state={state} now={now} />
        {showRequirements && a.next && (
          <ul className="reqs" aria-label={`Requisitos para ${a.next.name}`}>
            <li className="req-head">Para ascender a {a.next.name}:</li>
            {a.requirements.map((r) => (
              <li key={r.label} className={r.met ? 'req met' : 'req'}>
                <Icon name={r.met ? 'check' : 'target'} className={r.met ? 'req-ico met' : 'req-ico'} /> {r.label}
                <span className="mono muted"> · {Math.floor(r.progress * 100)} %</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function AttributeList({ state, detailed = false }: { state: GameState; detailed?: boolean }) {
  const xp = attributeXp(state);
  const level = levelInfo(totalXp(state)).level;
  return (
    <ul className={detailed ? 'attrs detailed' : 'attrs'}>
      {ATTRIBUTES.map((a) => {
        const lvl = attributeLevel(xp[a.id]);
        const last = detailed ? attributeHistory(state, a.id).slice(-1)[0] : undefined;
        const asleep = a.unlockLevel !== undefined && level < a.unlockLevel;
        if (asleep) {
          return (
            <li key={a.id} className="attr idle asleep" title={`${a.tagline} ${a.desc}`}>
              <span className="attr-icon" aria-hidden="true"><Icon name="lock" /></span>
              <span className="attr-name">{a.name}</span>
              <span className="attr-level mono">Nv {a.unlockLevel}</span>
              <span className="attr-asleep-text">Atributo avanzado: se despierta en el nivel global {a.unlockLevel}. Lo que hagas antes ya cuenta.</span>
              {detailed && (
              <span className="attr-desc">
                <strong className="attr-tagline">{a.tagline}</strong> {a.desc}
                <span className="attr-gains"><span className="eyebrow-inline">Sube con</span> {a.gains}</span>
                <span className="muted">Ej.: {a.examples}</span>
              </span>
            )}
            </li>
          );
        }
        return (
          <li key={a.id} className={xp[a.id] === 0 ? 'attr idle' : 'attr'} title={`${a.tagline} ${a.desc}`}>
            <span className={`attr-icon a-${a.id}`} aria-hidden="true"><Icon name={a.icon} /></span>
            <span className="attr-name">{a.name}</span>
            <span className="attr-level mono">Nv {lvl.level}</span>
            <div className="attr-bar" role="progressbar" aria-label={`${a.name}: ${formatAttrXp(lvl.current)} de ${lvl.needed} XP`} aria-valuemin={0} aria-valuemax={lvl.needed} aria-valuenow={lvl.current}>
              <div style={{ width: `${Math.min(100, lvl.progress * 100)}%` }} />
            </div>
            <span className="attr-xp mono">{formatAttrXp(xp[a.id])} XP</span>
            {detailed && (
              <span className="attr-desc">
                <strong className="attr-tagline">{a.tagline}</strong> {a.desc}
                <span className="attr-gains"><span className="eyebrow-inline">Sube con</span> {a.gains}</span>
                <span className="muted">Ej.: {a.examples}</span>
              </span>
            )}
            {detailed && (
              <span className="attr-last">
                {last ? `Último: +${formatAttrXp(last.amount)} · ${last.label}` : 'Aún sin progreso'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
