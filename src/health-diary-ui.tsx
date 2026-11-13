// El diario de sueño completo dentro del Reino de la Salud: el formulario entero de la noche, el panel del día
// (reloj, metas del plan, semana y gráfico), el historial y los datos (horario, exportar, importar).
// Es lo que hacía la web de Excelsior Health, con las mismas reglas (health-diary.ts).
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import { dayKey } from './game';
import { Icon } from './icons';
import { Select, TimeField } from './pickers';
import { InfoTip } from './infotip';
import { sfx } from './sfx';
import { shortDate } from './ui';
import { useCloud } from './cloud';
import { addDays, bedtimeGoal, clockDistance, emptyNight, normalizeNight, syncHealth, weightTrend, workDef, WORK_COINS, type Night } from './health';
import {
  clockAdvice, derive, exportCsv, exportJson, fmtHm, META, PERC_NOCHES, PHASES, planCheck, planRun, trainingWeek, weekCompare, weightAvisos,
} from './health-diary';
import {
  clearDraft, deleteNight, healthNights, healthSettings, importNights, loadDraft, saveDraft, saveHealthSettings, saveNight, useHealth, wipeNights,
} from './health-store';

export const CAP_NOTE = 'Has llegado al tope de XP de hábitos de hoy';
const PHASE_COLOR: Record<string, string> = { despierto: 'var(--h-awake)', rem: 'var(--h-rem)', ligero: 'var(--h-core)', profundo: 'var(--h-deep)' };

