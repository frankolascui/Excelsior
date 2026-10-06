import { useEffect, useState } from 'react';
import { useGame } from './store';
import { addHabit, deleteHabit, hasSeenTour, levelInfo, markTour, totalXp, xpForLevel } from './game';
import { avatarInfo } from './attributes';
import { isMuted, setMuted, sfx } from './sfx';
import { Arena, CoinBadge } from './arena';
import { AmbientDock } from './ambient-ui';
import { ConflictDialog, Guilds, loadGuest, saveGuest, Welcome } from './account';
import { cloudEnabled, useCloud } from './cloud';
import { coinBalance } from './economy';
import { Character, Dashboard, DeepWork, Habits, Kingdoms, Onboarding, Quests, type Tab } from './screens';
import { SettingsScreen } from './settings';
import type { Quest } from './types';
import { loadTutorial, saveTutorial, Tutorial, TOURS, type TutorialPrefs } from './tutorial';
import { isUnlocked, unlockedBetween, unlockLevel, UNLOCKS } from './unlocks';
import { ADMIN, setAdmin } from './admin';
import { onReviewRequest, onRitualRequest, openRitual, ReviewDialog, RitualDialog } from './ritual';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'hoy', label: 'Hoy', glyph: '◆' },
  { id: 'misiones', label: 'Misiones', glyph: '✦' },
  { id: 'habitos', label: 'Hábitos', glyph: '✓' },
  { id: 'deepwork', label: 'Deep Work', glyph: '◷' },
  { id: 'reinos', label: 'Reinos', glyph: '♖' },
  { id: 'arena', label: 'Arena', glyph: '⚔' },
  { id: 'gremios', label: 'Gremios', glyph: '⛨' },
  { id: 'personaje', label: 'Personaje', glyph: '♜' },
];

function tabFromHash(): Tab {
  const h = location.hash.slice(1);
  if (h === 'ajustes') return 'ajustes';
  return (TABS.find((t) => t.id === h)?.id ?? 'hoy') as Tab;
}

