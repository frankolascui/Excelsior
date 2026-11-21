// Historial de un hábito: las últimas 5 semanas en cuadrícula (lunes a domingo), escudos y números del mes.
import type { ReactNode } from 'react';
import type { GameState, Habit, HabitProgression } from './types';
import { atMax, clockText, constancy, habitHints, levelUpDue, nextValue, parseClock, PROGRESSION_RULES, valueText } from './progression';
import { GuidePortrait } from './tutorial';
import { dailyStreakInfo, dayKey, habitDayCount, habitPausedOn, habitStreakDays, isHabitDone, maxPerWeek, MINIMUM_MAX, PER_DAY_MAX, shiftDay, weekStart } from './game';
import { SHIELD } from './economy';
import { Icon } from './icons';
import { Select } from './pickers';

const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Días que aún se pueden marcar a toro pasado: hoy y los 6 anteriores (los mismos puntos que ves en la lista). */
export function editableDay(day: string, now: number): boolean {
  return day <= dayKey(now) && day >= dayKey(shiftDay(now, -6));
}

export function habitShields(state: GameState, habit: Habit, now: number): string[] {
  return habit.frequency === 'weekly' ? [] : dailyStreakInfo(state, habit.id, now).shields;
}

export function HabitHistory({ state, habit, now, onToggleDay }: { state: GameState; habit: Habit; now: number; onToggleDay?: (day: string) => void }) {
  const today = dayKey(now);
  const first = new Date(`${weekStart(shiftDay(now, -28))}T12:00:00`).getTime();
  const days = Array.from({ length: 35 }, (_, i) => dayKey(shiftDay(first, i)));
  const shields = new Set(habitShields(state, habit, now));
  const born = dayKey(habit.createdAt);
  const last30 = Array.from({ length: 30 }, (_, i) => dayKey(shiftDay(now, -i))).filter((d) => d >= born && (isHabitDone(state, habit.id, d) || !habitPausedOn(state, habit.id, d)));
  const done30 = last30.filter((d) => isHabitDone(state, habit.id, d)).length;
  const weekly = habit.frequency === 'weekly';
  const total = state.habitCompletions.filter((c) => c.habitId === habit.id).length;
  return (
    <div className="habit-history">
      <div className="hh-grid" role="grid" aria-label={`Últimas 5 semanas de ${habit.name}`}>
        {WD.map((w) => <span key={w} className="hh-wd">{w}</span>)}
        {days.map((d) => {
          const done = isHabitDone(state, habit.id, d);
          const rest = !done && habitPausedOn(state, habit.id, d);
          const cls = ['hh-day', done && 'on', shields.has(d) && 'shield', rest && 'paused', d === today && 'today', d > today && 'future', d < born && 'before'].filter(Boolean).join(' ');
          const label = `${new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}: ${done ? 'hecho' : shields.has(d) ? 'congelado con un escudo' : rest ? 'en pausa (vacaciones)' : 'sin hacer'}`;
          return onToggleDay && editableDay(d, now)
            ? <button type="button" key={d} role="gridcell" className={cls} aria-pressed={done} aria-label={label} title={label} onClick={() => onToggleDay(d)}>{Number(d.slice(8))}</button>
            : <span key={d} role="gridcell" className={cls} aria-label={label} title={label}>{shields.has(d) ? <Icon name="snowflake" /> : Number(d.slice(8))}</span>;
        })}
      </div>
      <div className="hh-stats">
        <span><b className="mono">{done30}</b>{weekly ? ' veces' : `/${last30.length} días`} en los últimos 30 días</span>
        {!weekly && last30.length > 0 && <span><b className="mono">{Math.round((done30 / last30.length) * 100)} %</b> de constancia</span>}
        <span><b className="mono">{total}</b> en total</span>
        {habitStreakDays(state, habit.id, now) > 0 && shields.size > 0 && <span className="ice-text"><Icon name="snowflake" /> Racha congelada con un escudo</span>}
      </div>
      {habit.minimum && <p className="small-text"><b>Mínimo para un día malo:</b> {habit.minimum}</p>}
      <p className="hint">Pulsa un día de los últimos 7 para marcarlo o desmarcarlo.{!weekly && ` Si fallas un día, un escudo de la Tienda (${SHIELD.cost} monedas) congela el de ayer y la racha sigue.`}</p>
    </div>
  );
}

