// Interfaz del sonido de fondo: panel de control en Deep Work y reproductor fijo que sigue sonando entre pantallas.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AMBIENTS, gainFor, parseLink, playAmbient, playLink, setAmbientVolume, stopAmbient, stopLink, useAmbient,
} from './ambient';
import { Icon } from './icons';

/** Deslizador de volumen: va en pasos finos y sigue una curva, así se puede dejar muy bajito. */
function Volume({ value, label, className }: { value: number; label: string; className: string }) {
  const pct = Math.round(gainFor(value) * 100);
  return (
    <label className={className} title={`Volumen ${pct < 1 && value > 0 ? '<1' : pct} %`}>
      <Icon name={value === 0 ? 'mute' : value < 0.55 ? 'volume-low' : 'volume'} />
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => setAmbientVolume(Number(e.target.value))} aria-label={label} aria-valuetext={`${pct} %`} />
    </label>
  );
}

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
            <Icon name={x.icon} /> {x.name}
          </button>
        ))}
        <Volume value={a.volume} label="Volumen" className="ambient-vol" />
      </div>
      <form className="ambient-link" onSubmit={submit}>
        <input id="ambient-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="O pega un enlace: YouTube, Spotify o un .mp3" aria-label="Enlace de música" />
        {a.linkOn ? (
          <button type="button" className="ghost" onClick={stopLink}><Icon name="stop" /> Parar</button>
        ) : (
          <button type="submit" className="secondary" disabled={!parsed}><Icon name="play" /> Reproducir</button>
        )}
      </form>
      {link.trim() && !parsed && <p className="muted small-text">Ese enlace no parece válido.</p>}
      {parsed?.kind === 'spotify' && <p className="muted small-text">Spotify no deja controlar su volumen desde fuera: usa el de su reproductor o el del ordenador.</p>}
    </section>
  );
}

/** YouTube solo acepta volúmenes enteros de 0 a 100: lo más bajo que no sea silencio es 1. */
const ytVolume = (pos: number) => (pos <= 0 ? 0 : Math.max(1, Math.round(gainFor(pos) * 100)));

/** Manda una orden al reproductor de YouTube incrustado (API por postMessage, sin cargar scripts). */
function ytCommand(frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

/** Reproductor del enlace (vive en App para no cortarse al cambiar de pantalla) + aviso de lo que suena. */
export function AmbientDock() {
  const a = useAmbient();
  const embed = a.linkOn ? parseLink(a.link) : null;
  const synth = AMBIENTS.find((x) => x.id === a.playing);
  const frame = useRef<HTMLIFrameElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  // El mismo control de volumen manda en todo lo que suena.
  useEffect(() => {
    if (audio.current) audio.current.volume = gainFor(a.volume);
    if (embed?.kind === 'youtube') ytCommand(frame.current, 'setVolume', [ytVolume(a.volume)]);
  }, [a.volume, embed?.kind, embed?.src]);

  function onFrameLoad() {
    if (embed?.kind !== 'youtube') return;
    // YouTube solo escucha órdenes cuando el reproductor está listo: se reintenta unas veces.
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
    [300, 1000, 2500].forEach((ms) => setTimeout(() => ytCommand(frame.current, 'setVolume', [ytVolume(a.volume)]), ms));
  }

  if (!embed && !synth) return null;
  return (
    <div className={embed && embed.kind !== 'audio' ? 'ambient-dock with-player' : 'ambient-dock'}>
      {synth && (
        <span className="ambient-now">
          <Icon name={synth.icon} /> {synth.name}
          <button className="icon-btn" onClick={stopAmbient} aria-label="Parar sonido de fondo" title="Parar"><Icon name="stop" /></button>
        </span>
      )}
      {embed?.kind === 'audio' && (
        <span className="ambient-now">
          <Icon name="music" /> <audio ref={audio} src={embed.src} autoPlay loop controls />
          <button className="icon-btn" onClick={stopLink} aria-label="Parar música" title="Parar"><Icon name="stop" /></button>
        </span>
      )}
      {embed && embed.kind !== 'audio' && (
        <>
          <iframe
            ref={frame} onLoad={onFrameLoad}
            title="Música de fondo" src={embed.src} allow="autoplay; encrypted-media"
            className={embed.kind === 'spotify' ? 'spotify' : 'youtube'}
          />
          <button className="icon-btn dock-close" onClick={stopLink} aria-label="Cerrar reproductor" title="Cerrar"><Icon name="x" /></button>
        </>
      )}
      {embed?.kind !== 'spotify' && (
        <Volume value={a.volume} label="Volumen del sonido de fondo" className="dock-vol" />
      )}
    </div>
  );
}
