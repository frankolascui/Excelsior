// Ajustes (tema, guía, tutorial, copia de seguridad), escalera de avatares y crónica semanal.
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Game, Tab } from './screens';
import { avatarInfo, ATTRIBUTES, formatAttrXp } from './attributes';
import { applyTheme, CUSTOM_ID, loadTheme, saveTheme, THEMES, type Theme } from './theme';
import { exportBackup, parseBackup, restorePrefs, type ImportResult } from './backup';
import { save } from './store';
import { saveFile } from './download';
import { adminToLevel, grantAdminXp, levelInfo, simulatePastDays, totalXp } from './game';
import { ADMIN, checkAdminPassword, setAdmin } from './admin';
import { ChronicleOath, openRitual } from './ritual';
import { AccountPanel } from './account';
import { ConfirmButton } from './ui';
import { TOURS } from './tutorial';
import { isUnlocked } from './unlocks';
import { summonTemplate, BOSS_TEMPLATES, MAX_ACTIVE_BOSSES, activeBosses } from './bosses';
import { weekSummary } from './summary';
import { formatMinutes } from './ui';
import { DEFAULT_GUIDE } from './tutorial';
import { sfx } from './sfx';

// ---------- Ajustes ----------

export function SettingsScreen({
  game, guide, setGuide, startTour,
}: { game: Game; guide: string; setGuide: (name: string) => void; startTour: (id: string) => void }) {
  return (
    <div className="screen">
      <h1 className="screen-title">Ajustes</h1>
      <AccountPanel />
      <SettingsPanel game={game} guide={guide} setGuide={setGuide} replayTutorial={() => startTour('intro')} />
      <AdminPanel game={game} startTour={startTour} />
      <section className="panel quiet">
        <h3>Zona peligrosa</h3>
        <p className="muted">Borrar el personaje elimina misiones, hábitos e historial de este dispositivo.</p>
        <ConfirmButton label="Borrar personaje" confirmLabel="Sí, borrar todo" onConfirm={game.reset} />
      </section>
    </div>
  );
}

/** Modo admin: partida de pruebas aparte con todo desbloqueado y atajos para probar. */
function AdminPanel({ game, startTour }: { game: Game; startTour: (id: string) => void }) {
  const [open, setOpen] = useState(ADMIN);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [xp, setXp] = useState('');
  const [toLevel, setToLevel] = useState('');
  if (!ADMIN) {
    async function enter(e: FormEvent) {
      e.preventDefault();
      if (await checkAdminPassword(password)) setAdmin(true);
      else setWrong(true);
    }
    return (
      <section className="panel quiet">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>🛠 Avanzado</button>
        {open && (
          <form className="admin-intro" onSubmit={enter}>
            <p className="hint">El modo admin abre una <strong>partida de pruebas aparte</strong> con todas las secciones desbloqueadas y atajos para subir de nivel. Tu partida real no se toca ni se sube a la nube; al salir vuelves a ella tal cual.</p>
            <label className="field">
              <span>Contraseña de admin</span>
              <input id="admin-pw" type="password" value={password} autoComplete="off" onChange={(e) => { setPassword(e.target.value); setWrong(false); }} />
            </label>
            {wrong && <p className="error-text" role="alert">Contraseña incorrecta.</p>}
            <button type="submit" className="secondary" disabled={!password}>Entrar en modo admin</button>
          </form>
        )}
      </section>
    );
  }
  const { act, state } = game;
  const now = Date.now();
  const avatar = avatarInfo(state, now);
  const customXp = Math.floor(Number(xp));
  const level = Math.floor(Number(toLevel));
  return (
    <section className="panel admin-panel">
      <h3>🛠 Modo admin</h3>
      <p className="hint">Partida de pruebas: nivel {levelInfo(totalXp(state)).level}, {totalXp(state)} XP, avatar {avatar.current.name}. Aquí no hay topes diarios de XP.</p>
      <h4 className="sub-h">XP de prueba (sube nivel, atributos y monedas)</h4>
      <div className="settings-row">
        {[100, 500, 2000].map((n) => (
          <button key={n} className="secondary" onClick={() => act((s) => ({ state: grantAdminXp(s, n, Date.now()), xp: n }))}>+{n} XP</button>
        ))}
        <form className="admin-inline" onSubmit={(e) => { e.preventDefault(); if (customXp > 0) act((s) => ({ state: grantAdminXp(s, customXp, Date.now()), xp: customXp })); setXp(''); }}>
          <input id="admin-xp" type="number" min={1} value={xp} onChange={(e) => setXp(e.target.value)} placeholder="XP" aria-label="XP a sumar" />
          <button type="submit" className="ghost" disabled={!(customXp > 0)}>Sumar</button>
        </form>
        <form className="admin-inline" onSubmit={(e) => { e.preventDefault(); if (level > 1) act((s) => adminToLevel(s, level, Date.now())); setToLevel(''); }}>
          <input id="admin-level" type="number" min={2} max={60} value={toLevel} onChange={(e) => setToLevel(e.target.value)} placeholder="Nivel" aria-label="Saltar al nivel" />
          <button type="submit" className="ghost" disabled={!(level > 1)}>Saltar al nivel</button>
        </form>
      </div>
      <h4 className="sub-h">Simular días pasados</h4>
      <p className="hint">Rellena los últimos días como si hubieras jugado: todos tus hábitos hechos y 1 h de Deep Work al día. Sirve para probar rachas, días activos y avatares.</p>
      <div className="settings-row">
        {[1, 7, 30, 90].map((d) => (
          <button key={d} className="secondary" onClick={() => act((s) => simulatePastDays(s, d, Date.now()))}>{d} {d === 1 ? 'día' : 'días'}</button>
        ))}
      </div>
      {avatar.next && (
        <>
          <h4 className="sub-h">Rituales</h4>
          <div className="settings-row">
            <button className="ghost" onClick={() => openRitual(true)}>Abrir ritual de {avatar.next.name}{avatar.ready ? '' : ' (sin requisitos)'}</button>
          </div>
        </>
      )}
      <h4 className="sub-h">Tutoriales</h4>
      <div className="settings-row">
        {Object.keys(TOURS).map((id) => <button key={id} className="ghost" onClick={() => startTour(id)}>Ver «{id}»</button>)}
        <button className="ghost" onClick={() => act((s) => ({ ...s, tours: [] }))}>Olvidar tutoriales vistos</button>
      </div>
      <h4 className="sub-h">Salir</h4>
      <div className="settings-row">
        <ConfirmButton label="Vaciar partida de pruebas" confirmLabel="Sí, vaciar" onConfirm={game.reset} />
        <button className="primary" onClick={() => setAdmin(false)}>Salir del modo admin</button>
      </div>
    </section>
  );
}