/** Campo del mínimo: lo que vale en un día malo. Solo se enseña cuando la racha peligra, para no quedarse siempre en él. */
export function MinimumInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="minimum-input" htmlFor={id}>
      <span className="small-text">Mínimo para un día malo (opcional)</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={MINIMUM_MAX} placeholder="ej. 5 minutos, 1 página, 10 flexiones" />
    </label>
  );
}

/** Opción escondida en «XP y atributos»: poder marcarlo más de una vez el mismo día (p. ej. doble entreno). */
export function PerDayInput({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="perday-input" id={id}>
      <span className="small-text">Veces al día</span>
      <div className="segmented" role="radiogroup" aria-label="Veces al día">
        {Array.from({ length: PER_DAY_MAX }, (_, i) => i + 1).map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} className={value === n ? 'seg on' : 'seg'} onClick={() => onChange(n)}>{n === 1 ? '1 vez' : `${n} veces`}</button>
        ))}
      </div>
      <span className="hint">{value > 1
        ? `El botón de siempre cumple el día. Si un día lo haces más veces, pulsa las estrellas: cada vez extra da su XP y cuenta para tu meta semanal.`
        : 'Para cosas que haces más de una vez al día (ej. doble entreno, beber agua).'}</span>
    </div>
  );
}

/**
 * Veces extra de hoy en un hábito de varias veces al día: una estrella por cada vez de más (la primera es el botón).
 * Pulsar una estrella deja el día en ese número; pulsar la última encendida la quita.
 */
export function DayPips({ name, count, max, onSet }: { name: string; count: number; max: number; onSet?: (n: number) => void }) {
  return (
    <span className="day-pips" role="group" aria-label={`${name}: ${count} de ${max} hoy`}>
      {Array.from({ length: max - 1 }, (_, i) => i + 2).map((n) => {
        const on = n <= count;
        const next = on && n === count ? n - 1 : n;
        const star = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z" /></svg>;
        return onSet
          ? <button type="button" key={n} className={on ? 'pip on' : 'pip'} aria-pressed={on} onClick={() => onSet(next)}
              aria-label={next < count ? `Quitar una vez extra de ${name}` : `${name}: ${n} veces hoy`} title={next < count ? 'Quitar esta vez extra' : `Vez extra: ${n} hoy (da su XP)`}>{star}</button>
          : <span key={n} className={on ? 'pip on' : 'pip'}>{star}</span>;
      })}
      {count > 1 && <span className="pips-text mono">×{count} hoy</span>}
    </span>
  );
}

const DAY_MS = 86_400_000;
/** Días enteros entre dos fechas YYYY-MM-DD. */
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY_MS);

/**
 * La sobrecarga a la vista: meta de ahora, la siguiente y la final, los escalones subidos
 * y cuánto falta para que Hiperión proponga subir (14 días al 80 %).
 */
