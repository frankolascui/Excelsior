// Tabla de clasificación (amigos o gremio): XP de esta semana, de la pasada o de siempre.
import { useState } from 'react';
import type { GameState } from './types';
import { Face } from './friends';
import { formatMinutes } from './ui';
import { publicFields, type PublicProfile } from './social';
import { addWeeks, lastWeekChampion, PERIOD_LABEL, rankRows, weekEndsIn, weekStart, type Period, type RankRow } from './ranking';

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PERIODS: Period[] = ['week', 'last', 'all'];

/** Tu perfil con los datos de tu partida de ahora mismo (el publicado puede ir unos segundos por detrás). */
export function freshMe(me: string, state: GameState, published: PublicProfile | undefined | null, now: number): PublicProfile {
  return { user_id: me, tag: published?.tag ?? '', ...publicFields(state, now) };
}

function detail(r: RankRow): string {
  if (!r.week) return `Nv ${r.p.level} · ${r.p.avatar_name}`;
  const { deep, habits, xp } = r.week;
  if (!deep && !habits && !xp) return 'Sin actividad esa semana';
  return `${formatMinutes(deep)} de foco · ${habits} ${habits === 1 ? 'hábito' : 'hábitos'}`;
}

function lastWeekLabel(now: number): string {
  const from = addWeeks(weekStart(now), -1);
  const to = weekStart(now) - 1;
  const f = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  return `Del ${f(from)} al ${f(to)}`;
}

export function Leaderboard({ id, title, people, me, now, onOpen, hint }: {
  id: string;
  title: string;
  people: PublicProfile[];
  me: string;
  now: number;
  onOpen?: (p: PublicProfile) => void;
  hint?: string;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const rows = rankRows(people, period, now);
  const champ = period === 'week' ? lastWeekChampion(people, now) : null;
  const top = Math.max(1, ...rows.map((r) => r.value));
  const mine = rows.find((r) => r.p.user_id === me);
  const sub = period === 'week' ? weekEndsIn(now) : period === 'last' ? lastWeekLabel(now) : 'XP total desde el primer día';
  return (
    <section className="panel leaderboard" aria-labelledby={id}>
      <header className="panel-head chart-head">
        <div>
          <h3 id={id}>{title}</h3>
          <p className="muted chart-sub">{sub}{mine && rows.length > 1 && <> · vas <strong className="mono">{mine.place}.º</strong> de {rows.length}</>}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Periodo del ranking">
          {PERIODS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? 'seg on' : 'seg'} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </header>
      <ol className="lb-list">
        {rows.map((r) => {
          const self = r.p.user_id === me;
          const medal = r.value > 0 ? MEDAL[r.place] : undefined;
          return (
            <li key={r.p.user_id} className={`lb-row${medal ? ` podium p${r.place}` : ''}${self ? ' me' : ''}`}>
              <span className="lb-place mono" aria-label={`Puesto ${r.place}`}>{medal ?? r.place}</span>
              <button className="lb-who" onClick={() => onOpen?.(r.p)} disabled={!onOpen || self} aria-label={self ? 'Tú' : `Ver perfil de ${r.p.name}`}>
                <Face p={r.p} size={40} />
                <span className="lb-text">
                  <span className="lb-name">
                    {r.p.name}{self && <span className="muted"> (tú)</span>}
                    {champ === r.p.user_id && <span className="lb-crown" title="Ganó la semana pasada" aria-label="Ganó la semana pasada">👑</span>}
                  </span>
                  <span className="muted small-text">
                    {detail(r)}
                  </span>
                </span>
              </button>
              <span className="lb-score">
                <span className="lb-value mono">{r.value} XP</span>
                <span className="lb-bar" aria-hidden="true"><span style={{ width: `${(r.value / top) * 100}%` }} /></span>
              </span>
            </li>
          );
        })}
      </ol>
      {hint && <p className="hint">{hint}</p>}
    </section>
  );
}