function SettingsPanel({
  game, guide, setGuide, replayTutorial,
}: { game: Game; guide: string; setGuide: (name: string) => void; replayTutorial: () => void }) {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [custom, setCustom] = useState(() => (theme.id === CUSTOM_ID ? theme : { ...THEMES[0], id: CUSTOM_ID, name: 'Personalizado' }));
  const [pending, setPending] = useState<ImportResult | null>(null);
  const file = useRef<HTMLInputElement>(null);

  function pick(t: Theme) {
    setTheme(t);
    applyTheme(t);
    saveTheme(t);
    sfx.tick();
  }

  function setCustomColor(key: 'c1' | 'c2' | 'c3', value: string) {
    const next = { ...custom, [key]: value };
    setCustom(next);
    pick(next);
  }

  async function download() {
    const name = `excelsior-${new Date().toISOString().slice(0, 10)}.json`;
    const r = await saveFile(name, exportBackup(game.state, Date.now()), 'application/json');
    if (r === 'ok') game.toast('Copia descargada', 'info');
    if (r === 'error') game.toast('No se pudo descargar aquí', 'info');
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setPending(parseBackup(await f.text()));
  }

  function confirmImport() {
    if (!pending?.ok) return;
    save(pending.state);
    restorePrefs(pending.prefs);
    location.reload();
  }

  return (
    <section className="panel" aria-labelledby="settings-h" data-tour="settings">
      <h3 id="settings-h">Ajustes</h3>

      <h4 className="sub-h">Tema</h4>
      <div className="themes" role="radiogroup" aria-label="Tema de color">
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={theme.id === t.id} className={theme.id === t.id ? 'theme-swatch on' : 'theme-swatch'} onClick={() => pick(t)}>
            <span className="swatch" style={{ background: `linear-gradient(120deg, ${t.c1}, ${t.c2} 55%, ${t.c3})` }} />
            {t.name}
          </button>
        ))}
        <button role="radio" aria-checked={theme.id === CUSTOM_ID} className={theme.id === CUSTOM_ID ? 'theme-swatch on' : 'theme-swatch'} onClick={() => pick(custom)}>
          <span className="swatch" style={{ background: `linear-gradient(120deg, ${custom.c1}, ${custom.c2} 55%, ${custom.c3})` }} />
          Personalizado
        </button>
      </div>
      {theme.id === CUSTOM_ID && (
        <div className="custom-colors">
          {(['c1', 'c2', 'c3'] as const).map((k, i) => (
            <label key={k}>
              <input type="color" value={custom[k]} onChange={(e) => setCustomColor(k, e.target.value)} aria-label={`Color ${i + 1}`} />
              {['Claro', 'Medio', 'Profundo'][i]}
            </label>
          ))}
        </div>
      )}

      <h4 className="sub-h">Guía</h4>
      <div className="settings-row">
        <label htmlFor="guide-name">Nombre de tu guía</label>
        <input id="guide-name" defaultValue={guide} maxLength={30} onBlur={(e) => setGuide(e.target.value.trim() || DEFAULT_GUIDE)} />
        <button className="secondary" onClick={replayTutorial}>Repetir tutorial</button>
      </div>

      <h4 className="sub-h">Copia de seguridad</h4>
      <p className="hint">Tu partida vive solo en este navegador. Descarga una copia de vez en cuando; con ella puedes pasarla a otro ordenador.</p>
      <div className="settings-row">
        <button className="secondary" onClick={download}>⬇ Exportar partida</button>
        <button className="ghost" onClick={() => file.current?.click()}>⬆ Importar copia</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={onFile} aria-label="Archivo de copia" />
      </div>
      {pending && !pending.ok && <p className="error-text">{pending.error}</p>}
      {pending?.ok && (
        <div className="import-confirm">
          <p>
            Copia de <strong>{pending.state.profile?.name}</strong>: nivel {levelInfo(totalXp(pending.state)).level}, {pending.state.quests.length} misiones, {pending.state.habits.length} hábitos.
            Sustituirá tu partida actual.
          </p>
          <span className="settings-row">
            <button className="danger-solid" onClick={confirmImport}>Sí, importar</button>
            <button className="ghost" onClick={() => setPending(null)}>Cancelar</button>
          </span>
        </div>
      )}
    </section>
  );
}

