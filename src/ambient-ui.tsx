// Interfaz del sonido de fondo: panel de control en Deep Work y reproductor fijo que sigue sonando entre pantallas.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AMBIENTS, ambientEmbed, gainFor, parseLink, playAmbient, playLink, realStarted, setAmbientReal, setAmbientVolume, stopAmbient, stopLink, useAmbient, warmAmbient,
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
  useEffect(warmAmbient, []);
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
      <div className="ambient-source">
        <div className="segmented" role="radiogroup" aria-label="Fuente del sonido">
          <button type="button" role="radio" aria-checked={a.real} className={a.real ? 'seg on' : 'seg'} onClick={() => setAmbientReal(true)}>Grabación real</button>
          <button type="button" role="radio" aria-checked={!a.real} className={!a.real ? 'seg on' : 'seg'} onClick={() => setAmbientReal(false)}>Sintetizado</button>
        </div>
        <span className="muted small-text">
          {!a.real ? 'Sin internet ni anuncios: lo genera la app y suena al instante.'
            : a.loadingReal ? 'Cargando la grabación… mientras, suena el sintetizado.'
            : 'Suena la grabación de YouTube (necesita internet); hasta que carga, suena el sintetizado. La Calma siempre es sintetizada.'}
        </span>
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
  const embed = a.linkOn ? parseLink(a.link) : ambientEmbed(a);
  const synth = AMBIENTS.find((x) => x.id === a.playing);
  const frame = useRef<HTMLIFrameElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const ambientYt = embed?.kind === 'youtube' && !a.linkOn;
  const volume = useRef(a.volume);
  volume.current = a.volume;
  /** La grabación del ambiente ya se oye (antes de eso está en silencio y suena el sintetizado). */
  const live = useRef(false);

  // El mismo control de volumen manda en todo lo que suena.
  useEffect(() => {
    if (audio.current) audio.current.volume = gainFor(a.volume);
    if (embed?.kind === 'youtube' && (!ambientYt || live.current)) ytCommand(frame.current, 'setVolume', [ytVolume(a.volume)]);
  }, [a.volume, embed?.kind, embed?.src]);

  // Cuando la grabación empieza a sonar de verdad, se quita el silencio, sube poco a poco y el sintetizado se retira.
  useEffect(() => {
    live.current = false;
    if (!ambientYt) return;
    const timers: number[] = [];
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      let msg: { event?: string; info?: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const info = msg.info as { playerState?: number } | number | undefined;
      const playing = (msg.event === 'onStateChange' && info === 1) || ((msg.event === 'infoDelivery' || msg.event === 'initialDelivery') && typeof info === 'object' && info?.playerState === 1);
      if (!playing) return;
      window.removeEventListener('message', onMessage);
      ytCommand(frame.current, 'setVolume', [Math.max(1, Math.round(ytVolume(volume.current) / 10))]);
      ytCommand(frame.current, 'unMute');
      for (let i = 2; i <= 10; i++) timers.push(window.setTimeout(() => ytCommand(frame.current, 'setVolume', [Math.round((ytVolume(volume.current) * i) / 10)]), (i - 1) * 300));
      timers.push(window.setTimeout(() => (live.current = true), 3000));
      realStarted();
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      timers.forEach(clearTimeout);
    };
  }, [ambientYt, embed?.src]);

  function onFrameLoad() {
    if (embed?.kind !== 'youtube') return;
    // YouTube solo escucha órdenes (y avisa de cuándo suena) cuando el reproductor está listo: se reintenta unas veces.
    [0, 300, 1000, 2500].forEach((ms) => setTimeout(() => {
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'ambient', channel: 'widget' }), '*');
      if (!ambientYt) ytCommand(frame.current, 'setVolume', [ytVolume(volume.current)]);
    }, ms));
  }

  if (!embed && !synth) return null;
  return (
    <div className={embed?.kind === 'spotify' ? 'ambient-dock with-player' : 'ambient-dock'}>
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
      {embed?.kind === 'youtube' && a.linkOn && (
        <span className="ambient-now">
          <Icon name="music" /> Música de YouTube
          <button className="icon-btn" onClick={stopLink} aria-label="Parar música" title="Parar"><Icon name="stop" /></button>
        </span>
      )}
      {embed && embed.kind !== 'audio' && (
        <>
          {/* YouTube suena sin enseñar el vídeo: el reproductor queda oculto (solo audio) */}
          <iframe
            ref={frame} onLoad={onFrameLoad}
            title="Música de fondo" src={embed.src} allow="autoplay; encrypted-media"
            className={embed.kind === 'spotify' ? 'spotify' : 'youtube audio-only'} aria-hidden={embed.kind === 'youtube' || undefined} tabIndex={embed.kind === 'youtube' ? -1 : undefined}
          />
          {embed.kind === 'spotify' && <button className="icon-btn dock-close" onClick={stopLink} aria-label="Cerrar reproductor" title="Cerrar"><Icon name="x" /></button>}
        </>
      )}
      {embed?.kind !== 'spotify' && (
        <Volume value={a.volume} label="Volumen del sonido de fondo" className="dock-vol" />
      )}
    </div>
  );
}
