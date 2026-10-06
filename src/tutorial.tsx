// Tutorial guiado: un personaje-guía recorre cada pantalla y señala lo que explica.
// Preferencia de interfaz, no de partida: se guarda aparte del estado del juego.
import { useEffect, useState } from 'react';
import type { Tab } from './screens';
import { XP_RULES } from './game';
import { sfx } from './sfx';
import { STARTER_HABITS } from './screens';

const KEY = 'excelsior:tutorial';
export const DEFAULT_GUIDE = 'Hiperión';
const OLD_DEFAULT = 'Maestro Sun'; // guía por defecto hasta oct. 2026

export interface TutorialPrefs {
  doneFor: number | null; // createdAt del perfil que ya lo vio (un personaje nuevo lo vuelve a ver)
  guide: string;
}

export function loadTutorial(): TutorialPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const guide = raw?.guide?.trim();
    return { doneFor: raw?.doneFor ?? null, guide: guide && guide !== OLD_DEFAULT ? guide : DEFAULT_GUIDE };
  } catch {
    return { doneFor: null, guide: DEFAULT_GUIDE };
  }
}

export function saveTutorial(p: TutorialPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: se verá otra vez */
  }
}

interface Step {
  tab: Tab;
  target?: string; // valor de data-tour del elemento a señalar
  title: string;
  text: (ctx: { name: string; guide: string }) => string;
  pickHabits?: boolean; // muestra los hábitos sugeridos para elegir
}

/** Tutorial de bienvenida y uno corto por cada sección que se desbloquea con el nivel. */
export const TOURS: Record<string, Step[]> = {
  intro: [
    {
      tab: 'hoy',
      title: 'Bienvenido',
      text: ({ name, guide }) =>
        `Hola, ${name}. Soy ${guide}, tu guía. Aquí tu vida es el juego: haces cosas reales y ganas XP para subir de nivel. Te enseño lo básico en un minuto.`,
    },
    {
      tab: 'habitos',
      target: 'habits',
      title: 'Elige tus hábitos',
      text: () =>
        `Lo primero: ¿qué quieres hacer cada día? Elige al menos un hábito (puedes cambiarlos cuando quieras). Cada día que lo cumplas ganas +${XP_RULES.habit} XP. Regla: nunca falles dos días seguidos.`,
      pickHabits: true,
    },
    {
      tab: 'hoy',
      target: 'now',
      title: '¿Qué hago ahora?',
      text: () => '¿No sabes por dónde empezar? Mira aquí. Siempre te propongo una sola cosa.',
    },
    {
      tab: 'misiones',
      target: 'quest-add',
      title: 'Misiones',
      text: () =>
        `Apunta tus tareas y márcalas al terminar. La Principal es la más importante del día (+${XP_RULES.quest.main} XP).`,
    },
    {
      tab: 'deepwork',
      target: 'modes',
      title: 'Deep Work',
      text: () => 'Pulsa empezar y concéntrate. Cada minuto de foco da 1 XP.',
    },
    {
      tab: 'hoy',
      title: 'Tu primera misión',
      text: ({ guide }) =>
        `Eso es todo por ahora. Al subir de nivel se abrirán los Reinos (nivel 3), la Arena (nivel 5) y los Gremios (nivel 7), y te los enseñaré entonces. Ahora crea tu misión principal de hoy. — ${guide}`,
    },
  ],
  reinos: [
    {
      tab: 'reinos',
      target: 'realm',
      title: 'Los Reinos',
      text: () =>
        'Has desbloqueado los Reinos. Un reino es un proyecto grande: «Aprender a programar», «Ponerme en forma»… Este es tu mapa.',
    },
    {
      tab: 'reinos',
      target: 'kingdom-add',
      title: 'Funda tu primer reino',
      text: () =>
        'Ponle nombre y añade sus tareas: cada una es una construcción. Al completarlas, el campamento crece hasta ser un reino glorioso que te paga monedas.',
    },
  ],
  arena: [
    {
      tab: 'arena',
      target: 'bosses',
      title: 'La Arena',
      text: () =>
        'Has desbloqueado la Arena. Invoca una bestia: es un reto con plazo. Todo lo que haces le quita vida y, si cae a tiempo, te llevas su botín.',
    },
    {
      tab: 'arena',
      target: 'shop',
      title: 'El tesoro',
      text: () => 'Cada 5 XP ganas una moneda. Cámbialas aquí por premios reales que eliges tú: un episodio, salir con amigos…',
    },
  ],
  gremios: [
    {
      tab: 'gremios',
      title: 'Los Gremios',
      text: () => 'Has llegado lejos. Pronto podrás formar un gremio con tus amigos y enfrentaros juntos a las bestias. Para eso necesitarás una cuenta.',
    },
  ],
};


