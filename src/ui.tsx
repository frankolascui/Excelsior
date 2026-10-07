// Piezas de interfaz compartidas entre pantallas.
import { useEffect, useState, type FormEvent } from 'react';
import type { AttributeRewards, GameState, Habit, Quest, QuestType } from './types';
import { ATTRIBUTES, attributeHistory, attributeLevel, attributeXp, avatarInfo, formatAttrXp, habitRewards, questRewards } from './attributes';
import {
  daysUntil, CUSTOM_LIMITS, dayKey, habitStreak, habitWeekCount, habitXp, isHabitDone, levelInfo, QUEST_LABEL, questAttributeRewards, questXp, shiftDay, totalXp, XP_RULES,
} from './game';
import { CustomizeToggle, InlineEdit, RewardEditor, sameRewards, type CustomValue } from './customize';
import { RitualCTA } from './ritual';
import { AvatarPortrait, initialOf } from './portrait';

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

export function LevelBar({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const info = levelInfo(totalXp(state));
  return (
    <div className={compact ? 'levelbar compact' : 'levelbar'}>
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
  quest, kingdom, onComplete, onStart, onDelete, onUndo, onEdit, onDeadline,
}: {
  quest: Quest;
  kingdom?: string;
  onComplete?: () => void;
  onStart?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onEdit?: (title: string, v: CustomValue) => void;
  onDeadline?: (day: string | null) => void;
}) {
  const done = !!quest.completedAt;
  const [editing, setEditing] = useState(false);
  const [dating, setDating] = useState(false);
  const due = quest.deadline && !done ? deadlineLabel(quest.deadline, Date.now()) : null;
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
    <li className={done ? 'item done' : 'item'}>
      {done ? (
        <span className="check checked" aria-hidden="true">✓</span>
      ) : (
        <button className="check" onClick={onComplete} aria-label={`Completar ${quest.title}`} title="Completar misión">✓</button>
      )}
      <div className="item-body">
        <span className="item-title">{quest.title}</span>
        <span className="item-meta">
          <TypeChip type={quest.type} />
          {due && (onDeadline
            ? <button type="button" className={`due due-${due.tone}`} onClick={() => setDating(!dating)} title="Cambiar la fecha límite">📅 {due.text}</button>
            : <span className={`due due-${due.tone}`}>📅 {due.text}</span>)}
          {kingdom && <span className="kingdom-tag">🏰 {kingdom}</span>}
          <span className="mono xp-tag">+{questXp(quest)} XP</span>
          <RewardTags rewards={questAttributeRewards(quest)} />
        </span>
        {dating && onDeadline && (
          <span className="due-edit">
            <input type="date" value={quest.deadline ?? ''} autoFocus aria-label={`Fecha límite de ${quest.title}`}
              onChange={(e) => { onDeadline(e.target.value || null); if (e.target.value) setDating(false); }} />
            {quest.deadline && <button type="button" className="link" onClick={() => { onDeadline(null); setDating(false); }}>Quitar fecha</button>}
          </span>
        )}
      </div>
      <div className="item-actions">
        {onStart && !done && (
          <button className="ghost small" onClick={onStart} title="Hacer Deep Work en esta misión">▶ Foco</button>
        )}
        {onUndo && done && <button className="ghost small" onClick={onUndo}>Deshacer</button>}
        {onDeadline && !done && !quest.deadline && (
          <button className="icon-btn" onClick={() => setDating(!dating)} aria-label={`Poner fecha límite a ${quest.title}`} title="Poner fecha límite">📅</button>
        )}
        {onEdit && !done && (
          <button className="icon-btn edit-btn" onClick={() => setEditing(true)} aria-label={`Editar ${quest.title}`} title="Editar XP y atributos">✎</button>
        )}
        {onDelete && !done && (
          <button className="icon-btn" onClick={onDelete} aria-label={`Borrar ${quest.title}`} title="Borrar">×</button>
        )}
      </div>
    </li>
  );
}

const TYPES: QuestType[] = ['daily', 'main', 'side'];

export function QuickAddQuest({
  onAdd, autoFocus = false, fixedDeadline,
}: { onAdd: (title: string, type: QuestType, custom: CustomValue & { deadline?: string }) => void; autoFocus?: boolean; fixedDeadline?: string }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [type, setType] = useState<QuestType>('daily');
  const [custom, setCustom] = useState<CustomValue>({});
  const [open, setOpen] = useState(false);
  const isCustom = custom.xp !== undefined || custom.rewards !== undefined;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const rewards = custom.rewards && !sameRewards(custom.rewards, questRewards(type, title)) ? custom.rewards : undefined;
    onAdd(title, type, { xp: custom.xp, rewards, deadline: fixedDeadline ?? (deadline || undefined) });
    setTitle('');
    setDeadline('');
    setCustom({});
    setOpen(false);
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
        <div className="segmented" role="radiogroup" aria-label="Tipo de misión">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={type === t}
              className={type === t ? 'seg on' : 'seg'}
              onClick={() => setType(t)}
            >
              {QUEST_LABEL[t]} <span className="mono">{XP_RULES.quest[t]}</span>
            </button>
          ))}
        </div>
        {!fixedDeadline && (
          <label className="deadline-field" title="Fecha límite (opcional)">
            <span aria-hidden="true">📅</span>
            <input id="new-quest-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Fecha límite (opcional)" />
          </label>
        )}
        <CustomizeToggle open={open} onToggle={() => setOpen(!open)} custom={isCustom} />
        <button type="submit" className="primary" disabled={!title.trim()}>Crear</button>
      </div>
      {open && (
        <RewardEditor autoXp={XP_RULES.quest[type]} autoRewards={questRewards(type, title)} value={custom} onChange={setCustom} maxXp={CUSTOM_LIMITS.questXp} idPrefix="new-quest" />
      )}
    </form>
  );
}

