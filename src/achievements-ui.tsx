// Logros en pantalla: el aviso épico al conseguir uno y la vitrina en Personaje.
import { useEffect, useState } from 'react';
import type { GameState } from './types';
import { ACHIEVEMENTS, stats, TIER_LABEL, type AchievementDef } from './achievements';
import { formatMinutes } from './ui';

const inMinutes = (a: AchievementDef) => a.id.startsWith('dw-') && a.id !== 'dw-perfect';
const fmt = (a: AchievementDef, n: number) => (inMinutes(a) ? formatMinutes(n) : String(n));

function Medal({ a, locked = false }: { a: AchievementDef; locked?: boolean }) {
  return (
    <span className={`medal tier-${a.tier}${locked ? ' locked' : ''}`} aria-hidden="true">
      <span className="medal-icon">{locked ? '🔒' : a.icon}</span>
    </span>
  );
}

/** Aviso al conseguir un logro; se van mostrando de uno en uno. */
export function AchievementPopup({ queue, dismiss }: { queue: AchievementDef[]; dismiss: () => void }) {
  const a = queue[0];
  useEffect(() => {
    if (!a) return;
    const t = setTimeout(dismiss, 5200);
    return () => clearTimeout(t);
  }, [a, dismiss]);
  if (!a) return null;
  return (
    <button key={a.id} className={`achv-pop tier-${a.tier}`} onClick={dismiss} aria-live="assertive">
      <Medal a={a} />
      <span className="achv-pop-text">
        <span className="eyebrow">🏆 Logro desbloqueado · {TIER_LABEL[a.tier]}</span>
        <strong className="achv-pop-name">{a.name}</strong>
        <span className="muted small-text">{a.desc}</span>
      </span>
    </button>
  );
}

export function AchievementsPanel({ state, now }: { state: GameState; now: number }) {
  const [showAll, setShowAll] = useState(false);
  const got = new Map((state.achievements ?? []).map((x) => [x.id, x.at]));
  const st = stats(state, now);
  const categories = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
  // Sin «ver todos», de cada categoría se ven los conseguidos y los 2 siguientes más cercanos.
  const visible = (list: AchievementDef[]) => {
    if (showAll) return list;
    const done = list.filter((a) => got.has(a.id));
    const next = list.filter((a) => !got.has(a.id))
      .sort((x, y) => { const [a1, b1] = x.progress(st); const [a2, b2] = y.progress(st); return b1 && b2 ? a2 / b2 - a1 / b1 : 0; })
      .slice(0, 2);
    return [...done, ...next];
  };
  return (
    <section className="panel achievements" aria-labelledby="achv-h">
      <header className="panel-head">
        <h3 id="achv-h">🏆 Logros</h3>
        <span className="count mono">{got.size}/{ACHIEVEMENTS.length}</span>
      </header>
      {categories.map((c) => {
        const list = visible(ACHIEVEMENTS.filter((a) => a.category === c));
        return (
          <div key={c} className="achv-cat">
            <p className="eyebrow">{c}</p>
            <ul className="achv-grid">
              {list.map((a) => {
                const at = got.get(a.id);
                const [v, goal] = a.progress(st);
                return (
                  <li key={a.id} className={`achv tier-${a.tier}${at ? ' got' : ''}`} title={a.desc}>
                    <Medal a={a} locked={!at} />
                    <div className="achv-body">
                      <span className="achv-name">{a.name}</span>
                      <span className="muted small-text">{a.desc}</span>
                      {at ? (
                        <span className="achv-date mono">{TIER_LABEL[a.tier]} · {new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      ) : (
                        <>
                          <span className="achv-bar" aria-hidden="true"><span style={{ width: `${Math.floor((v / goal) * 100)}%` }} /></span>
                          <span className="achv-date mono">{fmt(a, v)} / {fmt(a, goal)}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `Ver los ${ACHIEVEMENTS.length} logros`}</button>
    </section>
  );
}