export function HabitGoal({ state, habit, now }: { state: GameState; habit: Habit; now: number }) {
  const p = habit.progression;
  if (!p) return null;
  const start = p.history?.[0]?.value ?? p.value;
  const next = nextValue(p);
  const reached = atMax(p);
  const max = p.kind === 'freq' ? p.max ?? 7 : p.max;
  const steps = max !== undefined && p.step ? Math.max(1, Math.round(Math.abs(max - start) / Math.abs(p.step))) : null;
  const climbed = p.step ? Math.round(Math.abs(p.value - start) / Math.abs(p.step)) : 0;
  const weekly = habit.frequency === 'weekly';
  const need = PROGRESSION_RULES.levelDays;
  const pctNeed = Math.round(PROGRESSION_RULES.levelPct * 100);

  let line: ReactNode;
  if (reached) line = <>Meta final alcanzada. Ahora a mantenerla.</>;
  else if (next === null) line = <>Esta meta ya no puede subir más.</>;
  else if (levelUpDue(state, habit, now) !== null) line = <><b>Listo para subir</b> a {valueText(p, next)}: Hiperión te lo propone arriba.</>;
  else if (habit.snooze?.level && habit.snooze.level >= dayKey(now)) line = <>Dijiste «Aún no»: te lo vuelvo a proponer después del {dayLabel(habit.snooze.level)}.</>;
  else if (weekly) {
    const weeks = Math.max(0, Math.floor(daysBetween(dayKey(p.since), weekStart(now)) / 7));
    const w = Math.min(weeks, need / 7);
    const c = w > 0 ? constancy(state, habit, now, w * 7, p.since) : null;
    line = <>Para subir: {need / 7} semanas completas al {pctNeed} %. Llevas {w} de {need / 7}{c !== null && <> · <b className={c >= PROGRESSION_RULES.levelPct ? 'good' : 'low'}>{Math.round(c * 100)} %</b></>}.</>;
  } else {
    const elapsed = Math.max(0, daysBetween(dayKey(p.since), dayKey(now)));
    const d = Math.min(elapsed, need);
    const c = d > 0 ? constancy(state, habit, now, d, p.since) : null;
    line = <>Para subir: {need} días al {pctNeed} %. Llevas {d} de {need}{c !== null && <> · <b className={c >= PROGRESSION_RULES.levelPct ? 'good' : 'low'}>{Math.round(c * 100)} %</b></>}.</>;
  }

  return (
    <div className="habit-goal" data-testid="habit-goal">
      <p className="habit-goal-head">
        <span className="muted">Meta</span> <b>{valueText(p, p.value)}</b>
        {!reached && next !== null && <span className="muted"> · siguiente {valueText(p, next)}</span>}
        {max !== undefined && !reached && <span className="muted"> · final {valueText(p, max)}</span>}
      </p>
      {steps !== null && (steps <= 16
        ? <span className="goal-steps" aria-label={`Escalón ${climbed} de ${steps}`}>{Array.from({ length: steps }, (_, i) => <i key={i} className={i < climbed ? 'on' : ''} />)}</span>
        : <span className="goal-bar" aria-label={`${Math.round((climbed / steps) * 100)} % del camino`}><i style={{ width: `${Math.min(100, (climbed / steps) * 100)}%` }} /></span>)}
      <p className="habit-goal-line small-text">{line}</p>
    </div>
  );
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

/** Texto de «Compartir mi semana»: % de cada hábito de lunes a hoy, para mandarlo a un amigo. */
export function weekShareText(state: GameState, now: number): string {
  const start = new Date(`${weekStart(now)}T12:00:00`).getTime();
  const days = Array.from({ length: 7 }, (_, i) => dayKey(shiftDay(start, i))).filter((d) => d <= dayKey(now));
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  const lines = state.habits.map((h) => {
    const counted = days.filter((d) => d >= dayKey(h.createdAt));
    const done = h.frequency === 'weekly' ? counted.reduce((n, d) => n + habitDayCount(state, h.id, d), 0) : counted.filter((d) => isHabitDone(state, h.id, d)).length;
    const need = h.frequency === 'weekly' ? (h.perWeek ?? 1) : counted.length;
    const pct = need ? Math.min(100, Math.round((done / need) * 100)) : 0;
    return { pct, text: `- ${h.name}: ${done}/${need} (${pct} %)${pct < 80 ? ' · por debajo del 80 %' : ''}` };
  });
  const avg = lines.length ? Math.round(lines.reduce((n, l) => n + l.pct, 0) / lines.length) : 0;
  return [
    `Mi semana en Excelsior (${fmt(days[0])} – ${fmt(days.at(-1)!)})`,
    ...lines.map((l) => l.text),
    `Media: ${avg} %`,
  ].join('\n');
}

/**
 * Asa para ordenar arrastrando, con ratón o con el dedo (en móvil no hace scroll al tocarla).
 * Solo se mueve entre los de su grupo (`group`, ids en el orden que se ven). Con el teclado: flechas arriba y abajo.
 */
export function DragHandle({ name, group, onDrop }: { name: string; group: string[]; onDrop: (order: string[]) => void }) {
  function down(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || group.length < 2) return;
    e.preventDefault();
    const btn = e.currentTarget;
    const li = btn.closest('li') as HTMLElement;
    const list = li.parentElement!;
    const items = group.map((id) => list.querySelector<HTMLElement>(`li[data-habit="${id}"]`)).filter((x): x is HTMLElement => !!x);
    const from = items.indexOf(li);
    if (from < 0) return;
    const rects = items.map((x) => x.getBoundingClientRect());
    const step = rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height + 8;
    const y0 = e.clientY;
    let to = from;
    btn.setPointerCapture(e.pointerId);
    list.classList.add('drag-active');
    li.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      const dy = Math.max(rects[0].top - rects[from].top, Math.min(rects.at(-1)!.top - rects[from].top, ev.clientY - y0));
      li.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / step)));
      items.forEach((x, i) => {
        if (i === from) return;
        const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      items.forEach((x) => { x.style.transform = ''; });
      li.classList.remove('dragging');
      list.classList.remove('drag-active');
      if (to !== from) {
        const order = [...group];
        order.splice(to, 0, ...order.splice(from, 1));
        list.dataset.dropped = '1'; // ya se vio moverse: la lista no lo anima otra vez
        onDrop(order);
      }
    };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  function key(e: React.KeyboardEvent) {
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    const i = group.indexOf(li(e));
    if (!dir || i < 0 || !group[i + dir]) return;
    e.preventDefault();
    const order = [...group];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    onDrop(order);
  }
  const li = (e: React.SyntheticEvent) => (e.currentTarget.closest('li') as HTMLElement | null)?.dataset.habit ?? '';
  return (
    <button type="button" className="icon-btn drag-handle" onPointerDown={down} onKeyDown={key}
      aria-label={`Mover ${name} (arrastra, o usa las flechas arriba y abajo)`} title="Arrastra para ordenar">
      <Icon name="grip" />
    </button>
  );
}

