// Calendario de misiones: fechas límite de lo pendiente y lo completado cada día, para organizarse.
import { useState } from 'react';
import type { Game } from './screens';
import type { Quest } from './types';
import { addQuest, completeQuest, dayKey, deleteQuest, pendingQuests, setQuestDeadline, undoQuest, updateQuest, xpOnDay } from './game';
import { QuestItem, QuickAddQuest, shortDate } from './ui';

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

export function QuestCalendar({
  game, now, focusQuest, capNote, questOpts,
}: {
  game: Game; now: number; focusQuest: (q: Quest) => void; capNote: string; questOpts: (q: Quest) => { sound?: 'reward' | 'habit' | 'build'; party?: boolean };
}) {
  const { state, act } = game;
  const today = dayKey(now);
  const [cursor, setCursor] = useState(() => { const d = new Date(now); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const days = monthGrid(cursor.y, cursor.m);
  const longName = new Date(cursor.y, cursor.m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const monthName = longName[0].toUpperCase() + longName.slice(1);

  const due = (day: string) => state.quests.filter((q) => !q.completedAt && q.deadline === day);
  const doneOn = (day: string) => state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === day);
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const d = new Date(now);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  const selDue = pendingQuests(state, now).filter((q) => q.deadline === selected);
  const selDone = doneOn(selected);
  const undated = pendingQuests(state, now).filter((q) => !q.deadline);

  return (
    <>
      <section className="panel calendar" aria-labelledby="cal-h">
        <header className="cal-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Mes anterior">‹</button>
          <h3 id="cal-h" className="cal-month">{monthName}</h3>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Mes siguiente">›</button>
          <button className="ghost small" onClick={goToday}>Hoy</button>
        </header>
        <div className="cal-grid" role="grid" aria-label={`Calendario de ${monthName}`}>
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
          {days.map((day) => {
            const items = due(day);
            const finished = doneOn(day);
            const xp = xpOnDay(state, day);
            const outside = Number(day.slice(5, 7)) - 1 !== cursor.m;
            const late = day < today && items.length > 0;
            const cls = ['cal-day', outside && 'out', day === today && 'today', day === selected && 'sel', late && 'late', xp > 0 && 'active'].filter(Boolean).join(' ');
            return (
              <button
                key={day} role="gridcell" className={cls} onClick={() => setSelected(day)} aria-selected={day === selected}
                aria-label={`${shortDate(day)}: ${items.length} pendientes, ${finished.length} completadas${xp ? `, ${xp} XP` : ''}`}
              >
                <span className="cal-num mono">{Number(day.slice(8))}</span>
                <span className="cal-items" aria-hidden="true">
                  {items.slice(0, MAX_IN_CELL).map((q) => <span key={q.id} className={`cal-q q-${q.type}`}>{q.title}</span>)}
                  {items.length > MAX_IN_CELL && <span className="cal-more">+{items.length - MAX_IN_CELL}</span>}
                  {finished.length > 0 && <span className="cal-done">✓ {finished.length}</span>}
                </span>
                <span className="cal-dots" aria-hidden="true">
                  {items.slice(0, 4).map((q) => <i key={q.id} className={`q-${q.type}`} />)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="hint cal-legend">
          <span><i className="q-main" /> Principal</span><span><i className="q-daily" /> Diaria</span><span><i className="q-side" /> Secundaria</span>
          <span className="late-key">En rojo: fecha pasada sin terminar</span>
        </p>
      </section>

      <section className="panel" aria-labelledby="cal-day-h">
        <header className="panel-head">
          <h3 id="cal-day-h">{selected === today ? 'Hoy' : shortDate(selected)}</h3>
          <span className="count mono">{selDue.length}</span>
        </header>
        {selDue.length === 0 && selDone.length === 0 && <p className="empty">Nada para este día.</p>}
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