export default function App() {
  const game = useGame();
  const { state } = game;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const [tutorial, setTutorial] = useState<TutorialPrefs>(loadTutorial);
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null);
  const profileId = state.profile?.createdAt ?? null;
  const cloud = useCloud();
  const [guest, setGuest] = useState(loadGuest);
  const level = levelInfo(totalXp(state)).level;
  const introSeen = hasSeenTour(state, 'intro');
  const [ritual, setRitual] = useState(false);
  const [review, setReview] = useState(false);
  useEffect(() => onReviewRequest(() => setReview(true)), []);
  const avatar = avatarInfo(state, Date.now());

  // El ritual se abre desde la tarjeta de avatar, el camino del héroe o la subida de nivel.
  useEffect(() => onRitualRequest((force) => {
    const a = avatarInfo(game.state, Date.now());
    if (a.next && (a.ready || (force && ADMIN))) setRitual(true);
  }), [game.state]);

  // Tutorial de bienvenida: una vez por partida (se guarda en la partida, así no se repite en otro dispositivo).
  useEffect(() => {
    if (!state.profile || (cloud.email && !game.cloudChecked)) return;
    if (!introSeen && tutorial.doneFor === state.profile.createdAt) {
      game.act((s) => markTour(s, 'intro')); // ya lo vio con la versión anterior
      return;
    }
    if (!introSeen && !tour) setTour({ id: 'intro', step: 0 });
  }, [profileId, introSeen, game.cloudChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si llega una partida (de la nube) que ya vio este tutorial, se cierra.
  useEffect(() => {
    if (tour && hasSeenTour(state, tour.id)) setTour(null);
  }, [state.tours]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir por primera vez una sección desbloqueada, Hiperión la presenta.
  useEffect(() => {
    if (!state.profile || tour || !introSeen) return;
    if (TOURS[tab] && unlockLevel(tab) !== null && isUnlocked(state, tab) && !hasSeenTour(state, tab)) setTour({ id: tab, step: 0 });
  }, [tab, introSeen, level]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateTutorial(p: Partial<TutorialPrefs>) {
    const next = { ...tutorial, ...p };
    setTutorial(next);
    saveTutorial(next);
  }

  function closeTour() {
    if (tour) {
      const id = tour.id;
      game.act((s) => markTour(s, id));
    }
    setTour(null);
  }

  function toggleSound() {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) sfx.reward();
  }

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(t: Tab) {
    setTab(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* sin historial disponible */
    }
    window.scrollTo({ top: 0 });
  }

  function focusQuest(q: Quest | null) {
    setPreselect(q?.id ?? null);
    go('deepwork');
  }

  if (!state.profile) {
    if (cloudEnabled && !ADMIN && !cloud.ready) return null;
    if (cloudEnabled && !ADMIN && !cloud.email && !guest) return <Welcome onGuest={() => { saveGuest(true); setGuest(true); }} />;
    return <Onboarding game={game} onBack={cloudEnabled && !ADMIN ? () => { saveGuest(false); setGuest(false); } : undefined} />;
  }

  /** Paso del tutorial «Hábitos»: activar o quitar uno de los hábitos sugeridos. */
  function toggleStarterHabit(name: string) {
    const existing = state.habits.find((h) => h.name === name);
    game.act((s) => (existing ? deleteHabit(s, existing.id) : addHabit(s, name, Date.now())));
  }

  const locked = !isUnlocked(state, tab);
  const newlyUnlocked = game.levelUp ? unlockedBetween(game.levelUpFrom, game.levelUp) : [];

  return (
    <div className={ADMIN ? 'app admin' : 'app'}>
      {ADMIN && (
        <div className="admin-bar" role="status">
          🛠 Modo admin · partida de pruebas, todo desbloqueado · <button className="link" onClick={() => setAdmin(false)}>Salir</button>
        </div>
      )}
      <nav className="nav" aria-label="Secciones">
        <div className="nav-brand">Excelsior</div>
        {TABS.map((t) => {
          const open = isUnlocked(state, t.id);
          return (
            <button
              key={t.id} className={`nav-item${tab === t.id ? ' on' : ''}${open ? '' : ' locked'}`} aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)} title={open ? undefined : `Se desbloquea en el nivel ${unlockLevel(t.id)}`}
            >
              <span className="nav-glyph" aria-hidden="true">{open ? t.glyph : '🔒'}</span>
              <span className="nav-label">{t.label}</span>
              {!open && <span className="nav-lock mono">Nv {unlockLevel(t.id)}</span>}
              {open && unlockLevel(t.id) !== null && !hasSeenTour(state, t.id) && introSeen && <span className="nav-new">nuevo</span>}
              {t.id === 'deepwork' && state.activeTimer && <span className="live-dot" aria-label="Sesión en curso" />}
              {t.id === 'personaje' && avatar.ready && <span className="nav-new">ritual</span>}
            </button>
          );
        })}
        <div className="nav-level mono">Nv {level} · <CoinBadge amount={coinBalance(state, Date.now())} /></div>
      </nav>

      <div className="top-actions">
        <button className={tab === 'ajustes' ? 'icon-round on' : 'icon-round'} onClick={() => go('ajustes')} aria-label="Ajustes" title="Ajustes">⚙</button>
        <button className="icon-round" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} title={muted ? 'Activar sonido' : 'Silenciar sonido'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <main className="main">
        {locked ? <LockedScreen tab={tab} level={level} xp={totalXp(state)} /> : (
          <>
            {tab === 'hoy' && <Dashboard game={game} go={go} focusQuest={focusQuest} guide={tutorial.guide} />}
            {tab === 'misiones' && <Quests game={game} focusQuest={focusQuest} />}
            {tab === 'reinos' && <Kingdoms game={game} focusQuest={focusQuest} />}
            {tab === 'arena' && <Arena game={game} />}
            {tab === 'gremios' && <Guilds />}
            {tab === 'deepwork' && <DeepWork key={preselect ?? 'free'} game={game} preselect={preselect} clearPreselect={() => setPreselect(null)} />}
            {tab === 'habitos' && <Habits game={game} />}
            {tab === 'personaje' && <Character game={game} />}
            {tab === 'ajustes' && (
              <SettingsScreen
                game={game} guide={tutorial.guide} setGuide={(guide) => updateTutorial({ guide })}
                startTour={(id) => setTour({ id, step: 0 })}
              />
            )}
          </>
        )}
      </main>

      {tour && (
        <Tutorial
          tour={tour.id} step={tour.step} name={state.profile.name} guide={tutorial.guide} go={go}
          onStep={(step) => setTour({ id: tour.id, step })} onClose={closeTour}
          habits={state.habits.map((h) => h.name)} onToggleHabit={toggleStarterHabit}
        />
      )}

      <AmbientDock />

      <div className="toasts" aria-live="polite">
        {game.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>
        ))}
      </div>

      {ritual && !tour && <RitualDialog game={game} guide={tutorial.guide} onClose={() => setRitual(false)} />}
      {review && !tour && !ritual && <ReviewDialog game={game} guide={tutorial.guide} onClose={() => setReview(false)} />}

      {game.conflict && <ConflictDialog local={state} remote={game.conflict} onChoose={game.resolveConflict} />}

      {game.levelUp && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="lvl-h" onClick={game.dismissLevelUp}>
          <div className="levelup" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Subes de nivel</p>
            <div className="emblem big" aria-hidden="true"><span className="mono">{game.levelUp}</span></div>
            <h2 id="lvl-h">Nivel {game.levelUp}</h2>
            <p className="muted">Nivel global · {avatar.current.name}</p>
            {avatar.ready && <p className="unlock-line">🕯️ Ritual disponible: <strong>{avatar.next!.icon} {avatar.next!.name}</strong></p>}
            {newlyUnlocked.map((u) => (
              <p key={u.tab} className="unlock-line">🔓 Desbloqueado: <strong>{u.icon} {u.name}</strong></p>
            ))}
            {newlyUnlocked.length > 0 ? (
              <button className="primary big" autoFocus onClick={() => { game.dismissLevelUp(); go(newlyUnlocked[0].tab); }}>
                Ir a {newlyUnlocked[0].name}
              </button>
            ) : avatar.ready ? (
              <button className="primary big" autoFocus onClick={() => { game.dismissLevelUp(); openRitual(); }}>Hacer el ritual</button>
            ) : (
              <button className="primary big" onClick={game.dismissLevelUp} autoFocus>Seguir</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LockedScreen({ tab, level, xp }: { tab: Tab; level: number; xp: number }) {
  const u = UNLOCKS.find((x) => x.tab === tab)!;
  const need = xpForLevel(u.level);
  return (
    <div className="screen">
      <section className="panel locked-screen">
        <div className="locked-icon" aria-hidden="true">🔒</div>
        <h1 className="screen-title">{u.icon} {u.name}</h1>
        <p>Se desbloquea en el <strong>nivel {u.level}</strong>. Estás en el nivel {level}: te faltan <strong className="mono">{Math.max(0, need - xp)} XP</strong>.</p>
        <p className="muted">Completa misiones, hábitos y Deep Work para llegar antes.</p>
      </section>
    </div>
  );
}
