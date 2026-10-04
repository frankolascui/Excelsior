// Interfaz del sonido de fondo: panel de control en Deep Work y reproductor fijo que sigue sonando entre pantallas.
import { useState, type FormEvent } from 'react';
import {
  AMBIENTS, parseLink, playAmbient, playLink, setAmbientVolume, stopAmbient, stopLink, useAmbient,
} from './ambient';

export function AmbientPanel() {
  const a = useAmbient();
  const [link, setLink] = useState(a.link);
  const parsed = link.trim() ? parseLink(link) : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (parsed) playLink(link);
  }
  return (
    <section className="panel ambient" aria-labelledby="ambient-h">
      <header className="panel-head"><h3 id="ambient-h">Sonido de fondo</h3></header>
      <div className="ambient-row">
        {AMBIENTS.map((x) => (
          <button
            key={x.id} type="button" className={a.playing === x.id ? 'chip-btn on' : 'chip-btn'} aria-pressed={a.playing === x.id}
            onClick={() => (a.playing === x.id ? stopAmbient() : playAmbient(x.id))}
          >
            <span aria-hidden="true">{x.icon}</span> {x.name}
          </button>
        ))}
        <label className="ambient-vol">
          <span className="sr-only">Volumen</span>
          <span aria-hidden="true">🔉</span>
          <input type="range" min={0} max={1} step={0.05} value={a.volume} onChange={(e) => setAmbientVolume(Number(e.target.value))} aria-label="Volumen del ambiente" />
        </label>
      </div>
      <form className="ambient-link" onSubmit={submit}>
        <input id="ambient-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="O pega un enlace: YouTube, Spotify o un .mp3" aria-label="Enlace de música" />
        {a.linkOn ? (
          <button type="button" className="ghost" onClick={stopLink}>Parar</button>
        ) : (
          <button type="submit" className="secondary" disabled={!parsed}>▶ Reproducir</button>
        )}
      </form>
      {link.trim() && !parsed && <p className="muted small-text">Ese enlace no parece válido.</p>}
    </section>
  );
}

/** Reproductor del enlace (vive en App para no cortarse al cambiar de pantalla) + aviso de lo que suena. */
export function AmbientDock() {
  const a = useAmbient();
  const embed = a.linkOn ? parseLink(a.link) : null;
  const synth = AMBIENTS.find((x) => x.id === a.playing);
  if (!embed && !synth) return null;
  return (
    <div className={embed && embed.kind !== 'audio' ? 'ambient-dock with-player' : 'ambient-dock'}>
      {synth && (
        <span className="ambient-now">
          <span aria-hidden="true">{synth.icon}</span> {synth.name}
          <button className="icon-btn" onClick={stopAmbient} aria-label="Parar sonido de fondo">■</button>
        </span>
      )}
      {embed?.kind === 'audio' && (
        <span className="ambient-now">
          🎵 <audio src={embed.src} autoPlay loop controls />
          <button className="icon-btn" onClick={stopLink} aria-label="Parar música">■</button>
        </span>
      )}
      {embed && embed.kind !== 'audio' && (
        <>
          <iframe
            title="Música de fondo" src={embed.src} allow="autoplay; encrypted-media"
            className={embed.kind === 'spotify' ? 'spotify' : 'youtube'} loading="lazy"
          />
          <button className="icon-btn dock-close" onClick={stopLink} aria-label="Cerrar reproductor">×</button>
        </>
      )}
    </div>
  );
}
