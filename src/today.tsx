// Barra de Hoy: lo que llevas hoy de un vistazo (XP, foco, misiones, hábitos) y tu racha de días activos.
import type { GameState } from './types';
import { dailyCap, dayKey, deepWorkMinutesOnDay, habitSatisfied, isHabitDone, pendingQuests, xpOnDay } from './game';
import { activeDayStreak } from './core';
import { formatMinutes } from './ui';
import { Icon, type IconName } from './icons';

function Tile({ icon, value, label, sub, ratio, hot }: { icon: IconName; value: string; label: string; sub?: string; ratio?: number; hot?: boolean }) {
  return (
    <div className={hot ? 'today-tile hot' : 'today-tile'}>
      <Icon name={icon} className="today-ico" />
      <div className="today-txt">
        <span className="today-val mono">{value}</span>
        <span className="today-lbl">{label}{sub && <span className="muted"> · {sub}</span>}</span>
        {ratio !== undefined && <span className="today-bar" aria-hidden="true"><span style={{ width: `${Math.min(1, ratio) * 100}%` }} /></span>}
      </div>
    </div>
  );
}

export function TodayStrip({ state, now }: { state: GameState; now: number }) {
  const today = dayKey(now);
  const xp = xpOnDay(state, today);
  const questXp = xpOnDay(state, today, 'quest');
  const habitXp = xpOnDay(state, today, 'habit');
  const capQ = dailyCap(state, 'quest', now);
  const capH = dailyCap(state, 'habit', now);
  const minutes = deepWorkMinutesOnDay(state, today);
  const questsDone = state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === today).length;
  const questsLeft = pendingQuests(state, now).length;
  // hábitos de hoy: los diarios y los semanales que aún no has cumplido esta semana (o que marcaste hoy)
  const due = state.habits.filter((h) => h.frequency !== 'weekly' || isHabitDone(state, h.id, today) || !habitSatisfied(state, h, now));
  const habitsDone = due.filter((h) => isHabitDone(state, h.id, today)).length;
  const streak = activeDayStreak(state, now);
  const capped = questXp >= capQ || habitXp >= capH;
  return (
    <section className="today-strip" aria-label="Tu día">
      <Tile icon="zap" value={`+${xp}`} label="XP hoy" sub={capped ? 'tope' : undefined} hot={xp > 0} />
      <Tile icon="hourglass" value={formatMinutes(minutes)} label="de foco" hot={minutes > 0} />
      <Tile icon="check" value={questsLeft ? `${questsDone}/${questsDone + questsLeft}` : `${questsDone}`} label={questsLeft ? 'misiones' : questsDone === 1 ? 'misión hecha' : 'misiones hechas'} ratio={questsDone + questsLeft ? questsDone / (questsDone + questsLeft) : undefined} hot={questsDone > 0} />
      {due.length > 0 && <Tile icon="repeat" value={`${habitsDone}/${due.length}`} label="hábitos" ratio={habitsDone / due.length} hot={habitsDone === due.length} />}
      <Tile
        icon="flame"
        value={`${streak.days}`}
        label={streak.days === 1 ? 'día seguido' : 'días seguidos'}
        sub={streak.days > 0 && !streak.today ? 'falta hoy' : undefined}
        hot={streak.today && streak.days > 1}
      />
    </section>
  );
}
