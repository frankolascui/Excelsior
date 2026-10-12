// Inventario (V2): el cofre de premios canjeados y los trofeos sociales, con el título que enseñas a tus amigos.
import { useState } from 'react';
import type { Game } from './screens';
import { Chest } from './arena';
import { unusedPurchases } from './economy';
import { equipTitle, TROPHY_KIND, trophies, unlockedTitles } from './trophies';
import { Glyph, Icon } from './icons';
import './guilds.css';

type Tab = 'cofre' | 'trofeos';
const day = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function Inventory({ game }: { game: Game }) {
  const { state, act } = game;
  const unused = unusedPurchases(state).length;
  const list = [...trophies(state)].sort((a, b) => b.at - a.at);
  const titles = unlockedTitles(state);
  const [tab, setTab] = useState<Tab>(unused === 0 && list.length > 0 ? 'trofeos' : 'cofre');
  return (
    <section className="panel inventory" aria-labelledby="inv-h">
      <header className="panel-head chart-head">
        <div>
          <h3 id="inv-h"><Icon name="chest" /> Inventario</h3>
          {state.title && <p className="hero-title-tag">«{state.title}»</p>}
        </div>
        <div className="segmented inv-tabs" role="radiogroup" aria-label="Qué ver">
          <button type="button" role="radio" aria-checked={tab === 'cofre'} className={tab === 'cofre' ? 'seg on' : 'seg'} onClick={() => setTab('cofre')}>
            Cofre <span className="mono">{unused}</span>
          </button>
          <button type="button" role="radio" aria-checked={tab === 'trofeos'} className={tab === 'trofeos' ? 'seg on' : 'seg'} onClick={() => setTab('trofeos')}>
            Trofeos <span className="mono">{list.length}</span>
          </button>
        </div>
      </header>

      {tab === 'cofre' && (unused === 0
        ? <p className="empty">Tu cofre está vacío. Lo que canjees en la tienda de la Arena se guarda aquí hasta que lo uses.</p>
        : <Chest game={game} />)}

      {tab === 'trofeos' && (
        <>
          <p className="muted small-text">Lo que ganas con otros: el estandarte de cada encargo de gremio, ser el MVP de un encargo y la corona de la semana entre amigos. Se quedan aunque cambies de gremio.</p>
          {titles.length > 0 && (
            <>
              <p className="eyebrow">Tu título</p>
              <div className="title-pick" role="radiogroup" aria-label="Título que ven tus amigos">
                <button type="button" role="radio" aria-checked={!state.title} className={!state.title ? 'title-opt on' : 'title-opt'} onClick={() => act((s) => equipTitle(s, null))}>Sin título</button>
                {titles.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={state.title === t} className={state.title === t ? 'title-opt on' : 'title-opt'} onClick={() => act((s) => equipTitle(s, t))}>{t}</button>
                ))}
              </div>
            </>
          )}
          {list.length === 0 ? (
            <p className="empty">Aún no tienes trofeos. Gana un encargo con tu gremio o termina primero la semana entre tus amigos.</p>
          ) : (
            <ul className="trophy-grid">
              {list.map((t) => (
                <li key={t.id} className={`trophy k-${t.kind}`}>
                  <span className="trophy-icon" aria-hidden="true"><Glyph icon={t.icon} /></span>
                  <span className="trophy-body">
                    <span className="eyebrow">{TROPHY_KIND[t.kind]}</span>
                    <strong>{t.name}</strong>
                    <span className="muted small-text">{[t.detail, day(t.at)].filter(Boolean).join(' · ')}</span>
                    {(t.coins || t.title) && (
                      <span className="small-text">
                        {t.coins ? <>+{t.coins} <Icon name="coin" className="coin-ico" /></> : null}{t.coins && t.title ? ' · ' : ''}{t.title && <>título «{t.title}»</>}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
