// Gráfica de XP diario y mapa de actividad en cuadraditos (SVG a mano, sin librerías).
// Se dibujan al ancho real del contenedor para que el texto no se encoja en móvil.
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GameState } from './types';
import { activeDayStreak, activityByDay, bestDayStreak, heatLevel, niceTicks, type DayActivity } from './activity';
import { formatMinutes } from './ui';

export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

const shortDate = (ts: number) => new Date(ts).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

function Breakdown({ d }: { d: DayActivity }) {
  const parts = [
    d.quests && `${d.quests} ${d.quests === 1 ? 'misión' : 'misiones'}`,
    d.habits && `${d.habits} ${d.habits === 1 ? 'hábito' : 'hábitos'}`,
    d.deepWork && `${formatMinutes(d.deepWork)} de Deep Work`,
  ].filter(Boolean);
  return <span className="tip-sub">{parts.length ? parts.join(' · ') : 'Sin actividad'}</span>;
}

/** Tooltip HTML anclado a un punto del gráfico; se da la vuelta cerca del borde derecho. */
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width - 170;
  return (
    <div className="chart-tip" style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      {children}
    </div>
  );
}

// ---------- Calendario de días ----------

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Un cuadrado por día: filas de lunes a domingo y una columna por semana, como un calendario. */
function DayCalendar({ data, hover, onHover }: { data: DayActivity[]; hover: number | null; onHover: (i: number | null) => void }) {
  const best = Math.max(1, ...data.map((d) => d.xp));
  const last = data.length - 1;
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { // en rangos largos, que se vea hoy (a la derecha)
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data.length]);
  const offset = (new Date(data[0].ts).getDay() + 6) % 7; // lunes = 0
  const week = data.length <= 7; // una semana cabe en una fila; más días, una columna por semana
  const cols = Math.ceil((offset + data.length) / 7);
  const cell = week ? 26 : cols > 20 ? 11 : cols > 8 ? 16 : 20;
  const step = cell + (cols > 20 ? 3 : 4);
  const left = 18;
  const top = 16;
  const pos = (i: number) => week ? { col: i, row: 0 } : { col: Math.floor((offset + i) / 7), row: (offset + i) % 7 };
  const months = data.map((d, i) => ({ i, d: new Date(d.ts) })).filter(({ i, d }) => pos(i).row === 0 && d.getDate() <= 7 || i === 0)
    .filter(({ i }, k, arr) => k === 0 || pos(i).col - pos(arr[k - 1].i).col >= 2);
  return (
    <div className="day-cal">
      <div className="day-cal-scroll" ref={scroller}>
      <svg className="heat day-strip" width={week ? data.length * step : left + cols * step} height={week ? top + step : top + 7 * step} role="img" aria-label={`${data.filter((d) => d.xp > 0).length} días con actividad de ${data.length}`}>
        {week && data.map((d, i) => (
          <text key={d.day} className="axis" x={i * step + cell / 2} y={10} textAnchor="middle">{WEEKDAYS[(new Date(d.ts).getDay() + 6) % 7]}</text>
        ))}
        {!week && WEEKDAYS.map((w, r) => (
          <text key={w} className="axis" x={0} y={top + r * step + cell / 2} dy="0.35em">{w}</text>
        ))}
        {data.length > 7 && months.map(({ i, d }) => (
          <text key={i} className="axis" x={left + pos(i).col * step} y={10}>{d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</text>
        ))}
        {data.map((d, i) => {
          const { col, row } = pos(i);
          return (
            <rect
              key={d.day} className={`heat-${heatLevel(d.xp, best)}${i === last ? ' today' : ''}${hover === i ? ' on' : ''}`}
              x={(week ? 0 : left) + col * step} y={top + row * step} width={cell} height={cell} rx={cell > 12 ? 4 : 2}
              onPointerEnter={() => onHover(i)} onPointerLeave={() => onHover(null)}
            >
              <title>{`${shortDate(d.ts)}: ${d.xp} XP`}</title>
            </rect>
          );
        })}
      </svg>
      </div>
      <span className="day-legend muted small-text">menos {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`heat-${l}`} />)} más</span>
    </div>
  );
}

// ---------- XP diario ----------

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 0, label: 'Todo' }, // desde el primer día de la partida
];

/** Días desde que empezó la partida (o desde el primer XP, si es anterior), contando hoy. */
export function daysSinceStart(state: GameState, now: number): number {
  const first = Math.min(state.profile?.createdAt ?? now, ...state.xp.map((x) => x.at));
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return Math.max(7, Math.round((day(now) - day(first)) / 86_400_000) + 1);
}

