// Reino de la Salud: el reino (obras de la semana) y el diario de sueño completo (panel del día, historial y datos).
import { useEffect, useRef, useState } from 'react';
import type { Game } from './screens';
import { dayKey } from './game';
import { stageFor, nextStage } from './kingdoms';
import { CityScene } from './city';
import { Icon } from './icons';
import { InfoTip } from './infotip';
import { sfx } from './sfx';
import { shortDate } from './ui';
import { useCloud } from './cloud';
import {
  addDays, bedtimeGoal, fmtMin, foundHealth, healthBuildings, healthFounded, nightStats, syncHealth, vigor,
  weekProgress, weekStart, workDef, WORK_COINS, WORKS,
} from './health';
import { healthNights, healthSettings, importLegacyDiary, onHealthChange, syncHealthCloud, useHealth } from './health-store';
import { CAP_NOTE, DiaryData, DiaryHistory, DiaryToday, NightForm } from './health-diary-ui';
import './health.css';


/**
 * Mantiene la partida al día con las noches: al entrar con cuenta trae las de la nube y, si llegan noches
 * apuntadas en otro dispositivo (o en la web de Health), marca el hábito de esos días y levanta las obras ganadas.
 */
export function useHealthBridge(game: Game) {
  const { state, act } = game;
  const founded = healthFounded(state);
  const userId = useCloud().userId;
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (founded && userId) void syncHealthCloud();
  }, [founded, userId]);
  useEffect(() => {
    if (!founded) return;
    const apply = () => actRef.current((s) => syncHealth(s, healthNights(), healthSettings(), Date.now()), CAP_NOTE, { sound: 'habit' });
    apply();
    return onHealthChange(apply);
  }, [founded]);
}

type HealthView = 'reino' | 'diario' | 'historial' | 'datos';
const HEALTH_VIEWS: { id: HealthView; label: string; icon: 'castle' | 'sundial' | 'calendar' | 'sliders' }[] = [
  { id: 'reino', label: 'Reino', icon: 'castle' },
  { id: 'diario', label: 'Diario', icon: 'sundial' },
  { id: 'historial', label: 'Historial', icon: 'calendar' },
  { id: 'datos', label: 'Datos', icon: 'sliders' },
];

