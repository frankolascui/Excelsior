// Deep Work con dos paneles (V3): el temporizador de foco de siempre y Academy entera.
// Academy usa direcciones «#academy/…» (asignatura, hoja, simulacro…), así que «atrás» del navegador funciona dentro.
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { Game } from './screens';
import { Icon } from './icons';
import { navState } from './nav-state';

const AcademyApp = lazy(() => import('./academy-app'));

const inAcademy = () => location.hash.startsWith('#academy');

export function DeepWorkTabs({ game, force, children }: { game: Game; force: boolean; children: ReactNode }) {
  // Venir de «Empezar Deep Work» en una misión, o con un temporizador en marcha, abre siempre el foco.
  const [panel, setPanel] = useState<'foco' | 'academy'>(() => (inAcademy() ? 'academy' : force || game.state.activeTimer ? 'foco' : navState.deepPanel));
  useEffect(() => {
    const onHash = () => { if (inAcademy()) { navState.deepPanel = 'academy'; setPanel('academy'); } };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const pick = (p: 'foco' | 'academy') => {
    navState.deepPanel = p;
    setPanel(p);
    const want = p === 'academy' ? '#academy/' : '#deepwork';
    if (p === 'academy' ? !inAcademy() : location.hash !== want) history.replaceState(null, '', want);
  };
  return (
    <>
      <div className="deep-tabs-row"><div className="segmented deep-tabs" role="tablist" aria-label="Deep Work">
        <button type="button" role="tab" aria-selected={panel === 'foco'} className={panel === 'foco' ? 'seg on' : 'seg'} onClick={() => pick('foco')}><Icon name="hourglass" /> Foco</button>
        <button type="button" role="tab" aria-selected={panel === 'academy'} className={panel === 'academy' ? 'seg on' : 'seg'} onClick={() => pick('academy')} data-testid="tab-academy" data-tour="academy"><Icon name="graduate-cap" /> Academy</button>
      </div></div>
      {panel === 'foco' ? children : (
        <div className="screen">
          <Suspense fallback={<p className="muted">Abriendo Academy…</p>}><AcademyApp game={game} /></Suspense>
        </div>
      )}
    </>
  );
}
