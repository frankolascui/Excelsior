// Historial de un hábito: las últimas 5 semanas en cuadrícula (lunes a domingo), escudos y números del mes.
import type { GameState, Habit } from './types';
import { dailyStreakInfo, dayKey, habitStreakDays, isHabitDone, shiftDay, weekStart } from './game';
import { Icon } from './icons';

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
  const last30 = Array.from({ length: 30 }, (_, i) => dayKey(shiftDay(now, -i))).filter((d) => d >= born);
  const done30 = last30.filter((d) => isHabitDone(state, habit.id, d)).length;
  const weekly = habit.frequency === 'weekly';
  const total = state.habitCompletions.filter((c) => c.habitId === habit.id).length;
  return (
    <div className="habit-history">
      <div className="hh-grid" role="grid" aria-label={`Últimas 5 semanas de ${habit.name}`}>
        {WD.map((w) => <span key={w} className="hh-wd">{w}</span>)}
        {days.map((d) => {
          const done = isHabitDone(state, habit.id, d);
          const cls = ['hh-day', done && 'on', shields.has(d) && 'shield', d === today && 'today', d > today && 'future', d < born && 'before'].filter(Boolean).join(' ');
          const label = `${new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}: ${done ? 'hecho' : shields.has(d) ? 'salvado por el escudo' : 'sin hacer'}`;
          return onToggleDay && editableDay(d, now)
            ? <button type="button" key={d} role="gridcell" className={cls} aria-pressed={done} aria-label={label} title={label} onClick={() => onToggleDay(d)}>{Number(d.slice(8))}</button>
            : <span key={d} role="gridcell" className={cls} aria-label={label} title={label}>{shields.has(d) ? <Icon name="shield" /> : Number(d.slice(8))}</span>;
        })}
      </div>
      <div className="hh-stats">
        <span><b className="mono">{done30}</b>{weekly ? ' veces' : `/${last30.length} días`} en los últimos 30 días</span>
        {!weekly && last30.length > 0 && <span><b className="mono">{Math.round((done30 / last30.length) * 100)} %</b> de constancia</span>}
        <span><b className="mono">{total}</b> en total</span>
        {habitStreakDays(state, habit.id, now) > 0 && shields.size > 0 && <span><Icon name="shield" /> Escudo usado esta racha</span>}
      </div>
      <p className="hint">Puedes marcar o desmarcar los últimos 7 días si se te olvidó. {!weekly && 'Escudo: un día fallado por semana no rompe la racha si el día anterior lo hiciste (ese día no suma).'}</p>
    </div>
  );
}
