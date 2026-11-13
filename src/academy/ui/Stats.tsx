import { useEffect, useMemo, useState } from 'react';
import { listAllTopics, listCardStats, listReviewsSince, listSubjects } from '../study/api';
import { routeToHash } from '../study/logic';
import { LEVELS } from '../study/srs';
import { dailyCounts, forecast, loadWarning, mastery, MASTERED_DAYS, secondsPerCard, streak, trueRetention, weakTopics, type CardStat, type ReviewLog } from '../study/stats';
import type { Subject, Topic } from '../study/types';
import { sfx } from '../sfx';
import { friendly } from './CardsPanel';
import { Icon } from './Icon';

// Dominio: una sola gama (de oscuro a claro = de menos a más) porque es un orden, no tres cosas distintas.
const MASTERY = [
  { key: 'nuevas', label: 'Nuevas', color: '#4b3a78' },
  { key: 'aprendiendo', label: 'Aprendiendo', color: '#8e63f2' },
  { key: 'dominadas', label: `Dominadas (≥ ${MASTERED_DAYS} d)`, color: '#e0c6ff' },
] as const;

const fmtDay = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fmtWeekday = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });

/** Estadísticas: cómo vas, qué te espera y dónde fallas. Se puede filtrar por asignatura. */
export function Stats({ subjectId }: { subjectId?: string }) {
  const [data, setData] = useState<{ reviews: ReviewLog[]; cards: CardStat[]; topics: Topic[]; subjects: Subject[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listReviewsSince(30), listCardStats(), listAllTopics(), listSubjects()])
      .then(([reviews, cards, topics, subjects]) => setData({ reviews, cards, topics, subjects }))
      .catch((e) => setError(friendly(e.message)));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const subjectOf = new Map(data.topics.map((t) => [t.id, t.subject_id]));
    const inSubject = (tid: string | null) => !subjectId || (tid !== null && subjectOf.get(tid) === subjectId);
    const reviews = data.reviews.filter((r) => inSubject(r.topic_id));
    const cards = data.cards.filter((c) => inSubject(c.topic_id));
    const next = forecast(cards, 14);
    return {
      reviews, cards, next,
      daily: dailyCounts(reviews, 30),
      retention: trueRetention(reviews),
      load: loadWarning(next, secondsPerCard(reviews)),
      streak: streak(data.reviews), // la racha es tuya, no de una asignatura
      mastery: mastery(cards),
      weak: weakTopics(reviews),
      today: reviews.filter((r) => new Date(r.reviewed_at) >= new Date(new Date().setHours(0, 0, 0, 0))).length,
    };
  }, [data, subjectId]);

  if (error) return <p className="error">{error}</p>;
  if (!data || !view) return <p className="muted">Calculando estadísticas…</p>;

  const subject = data.subjects.find((s) => s.id === subjectId);
  const target = subject ? LEVELS[subject.level ?? 'equilibrado'].retention * 100 : null;
  const topicById = new Map(data.topics.map((t) => [t.id, t]));
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]));

  return (
    <section className="stack stats-page" style={{ '--spine': subject?.color ?? 'var(--c2)' } as React.CSSProperties}>
      <nav className="crumbs">
        <a className="back-btn" href="#academy/" onClick={() => sfx.page()}><Icon name="left" size={16} /> Estantería</a>
      </nav>
      <div>
        <p className="eyebrow">Últimos 30 días</p>
        <h1 className="section-title">Estadísticas</h1>
      </div>

      <div className="chips stats-filter" role="radiogroup" aria-label="Asignatura">
        <a role="radio" aria-checked={!subjectId} className="chip" href={routeToHash({ view: 'estadisticas' })} onClick={() => sfx.tick()}>Todas</a>
        {data.subjects.map((s) => (
          <a key={s.id} role="radio" aria-checked={s.id === subjectId} className="chip" href={routeToHash({ view: 'estadisticas', subjectId: s.id })} onClick={() => sfx.tick()}>
            <span className="dot" style={{ background: s.color }} /> {s.name}
          </a>
        ))}
      </div>

      <div className="tiles">
        <Tile label="Retención real" value={view.retention.pct === null ? '—' : `${view.retention.pct} %`}
          note={view.retention.pct === null ? 'Aún no hay repasos de tarjetas maduras' : `${view.retention.n} repasos${target ? ` · objetivo ${target} %` : ''}`} />
        <Tile label="Respuestas hoy" value={String(view.today)} />
        <Tile label="Racha" value={`${view.streak} ${view.streak === 1 ? 'día' : 'días'}`} note="días seguidos repasando" />
        <Tile label="Carga prevista" value={`~${view.load.minutes} min`} note={`al día esta semana · ${view.load.avgCards} tarjetas`} />
      </div>

      {view.load.heavy && (
        <div className="warn-note" role="status">
          <Icon name="clock" />
          <p><strong>Vas cargado:</strong> los próximos 7 días te esperan unas {view.load.avgCards} tarjetas al día (~{view.load.minutes} min), con un pico de {view.load.peak}.
            Si es demasiado, pasa alguna asignatura a «Mínimo» o no añadas tarjetas nuevas unos días: los repasos bajarán solos.</p>
        </div>
      )}
      {target && view.retention.pct !== null && view.retention.n >= 50 && view.retention.pct < target - 5 && (
        <div className="warn-note" role="status">
          <Icon name="sparkles" />
          <p><strong>Recuerdas menos de lo que pide tu nivel</strong> ({view.retention.pct} % frente a {target} %). Suele pasar por pulsar «Bien» en tarjetas que no sabías, o por tarjetas demasiado largas.</p>
        </div>
      )}

      <div className="charts">
        <ColumnChart title="Respuestas al día" subtitle="últimos 30 días"
          data={view.daily.map((d) => ({ label: fmtDay(d.date), value: d.n, detail: `${d.n} respuestas${d.again ? ` · ${d.again} «Otra vez»` : ''}` }))} />
        <ColumnChart title="Lo que te espera" subtitle="tarjetas en repaso por día, sin contar nuevas"
          data={view.next.map((d, i) => ({ label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fmtWeekday(d.date), value: d.n, detail: `${d.n} tarjetas` }))} />
      </div>

      <div className="panel stats-block">
        <h2 className="block-title">Dominio por tema</h2>
        <ul className="legend" aria-label="Leyenda">
          {MASTERY.map((m) => <li key={m.key}><span className="swatch-key" style={{ background: m.color }} /> {m.label}</li>)}
        </ul>
        <MasteryList mastery={view.mastery} topicById={topicById} subjectById={subjectById} showSubject={!subjectId} />
      </div>

      <div className="panel stats-block">
        <h2 className="block-title">Puntos débiles</h2>
        <p className="muted small">Temas donde más pulsas «Otra vez» (con al menos 10 respuestas en 30 días).</p>
        {view.weak.length === 0 ? (
          <p className="muted">Nada destacable todavía. Sigue repasando y aquí aparecerán los temas que más te cuestan.</p>
        ) : (
          <ul className="weak-list">
            {view.weak.map((w) => {
              const t = topicById.get(w.topicId);
              const s = t && subjectById.get(t.subject_id);
              return (
                <li key={w.topicId}>
                  <span className="dot" style={{ background: s?.color }} />
                  <span className="weak-name"><strong>{t?.title ?? 'Tema'}</strong>{s && <span className="muted small"> · {s.name}</span>}</span>
                  <span className="weak-pct">{w.failPct} % de fallos <span className="muted small">({w.n})</span></span>
                  {t && <a className="button" href={routeToHash({ view: 'repasar', subjectId: t.subject_id, topicIds: [t.id] })} onClick={() => sfx.open()}><Icon name="play" /> Repasar</a>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <a className="panel tune-link" href={routeToHash({ view: 'ajustar' })} onClick={() => sfx.open()}>
        <Icon name="sparkles" />
        <span><strong>Ajustar FSRS a tu memoria</strong><span className="muted small">Calcula tus propios parámetros con tu historial (a partir de 1000 respuestas).</span></span>
        <Icon name="right" />
      </a>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile panel">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}

/** Gráfico de columnas: una serie, sin leyenda (el título la nombra), con tooltip al pasar o enfocar y tabla de datos. */
function ColumnChart({ title, subtitle, data }: { title: string; subtitle: string; data: { label: string; value: number; detail: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  const labelAt = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  return (
    <figure className="panel chart">
      <figcaption><h2 className="block-title">{title}</h2><span className="muted small">{subtitle}</span></figcaption>
      <div className="chart-plot" onMouseLeave={() => setHover(null)}>
        <div className="chart-grid" aria-hidden="true">{ticks.map((t) => <span key={t}><em>{t}</em></span>)}</div>
        <div className="chart-cols" role="list">
          {data.map((d, i) => (
            <div key={i} role="listitem" tabIndex={0} className={hover === i ? 'col on' : 'col'} aria-label={`${d.label}: ${d.detail}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <span className="bar" style={{ height: `${max ? (d.value / max) * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <strong>{data[hover].label}</strong><span>{data[hover].detail}</span>
          </div>
        )}
      </div>
      <div className="chart-x" aria-hidden="true">
        {data.map((d, i) => <span key={i}>{labelAt.has(i) ? d.label : ''}</span>)}
      </div>
      <details className="chart-table">
        <summary className="muted small">Ver como tabla</summary>
        <table><tbody>{data.map((d, i) => <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** Máximo «redondo» para el eje: 7 → 10, 43 → 50, 180 → 200. */
export function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function MasteryList({ mastery, topicById, subjectById, showSubject }: {
  mastery: ReturnType<typeof import('../study/stats').mastery>; topicById: Map<string, Topic>; subjectById: Map<string, Subject>; showSubject: boolean;
}) {
  const rows = [...mastery].map(([tid, m]) => ({ t: topicById.get(tid), m, total: m.nuevas + m.aprendiendo + m.dominadas }))
    .filter((r) => r.t && r.total > 0)
    .sort((a, b) => (a.t!.subject_id + a.t!.position).localeCompare(b.t!.subject_id + b.t!.position));
  if (!rows.length) return <p className="muted">Aún no hay tarjetas.</p>;
  return (
    <>
      <ul className="mastery">
        {rows.map(({ t, m, total }) => {
          const s = subjectById.get(t!.subject_id);
          const parts = MASTERY.map((p) => ({ ...p, n: m[p.key] }));
          const name = parts.map((p) => `${p.label}: ${p.n} (${Math.round((p.n / total) * 100)} %)`).join(', ');
          return (
            <li key={t!.id}>
              <span className="mastery-name">{t!.title}{showSubject && s && <span className="muted small"> · {s.name}</span>}</span>
              <span className="seg" role="img" aria-label={`${t!.title}. ${name}`} title={name}>
                {parts.filter((p) => p.n > 0).map((p) => <span key={p.key} style={{ flexGrow: p.n, background: p.color }} />)}
              </span>
              <span className="mastery-num">{m.dominadas}/{total}</span>
            </li>
          );
        })}
      </ul>
      <details className="chart-table">
        <summary className="muted small">Ver como tabla</summary>
        <table>
          <thead><tr><th>Tema</th>{MASTERY.map((p) => <th key={p.key}>{p.label}</th>)}</tr></thead>
          <tbody>{rows.map(({ t, m }) => <tr key={t!.id}><td>{t!.title}</td><td>{m.nuevas}</td><td>{m.aprendiendo}</td><td>{m.dominadas}</td></tr>)}</tbody>
        </table>
      </details>
    </>
  );
}
