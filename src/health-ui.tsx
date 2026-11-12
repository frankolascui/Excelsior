// Reino de la Salud: apuntar la noche, obras de la semana, tu horario y las últimas noches.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
  addDays, bedtimeGoal, emptyNight, fmtMin, foundHealth, healthBuildings, healthFounded, nightStats, syncHealth, vigor,
  weekProgress, weekStart, weightTrend, workDef, WORK_COINS, WORKS, type Night,
} from './health';
import { deleteNight, healthNights, healthSettings, importNights, onHealthChange, saveHealthSettings, saveNight, syncHealthCloud, useHealth } from './health-store';
import './health.css';

const CAP_NOTE = 'Has llegado al tope de XP de hábitos de hoy';

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

const hm = (min: number | null) => (min == null ? { h: '', m: '' } : { h: String(Math.floor(min / 60)), m: String(min % 60) });

function NightForm({ game, day, onDone }: { game: Game; day: string; onDone: () => void }) {
  const { act, toast } = game;
  const { nights } = useHealth();
  const saved = nights.find((n) => n.fecha === day);
  const base = saved ?? emptyNight(day);
  const [cama, setCama] = useState(base.percibido.cama ?? '');
  const [levantado, setLevantado] = useState(base.percibido.levantado ?? '');
  const t = hm(base.reloj.total_dormido_min);
  const [h, setH] = useState(t.h);
  const [m, setM] = useState(t.m);
  const [descanso, setDescanso] = useState<number | null>(Number(base.preguntas.descanso) || null);
  const [peso, setPeso] = useState(base.cuerpo.peso_kg == null ? '' : String(base.cuerpo.peso_kg));
  const [entrenos, setEntrenos] = useState<number | null>(base.preguntas.entrenos_ayer == null ? null : Number(base.preguntas.entrenos_ayer));

  function submit(e: FormEvent) {
    e.preventDefault();
    const total = h === '' && m === '' ? null : (Number(h) || 0) * 60 + (Number(m) || 0);
    // Se conserva lo que la noche ya tuviera (fases, notas… apuntadas en la web de Health).
    const night: Night = {
      ...base,
      percibido: { ...base.percibido, cama: cama || null, levantado: levantado || null },
      reloj: { ...base.reloj, total_dormido_min: total },
      preguntas: { ...base.preguntas, descanso, entrenos_ayer: entrenos },
      cuerpo: { peso_kg: peso === '' ? null : Number(peso.replace(',', '.')), mismas_condiciones: base.cuerpo.mismas_condiciones },
    };
    saveNight(night);
    let built: string[] = [];
    act((s) => {
      const r = syncHealth(s, healthNights(), healthSettings(), Date.now(), day);
      built = r.built.map((k) => workDef(k).name);
      return r;
    }, CAP_NOTE, { sound: 'habit' });
    if (built.length) {
      sfx.victory();
      toast(`{i:greek-temple} Obra levantada: ${built.join(', ')} · +${built.length * WORK_COINS} {i:coin}`, 'level', 5000);
    } else if (saved) {
      toast('Noche guardada', 'info');
    }
    onDone();
  }

  return (
    <form className="night-form" onSubmit={submit} data-testid="night-form">
      <div className="night-grid">
        <label className="field"><span>Me acosté</span>
          <input id="night-cama" type="time" value={cama} onChange={(e) => setCama(e.target.value)} /></label>
        <label className="field"><span>Me levanté</span>
          <input id="night-levantado" type="time" value={levantado} onChange={(e) => setLevantado(e.target.value)} /></label>
        <div className="field"><span>Dormí (según el reloj)</span>
          <div className="night-hm">
            <input id="night-h" type="number" inputMode="numeric" min={0} max={23} value={h} onChange={(e) => setH(e.target.value)} aria-label="Horas dormidas" placeholder="7" /> h
            <input id="night-m" type="number" inputMode="numeric" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} aria-label="Minutos dormidos" placeholder="30" /> min
          </div></div>
        <label className="field"><span>Peso (kg)</span>
          <input id="night-peso" type="text" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="opcional" maxLength={6} /></label>
      </div>
      <div className="field"><span>¿Cómo te has levantado?</span>
        <div className="segmented" role="radiogroup" aria-label="Descanso de 1 a 5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button type="button" key={v} role="radio" aria-checked={descanso === v} className={descanso === v ? 'seg on' : 'seg'} onClick={() => setDescanso(descanso === v ? null : v)}>{v}</button>
          ))}
        </div></div>
      <div className="field"><span>Entrenos de ayer</span>
        <div className="segmented" role="radiogroup" aria-label="Entrenos de ayer">
          {[0, 1, 2, 3].map((v) => (
            <button type="button" key={v} role="radio" aria-checked={entrenos === v} className={entrenos === v ? 'seg on' : 'seg'} onClick={() => setEntrenos(entrenos === v ? null : v)}>{v}</button>
          ))}
        </div></div>
      <div className="row">
        <button type="submit" className="primary"><Icon name="check" /> {saved ? 'Guardar cambios' : 'Apuntar la noche'}</button>
        {saved && (
          <button type="button" className="ghost" onClick={() => {
            deleteNight(day);
            act((s) => syncHealth(s, healthNights(), healthSettings(), Date.now(), day));
            onDone();
          }}><Icon name="trash" /> Borrar</button>
        )}
      </div>
    </form>
  );
}

