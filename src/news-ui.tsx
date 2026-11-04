// Panel de novedades: una vez por versión (al abrir la app) y el historial completo en Ajustes.
import { useEffect, useState } from 'react';
import { APP_VERSION } from './version';
import { cmpVersion, NEWS, newsToAnnounce, type NewsEntry } from './news';
import { Icon } from './icons';

const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

function NewsBody({ entry }: { entry: NewsEntry }) {
  return (
    <>
      {entry.groups.map((g) => (
        <div key={g.name} className="news-group">
          <h4>{g.name}</h4>
          <ul>{g.items.map((it) => <li key={it}>{it}</li>)}</ul>
        </div>
      ))}
    </>
  );
}

function NewsDialog({ entry, onClose }: { entry: NewsEntry; onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="news-h" onClick={onClose}>
      <div className="news-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Novedades · v{entry.version}</p>
        <h2 id="news-h">{entry.title}</h2>
        <div className="news-scroll"><NewsBody entry={entry} /></div>
        <button className="primary big" autoFocus onClick={onClose}>¡A por ello!</button>
      </div>
    </div>
  );
}

const OPEN_EVENT = 'excelsior:news-open';

/** Abre el aviso de la versión actual (al pulsar la versión de la app). */
export function openNews() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** La versión visible de la app: al pulsarla vuelve a salir el aviso de novedades. */
export function VersionButton({ label, className, onClick }: { label: string; className: string; onClick?: () => void }) {
  return (
    <button type="button" className={`${className} version-btn`} onClick={() => { onClick?.(); openNews(); }} title="Ver las novedades de esta versión">
      {label}
    </button>
  );
}

/**
 * Sale una vez por versión, nada más entrar. Lo visto se guarda en la partida (no se repite en otro dispositivo).
 * Una partida recién creada no lo ve (todo es nuevo para ella): se marca como vista en silencio.
 * `ready` espera a que la partida de la nube haya llegado, para no enseñarlo si ya se vio en otro dispositivo.
 */
export function NewsGate({ seen, createdAt, ready, blocked, markSeen }: {
  seen: string | null; createdAt: number | null; ready: boolean; blocked: boolean; markSeen: () => void;
}) {
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const on = () => setManual(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  const auto = ready ? newsToAnnounce(seen) : null;
  const fresh = !!auto && createdAt !== null && Date.now() - createdAt < 30 * 60_000;
  useEffect(() => {
    if (fresh) markSeen();
  }, [fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = NEWS.find((n) => n.version === APP_VERSION) ?? NEWS[0];
  if (manual && current) return <NewsDialog entry={current} onClose={() => { setManual(false); if (auto) markSeen(); }} />;
  if (!auto || fresh || blocked) return null;
  return <NewsDialog entry={auto} onClose={markSeen} />;
}

/** Historial en Ajustes. Lo que aún no ha salido se marca como «Llega el …». */
export function NewsHistory() {
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<NewsEntry | null>(null);
  return (
    <section className="panel" aria-labelledby="news-hist-h">
      <header className="panel-head"><h3 id="news-hist-h">Novedades</h3><span className="count mono">v{APP_VERSION}</span></header>
      <ul className="news-list">
        {NEWS.map((n) => {
          const upcoming = cmpVersion(n.version, APP_VERSION) > 0;
          return (
            <li key={n.version}>
              <button type="button" className="news-row" aria-expanded={open === n.version} onClick={() => setOpen(open === n.version ? null : n.version)}>
                <b className="mono">v{n.version}</b> {n.title}
                <span className="muted small-text">{upcoming ? `Llega el ${longDate(n.date)}` : longDate(n.date)}</span>
                <Icon name={open === n.version ? 'chevron-down' : 'chevron-right'} />
              </button>
              {open === n.version && (
                <div className="news-detail">
                  <NewsBody entry={n} />
                  {n.announce !== false && <button type="button" className="link" onClick={() => setPreview(n)}>Ver el aviso tal como sale</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {preview && <NewsDialog entry={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