// ---------- Crónica semanal ----------

const SEEN_KEY = 'excelsior:chronicle-seen';

function seenWeek(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function WeeklyChronicle({ game, guide, now, go }: { game: Game; guide: string; now: number; go: (t: Tab) => void }) {
  const { state, act } = game;
  const w = weekSummary(state, now);
  const [hidden, setHidden] = useState(() => seenWeek() === w.weekKey);
  if (hidden || (w.xp === 0 && w.prevXp === 0)) return null;
  const challenge = BOSS_TEMPLATES.find((t) => t.id === w.challenge)!;
  const canSummon = isUnlocked(state, 'arena') && activeBosses(state, now).length < MAX_ACTIVE_BOSSES && !state.bosses.some((b) => b.name === challenge.name && b.deadline > now);
  const fmt = (ts: number) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  function close() {
    try {
      localStorage.setItem(SEEN_KEY, w.weekKey);
    } catch {
      /* ignorado */
    }
    setHidden(true);
  }
  const verdict = w.deltaPct === null ? 'Primera semana registrada.' : w.deltaPct >= 0 ? `+${w.deltaPct} % frente a la anterior. Sigue así.` : `${w.deltaPct} % frente a la anterior. Esta semana, recupera terreno.`;
  return (
    <section className="panel chronicle" aria-labelledby="chron-h">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Crónica de {guide} · {fmt(w.from)} – {fmt(w.to)}</p>
          <h3 id="chron-h">La semana pasada ganaste <span className="mono">{w.xp}</span> XP</h3>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Cerrar crónica">×</button>
      </header>
      <p className="muted">{verdict}</p>
      <div className="chron-stats">
        <span><b className="mono">{w.activeDays}/7</b> días activos</span>
        <span><b className="mono">{formatMinutes(w.deepWork)}</b> de Deep Work{w.focusPct !== null && ` · ${w.focusPct} % foco`}</span>
        <span><b className="mono">{w.quests}</b> misiones · <b className="mono">{w.habits}</b> hábitos</span>
        {w.bossesDefeated > 0 && <span><b className="mono">{w.bossesDefeated}</b> bosses caídos</span>}
      </div>
      <p className="chron-attrs">
        {ATTRIBUTES.map((a) => (
          <span key={a.id} className={a.id === w.weakest.id ? 'weak' : ''}>{a.icon} +{formatAttrXp(w.gains[a.id])}</span>
        ))}
      </p>
      <p>
        Tu punto débil fue <strong>{w.weakest.icon} {w.weakest.name}</strong>.{isUnlocked(state, 'arena') && <> Reto: derrota a <strong>{challenge.icon} {challenge.name}</strong> esta semana.</>}
      </p>
      <ChronicleOath state={state} />
      <div className="settings-row">
        {canSummon && (
          <button className="primary" onClick={() => { act((s) => summonTemplate(s, challenge.id, Date.now())); sfx.summon(); go('arena'); close(); }}>
            Aceptar el reto
          </button>
        )}
        <button className="ghost" onClick={close}>Entendido</button>
      </div>
    </section>
  );
}