function useTyped(text: string): string {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return setN(text.length);
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 2)), 16);
    return () => clearInterval(id);
  }, [text, reduce]);
  return text.slice(0, n);
}

export function Tutorial({
  tour, step, name, guide, go, onStep, onClose, habits, onToggleHabit,
}: {
  tour: string; step: number; name: string; guide: string; go: (t: Tab) => void; onStep: (i: number) => void; onClose: () => void;
  habits: string[]; onToggleHabit: (name: string) => void;
}) {
  const STEPS = TOURS[tour];
  const s = STEPS[step];
  const blocked = !!s.pickHabits && habits.length === 0; // hay que elegir al menos un hábito
  const text = s.text({ name, guide });
  const typed = useTyped(text);
  const [hasTarget, setHasTarget] = useState(false);
  const last = step === STEPS.length - 1;

  // Cambia de pantalla y señala el elemento del paso.
  useEffect(() => {
    go(s.tab);
    sfx.tick();
    let el: Element | null = null;
    const t = setTimeout(() => {
      el = s.target ? document.querySelector(`[data-tour="${s.target}"]`) : null;
      setHasTarget(!!el);
      if (el) {
        el.classList.add('tour-target');
        el.scrollIntoView({ behavior: 'smooth', block: 'start' }); // arriba: la tarjeta del guía ocupa la parte de abajo
      }
    }, 60);
    return () => {
      clearTimeout(t);
      el?.classList.remove('tour-target');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, step]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !blocked) last ? onClose() : onStep(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, onClose, onStep, blocked]);

  return (
    <>
      {!hasTarget && <div className="tour-backdrop" aria-hidden="true" />}
      <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-h">
        <div className="tour-guide" aria-hidden="true">
          <span className="tour-portrait"><GuidePortrait /></span>
        </div>
        <div className="tour-body">
          <p className="eyebrow">{guide} · {step + 1}/{STEPS.length}</p>
          <h2 id="tour-h" className="tour-title">{s.title}</h2>
          <p className="tour-text" aria-live="polite">
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">{typed}</span>
          </p>
          {s.pickHabits && (
            <div className="tour-chips" role="group" aria-label="Hábitos sugeridos">
              {STARTER_HABITS.map((h) => (
                <button key={h} className={habits.includes(h) ? 'pick on' : 'pick'} aria-pressed={habits.includes(h)} onClick={() => onToggleHabit(h)}>{h}</button>
              ))}
            </div>
          )}
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}
          </div>
          <div className="tour-actions">
            <button className="link" onClick={onClose}>Saltar</button>
            <span className="tour-nav">
              {step > 0 && <button className="ghost" onClick={() => onStep(step - 1)}>Atrás</button>}
              <button className="primary" disabled={blocked} title={blocked ? 'Elige al menos un hábito' : undefined} onClick={() => (last ? onClose() : onStep(step + 1))} autoFocus>
                {last ? '¡A por ello!' : 'Siguiente'}
              </button>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/** Retrato del guía: yelmo corintio de bronce con mirada de luz. */
export function GuidePortrait() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-bronze" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="55%" stopColor="#d4a03c" />
          <stop offset="100%" stopColor="#7a4d12" />
        </linearGradient>
        <linearGradient id="g-crest" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--c3)" />
          <stop offset="50%" stopColor="var(--c1)" />
          <stop offset="100%" stopColor="var(--c2)" />
        </linearGradient>
      </defs>
      <path d="M10 27 C9 7, 55 7, 54 27 C47 15, 17 15, 10 27 Z" fill="url(#g-crest)" />
      <path d="M17 30 C17 16, 47 16, 47 30 L47 47 C47 52, 42 55, 38 55 L38 42 L34 38 L30 38 L26 42 L26 55 C22 55, 17 52, 17 47 Z" fill="url(#g-bronze)" />
      <path d="M21 32 L30 34.5 L32 33.5 L34 34.5 L43 32 L43 35.5 L34 38 L32 37 L30 38 L21 35.5 Z" fill="#160b02" />
      <circle cx="26" cy="34.6" r="1.6" fill="var(--c1)" className="guide-eye" />
      <circle cx="38" cy="34.6" r="1.6" fill="var(--c1)" className="guide-eye" />
      <path d="M32 18 L32 31" stroke="#7a4d12" strokeWidth="1.2" />
    </svg>
  );
}