// ---------- Sobrecarga progresiva ----------

export interface ProgressionDraft { kind: 'none' | HabitProgression['kind']; value: string; step: string; unit: string; dir: 'earlier' | 'later'; max: string }

export function progressionDraft(h?: Habit): ProgressionDraft {
  const p = h?.progression;
  if (!p) return { kind: 'none', value: '', step: '', unit: '', dir: 'earlier', max: '' };
  if (p.kind === 'time') return { kind: 'time', value: clockText(p.value), step: String(Math.abs(p.step)), unit: '', dir: p.step < 0 ? 'earlier' : 'later', max: p.max === undefined ? '' : clockText(p.max) };
  return { kind: p.kind, value: String(p.value), step: String(p.step), unit: p.unit ?? '', dir: 'earlier', max: p.max === undefined ? '' : String(p.max) };
}

/** Del borrador a la sobrecarga (null = sin ella). `perWeek` = la frecuencia elegida (7 = cada día). */
export function draftToProgression(d: ProgressionDraft, perWeek: number, perDay = 1): Omit<HabitProgression, 'since' | 'history'> | null {
  if (d.kind === 'none') return null;
  if (d.kind === 'freq') {
    const cap = perDay > 1 ? maxPerWeek(perDay) : 7;
    if (perWeek >= cap || (perWeek === 7 && perDay <= 1)) return null;
    const max = Number(d.max);
    return { kind: 'freq', value: perWeek, step: 1, ...(max > perWeek && max <= cap && !(max === 7 && cap === 7) ? { max } : {}) };
  }
  const step = Math.abs(Number(d.step.replace(',', '.')));
  if (d.kind === 'time') {
    const v = parseClock(d.value);
    if (v === null || !step) return null;
    const signed = d.dir === 'earlier' ? -Math.round(step) : Math.round(step);
    const max = parseClock(d.max);
    // la meta final tiene que estar hacia donde vas (antes si adelantas, después si retrasas)
    const ok = max !== null && (signed < 0 ? max < v : max > v);
    return { kind: 'time', value: v, step: signed, ...(ok ? { max: max! } : {}) };
  }
  const v = Number(d.value.replace(',', '.'));
  const max = Number(d.max.replace(',', '.'));
  return v > 0 && step > 0 ? { kind: 'amount', value: v, step, unit: d.unit, ...(max > v ? { max } : {}) } : null;
}