const hmParts = (min: number | null | undefined) => (min == null ? { h: '', m: '' } : { h: String(Math.floor(min / 60)), m: String(min % 60) });
const fromParts = (h: string, m: string) => (h === '' && m === '' ? null : (Number(h) || 0) * 60 + (Number(m) || 0));
const longDate = (f: string) => new Date(`${f}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
const num = (v: string) => (v === '' ? null : Number(v));

function HM({ id, label, value, onChange, maxH = 16 }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; maxH?: number }) {
  const p = hmParts(value);
  return (
    <span className="night-hm">
      <input id={`${id}-h`} type="number" inputMode="numeric" min={0} max={maxH} value={p.h} placeholder="h" aria-label={`${label}, horas`} onChange={(e) => onChange(fromParts(e.target.value, p.m))} />
      <input id={`${id}-m`} type="number" inputMode="numeric" min={0} max={59} value={p.m} placeholder="min" aria-label={`${label}, minutos`} onChange={(e) => onChange(fromParts(p.h, e.target.value))} />
    </span>
  );
}

function Scale({ label, hint, value, onChange }: { label: string; hint: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="field"><span>{label} <span className="muted small-text">{hint}</span></span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'seg on' : 'seg'} onClick={() => onChange(value === v ? null : v)}>{v}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * La noche entera: lo esencial arriba (menos de un minuto) y «Más detalles» plegado (fases, percepción, hábitos).
 * Si algo no cuadra, avisa; pulsar «Guardar» otra vez guarda igualmente. Lo escrito se guarda como borrador.
 */
export function NightForm({ game, day, onDone }: { game: Game; day: string; onDone: () => void }) {
  const { act, toast } = game;
  const { nights, settings } = useHealth();
  const saved = nights.find((n) => n.fecha === day);
  const [n, setN] = useState<Night>(() => {
    const d = loadDraft();
    return d && d.night.fecha === day ? d.night : saved ?? emptyNight(day);
  });
  const [rawPeso, setRawPeso] = useState(() => {
    const d = loadDraft();
    return d && d.night.fecha === day ? d.raw : n.cuerpo.peso_kg == null ? '' : String(n.cuerpo.peso_kg).replace('.', ',');
  });
  const [confirmSig, setConfirmSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const percDone = nights.filter((x) => x.percibido.dormido || x.percibido.despertar).length;
  const showPerc = percDone < PERC_NOCHES || !!n.percibido.dormido || !!n.percibido.despertar;
  const hasDetails = !!(n.percibido.dormido || n.percibido.despertar || PHASES.some((p) => n.reloj.fases_min[p.k] != null) || ['estres', 'despertares', 'despierto_noche_min', 'siesta_min', 'ultima_cafeina', 'ultima_comida', 'pantalla_ultima_hora', 'ejercicio', 'luz_natural', 'notas'].some((k) => n.preguntas[k] != null));
  const [open, setOpen] = useState(hasDetails);

  const update = (f: (x: Night) => Night) => setN((x) => {
    const next = f(x);
    setConfirmSig(null);
    setError(null);
    saveDraft(next, rawPeso);
    return next;
  });
  const P = (k: keyof Night['percibido'], v: string) => update((x) => ({ ...x, percibido: { ...x.percibido, [k]: v || null } }));
  const R = (k: 'dormido' | 'despertar', v: string) => update((x) => ({ ...x, reloj: { ...x.reloj, [k]: v || null } }));
  const Q = (k: string, v: string | number | null) => update((x) => ({ ...x, preguntas: { ...x.preguntas, [k]: v === '' ? null : v } }));
  const F = (k: string, v: number | null) => update((x) => ({ ...x, reloj: { ...x.reloj, fases_min: { ...x.reloj.fases_min, [k]: v } } }));

  const peso = rawPeso.trim() === '' ? null : Number(rawPeso.trim().replace(',', '.'));
  const candidate = useMemo(() => normalizeNight({ ...n, cuerpo: { peso_kg: peso, mismas_condiciones: rawPeso.trim() === '' ? null : n.cuerpo.mismas_condiciones !== false } } as unknown as { fecha: string }), [n, peso, rawPeso]);
  const calc = derive(candidate);
  const avisos = [...calc.avisos, ...weightAvisos(candidate, nights, rawPeso)];

  function submit(e: FormEvent) {
    e.preventDefault();
    const today = dayKey(Date.now());
    if (candidate.fecha > today) { setError('La fecha es del futuro: pon el día en que te despertaste.'); sfx.error(); return; }
    const sig = JSON.stringify(avisos);
    if (avisos.length && confirmSig !== sig) {
      setConfirmSig(sig);
      setError('Hay datos que no cuadran (en amarillo). Corrígelos o pulsa «Guardar» otra vez para guardar igualmente.');
      sfx.error();
      return;
    }
    saveNight(candidate);
    clearDraft();
    let built: string[] = [];
    act((s) => {
      const r = syncHealth(s, healthNights(), healthSettings(), Date.now(), day);
      built = r.built.map((k) => workDef(k).name);
      return r;
    }, CAP_NOTE, { sound: 'habit' });
    if (built.length) {
      sfx.victory();
      toast(`{i:greek-temple} Obra levantada: ${built.join(', ')} · +${built.length * WORK_COINS} {i:coin}`, 'level', 5000);
    } else if (saved) toast('Noche guardada', 'info');
    onDone();
  }

  const cell = (v: string, l: string, tone?: boolean | null) => <div className={tone === false ? 'warn' : undefined}><b>{v}</b><small>{l}</small></div>;
  const err = calc.error_hora_dormido_min;

  return (
    <form className="night-form" onSubmit={submit} data-testid="night-form" autoComplete="off">
      <p className="eyebrow">Lo esencial · menos de 1 minuto</p>
      <div className="night-grid">
        <label className="field"><span>Me metí en la cama</span><TimeField id="night-cama" near={bedtimeGoal(settings)} label="Me metí en la cama" value={n.percibido.cama ?? ''} onChange={(v) => P('cama', v)} /></label>
        <label className="field"><span>Me levanté</span><TimeField id="night-levantado" near={settings.levantar} label="Me levanté" value={n.percibido.levantado ?? ''} onChange={(v) => P('levantado', v)} /></label>
        <label className="field"><span>Me dormí (reloj)</span><TimeField id="night-dormido" near={bedtimeGoal(settings)} label="Me dormí (reloj)" value={n.reloj.dormido ?? ''} onChange={(v) => R('dormido', v)} /></label>
        <label className="field"><span>Me desperté (reloj)</span><TimeField id="night-despertar" near={settings.levantar} label="Me desperté (reloj)" value={n.reloj.despertar ?? ''} onChange={(v) => R('despertar', v)} /></label>
        <div className="field"><span>Total dormido (Salud)</span>
          <HM id="night" label="Total dormido" value={n.reloj.total_dormido_min} onChange={(v) => update((x) => ({ ...x, reloj: { ...x.reloj, total_dormido_min: v } }))} /></div>
        <label className="field"><span>Peso (kg)</span><input id="night-peso" type="text" inputMode="decimal" value={rawPeso} placeholder="opcional" maxLength={6}
          onChange={(e) => { setRawPeso(e.target.value); setConfirmSig(null); saveDraft(n, e.target.value); }} /></label>
      </div>
      {rawPeso.trim() !== '' && (
        <label className="night-cond small-text"><input type="checkbox" checked={n.cuerpo.mismas_condiciones !== false} onChange={(e) => update((x) => ({ ...x, cuerpo: { ...x.cuerpo, mismas_condiciones: e.target.checked } }))} />
          <span>Pesado en las condiciones de siempre: al levantarte, tras ir al baño, antes de comer, misma ropa y báscula</span></label>
      )}
      <div className="night-grid">
        <Scale label="¿Te levantaste descansado?" hint="1 destrozado · 5 como nuevo" value={(candidate.preguntas.descanso as number) ?? null} onChange={(v) => Q('descanso', v)} />
        <div className="field"><span>Entrenos de ayer</span>
          <div className="segmented" role="radiogroup" aria-label="Entrenos de ayer">
            {[0, 1, 2, 3, 4].map((v) => (
              <button type="button" key={v} role="radio" aria-checked={candidate.preguntas.entrenos_ayer === v} className={candidate.preguntas.entrenos_ayer === v ? 'seg on' : 'seg'} onClick={() => Q('entrenos_ayer', candidate.preguntas.entrenos_ayer === v ? null : v)}>{v}</button>
            ))}
          </div></div>
      </div>
      <p className="muted small-text">Las horas del reloj y el total salen de Salud → Sueño. Puedes cambiar de app: lo que escribes se guarda como borrador.</p>

      <div className="night-live" aria-live="polite">
        {cell(fmtHm(calc.sueno_real_min), 'sueño real', calc.sueno_real_min == null ? null : calc.sueno_real_min >= META.sueno)}
        {cell(calc.eficiencia_pct == null ? '—' : `${calc.eficiencia_pct}%`, `eficiencia (meta ≥${META.eficiencia}%)`, calc.eficiencia_pct == null ? null : calc.eficiencia_pct >= META.eficiencia)}
        {cell(calc.latencia_real_min == null ? '—' : `${calc.latencia_real_min} min`, `latencia (meta ≤${META.latencia})`, calc.latencia_real_min == null ? null : calc.latencia_real_min <= META.latencia)}
        {showPerc && cell(fmtHm(calc.sueno_percibido_min), 'lo que crees')}
        {showPerc && cell(err == null ? '—' : `${err > 0 ? '+' : ''}${err} min`, 'error al dormirte')}
      </div>
      {avisos.length > 0 && <ul className="night-avisos" data-testid="night-avisos">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}

      <details className="night-more" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary><span className="eyebrow">Más detalles (opcional)</span> <span className="muted small-text">Fases, percepción y hábitos</span></summary>
        <div className="night-more-body">
          {showPerc && (
            <div>
              <p className="q-label">Lo que tú crees, sin mirar el reloj</p>
              <p className="muted small-text">Solo las primeras {PERC_NOCHES} noches (llevas {Math.min(percDone, PERC_NOCHES)}), para medir cuánto se parece tu percepción a la realidad.</p>
              <div className="night-grid">
                <label className="field"><span>Creo que me dormí</span><TimeField id="night-dormido-perc" near={bedtimeGoal(settings)} label="Creo que me dormí" value={n.percibido.dormido ?? ''} onChange={(v) => P('dormido', v)} /></label>
                <label className="field"><span>Creo que me desperté</span><TimeField id="night-despertar-perc" near={settings.levantar} label="Creo que me desperté" value={n.percibido.despertar ?? ''} onChange={(v) => P('despertar', v)} /></label>
              </div>
            </div>
          )}
          <div className="night-phases">
            <p className="q-label">Fases (Salud)</p>
            {PHASES.map((p) => (
              <div key={p.k} className="night-phase"><span className="night-phase-dot" style={{ background: PHASE_COLOR[p.k] }} /><span>{p.n}</span>
                <HM id={`ph-${p.k}`} label={p.n} value={n.reloj.fases_min[p.k] ?? null} onChange={(v) => F(p.k, v)} maxH={14} /></div>
            ))}
          </div>
          <Scale label="Estrés al acostarte" hint="1 nada · 5 mucho" value={(n.preguntas.estres as number) ?? null} onChange={(v) => Q('estres', v)} />
          <div className="night-grid">
            <label className="field"><span>Veces que te despertaste</span><input type="number" min={0} max={30} inputMode="numeric" value={n.preguntas.despertares ?? ''} onChange={(e) => Q('despertares', num(e.target.value))} /></label>
            <label className="field"><span>Minutos despierto en la noche</span><input type="number" min={0} max={600} inputMode="numeric" value={n.preguntas.despierto_noche_min ?? ''} onChange={(e) => Q('despierto_noche_min', num(e.target.value))} /></label>
            <label className="field"><span>Siesta ayer (min)</span><input type="number" min={0} max={300} inputMode="numeric" value={n.preguntas.siesta_min ?? ''} onChange={(e) => Q('siesta_min', num(e.target.value))} /></label>
            <label className="field"><span>Última cafeína</span><TimeField label="Última cafeína" near="12:00" value={(n.preguntas.ultima_cafeina as string) ?? ''} onChange={(v) => Q('ultima_cafeina', v)} /></label>
            <label className="field"><span>Última comida</span><TimeField label="Última comida" near="20:00" value={(n.preguntas.ultima_comida as string) ?? ''} onChange={(v) => Q('ultima_comida', v)} /></label>
            <label className="field"><span>Pantalla en la última hora</span>
              <Select label="Pantalla en la última hora" value={(n.preguntas.pantalla_ultima_hora as string) ?? ''} onChange={(v) => Q('pantalla_ultima_hora', v)} options={[{ value: '', label: '—' }, { value: 'no', label: 'No' }, { value: 'poco', label: 'Menos de 15 min' }, { value: 'si', label: 'Sí, bastante' }]} /></label>
            <label className="field"><span>Ejercicio ayer</span>
              <Select label="Ejercicio ayer" value={(n.preguntas.ejercicio as string) ?? ''} onChange={(v) => Q('ejercicio', v)} options={[{ value: '', label: '—' }, { value: 'no', label: 'No' }, { value: 'manana', label: 'Por la mañana' }, { value: 'tarde', label: 'Por la tarde' }, { value: 'noche', label: 'Por la noche' }]} /></label>
            <label className="field"><span>Luz natural ayer</span>
              <Select label="Luz natural ayer" value={(n.preguntas.luz_natural as string) ?? ''} onChange={(v) => Q('luz_natural', v)} options={[{ value: '', label: '—' }, { value: 'poca', label: 'Casi nada' }, { value: 'algo', label: 'Un rato' }, { value: 'mucha', label: 'Más de 1 h' }]} /></label>
          </div>
          <label className="field"><span>Notas</span><textarea rows={3} value={(n.preguntas.notas as string) ?? ''} placeholder="Examen mañana, ruido en la calle, cené tarde…" onChange={(e) => Q('notas', e.target.value)} maxLength={2000} /></label>
        </div>
      </details>

      {error && <p className="night-error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="primary"><Icon name="check" /> {saved ? 'Guardar cambios' : 'Apuntar la noche'}</button>
        {saved && (
          <button type="button" className="ghost" onClick={() => {
            deleteNight(day);
            clearDraft();
            act((s) => syncHealth(s, healthNights(), healthSettings(), Date.now(), day));
            onDone();
          }}><Icon name="trash" /> Borrar</button>
        )}
      </div>
    </form>
  );
}

// ---------- Diario: el panel del día ----------

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Ring({ ratio, night }: { ratio: number; night: boolean }) {
  const R = 52, L = 2 * Math.PI * R;
  return (
    <svg className="diary-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={R} className="ring-bg" />
      <circle cx="60" cy="60" r={R} className={night ? 'ring-fg night' : 'ring-fg'} strokeDasharray={L} strokeDashoffset={L * (1 - ratio)} />
    </svg>
  );
}

/** Reloj del diario en Hoy: cuánto falta para acostarte (o levantarte), el consejo del momento y apuntar la noche. */
export function SleepClockCard({ onRecord }: { onRecord: () => void }) {
  const { nights, settings } = useHealth();
  const now = useNow(30_000);
  const clock = clockAdvice(settings, now);
  const done = nights.some((n) => n.fecha === dayKey(now.getTime()));
  const h = Math.floor(clock.left / 60), m = clock.left % 60;
  return (
    <section className={`panel diary-clock diary-clock-mini${clock.awake && clock.left > 120 ? '' : ' is-night'}`} aria-label="Reloj del sueño" data-testid="hoy-sleep">
      <div className="diary-ring-wrap">
        <Ring ratio={clock.ratio} night={!clock.awake} />
        <div className="diary-ring-center"><b className="mono">{h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}</b><small>{clock.awake ? 'para acostarte' : 'para levantarte'}</small></div>
      </div>
      <div className="diary-clock-side">
        <span className="muted small-text"><Icon name="moon" /> Cama {bedtimeGoal(settings)} · Levantarte {settings.levantar}</span>
        <p className="diary-tip">{clock.tip}</p>
        {!done && <div className="row"><button className="secondary small" onClick={onRecord} data-testid="hoy-sleep-record"><Icon name="play" /> Apuntar la noche</button></div>}
      </div>
    </section>
  );
}

const NUM_1_21 = Array.from({ length: 21 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

function Panel({ title, info, children, action }: { title: ReactNode; info?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel diary-panel">
      <div className="row-between">
        <div className="with-info"><h3>{title}</h3>{info && <InfoTip label="Qué es">{info}</InfoTip>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DiaryToday({ onRecord, onHistory, onData }: { onRecord: () => void; onHistory: () => void; onData: () => void }) {
  const { nights, settings } = useHealth();
  const now = useNow(1000);
  const today = dayKey(now.getTime());
  const clock = clockAdvice(settings, now);
  const bed = bedtimeGoal(settings);
  const last = nights[0];
  const lc = last ? derive(last) : null;
  const week = nights.slice(0, 7);
  const avg = (fn: (n: Night) => number | null) => {
    const v = week.map(fn).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const descanso = avg((n) => (typeof n.preguntas.descanso === 'number' ? n.preguntas.descanso : null));
  const dev = avg((n) => (n.percibido.cama ? clockDistance(n.percibido.cama, bed) : null));
  const ent = trainingWeek(nights, today, 0);
  const ent1 = trainingWeek(nights, today, -1);
  const wt = weightTrend(nights, today);
  const run = planRun(nights, settings);
  const cmp = weekCompare(nights, settings, today);
  const done = nights.some((n) => n.fecha === today);
  const h = Math.floor(clock.left / 60), m = clock.left % 60;

  const tiles: { icon: Parameters<typeof Icon>[0]['name']; v: string; l: string; bar?: number }[] = [
    { icon: 'moon', v: fmtHm(lc?.sueno_real_min), l: `última noche (meta ${META.sueno / 60} h)`, bar: lc?.sueno_real_min ? Math.min(100, (lc.sueno_real_min / META.sueno) * 100) : 0 },
    { icon: 'star', v: descanso == null ? '—' : `${descanso.toFixed(1)}/5`, l: 'descanso (7 noches)', bar: descanso ? (descanso / 5) * 100 : 0 },
    { icon: 'sundial', v: dev == null ? '—' : `±${Math.round(dev)} min`, l: `hora de cama (meta ±${META.regularidad})` },
    { icon: 'target', v: lc?.eficiencia_pct == null ? '—' : `${lc.eficiencia_pct}%`, l: `eficiencia (≥${META.eficiencia}%)`, bar: lc?.eficiencia_pct == null ? 0 : Math.min(100, lc.eficiencia_pct) },
    { icon: 'weight-lifting-up', v: `${ent.total}/${settings.entrenosPlan}`, l: `entrenos semana (meta ${settings.entrenosMin})`, bar: Math.min(100, (ent.total / settings.entrenosPlan) * 100) },
    { icon: 'weight-scale', v: wt == null ? '—' : `${wt.avg.toFixed(1)} kg`, l: wt?.change == null ? 'peso (media 7 días)' : `peso 7 días · ${wt.change >= 0 ? '+' : ''}${wt.change.toFixed(1)} kg/sem` },
  ];

  // Gráfico de 14 días (0–10 h) con la meta.
  const byDate = new Map(nights.map((n) => [n.fecha, n]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const mark = (c: { v: string; ok: boolean | null }) => <td className={c.ok == null ? 'na' : c.ok ? 'ok' : 'no'}>{c.v}</td>;

  return (
    <div className="diary" data-testid="diary-today">
      <section className={`panel diary-clock${clock.awake && clock.left > 120 ? '' : ' is-night'}`}>
        <div className="diary-ring-wrap">
          <Ring ratio={clock.ratio} night={!clock.awake} />
          <div className="diary-ring-center"><b className="mono">{h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}</b><small>{clock.awake ? 'para acostarte' : 'para levantarte'}</small></div>
        </div>
        <div className="diary-clock-side">
          <span className="diary-time mono">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="muted small-text">Cama {bed} · Levantarte {settings.levantar}</span>
          <p className="diary-tip">{clock.tip}</p>
          <div className="row">
            <button className="primary" onClick={onRecord} data-testid="diary-record"><Icon name={done ? 'pencil' : 'play'} /> {done ? 'Editar la noche de hoy' : 'Apuntar la noche'}</button>
            <span className="muted small-text">{done ? 'Noche de hoy apuntada' : 'Menos de 1 minuto'}</span>
          </div>
        </div>
      </section>

      <div className="diary-stats">
        {tiles.map((t) => (
          <div key={t.l} className="diary-stat">
            <span className="diary-stat-icon"><Icon name={t.icon} /></span>
            <div><span className="diary-stat-value mono">{t.v}</span><span className="diary-stat-label">{t.l}</span>
              {t.bar != null && <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${t.bar}%` }} /></span>}</div>
          </div>
        ))}
      </div>

      <Panel title={<><Icon name="target" /> Objetivos del plan</>} action={<button className="link small" onClick={onData}>Cambiar horario</button>}
        info={<p>Metas: acostarte y levantarte ±{META.regularidad} min de tu horario, dormirte en ≤{META.latencia} min, eficiencia ≥{META.eficiencia} %, ≥{META.sueno / 60} h de sueño y descanso ≥{META.descanso}/5. Con {META.noches} noches seguidas cumpliendo todo, prueba el siguiente paso del plan.</p>}>
        <div className="diary-plan-run">
          <span className="muted small-text">Horario {bed}–{settings.levantar} · {Math.min(run, META.noches)} de {META.noches} noches seguidas cumpliendo todo{run >= META.noches && <b>: puedes probar el siguiente paso del plan</b>}</span>
          <span className="kingdom-next-bar" aria-hidden="true"><span style={{ width: `${(Math.min(run, META.noches) / META.noches) * 100}%` }} /></span>
        </div>
        {nights.length === 0 ? <p className="empty">Aparece con tu primera noche.</p> : (
          <div className="diary-table-wrap"><table className="diary-table">
            <thead><tr><th>Noche</th><th>Cama</th><th>Levant.</th><th>Lat.</th><th>Efic.</th><th>Sueño</th><th>Desc.</th></tr></thead>
            <tbody>{nights.slice(0, 7).map((n) => { const t = planCheck(n, settings); return <tr key={n.fecha}><td>{shortDate(n.fecha)}</td>{mark(t.cama)}{mark(t.levantado)}{mark(t.latencia)}{mark(t.eficiencia)}{mark(t.sueno)}{mark(t.descanso)}</tr>; })}</tbody>
          </table></div>
        )}
        <p className="small-text"><b>Entrenos:</b> esta semana {ent.total} de {settings.entrenosPlan}{ent.sinDato ? ` (${ent.sinDato} ${ent.sinDato === 1 ? 'día' : 'días'} sin apuntar)` : ''}; la pasada {ent1.total}
          {' '}{ent1.total >= settings.entrenosMin ? <span className="ok"><Icon name="check" /> meta cumplida</span> : ent1.dias && !ent1.sinDato ? <span className="no">por debajo de {settings.entrenosMin}</span> : null}</p>
      </Panel>

      <Panel title={<><Icon name="calendar" /> Esta semana frente a la anterior</>}>
        <p className="muted small-text">Esta semana: {cmp.now} {cmp.now === 1 ? 'noche apuntada' : 'noches apuntadas'}. La pasada: {cmp.prev}.</p>
        <div className="diary-table-wrap"><table className="diary-table">
          <thead><tr><th>Medida</th><th>Esta</th><th>Pasada</th><th>Cambio</th></tr></thead>
          <tbody>{cmp.rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.now}</td><td>{r.prev}</td><td className={r.tone}>{r.change}</td></tr>)}</tbody>
        </table></div>
      </Panel>

      <Panel title={<><Icon name="moon" /> Sueño de 14 días</>} action={<button className="link small" onClick={onHistory}>Ver todas</button>}>
        <div className="diary-chart" role="img" aria-label="Sueño real de los últimos 14 días">
          <div className="diary-chart-goal" style={{ bottom: `${(META.sueno / 600) * 100}%` }}><span>{META.sueno / 60} h</span></div>
          {days.map((f) => {
            const mm = byDate.has(f) ? derive(byDate.get(f)!).sueno_real_min : null;
            return (
              <div key={f} className="diary-col" title={`${longDate(f)}: ${fmtHm(mm)}`}>
                <i className={mm == null ? 'none' : mm >= META.sueno ? 'ok' : 'low'} style={{ height: `${mm == null ? 0 : Math.min(100, (mm / 600) * 100)}%` }} />
                <span>{new Date(`${f}T12:00`).toLocaleDateString('es-ES', { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------- Historial ----------

export function NightCard({ n, max, onEdit }: { n: Night; max: number; onEdit: () => void }) {
  const f = n.reloj.fases_min, q = n.preguntas, c = derive(n);
  const chips = [
    c.avisos.length > 0 && ['revisar datos', 'bad'],
    c.eficiencia_pct != null && [`eficiencia ${c.eficiencia_pct}%`, c.eficiencia_pct >= META.eficiencia ? '' : 'warn'],
    c.latencia_real_min != null && [`latencia ${c.latencia_real_min}'`, c.latencia_real_min <= META.latencia ? '' : 'warn'],
    q.descanso != null && [`descanso ${q.descanso}/5`, ''],
    n.cuerpo.peso_kg != null && [`${String(n.cuerpo.peso_kg).replace('.', ',')} kg`, n.cuerpo.mismas_condiciones === false ? 'warn' : 'soft'],
    Number(q.entrenos_ayer) > 0 && [`${q.entrenos_ayer} ${q.entrenos_ayer === 1 ? 'entreno' : 'entrenos'}`, 'soft'],
    q.ultima_cafeina && [`café ${q.ultima_cafeina}`, Number(String(q.ultima_cafeina).slice(0, 2)) >= 12 ? 'warn' : 'soft'],
    q.pantalla_ultima_hora === 'si' && ['pantalla', 'warn'],
    q.ejercicio && q.ejercicio !== 'no' && [`ejercicio ${q.ejercicio === 'manana' ? 'mañana' : q.ejercicio}`, 'soft'],
    Number(q.estres) >= 4 && ['estrés alto', 'warn'],
  ].filter(Boolean) as [string, string][];
  return (
    <li className="diary-night">
      <div className="diary-night-top"><span className="diary-night-date">{longDate(n.fecha)}</span>
        <span className="muted small-text mono">{n.reloj.dormido ?? '--:--'} → {n.reloj.despertar ?? '--:--'} · {fmtHm(c.sueno_real_min)}</span></div>
      <div className="diary-bar">{PHASES.map((p) => (f[p.k] ? <i key={p.k} style={{ width: `${(f[p.k]! / max) * 100}%`, background: PHASE_COLOR[p.k] }} title={`${p.n}: ${fmtHm(f[p.k])}`} /> : null))}</div>
      <div className="diary-night-foot">
        <div className="diary-chips">{chips.map(([t, k]) => <span key={t} className={`diary-chip ${k}`}>{t}</span>)}</div>
        <button className="link small" onClick={onEdit}><Icon name="pencil" /> Editar</button>
      </div>
    </li>
  );
}

export function DiaryHistory({ onEdit }: { onEdit: (fecha: string) => void }) {
  const { nights } = useHealth();
  const max = Math.max(1, ...nights.map((n) => PHASES.reduce((s, p) => s + (n.reloj.fases_min[p.k] ?? 0), 0)));
  return (
    <section className="panel" data-testid="diary-history">
      <div className="diary-legend">{PHASES.map((p) => <span key={p.k}><i style={{ background: PHASE_COLOR[p.k] }} />{p.n}</span>)}</div>
      {nights.length === 0 ? <p className="empty">Aún no hay noches. Apunta la de hoy y aparecerá aquí.</p>
        : <ul className="diary-nights">{nights.map((n) => <NightCard key={n.fecha} n={n} max={max} onEdit={() => onEdit(n.fecha)} />)}</ul>}
    </section>
  );
}

// ---------- Datos ----------

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiaryData({ game }: { game: Game }) {
  const { toast, act } = game;
  const { nights, settings, sync, error } = useHealth();
  const cloud = useCloud();
  const file = useRef<HTMLInputElement>(null);
  const [wipe, setWipe] = useState(false);
  const today = dayKey(Date.now());

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let n = -1;
    try { n = importNights(JSON.parse(await f.text())); } catch { /* no es JSON */ }
    if (n < 0) { sfx.error(); toast('Ese archivo no es una copia del diario de sueño', 'info'); return; }
    act((s) => syncHealth(s, healthNights(), healthSettings(), Date.now()));
    toast(`${n} ${n === 1 ? 'noche importada' : 'noches importadas'}`, 'info');
  }
  const exp = (kind: 'json' | 'csv' | 'copy') => {
    if (!nights.length) { toast('Todavía no hay noches que exportar', 'info'); return; }
    if (kind === 'json') download(`sueno-${today}.json`, exportJson(nights, settings), 'application/json');
    else if (kind === 'csv') download(`sueno-${today}.csv`, exportCsv(nights), 'text/csv');
    else navigator.clipboard?.writeText(exportJson(nights, settings)).then(() => toast('JSON copiado', 'info'), () => toast('No se pudo copiar: usa «Descargar JSON»', 'info'));
    sfx.saved();
  };

  return (
    <div className="diary" data-testid="diary-data">
      <Panel title={<><Icon name="sundial" /> Tu horario objetivo</>}>
        <p className="muted small-text">Lo usan el plan, el Reloj de Sol y la cuenta atrás. Cámbialo en cada escalón del plan.</p>
        <div className="night-grid">
          <label className="field"><span>Hora de levantarte</span>
            <TimeField id="health-levantar" label="Hora de levantarte" clearable={false} value={settings.levantar} onChange={(v) => v && saveHealthSettings({ levantar: v })} /></label>
          <label className="field"><span>Horas en la cama</span>
            <Select id="health-horas" label="Horas en la cama" value={settings.horas} onChange={(v) => saveHealthSettings({ horas: v })}
              options={[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11].map((v) => ({ value: v, label: `${String(v).replace('.', ',')} h` }))} /></label>
          <label className="field"><span>Entrenos planeados por semana</span>
            <Select id="health-entrenos-plan" label="Entrenos planeados por semana" value={settings.entrenosPlan} onChange={(v) => saveHealthSettings({ entrenosPlan: v, entrenosMin: Math.min(settings.entrenosMin, v) })} options={NUM_1_21} /></label>
          <label className="field"><span>Mínimo para cumplir (Palestra)</span>
            <Select id="health-entrenos" label="Mínimo para cumplir" value={settings.entrenosMin} onChange={(v) => saveHealthSettings({ entrenosMin: v, entrenosPlan: Math.max(settings.entrenosPlan, v) })} options={NUM_1_21} /></label>
        </div>
        <p className="muted small-text">Cama a las {bedtimeGoal(settings)}, levantarte a las {settings.levantar}.</p>
      </Panel>

      <Panel title={<><Icon name="download" /> Exportar</>}>
        <p className="muted small-text">JSON para que Claude lo analice; CSV para Excel o Google Sheets.</p>
        <div className="row">
          <button className="primary" onClick={() => exp('json')}>Descargar JSON</button>
          <button className="secondary" onClick={() => exp('csv')}>Descargar CSV</button>
          <button className="secondary" onClick={() => exp('copy')}>Copiar JSON</button>
        </div>
      </Panel>

      <Panel title={<><Icon name="upload" /> Importar</>}>
        <p className="muted small-text">Una copia JSON del diario (de la web antigua de Health o de aquí). Las noches con la misma fecha se sustituyen.</p>
        <button className="secondary" onClick={() => file.current?.click()}>Importar JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={onImport} data-testid="health-import" />
      </Panel>

      <Panel title={<><Icon name={cloud.userId ? (sync === 'error' ? 'cloud-off' : 'cloud') : 'laptop'} /> Nube</>}>
        <p className="muted small-text">
          {!cloud.userId ? 'Sin cuenta: las noches se guardan solo en este navegador. Entra con tu email (Ajustes → Cuenta) y se guardarán en la nube.'
            : error ?? (sync === 'syncing' ? 'Sincronizando…' : `Noches sincronizadas con tu cuenta (${nights.length}).`)}
        </p>
      </Panel>

      <Panel title={<><Icon name="trash" /> Zona peligrosa</>}>
        {!wipe ? <button className="ghost danger" onClick={() => setWipe(true)}>Borrar todas las noches</button> : (
          <div className="row">
            <span className="muted small-text">¿Seguro? Se borran todas las noches{cloud.userId ? ', también de la nube' : ' de este navegador'}. Las obras ya levantadas se quedan.</span>
            <button className="ghost danger" onClick={() => { wipeNights(); setWipe(false); toast('Noches borradas', 'info'); }}>Sí, borrar</button>
            <button className="ghost" onClick={() => setWipe(false)}>Cancelar</button>
          </div>
        )}
      </Panel>
    </div>
  );
}