function ScheduleForm() {
  const { settings } = useHealth();
  return (
    <details className="health-schedule">
      <summary><Icon name="sliders" /> Tu horario: cama {bedtimeGoal(settings)}, arriba {settings.levantar} · {settings.entrenosMin} entrenos por semana</summary>
      <div className="night-grid">
        <label className="field"><span>Me levanto a las</span>
          <input id="health-levantar" type="time" value={settings.levantar} onChange={(e) => e.target.value && saveHealthSettings({ levantar: e.target.value })} /></label>
        <label className="field"><span>Horas en cama</span>
          <select id="health-horas" value={settings.horas} onChange={(e) => saveHealthSettings({ horas: Number(e.target.value) })}>
            {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} h</option>)}
          </select></label>
        <label className="field"><span>Entrenos mínimos por semana</span>
          <select id="health-entrenos" value={settings.entrenosMin} onChange={(e) => saveHealthSettings({ entrenosMin: Number(e.target.value), entrenosPlan: Math.max(settings.entrenosPlan, Number(e.target.value)) })}>
            {Array.from({ length: 14 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
          </select></label>
      </div>
    </details>
  );
}

export function HealthKingdom({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const { nights, settings, sync, error } = useHealth();
  const cloud = useCloud();
  const now = Date.now();
  const today = dayKey(now);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const founded = healthFounded(state);

  useEffect(() => {
    if (founded) void syncHealthCloud();
  }, [founded]);

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
  const w = weightTrend(nights, today);

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let n = -1;
    try {
      n = importNights(JSON.parse(await f.text()));
    } catch {
      /* no es JSON */
    }
    if (n < 0) { sfx.error(); toast('Ese archivo no es una copia de Excelsior Health', 'info'); } else toast(`${n} ${n === 1 ? 'noche importada' : 'noches importadas'}`, 'info');
  }

  return (
    <>
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
        <ScheduleForm />
      </section>

      <section className="panel" aria-labelledby="nights-h">
        <h3 id="nights-h"><Icon name="calendar" /> Últimas noches</h3>
        {w && <p className="muted small-text"><Icon name="weight-scale" /> Peso medio de 7 días: {String(w.avg).replace('.', ',')} kg{w.change != null && <> ({w.change > 0 ? '+' : ''}{String(w.change).replace('.', ',')} kg frente a la semana anterior)</>}</p>}
        {nights.length === 0 ? <p className="empty">Aún no hay noches. Apunta la de hoy y aparecerá aquí.</p> : (
          <ul className="health-nights">
            {nights.slice(0, 14).map((n) => {
              const st = nightStats(n);
              return (
                <li key={n.fecha}>
                  <span className="health-night-date">{shortDate(n.fecha)}</span>
                  <span className="mono">{fmtMin(st.sleepMin)}</span>
                  <span className="muted small-text">{[st.efficiency != null && `${st.efficiency} %`, n.preguntas.descanso != null && `descanso ${n.preguntas.descanso}/5`, n.cuerpo.peso_kg != null && `${String(n.cuerpo.peso_kg).replace('.', ',')} kg`].filter(Boolean).join(' · ')}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted small-text health-sync">
          <Icon name={cloud.userId ? (sync === 'error' ? 'cloud-off' : 'cloud') : 'laptop'} />{' '}
          {!cloud.userId ? 'Sin cuenta: las noches se guardan solo en este navegador.' : error ?? (sync === 'syncing' ? 'Sincronizando…' : 'Noches sincronizadas con tu cuenta (las mismas que en Excelsior Health).')}
          {' '}<button className="link small" onClick={() => file.current?.click()}><Icon name="upload" /> Importar copia de Health</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={onImport} data-testid="health-import" />
        </p>
      </section>
    </>
  );
}
