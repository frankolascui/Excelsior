// Deep Work con dos paneles (V3): el temporizador de foco de siempre y Academy (repaso de tarjetas).
import { useState, type ReactNode } from 'react';
import type { Game } from './screens';
import { Icon } from './icons';
import { navState } from './nav-state';
import { AcademyPanel } from './academy-ui';

export function DeepWorkTabs({ game, force, children }: { game: Game; force: boolean; children: ReactNode }) {
  // Venir de «Empezar Deep Work» en una misión, o con un temporizador en marcha, abre siempre el foco.
  const [panel, setPanel] = useState<'foco' | 'academy'>(() => (force || game.state.activeTimer ? 'foco' : navState.deepPanel));
  const pick = (p: 'foco' | 'academy') => { navState.deepPanel = p; setPanel(p); };
  return (
    <>
      <div className="deep-tabs-row"><div className="segmented deep-tabs" role="tablist" aria-label="Deep Work">
        <button type="button" role="tab" aria-selected={panel === 'foco'} className={panel === 'foco' ? 'seg on' : 'seg'} onClick={() => pick('foco')}><Icon name="hourglass" /> Foco</button>
        <button type="button" role="tab" aria-selected={panel === 'academy'} className={panel === 'academy' ? 'seg on' : 'seg'} onClick={() => pick('academy')} data-testid="tab-academy" data-tour="academy"><Icon name="graduate-cap" /> Academy</button>
      </div></div>
      {panel === 'foco' ? children : <div className="screen"><h1 className="screen-title">Academy</h1><AcademyPanel game={game} /></div>}
    </>
  );
}