export function HealthKingdom({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const { nights, settings } = useHealth();
  const now = Date.now();
  const today = dayKey(now);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<HealthView>('reino');
  const founded = healthFounded(state);

  useEffect(() => {
    if (!founded) return;
    void syncHealthCloud();
    const n = importLegacyDiary();
    if (n > 0) {
      act((s) => syncHealth(s, healthNights(), healthSettings(), Date.now()));
      toast(`${n} ${n === 1 ? 'noche traída' : 'noches traídas'} de tu antiguo Diario de Sueño`, 'info');
    }
  }, [founded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!founded) {
    return (
      <section className="panel health-intro" aria-labelledby="health-h">
        <h2 id="health-h" className="kingdom-name"><Icon name="caduceus" /> Reino de la Salud</h2>
        <p>Un reino que no se construye con tareas, sino durmiendo y entrenando con constancia. Cada mañana apuntas la noche en menos de un minuto.</p>
        <ul className="health-rules">
          <li><Icon name="moon" /> <b>Apuntar la noche</b> pasa a ser un hábito con su racha y su XP. Se marca solo al guardarla.</li>
          {WORKS.map((w) => <li key={w.kind}><Icon name={w.icon} /> <b>{w.name}:</b> {w.rule(settings).toLowerCase()} en la semana. +{WORK_COINS} <Icon name="coin" className="coin-ico" /></li>)}
          <li><Icon name="heart" /> El reino premia la constancia, no las cifras: dormir poco una noche no te quita nada; no apuntarla, sí.</li>
        </ul>
        <button className="primary big" onClick={() => { act((s) => syncHealth(foundHealth(s, Date.now()), healthNights(), healthSettings(), Date.now())); sfx.confirm(); }} data-testid="found-health">
          <Icon name="castle" /> Fundar el Reino de la Salud
        </button>
      </section>
    );
  }

  const works = state.health?.works ?? [];
  const stage = stageFor(works.length);
  const next = nextStage(works.length);
  const v = vigor(nights, today);
  const week = weekProgress(nights, settings, weekStart(today));
  const dayNight = nights.find((n) => n.fecha === day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const record = (d: string) => { setDay(d); setEditing(true); setView('reino'); requestAnimationFrame(() => document.getElementById('night-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const tabs = (
    <div className="segmented health-tabs" role="tablist" aria-label="Reino de la Salud">
      {HEALTH_VIEWS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={view === t.id} className={view === t.id ? 'seg on' : 'seg'} onClick={() => { setView(t.id); sfx.page(); }} data-testid={`health-tab-${t.id}`}>
          <Icon name={t.icon} /> {t.label}
        </button>
      ))}
    </div>
  );
  if (view !== 'reino') {
    return (
      <>
        {tabs}
        {view === 'diario' && <DiaryToday onRecord={() => record(today)} onHistory={() => setView('historial')} onData={() => setView('datos')} />}
        {view === 'historial' && <DiaryHistory onEdit={record} />}
        {view === 'datos' && <DiaryData game={game} />}
      </>
    );
  }

  return (
    <>
      {tabs}
      <section className="panel kingdom health" aria-labelledby="health-h">
        <header className="kingdom-head">
          <div className="kingdom-head-main">
            <div className="with-info">
              <h2 id="health-h" className="kingdom-name"><Icon name="caduceus" /> Reino de la Salud</h2>
              <InfoTip label="Cómo funciona el Reino de la Salud">
                <p>Apunta la noche cada mañana. Cada semana (de lunes a domingo) puedes levantar cuatro obras con constancia: {WORKS.map((x) => x.name).join(', ')}. Cada obra se queda para siempre, hace crecer el reino y da {WORK_COINS} monedas.</p>
              </InfoTip>
            </div>
            <p className="kingdom-stage"><Icon name={stage.icon} /> {stage.name}</p>
            {next && (
              <div className="kingdom-next">
                <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${next.ratio * 100}%` }} /></span>
                <span className="muted small-text"><Icon name={next.icon} /> {next.name} con {next.missing} {next.missing === 1 ? 'obra' : 'obras'} más</span>
              </div>
            )}
            <div className="health-vigor" aria-label={`Vigor: ${v.days} de 7 noches apuntadas`}>
              <span className="muted small-text"><Icon name="heart" /> Vigor</span>
              <span className="health-vigor-dots" aria-hidden="true">
                {[...days].reverse().map((d) => <i key={d} className={nights.some((n) => n.fecha === d) ? 'on' : ''} title={shortDate(d)} />)}
              </span>
              <span className="mono small-text">{v.days}/7</span>
            </div>
          </div>
          <div className="kingdom-count" aria-label={`${works.length} obras levantadas`}>
            <span className="kingdom-pct mono">{works.length}</span>
            <span className="muted small-text">{works.length === 1 ? 'obra' : 'obras'}</span>
          </div>
        </header>
        <CityScene quests={healthBuildings(state)} progress={1} complete={false} stage={stage.name} icon={stage.icon} />
      </section>

      <section className="panel" aria-labelledby="night-title" data-tour="health-night">
        <div className="row-between">
          <h3 id="night-title"><Icon name="moon" /> {day === today ? 'La noche de hoy' : `La noche del ${shortDate(day)}`}</h3>
          <div className="health-days" role="tablist" aria-label="Día">
            {days.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={d === day} className={`day-dot${d === day ? ' on' : ''}${nights.some((n) => n.fecha === d) ? ' done' : ''}`}
                onClick={() => { setDay(d); setEditing(false); }} title={shortDate(d)}>
                {Number(d.slice(8))}
              </button>
            ))}
          </div>
        </div>
        {editing || !dayNight
          ? <NightForm key={day} game={game} day={day} onDone={() => { setEditing(false); setDay(today); }} />
          : (() => {
            const n = dayNight;
            const st = nightStats(n);
            return (
              <div className="night-summary">
                <p><Icon name="check" /> Apuntada. Dormiste <b>{fmtMin(st.sleepMin)}</b>{st.efficiency != null && <> · eficiencia {st.efficiency} %</>}{n.preguntas.descanso != null && <> · descanso {n.preguntas.descanso}/5</>}{n.cuerpo.peso_kg != null && <> · {String(n.cuerpo.peso_kg).replace('.', ',')} kg</>}</p>
                <button className="link" onClick={() => setEditing(true)}><Icon name="pencil" /> Editar</button>
              </div>
            );
          })()}
      </section>

      <section className="panel" aria-labelledby="works-h">
        <h3 id="works-h"><Icon name="greek-temple" /> Obras de esta semana</h3>
        <ul className="health-works">
          {week.map((p) => {
            const d = workDef(p.kind);
            return (
              <li key={p.kind} className={p.done ? 'done' : ''}>
                <span className="health-work-ico"><Icon name={d.icon} /></span>
                <div className="health-work-main">
                  <span><b>{d.name}</b> <span className="muted small-text">{d.rule(settings)}</span></span>
                  <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${(p.have / p.need) * 100}%` }} /></span>
                </div>
                <span className="mono">{p.done ? <Icon name="check" /> : `${p.have}/${p.need}`}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small-text">Tu horario: cama {bedtimeGoal(settings)}, arriba {settings.levantar} · {settings.entrenosMin} entrenos por semana. <button className="link small" onClick={() => setView('datos')}>Cambiar</button></p>
      </section>

    </>
  );
}