/** Campos de la sobrecarga: qué sube (cantidad, hora o veces por semana), desde dónde y de cuánto en cuánto. */
export function ProgressionInput({ id, value: d, onChange, perWeek, perDay = 1 }: { id: string; value: ProgressionDraft; onChange: (d: ProgressionDraft) => void; perWeek: number; perDay?: number }) {
  const set = (patch: Partial<ProgressionDraft>) => onChange({ ...d, ...patch });
  const cap = perDay > 1 ? maxPerWeek(perDay) : 7;
  const freqOk = perWeek !== 7 && perWeek < cap;
  return (
    <fieldset className="progression-input">
      <legend className="small-text">Sobrecarga progresiva (opcional)</legend>
      <Select<ProgressionDraft['kind']> id={`${id}-kind`} label="Qué sube" value={d.kind} onChange={(v) => set({ kind: v })}
        options={[{ value: 'none', label: 'Sin sobrecarga' }, { value: 'amount', label: 'Cantidad', hint: '(minutos, páginas, kilos…)' }, { value: 'time', label: 'Hora', hint: '(ej. irse a dormir)' }, ...(freqOk ? [{ value: 'freq' as const, label: 'Veces por semana' }] : [])]} />
      {d.kind === 'amount' && (
        <div className="progression-row">
          <label>Empiezo en <input id={`${id}-value`} inputMode="decimal" value={d.value} onChange={(e) => set({ value: e.target.value })} placeholder="10" /></label>
          <label>unidad <input id={`${id}-unit`} value={d.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} placeholder="min" /></label>
          <label>sube de <input id={`${id}-step`} inputMode="decimal" value={d.step} onChange={(e) => set({ step: e.target.value })} placeholder="5" /></label>
          <label>hasta <input id={`${id}-max`} inputMode="decimal" value={d.max} onChange={(e) => set({ max: e.target.value })} placeholder="60" aria-label="Hasta dónde quieres llegar" /></label>
        </div>
      )}
      {d.kind === 'time' && (
        <div className="progression-row">
          <label>Ahora a las <input id={`${id}-value`} value={d.value} onChange={(e) => set({ value: e.target.value })} placeholder="22:00" /></label>
          <label><Select<ProgressionDraft['dir']> id={`${id}-dir`} label="Hacia dónde" value={d.dir} onChange={(v) => set({ dir: v })} options={[{ value: 'earlier', label: 'adelantar' }, { value: 'later', label: 'retrasar' }]} /> <input id={`${id}-step`} inputMode="numeric" value={d.step} onChange={(e) => set({ step: e.target.value })} placeholder="15" /> min</label>
          <label>hasta las <input id={`${id}-max`} value={d.max} onChange={(e) => set({ max: e.target.value })} placeholder="21:00" aria-label="Hasta qué hora quieres llegar" /></label>
        </div>
      )}
      {d.kind === 'freq' && freqOk && (
        <div className="progression-row">
          <span>Empieza en {perWeek} y sube de 1 en 1</span>
          <label>hasta <Select id={`${id}-max`} label="Hasta cuántas veces por semana" value={d.max || String(cap)} onChange={(v) => set({ max: v })}
            options={Array.from({ length: cap - perWeek }, (_, i) => perWeek + 1 + i).map((n) => ({ value: String(n), label: n === 7 && cap === 7 ? 'cada día' : `${n} veces/sem` }))} /></label>
        </div>
      )}
      {d.kind !== 'none' && <p className="hint">«Hasta» es tu meta final (opcional): al llegar, deja de subir.</p>}
      {d.kind !== 'none' && <p className="hint">Hiperión te propondrá subir cuando lleves {PROGRESSION_RULES.levelDays} días con la meta actual al {Math.round(PROGRESSION_RULES.levelPct * 100)} % o más. Tú decides si subes.</p>}
    </fieldset>
  );
}

