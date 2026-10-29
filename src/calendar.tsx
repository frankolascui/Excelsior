// Calendario: mes, semana o día por horas. Eventos, bloques de tiempo, recordatorios, fechas límite de misiones y lo completado.
import { useState, type CSSProperties } from 'react';
import type { Game } from './screens';
import type { Quest } from './types';
import { addQuest, completeQuest, dayKey, deleteQuest, pendingQuests, setQuestDeadline, undoQuest, updateQuest, xpOnDay } from './game';
import { QuestItem, QuickAddQuest, shortDate } from './ui';
import { eventColor, eventIcon, eventsOn, isKeyEvent, priorityEvents, remindersOn } from './life';
import { countdown } from './life-ui';
import { addDays, AgendaForm, mondayOf, ReminderRow, TimeGrid } from './agenda-ui';
import { Fold } from './fold';
import { InfoTip } from './infotip';

/** Si el panel de misiones y recordatorios del calendario está abierto (se recuerda). */
const TASKS_KEY = 'excelsior:cal-tasks';
import { Icon } from './icons';
import { stepsDueOn, toggleStep } from './core';

type CalView = 'month' | 'week' | 'four' | 'day';
const CAL_VIEW_KEY = 'excelsior:cal-view';
const VIEW_NAMES: Record<CalView, string> = { month: 'Mes', week: 'Semana', four: '4 días', day: 'Día' };

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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
      return v === 'week' || v === 'four' || v === 'day' ? v : 'month';
    } catch {
      return 'month';
    }
  });
  function pickView(v: CalView) {
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
  const four = Array.from({ length: 4 }, (_, i) => addDays(selected, i)); // como en Google: empieza en el día elegido
  const title = view === 'month' ? monthName
    : view === 'week' ? `${shortDate(week[0])} – ${shortDate(week[6])}`
      : view === 'four' ? `${shortDate(four[0])} – ${shortDate(four[3])}`
      : cap(new Date(`${selected}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));

  const selSteps = stepsDueOn(state, selected);
  const selRems = remindersOn(state, selected);
  const [tasksOpen, setTasksOpen] = useState(() => {
    try {
      return localStorage.getItem(TASKS_KEY) === '1';
    } catch {
      return false;
    }
  });
  function toggleTasks(open: boolean) {
    setTasksOpen(open);
    try {
      localStorage.setItem(TASKS_KEY, open ? '1' : '0');
    } catch {
      /* ignorado */
    }
  }
  const doneOn = (day: string) => state.quests.filter((q) => q.completedAt && dayKey(q.completedAt) === day);
  const move = (delta: number) => {
    if (view === 'week') return select(addDays(selected, 7 * delta));
    if (view === 'four') return select(addDays(selected, 4 * delta));
    if (view === 'day') return select(addDays(selected, delta));
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => select(today);
  const unit = view === 'month' ? 'Mes' : view === 'week' ? 'Semana' : view === 'four' ? 'Bloque de 4 días' : 'Día';

  const selDue = pendingQuests(state, now).filter((q) => q.deadline === selected);
  const selDone = doneOn(selected);
  const undated = pendingQuests(state, now).filter((q) => !q.deadline);
  // Hoy también enseña lo atrasado, arriba del todo (pendingQuests ya viene ordenado por urgencia).
  const overdue = selected === today ? pendingQuests(state, now).filter((q) => q.deadline && q.deadline < today) : [];
  const pendingItem = (q: Quest) => (
    <QuestItem
      key={q.id} quest={q}
      onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), capNote, questOpts(q))}
      onStart={() => focusQuest(q)}
      onEdit={(t, v) => act((st) => updateQuest(st, q.id, { title: t, ...v }))}
      onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
      onDelete={() => act((st) => deleteQuest(st, q.id))}
    />
  );

  return (
    <>
      <section className={`panel calendar cal-view-${view}`} aria-labelledby="cal-h">
        <header className="cal-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label={`${unit} anterior`}><Icon name="chevron-left" /></button>
          <h3 id="cal-h" className="cal-month">{title}</h3>
          <button className="icon-btn" onClick={() => move(1)} aria-label={`${unit} siguiente`}><Icon name="chevron-right" /></button>
          <button className="ghost small" onClick={goToday}>Hoy</button>
          <div className="segmented cal-views" role="radiogroup" aria-label="Vista del calendario">
            {(Object.keys(VIEW_NAMES) as CalView[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'seg on' : 'seg'} onClick={() => pickView(v)}>{VIEW_NAMES[v]}</button>
            ))}
          </div>
        </header>
        <KeyEvents game={game} now={now} onPick={select} />
        {view === 'week' && <TimeGrid game={game} days={week} now={now} startFocus={startFocus} onPickDay={(d) => { select(d); pickView('day'); }} />}
        {view === 'four' && <TimeGrid game={game} days={four} now={now} startFocus={startFocus} onPickDay={(d) => { select(d); pickView('day'); }} />}
        {view === 'day' && <TimeGrid game={game} days={[selected]} now={now} startFocus={startFocus} />}
        {view === 'month' && <>
        <div className="cal-grid" role="grid" aria-label={`Calendario de ${monthName}`}>
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
          {days.map((day) => {
            // en la cuadrícula solo van los eventos; misiones y recordatorios se ven en su panel al elegir el día
            // en el mes solo lo importante (exámenes, lanzamientos); los bloques y el resto, en Semana, 4 días y Día
            const evs = eventsOn(state, day).filter(isKeyEvent);
            const xp = xpOnDay(state, day);
            const outside = Number(day.slice(5, 7)) - 1 !== cursor.m;
            const cls = ['cal-day', outside && 'out', day === today && 'today', day === selected && 'sel', xp > 0 && 'active', evs.some(isKeyEvent) && 'has-key'].filter(Boolean).join(' ');
            return (
              <button
                key={day} role="gridcell" className={cls} onClick={() => select(day)} aria-selected={day === selected}
                aria-label={`${shortDate(day)}: ${evs.length} eventos${xp ? `, ${xp} XP` : ''}`}
              >
                <span className="cal-num mono">{Number(day.slice(8))}</span>
                <span className="cal-items" aria-hidden="true">
                  {evs.slice(0, 2).map((e) => <span key={e.id} className={`cal-ev ev-${e.kind}${isKeyEvent(e) ? ' key' : ''}`} style={eventColor(e) ? ({ '--ev': eventColor(e) } as CSSProperties) : undefined}><Icon name={eventIcon(e.kind)} /> {e.time ? `${e.time} ` : ''}{e.title}</span>)}
                  {evs.length > 2 && <span className="cal-more">+{evs.length - 2} eventos</span>}
                </span>
                <span className="cal-dots" aria-hidden="true">
                  {evs.length > 0 && <b className="ev-dot"><Icon name={eventIcon(evs[0].kind)} /></b>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="hint cal-legend">
          <span><Icon name="ev-examen" /> En el mes solo salen los exámenes y lanzamientos. Los bloques de tiempo y el resto de eventos, en Semana o Día.</span>
        </p>
        </>}
        {view !== 'month' && <p className="hint cal-legend">Pulsa una hora libre para añadir algo a esa hora. <Icon name="zap" /> = tus sesiones de Deep Work. <Icon name="repeat" /> = se repite.</p>}
      </section>

      <section className={`panel cal-tasks${tasksOpen ? ' open' : ''}`} aria-labelledby="cal-tasks-h">
        <button type="button" className="cal-tasks-head" aria-expanded={tasksOpen} onClick={() => toggleTasks(!tasksOpen)}>
          <h3 id="cal-tasks-h">Misiones y recordatorios · {selected === today ? 'hoy' : shortDate(selected)}</h3>
          <span className="cal-tasks-count mono">
            {overdue.length > 0 && <span className="late"><Icon name="alert" /> {overdue.length}</span>}
            {selDue.length + selSteps.length > 0 && <span><Icon name="list" /> {selDue.length + selSteps.length}</span>}
            {selRems.length > 0 && <span><Icon name="bell" /> {selRems.length}</span>}
            {overdue.length + selDue.length + selSteps.length + selRems.length === 0 && <span className="muted">nada</span>}
          </span>
          <Icon name={tasksOpen ? 'chevron-down' : 'chevron-right'} />
        </button>
        {tasksOpen && (
          <div className="cal-tasks-body">
            {overdue.length + selDue.length + selDone.length + selSteps.length + selRems.length === 0 && <p className="empty">Nada para este día.</p>}
            {overdue.length > 0 && (
              <div className="cal-group overdue">
                <h4 className="cal-sub"><Icon name="alert" /> Atrasadas <span className="count mono">{overdue.length}</span></h4>
                <ul className="list">{overdue.map(pendingItem)}</ul>
              </div>
            )}
            {selDue.length > 0 && (
              <div className="cal-group">
                <h4 className="cal-sub"><Icon name="target" /> Misiones que vencen {selected === today ? 'hoy' : `el ${shortDate(selected)}`} <span className="count mono">{selDue.length}</span></h4>
                <ul className="list">{selDue.map(pendingItem)}</ul>
              </div>
            )}
            {selSteps.length > 0 && (
              <div className="cal-group">
                <h4 className="cal-sub"><Icon name="list" /> Pasos <span className="count mono">{selSteps.length}</span></h4>
                <ul className="list plain cal-steps" aria-label="Pasos con fecha este día">
                  {selSteps.map(({ quest, step }) => (
                    <li key={step.id} className="step">
                      <button type="button" className="step-check" aria-pressed={false} aria-label={`Marcar paso ${step.title}`} onClick={() => act((st) => toggleStep(st, quest.id, step.id))} />
                      <span className="step-title">{step.title} <span className="muted small-text">· paso de {quest.title}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selRems.length > 0 && (
              <div className="cal-group">
                <h4 className="cal-sub"><Icon name="bell" /> Recordatorios <span className="count mono">{selRems.length}</span></h4>
                <ul className="list">{selRems.map((r) => <ReminderRow key={r.id} r={r} now={now} game={game} />)}</ul>
              </div>
            )}
            {selDone.length > 0 && (
              <div className="cal-group done">
                <h4 className="cal-sub"><Icon name="check" /> Hechas <span className="count mono">{selDone.length}</span></h4>
                <ul className="list">
                  {selDone.map((q) => <QuestItem key={q.id} quest={q} onUndo={() => act((st) => ({ state: undoQuest(st, q.id), xp: 0 }))} />)}
                </ul>
              </div>
            )}
            {selected >= today && (
              <div className="cal-add">
                <p className="muted small-text">Nueva misión con fecha límite el {shortDate(selected)}:</p>
                <QuickAddQuest fixedDeadline={selected} onAdd={(t, ty, c) => act((st) => addQuest(st, t, ty, Date.now(), c))} />
              </div>
            )}
            {undated.length > 0 && (
              <div className="cal-group cal-undated">
                <div className="with-info">
                  <h4 className="cal-sub"><Icon name="calendar-plus" /> Misiones sin fecha <span className="count mono">{undated.length}</span></h4>
                  <InfoTip label="Misiones sin fecha"><p>Ponles fecha con <Icon name="calendar-plus" /> para que salgan en su día.</p></InfoTip>
                </div>
                <ul className="list">
                  {undated.map((q) => (
                    <QuestItem key={q.id} quest={q} onDeadline={(d) => act((st) => setQuestDeadline(st, q.id, d))}
                      onComplete={() => act((st) => completeQuest(st, q.id, Date.now()), capNote, questOpts(q))} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Sin lista de eventos del día (ya se ven en el calendario): solo el botón para añadir uno ese día. */}
      <section className="panel cal-add" aria-label="Añadir evento">
        <Fold key={`${selected}-${view === 'month'}`} label={`Añadir ${view === 'month' ? 'examen o lanzamiento' : 'evento'} · ${selected === today ? 'hoy' : shortDate(selected)}`} icon="plus" className="cal-add-fold">
          <AgendaForm game={game} day={selected} onlyKey={view === 'month'} />
        </Fold>
        {view === 'month' && <button className="link cal-open-day" onClick={() => pickView('day')}>Ver el día por horas <Icon name="arrow-right" /></button>}
      </section>

    </>
  );
}

/** Arriba del calendario: exámenes y lanzamientos del próximo mes, con la cuenta atrás. Pulsar uno lleva a su día. */
function KeyEvents({ game, now, onPick }: { game: Game; now: number; onPick: (day: string) => void }) {
  const list = priorityEvents(game.state, now).filter(isKeyEvent);
  if (list.length === 0) return null;
  return (
    <div className="key-events" aria-label="Lo importante del próximo mes">
      {list.slice(0, 4).map((e) => (
        <button key={e.id} type="button" className={`key-ev ev-${e.kind}`} style={eventColor(e) ? ({ '--ev': eventColor(e) } as CSSProperties) : undefined} onClick={() => onPick(e.day)}>
          <Icon name={eventIcon(e.kind)} /> <strong>{e.title}</strong>
          <span className="key-when">{countdown(e.day, now)}{e.time ? ` · ${e.time}` : ''}</span>
        </button>
      ))}
    </div>
  );
}
