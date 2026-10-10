// Calendario: mes, semana o día por horas. Eventos, bloques de tiempo, recordatorios, fechas límite de misiones y lo completado.
import { useState, type CSSProperties } from 'react';
import type { Game } from './screens';
import type { Quest } from './types';
import { addQuest, completeQuest, dayKey, deleteQuest, pendingQuests, setQuestDeadline, undoQuest, updateQuest, xpOnDay } from './game';
import { QuestItem, QuickAddQuest, shortDate } from './ui';
import { eventColor, eventIcon, eventsOn, remindersOn } from './life';
import { sfx } from './sfx';
import { addDays, DayAgenda, mondayOf, TimeGrid } from './agenda-ui';

type CalView = 'month' | 'week' | 'day';
const CAL_VIEW_KEY = 'excelsior:cal-view';
const VIEW_NAMES: Record<CalView, string> = { month: 'Mes', week: 'Semana', day: 'Día' };

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MAX_IN_CELL = 3;

/** Días (YYYY-MM-DD) de la cuadrícula del mes: semanas completas de lunes a domingo. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0);
  const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12).getTime()));
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

export function QuestCalendar({
  game, now, focusQuest, startFocus, capNote, questOpts,
}: {
  game: Game; now: number; focusQuest: (q: Quest) => void; startFocus?: (label: string) => void; capNote: string;
  questOpts: (q: Quest) => { sound?: 'reward' | 'habit' | 'build'; party?: boolean };
}) {
  const { state, act } = game;
  const today = dayKey(now);
  const [cursor, setCursor] = useState(() => { const d = new Date(now); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<CalView>(() => {
    try {
      const v = localStorage.getItem(CAL_VIEW_KEY);
      return v === 'week' || v === 'day' ? v : 'month';
    } catch {
      return 'month';
    }
  });
  function pickView(v: CalView) {
    if (v !== view) sfx.tick();
    setView(v);
    try {
      localStorage.setItem(CAL_VIEW_KEY, v);
    } catch {
      /* ignorado */
    }
  }
  /** Elegir un día también mueve el mes que se ve. */
  function select(day: string) {
    setSelected(day);
    setCursor({ y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) - 1 });
  }
  const days = monthGrid(cursor.y, cursor.m);
  const monthName = cap(new Date(cursor.y, cursor.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(selected), i));
  const title = view === 'month' ? monthName
    : view === 'week' ? `${shortDate(week[0])} – ${shortDate(week[6])}`
      : cap(new Date(`${selected}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));

  const due = (day: string) => state.quests.filter((q) => !q.completedAt && q.deadline === day);
  const doneOn = (day: string) => state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === day);
  const move = (delta: number) => {
    sfx.page();
    if (view === 'week') return select(addDays(selected, 7 * delta));
    if (view === 'day') return select(addDays(selected, delta));
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => select(today);
  const unit = view === 'month' ? 'Mes' : view === 'week' ? 'Semana' : 'Día';

  const selDue = pendingQuests(state, now).filter((q) => q.deadline === selected);
  const selDone = doneOn(selected);
  const undated = pendingQuests(state, now).filter((q) => !q.deadline);

  return (
    <>
      <section className={`panel calendar cal-view-${view}`} aria-labelledby="cal-h">
        <header className="cal-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label={`${unit} anterior`}>‹</button>
          <h3 id="cal-h" className="cal-month">{title}</h3>
          <button className="icon-btn" onClick={() => move(1)} aria-label={`${unit} siguiente`}>›</button>
          <button className="ghost small" onClick={goToday}>Hoy</button>
          <div className="segmented cal-views" role="radiogroup" aria-label="Vista del calendario">
            {(Object.keys(VIEW_NAMES) as CalView[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'seg on' : 'seg'} onClick={() => pickView(v)}>{VIEW_NAMES[v]}</button>
            ))}
          </div>
        </header>
        {view === 'week' && <TimeGrid game={game} days={week} now={now} startFocus={startFocus} onPickDay={(d) => { select(d); pickView('day'); }} />}
        {view === 'day' && <TimeGrid game={game} days={[selected]} now={now} startFocus={startFocus} />}
        {view === 'month' && <>
        <div className="cal-grid" role="grid" aria-label={`Calendario de ${monthName}`}>
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
          {days.map((day) => {
            const items = due(day);
            const evs = eventsOn(state, day);
            const rems = remindersOn(state, day).filter((r) => !r.doneAt);
            const finished = doneOn(day);
            const xp = xpOnDay(state, day);
            const outside = Number(day.slice(5, 7)) - 1 !== cursor.m;
            const late = day < today && items.length > 0;
            const cls = ['cal-day', outside && 'out', day === today && 'today', day === selected && 'sel', late && 'late', xp > 0 && 'active'].filter(Boolean).join(' ');
            return (
              <button
                key={day} role="gridcell" className={cls} onClick={() => select(day)} aria-selected={day === selected}
                aria-label={`${shortDate(day)}: ${evs.length ? `${evs.length} eventos, ` : ''}${rems.length ? `${rems.length} recordatorios, ` : ''}${items.length} pendientes, ${finished.length} completadas${xp ? `, ${xp} XP` : ''}`}
              >
                <span className="cal-num mono">{Number(day.slice(8))}</span>
                <span className="cal-items" aria-hidden="true">
                  {evs.slice(0, 2).map((e) => <span key={e.id} className={`cal-ev ev-${e.kind}`} style={eventColor(e) ? ({ '--ev': eventColor(e) } as CSSProperties) : undefined}>{eventIcon(e.kind)} {e.time ? `${e.time} ` : ''}{e.title}</span>)}
                  {evs.length > 2 && <span className="cal-more">+{evs.length - 2} eventos</span>}
                  {rems.slice(0, 1).map((r) => <span key={r.id} className="cal-rem">🔔 {r.title}</span>)}
                  {rems.length > 1 && <span className="cal-more">+{rems.length - 1} 🔔</span>}
                  {items.slice(0, MAX_IN_CELL).map((q) => <span key={q.id} className={`cal-q q-${q.type}`}>{q.title}</span>)}
                  {items.length > MAX_IN_CELL && <span className="cal-more">+{items.length - MAX_IN_CELL}</span>}
                  {finished.length > 0 && <span className="cal-done">✓ {finished.length}</span>}
                </span>
                <span className="cal-dots" aria-hidden="true">
                  {evs.length > 0 && <b className="ev-dot">{eventIcon(evs[0].kind)}</b>}
                  {rems.length > 0 && <b className="ev-dot">🔔</b>}
                  {items.slice(0, 4).map((q) => <i key={q.id} className={`q-${q.type}`} />)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="hint cal-legend">
          <span><i className="q-main" /> Principal</span><span><i className="q-daily" /> Diaria</span><span><i className="q-side" /> Secundaria</span>
          <span>📝🚀📞 Eventos</span><span>🔔 Recordatorios</span>
          <span className="late-key">En rojo: fecha pasada sin terminar</span>
        </p>
        </>}
        {view !== 'month' && <p className="hint cal-legend">Pulsa una hora libre para añadir algo a esa hora. ⚡ = tus sesiones de Deep Work. ↻ = se repite.</p>}
      </section>

      <section className="panel" aria-labelledby="cal-day-h">
        <header className="panel-head">
          <h3 id="cal-day-h">{selected === today ? 'Hoy' : shortDate(selected)}</h3>
          <span className="count mono">{selDue.length}</span>
        </header>
        <DayAgenda key={selected} game={game} day={selected} now={now} startFocus={startFocus} />
        {view === 'month' && <button className="link cal-open-day" onClick={() => pickView('day')}>Ver el día por horas →</button>}
        {selDue.length === 0 && selDone.length === 0 && <p className="empty">Sin misiones para este día.</p>}
        {selDue.length > 0 && (
          <ul className="list">
            {selDue.map((q) => (
              <QuestItem
                key={q.id} quest={q}
                onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), capNote, questOpts(q))}
                onStart={() => focusQuest(q)}
                onEdit={(t, v) => act((st) => updateQuest(st, q.id, { title: t, ...v }))}
                onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
                onDelete={() => act((st) => deleteQuest(st, q.id))}
              />
            ))}
          </ul>
        )}
        {selDone.length > 0 && (
          <ul className="list">
            {selDone.map((q) => <QuestItem key={q.id} quest={q} onUndo={() => act((st) => ({ state: undoQuest(st, q.id), xp: 0 }))} />)}
          </ul>
        )}
        {selected >= today && (
          <div className="cal-add">
            <p className="muted small-text">Nueva misión con fecha límite el {shortDate(selected)}:</p>
            <QuickAddQuest fixedDeadline={selected} onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />
          </div>
        )}
      </section>

      {undated.length > 0 && (
        <section className="panel quiet" aria-labelledby="undated-h">
          <header className="panel-head"><h3 id="undated-h">Sin fecha</h3><span className="count mono">{undated.length}</span></header>
          <p className="hint">Ponles fecha con 📅 para verlas en el calendario.</p>
          <ul className="list">
            {undated.map((q) => (
              <QuestItem key={q.id} quest={q} onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
                onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), capNote, questOpts(q))} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
