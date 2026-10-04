// Ajustes (tema, guía, tutorial, copia de seguridad), escalera de avatares y crónica semanal.
import { useRef, useState, type ChangeEvent } from 'react';
import type { Game, Tab } from './screens';
import { AVATARS, avatarInfo, avatarRequirements, ATTRIBUTES, formatAttrXp, requirementStatus } from './attributes';
import { applyTheme, CUSTOM_ID, loadTheme, saveTheme, THEMES, type Theme } from './theme';
import { exportBackup, parseBackup, restorePrefs, type ImportResult } from './backup';
import { save } from './store';
import { levelInfo, totalXp } from './game';
import { summonTemplate, BOSS_TEMPLATES, MAX_ACTIVE_BOSSES, activeBosses } from './bosses';
import { weekSummary } from './summary';
import { formatMinutes } from './ui';
import { DEFAULT_GUIDE } from './tutorial';
import { sfx } from './sfx';

// ---------- Ajustes ----------

export function SettingsPanel({
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
    const data = exportBackup(game.state, Date.now());
    // Dentro de Claude (Artifact) las descargas pasan por la capacidad «downloads»; en la web, enlace normal.
    const claudeRt = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: string }) => Promise<unknown> } | null> } }).claude;
    const downloads = claudeRt?.use ? await claudeRt.use('downloads').catch(() => null) : null;
    if (downloads) {
      try {
        await downloads.save({ filename: name, data });
        game.toast('Copia descargada', 'info');
      } catch (e) {
        if ((e as { code?: string }).code !== 'declined') game.toast('No se pudo descargar aquí', 'info');
      }
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    game.toast('Copia descargada', 'info');
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

// ---------- Escalera de avatares ----------

export function AvatarLadder({ game, now }: { game: Game; now: number }) {
  const { state } = game;
  const info = avatarInfo(state, now);
  const [open, setOpen] = useState<string | null>(info.next?.id ?? null);
  return (
    <section className="panel" aria-labelledby="ladder-h" data-tour="ladder">
      <header className="panel-head"><h3 id="ladder-h">Camino del héroe</h3><span className="count mono">{info.index + 1}/{AVATARS.length}</span></header>
      <p className="hint">Los requisitos son los mismos para todo el mundo. Además, cada avatar admite tus propias metas reales.</p>
      <ol className="ladder">
        {AVATARS.map((a, i) => {
          const state_ = i < info.index ? 'past' : i === info.index ? 'current' : i === info.index + 1 ? 'next' : 'locked';
          const reqs = avatarRequirements(state, a).map((r) => requirementStatus(state, r, now));
          const shown = open === a.id;
          return (
            <li key={a.id} className={`rung ${state_}`}>
              <button className="rung-head" onClick={() => setOpen(shown ? null : a.id)} aria-expanded={shown}>
                <span className="rung-icon" aria-hidden="true">{state_ === 'locked' ? '🔒' : a.icon}</span>
                <span className="rung-name">{a.name}</span>
                <span className="rung-state muted small-text">
                  {state_ === 'past' ? 'superado' : state_ === 'current' ? 'actual' : `${reqs.filter((r) => r.met).length}/${reqs.length}`}
                </span>
              </button>
              {shown && (
                <div className="rung-body">
                  <p className="rung-motto">«{a.motto}»</p>
                  {reqs.length === 0 ? <p className="muted small-text">Punto de partida.</p> : (
                    <ul className="reqs">
                      {reqs.map((r, j) => (
                        <li key={j} className={r.met ? 'req met' : 'req'}>
                          <span aria-hidden="true">{r.met ? '✓' : '○'}</span> {r.label}{!r.met && <span className="mono muted"> · {Math.floor(r.progress * 100)} %</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
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
  const canSummon = activeBosses(state, now).length < MAX_ACTIVE_BOSSES && !state.bosses.some((b) => b.name === challenge.name && b.deadline > now);
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
        Tu punto débil fue <strong>{w.weakest.icon} {w.weakest.name}</strong>. Reto: derrota a <strong>{challenge.icon} {challenge.name}</strong> esta semana.
      </p>
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
