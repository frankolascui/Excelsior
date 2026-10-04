import { useEffect, useState } from 'react';
import { useGame } from './store';
import { levelInfo, totalXp } from './game';
import { avatarInfo } from './attributes';
import { isMuted, setMuted, sfx } from './sfx';
import { Arena, CoinBadge } from './arena';
import { AmbientDock } from './ambient-ui';
import { coinBalance } from './economy';
import { Character, Dashboard, DeepWork, Habits, Kingdoms, Onboarding, Quests, type Tab } from './screens';
import type { Quest } from './types';
import { loadTutorial, saveTutorial, Tutorial, type TutorialPrefs } from './tutorial';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'hoy', label: 'Hoy', glyph: '◆' },
  { id: 'misiones', label: 'Misiones', glyph: '✦' },
  { id: 'reinos', label: 'Reinos', glyph: '♖' },
  { id: 'arena', label: 'Arena', glyph: '⚔' },
  { id: 'deepwork', label: 'Deep Work', glyph: '◷' },
  { id: 'habitos', label: 'Hábitos', glyph: '✓' },
  { id: 'personaje', label: 'Personaje', glyph: '♜' },
];

function tabFromHash(): Tab {
  const h = location.hash.slice(1);
  return (TABS.find((t) => t.id === h)?.id ?? 'hoy') as Tab;
}

export default function App() {
  const game = useGame();
  const { state } = game;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const [tutorial, setTutorial] = useState<TutorialPrefs>(loadTutorial);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const profileId = state.profile?.createdAt ?? null;

  // Cada personaje nuevo ve el tutorial una vez.
  useEffect(() => {
    if (profileId !== null && tutorial.doneFor !== profileId) setTourStep(0);
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateTutorial(p: Partial<TutorialPrefs>) {
    const next = { ...tutorial, ...p };
    setTutorial(next);
    saveTutorial(next);
  }

  function closeTour() {
    setTourStep(null);
    updateTutorial({ doneFor: profileId });
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

  if (!state.profile) return <Onboarding game={game} />;

  const level = levelInfo(totalXp(state)).level;

  return (
    <div className="app">
      <nav className="nav" aria-label="Secciones">
        <div className="nav-brand">Excelsior</div>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'nav-item on' : 'nav-item'} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span className="nav-glyph" aria-hidden="true">{t.glyph}</span>
            <span className="nav-label">{t.label}</span>
            {t.id === 'deepwork' && state.activeTimer && <span className="live-dot" aria-label="Sesión en curso" />}
          </button>
        ))}
        <div className="nav-level mono">Nv {level} · <CoinBadge amount={coinBalance(state, Date.now())} /></div>
      </nav>

      <button className="sound-toggle" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} title={muted ? 'Activar sonido' : 'Silenciar sonido'}>
        {muted ? '🔇' : '🔊'}
      </button>

      <main className="main">
        {tab === 'hoy' && <Dashboard game={game} go={go} focusQuest={focusQuest} guide={tutorial.guide} />}
        {tab === 'misiones' && <Quests game={game} focusQuest={focusQuest} />}
        {tab === 'reinos' && <Kingdoms game={game} focusQuest={focusQuest} />}
        {tab === 'arena' && <Arena game={game} />}
        {tab === 'deepwork' && <DeepWork key={preselect ?? 'free'} game={game} preselect={preselect} clearPreselect={() => setPreselect(null)} />}
        {tab === 'habitos' && <Habits game={game} />}
        {tab === 'personaje' && (
          <Character game={game} guide={tutorial.guide} setGuide={(guide) => updateTutorial({ guide })} replayTutorial={() => setTourStep(0)} />
        )}
      </main>

      {tourStep !== null && (
        <Tutorial step={tourStep} name={state.profile.name} guide={tutorial.guide} go={go} onStep={setTourStep} onClose={closeTour} />
      )}

      <AmbientDock />

      <div className="toasts" aria-live="polite">
        {game.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>
        ))}
      </div>

      {game.levelUp && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="lvl-h" onClick={game.dismissLevelUp}>
          <div className="levelup" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Subes de nivel</p>
            <div className="emblem big" aria-hidden="true"><span className="mono">{game.levelUp}</span></div>
            <h2 id="lvl-h">Nivel {game.levelUp}</h2>
            <p className="muted">Nivel global · {avatarInfo(state, Date.now()).current.name}</p>
            <button className="primary big" onClick={game.dismissLevelUp} autoFocus>Seguir</button>
          </div>
        </div>
      )}
    </div>
  );
}