export function HabitItem({
  state, habit, now, onToggle, onDelete, onEdit,
}: {
  state: GameState;
  habit: Habit;
  now: number;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: (name: string, v: CustomValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && onEdit) {
    const auto = habitRewards(habit.name);
    return (
      <li className="item editing">
        <InlineEdit
          name={habit.name} label="Nombre del hábito" autoXp={XP_RULES.habit} autoRewards={(n) => habitRewards(n)}
          initial={{ xp: habit.xp, rewards: sameRewards(habit.rewards, auto) ? undefined : habit.rewards }}
          maxXp={CUSTOM_LIMITS.habitXp} idPrefix={`edit-${habit.id}`}
          onSave={(n, v) => { onEdit(n, v); setEditing(false); }} onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  const today = dayKey(now);
  const done = isHabitDone(state, habit.id, today);
  const streak = habitStreak(state, habit.id, now);
  const weekly = habit.frequency === 'weekly';
  const weekCount = weekly ? habitWeekCount(state, habit.id, now) : 0;
  const weekDone = weekly && weekCount >= (habit.perWeek ?? 1);
  const week = Array.from({ length: 7 }, (_, i) => dayKey(shiftDay(now, i - 6)));
  return (
    <li className={done ? 'item done' : 'item'}>
      <button
        className={done ? 'check checked' : 'check'}
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Desmarcar ${habit.name}` : `Completar ${habit.name}`}
        title={done ? 'Desmarcar' : 'Completado'}
      >
        ✓
      </button>
      <div className="item-body">
        <span className="item-title">{habit.name}</span>
        <span className="item-meta">
          {weekly && <span className={weekDone ? 'freq-tag done' : 'freq-tag'}>{weekCount}/{habit.perWeek} esta semana{weekDone ? ' ✓' : ''}</span>}
          <span className="week" aria-label="Últimos 7 días">
            {week.map((d) => (
              <span key={d} className={isHabitDone(state, habit.id, d) ? 'dot on' : 'dot'} title={d} />
            ))}
          </span>
          <span className="mono streak">{streak > 0 ? `racha ${streak}${weekly ? ' sem' : ''}` : 'sin racha'}</span>
          <span className="mono xp-tag">+{habitXp(habit)} XP</span>
          <RewardTags rewards={habit.rewards} />
        </span>
      </div>
      <div className="item-actions">
        {onEdit && <button className="icon-btn edit-btn" onClick={() => setEditing(true)} aria-label={`Editar ${habit.name}`} title="Editar XP y atributos">✎</button>}
        {onDelete && <button className="icon-btn" onClick={onDelete} aria-label={`Borrar ${habit.name}`} title="Borrar">×</button>}
      </div>
    </li>
  );
}

/** Confirmación en la propia página (los diálogos nativos no siempre están disponibles). */
export function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className="ghost danger" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm">
      <button className="danger-solid" onClick={onConfirm}>{confirmLabel}</button>
      <button className="ghost" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}

/** Iconos compactos del XP de atributo que da una acción (p. ej. ⚔️5 🔨5). */
export function RewardTags({ rewards }: { rewards: AttributeRewards }) {
  const items = ATTRIBUTES.filter((a) => (rewards[a.id] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <span className="rewards mono" aria-label={items.map((a) => `+${formatAttrXp(rewards[a.id]!)} ${a.name}`).join(', ')}>
      {items.map((a) => (
        <span key={a.id}>
          <span aria-hidden="true">{a.icon}</span>+{formatAttrXp(rewards[a.id]!)}
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
                <span aria-hidden="true">{r.met ? '✓' : '○'}</span> {r.label}
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
    <ul className="attrs">
      {ATTRIBUTES.map((a) => {
        const lvl = attributeLevel(xp[a.id]);
        const last = detailed ? attributeHistory(state, a.id).slice(-1)[0] : undefined;
        const asleep = a.unlockLevel !== undefined && level < a.unlockLevel;
        if (asleep) {
          return (
            <li key={a.id} className="attr idle asleep" title={`${a.tagline} ${a.desc}`}>
              <span className="attr-icon" aria-hidden="true">🔒</span>
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
            <span className="attr-icon" aria-hidden="true">{a.icon}</span>
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
