// Tutorial guiado: un personaje-guía recorre cada pantalla y señala lo que explica.
// Preferencia de interfaz, no de partida: se guarda aparte del estado del juego.
import { useEffect, useState } from 'react';
import type { Tab } from './screens';
import { XP_RULES } from './game';

const KEY = 'excelsior:tutorial';
export const DEFAULT_GUIDE = 'Maestro Sun';

export interface TutorialPrefs {
  doneFor: number | null; // createdAt del perfil que ya lo vio (un personaje nuevo lo vuelve a ver)
  guide: string;
}

export function loadTutorial(): TutorialPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { doneFor: raw?.doneFor ?? null, guide: raw?.guide?.trim() || DEFAULT_GUIDE };
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
}

export const STEPS: Step[] = [
  {
    tab: 'hoy',
    title: 'Bienvenida',
    text: ({ name, guide }) =>
      `Saludos, ${name}. Soy ${guide}, cronista de Excelsior. Aquí tu vida real es la partida: lo que haces da XP, sube tus atributos y levanta tus reinos. Te enseño el castillo en un par de minutos.`,
  },
  {
    tab: 'hoy',
    target: 'now',
    title: '¿Qué hago ahora?',
    text: () =>
      'Esta es la pregunta que más importa. Excelsior siempre te propone UNA acción: un Deep Work, tu misión principal o un hábito. Cuando dudes, no pienses: haz lo que diga aquí.',
  },
  {
    tab: 'misiones',
    target: 'quest-add',
    title: 'Misiones',
    text: () =>
      `Tus tareas son misiones. Principal (+${XP_RULES.quest.main} XP) es la que de verdad mueve tu vida; Diaria (+${XP_RULES.quest.daily}) es la rutina; Secundaria (+${XP_RULES.quest.side}) es lo demás. Hay un tope de ${XP_RULES.dailyCap.quest} XP al día por misiones: no se gana trampeándose a uno mismo.`,
  },
  {
    tab: 'deepwork',
    target: 'modes',
    title: 'Deep Work',
    text: () =>
      'Aquí se forja la Maestría. Elige sesión libre o con minutos. Si te levantas, pulsa Descanso; si te vas al móvil, Me distraje. Solo el foco real da XP: 1 por minuto, y verás tu % de foco al terminar.',
  },
  {
    tab: 'habitos',
    target: 'habits',
    title: 'Hábitos',
    text: () =>
      `Los hábitos se marcan cada día (+${XP_RULES.habit} XP) y cada uno alimenta un atributo: entrenar da Voluntad, leer da Sabiduría, llamar a alguien da Conexión. La racha es tu escudo: no la rompas dos días seguidos.`,
  },
  {
    tab: 'reinos',
    target: 'realm',
    title: 'Reinos',
    text: () =>
      'Tus proyectos grandes son reinos. Cada tarea es una construcción: cabaña, herrería o torreón. Al completarlas el reino pasa de campamento a aldea, villa, ciudad amurallada y reino glorioso, y su camino en el mapa se ilumina.',
  },
  {
    tab: 'personaje',
    target: 'avatar',
    title: 'Tu avatar',
    text: () =>
      'Tu avatar no sube solo con XP. Exige nivel global, niveles de atributo y metas reales que eliges tú: dinero, peso, personas nuevas. Lo que no cumples en la vida real, no lo desbloqueas aquí.',
  },
  {
    tab: 'personaje',
    target: 'attrs',
    title: 'Atributos',
    text: () =>
      'Cinco atributos: Voluntad, Sabiduría, Maestría, Conexión y Creación. Mira cuál está más bajo: ese suele ser tu cuello de botella.',
  },
  {
    tab: 'personaje',
    target: 'heat',
    title: 'Actividad',
    text: () =>
      'Cada cuadrado es un día; cuanto más brilla, más XP. El objetivo no es un día perfecto: es no dejar huecos.',
  },
  {
    tab: 'hoy',
    title: 'Primera orden',
    text: ({ guide }) =>
      `Eso es todo. Tu primera orden: crea la misión principal de hoy y complétala antes de dormir. Si me necesitas, en Personaje → Repetir tutorial. ${guide} se retira.`,
  },
];

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
  step, name, guide, go, onStep, onClose,
}: { step: number; name: string; guide: string; go: (t: Tab) => void; onStep: (i: number) => void; onClose: () => void }) {
  const s = STEPS[step];
  const text = s.text({ name, guide });
  const typed = useTyped(text);
  const [hasTarget, setHasTarget] = useState(false);
  const last = step === STEPS.length - 1;

  // Cambia de pantalla y señala el elemento del paso.
  useEffect(() => {
    go(s.tab);
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
  }, [step]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') last ? onClose() : onStep(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, onClose, onStep]);

  return (
    <>
      {!hasTarget && <div className="tour-backdrop" aria-hidden="true" />}
      <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-h">
        <div className="tour-guide" aria-hidden="true">
          <span className="tour-portrait">🧙</span>
        </div>
        <div className="tour-body">
          <p className="eyebrow">{guide} · {step + 1}/{STEPS.length}</p>
          <h2 id="tour-h" className="tour-title">{s.title}</h2>
          <p className="tour-text" aria-live="polite">
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">{typed}</span>
          </p>
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}
          </div>
          <div className="tour-actions">
            <button className="link" onClick={onClose}>Saltar</button>
            <span className="tour-nav">
              {step > 0 && <button className="ghost" onClick={() => onStep(step - 1)}>Atrás</button>}
              <button className="primary" onClick={() => (last ? onClose() : onStep(step + 1))} autoFocus>
                {last ? '¡A por ello!' : 'Siguiente'}
              </button>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