/** Hiperión sobre tus hábitos: subir la meta cuando ya la cumples y retirar los que ya están automatizados. */
export function HabitHints({ state, now, guide, onLevel, onRetire, onSnooze }: {
  state: GameState; now: number; guide: string;
  onLevel: (id: string) => void; onRetire: (id: string) => void; onSnooze: (id: string, kind: 'level' | 'auto') => void;
}) {
  const hints = habitHints(state, now);
  if (hints.length === 0) return null;
  return (
    <section className="panel habit-hints" aria-labelledby="habit-hints-h">
      <header className="habit-hints-head">
        <span className="tour-portrait" aria-hidden="true"><GuidePortrait /></span>
        <h3 id="habit-hints-h" className="eyebrow">{guide}</h3>
      </header>
      <ul className="list plain">
        {hints.map((x) => {
          const h = x.habit;
          const p = h.progression;
          const canLevel = p && nextValue(p) !== null;
          return x.kind === 'auto' ? (
            <li key={h.id} className="habit-hint auto">
              <p><b>{h.name}</b> ya te sale solo ({Math.round(x.pct * 100)} % en {PROGRESSION_RULES.autoDays} días). ¿Lo retiras de la lista para centrarte en otro?</p>
              <div className="habit-hint-actions">
                <button className="primary small" onClick={() => onRetire(h.id)}><Icon name="check" /> Retirarlo</button>
                {canLevel && <button className="ghost small" onClick={() => onLevel(h.id)} title={`Siguiente meta: ${valueText(p!, nextValue(p!)!)}`}><Icon name="trend" /> Subir la meta</button>}
                <button className="ghost small" onClick={() => onSnooze(h.id, 'auto')}>Seguir con él</button>
              </div>
            </li>
          ) : (
            <li key={h.id} className="habit-hint level">
              <p><b>{h.name}</b>: {PROGRESSION_RULES.levelDays} días cumpliendo. Siguiente meta: <b>{valueText(p!, x.next)}</b>{p!.max === x.next && ' (la final)'}.</p>
              <div className="habit-hint-actions">
                <button className="primary small" onClick={() => onLevel(h.id)}><Icon name="trend" /> Subir la meta</button>
                <button className="ghost small" onClick={() => onSnooze(h.id, 'level')}>Aún no</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Hábitos retirados por automatizados, plegados al final. */
export function RetiredHabits({ state, onRestore }: { state: GameState; onRestore: (id: string) => void }) {
  const list = state.retiredHabits ?? [];
  if (list.length === 0) return null;
  return (
    <details className="panel retired-habits">
      <summary><Icon name="trophy" /> Hábitos automatizados ({list.length})</summary>
      <ul className="list plain">
        {list.map((h) => (
          <li key={h.id}>
            <span><b>{h.name}</b>{h.progression && <> · {valueText(h.progression, h.progression.value)}</>} <span className="muted small-text">retirado el {new Date(h.retiredAt ?? 0).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></span>
            <button className="link" onClick={() => onRestore(h.id)}><Icon name="rotate-ccw" /> Volver a la lista</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