/** Actividad: XP de cada día (línea) y, debajo, un calendario con un cuadrado por día que brilla según lo que hiciste. */
export function XpChart({ state, now }: { state: GameState; now: number }) {
  const [range, setRange] = useState(30);
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const days = range || daysSinceStart(state, now);
  const data = activityByDay(state, now, days);
  const total = data.reduce((n, d) => n + d.xp, 0);
  const avg = total / days;
  const best = data.reduce((m, d) => (d.xp > m.xp ? d : m), data[0]);
  const year = activityByDay(state, now, 365);
  const activeDays = data.filter((d) => d.xp > 0).length;

  const STRIP = 0;
  const H = 210 + STRIP;
  const m = { top: 22, right: 18, bottom: 26 + STRIP, left: 40 };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = H - m.top - m.bottom;
  const ticks = niceTicks(Math.max(50, best.xp));
  const top = ticks[ticks.length - 1];
  const x = (i: number) => m.left + (i * iw) / (data.length - 1);
  const y = (v: number) => m.top + ih * (1 - v / top);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.xp).toFixed(1)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const labelEvery = Math.max(days === 7 ? 1 : days === 30 ? 5 : 15, Math.ceil(days / Math.max(2, Math.floor(iw / 64))));
  const xLabels = data.map((_, i) => i).filter((i) => (data.length - 1 - i) % labelEvery === 0);
  const last = data.length - 1;
  const h = hover === null ? null : data[hover];

  function onMove(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * last);
    setHover(Math.max(0, Math.min(last, i)));
  }

  return (
    <section className="panel" aria-labelledby="xp-chart-h" data-tour="heat">
      <header className="panel-head chart-head">
        <div>
          <h3 id="xp-chart-h">Actividad</h3>
          <p className="muted chart-sub"><span className="mono">{total}</span> XP en {days} días · media <span className="mono">{Math.round(avg)}</span>/día</p>
          <p className="muted chart-sub">
            <span className="mono">{activeDays}</span> {activeDays === 1 ? 'día activo' : 'días activos'} · racha <span className="mono">{activeDayStreak(year)}</span> · mejor <span className="mono">{bestDayStreak(year)}</span>
          </p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.days} type="button" role="radio" aria-checked={range === r.days} className={range === r.days ? 'seg on' : 'seg'} onClick={() => { setRange(r.days); setHover(null); }}>
              {r.label}
            </button>
          ))}
        </div>
      </header>
      <div className="chart" ref={ref}>
        <svg width={width} height={H} role="img" aria-label={`XP diario de los últimos ${days} días: ${total} XP en total, mejor día ${best.xp} XP.`}>
          <defs>
            <linearGradient id="xp-wash" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--c2)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--c2)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="xp-stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--c3)" />
              <stop offset="60%" stopColor="var(--c2)" />
              <stop offset="100%" stopColor="var(--c1)" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} />
              <text className="axis" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} className={i === last ? 'axis strong' : 'axis'} x={x(i)} y={H - STRIP - 6} textAnchor={i === last ? 'end' : i === 0 ? 'start' : 'middle'}>
              {i === last ? 'hoy' : new Date(data[i].ts).toLocaleDateString('es-ES', days === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }).replace('.', '')}
            </text>
          ))}
          {avg > 0 && (
            <g>
              <line className="avg" x1={m.left} x2={m.left + iw} y1={y(avg)} y2={y(avg)} />
              <text className="axis" x={m.left + 4} y={y(avg) - 5}>media</text>
            </g>
          )}
          <path d={area} fill="url(#xp-wash)" />
          <path d={line} className="xp-line" stroke="url(#xp-stroke)" />
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={m.top} y2={y(0)} />}
          <circle className="xp-dot" cx={x(hover ?? last)} cy={y(data[hover ?? last].xp)} r={5} />
          {hover === null && (
            <text className="end-label mono" x={x(last) - 8} y={y(data[last].xp) - 10} textAnchor="end">{data[last].xp} XP</text>
          )}
          <rect x={m.left} y={0} width={iw} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {h && hover !== null && (
          <Tip x={x(hover)} y={y(h.xp)} width={width}>
            <span className="tip-title">{shortDate(h.ts)}</span>
            <span className="mono tip-value">{h.xp} XP</span>
            <Breakdown d={h} />
          </Tip>
        )}
      </div>
      <DayCalendar data={data} hover={hover} onHover={setHover} />
      <details className="chart-table">
        <summary>Ver como tabla</summary>
        <table>
          <thead><tr><th>Día</th><th>XP</th><th>Misiones</th><th>Hábitos</th><th>Deep Work</th></tr></thead>
          <tbody>
            {data.filter((d) => d.xp > 0).reverse().map((d) => (
              <tr key={d.day}><td>{shortDate(d.ts)}</td><td className="mono">{d.xp}</td><td className="mono">{d.quests}</td><td className="mono">{d.habits}</td><td className="mono">{formatMinutes(d.deepWork)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small-text">Los días sin XP no aparecen.</p>
      </details>
    </section>
  );
}
