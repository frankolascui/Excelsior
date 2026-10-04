// Tutorial guiado: un personaje-guía recorre cada pantalla y señala lo que explica.
// Preferencia de interfaz, no de partida: se guarda aparte del estado del juego.
import { useEffect, useState } from 'react';
import type { Tab } from './screens';
import { XP_RULES } from './game';
import { sfx } from './sfx';

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
}

export const STEPS: Step[] = [
  {
    tab: 'hoy',
    title: 'El despertar',
    text: ({ name, guide }) =>
      `Mortal ${name}: soy ${guide}, Titán de la luz, el que camina en lo alto. Excelsior significa «siempre más alto», y desde hoy ese es tu juramento. Aquí tu vida real es la epopeya: cada acción forja tu leyenda. Escucha bien.`,
  },
  {
    tab: 'hoy',
    target: 'now',
    title: 'El oráculo',
    text: () =>
      'Este es tu oráculo. Cuando dudes, te señalará UNA acción: una forja de Deep Work, tu gesta principal o un rito. Los héroes no deliberan eternamente. Obedece al oráculo y avanza.',
  },
  {
    tab: 'misiones',
    target: 'quest-add',
    title: 'Las gestas',
    text: () =>
      `Tus tareas son gestas. La Principal (+${XP_RULES.quest.main} XP) mueve tu destino; la Diaria (+${XP_RULES.quest.daily}) es disciplina; la Secundaria (+${XP_RULES.quest.side}), el resto. Con ⚙ decides tú cuánta XP y qué atributos otorga cada una. Los dioses limitan la gloria diaria a ${XP_RULES.dailyCap.quest} XP: no se gana engañándose a uno mismo.`,
  },
  {
    tab: 'deepwork',
    target: 'modes',
    title: 'La forja',
    text: () =>
      'En la forja se templa la Maestría. Elige sesión libre o con minutos. Si te levantas, Descanso; si sucumbes al móvil, Me distraje. Solo el foco real da XP. Invoca lluvia, océano u hoguera de fondo, o pega el enlace de tu música.',
  },
  {
    tab: 'habitos',
    target: 'habits',
    title: 'Los ritos',
    text: () =>
      `Los hábitos son tus ritos diarios (+${XP_RULES.habit} XP). Cada uno alimenta atributos, y con ✎ puedes repartirlos a tu gusto. La racha es tu escudo: puedes caer un día, nunca dos seguidos.`,
  },
  {
    tab: 'reinos',
    target: 'realm',
    title: 'Los reinos',
    text: () =>
      'Tus grandes proyectos son reinos. Cada tarea levanta una cabaña, una herrería o un torreón. Al completarlas, el campamento se vuelve aldea, villa, ciudad amurallada y, al fin, reino glorioso, que te paga tributo en monedas.',
  },
  {
    tab: 'arena',
    target: 'bosses',
    title: 'La Arena',
    text: () =>
      'Aquí se invocan las bestias del mito: la Hidra de la Procrastinación, la Medusa de la Distracción, el Minotauro de la Rutina. Todo lo que haces las hiere. Derríbalas antes de que expire su plazo y su botín será tuyo.',
  },
  {
    tab: 'arena',
    target: 'shop',
    title: 'El tesoro',
    text: () =>
      'Cada 5 XP te da una moneda. Gástalas en recompensas que eliges tú: un episodio, una salida con amigos, un día libre. El placer ganado sabe distinto al placer robado.',
  },
  {
    tab: 'personaje',
    target: 'ladder',
    title: 'El camino del héroe',
    text: () =>
      'Diez avatares, de Aprendiz a Excelsior. Sus pruebas son las mismas para todo mortal: nivel, atributos y hazañas. Tus metas reales (dinero, peso, personas) las añades tú, y hacen el camino tuyo.',
  },
  {
    tab: 'personaje',
    target: 'attrs',
    title: 'Los cinco atributos',
    text: () =>
      'Voluntad, Sabiduría, Maestría, Conexión y Creación. El más bajo suele ser tu cuello de botella. Cada lunes te escribiré una crónica señalándolo y te propondré una bestia a la que enfrentarte.',
  },
  {
    tab: 'personaje',
    target: 'heat',
    title: 'La huella',
    text: () =>
      'Cada cuadrado es un día; cuanto más brilla, más XP. La grandeza no es un día perfecto: es no dejar huecos.',
  },
  {
    tab: 'personaje',
    target: 'settings',
    title: 'Tu estandarte',
    text: () =>
      'Elige los colores de tu estandarte y guarda copias de tu partida: vive solo en este navegador, y ni los dioses recuperan lo que no se guarda.',
  },
  {
    tab: 'hoy',
    title: 'Primera orden',
    text: ({ guide }) =>
      `Ya lo sabes todo. Tu primera orden: crea la gesta principal de hoy y complétala antes de que caiga el sol. Si me necesitas, Personaje → Ajustes → Repetir tutorial. ${guide} vela por ti. Siempre más alto.`,
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
          <span className="tour-portrait"><GuidePortrait /></span>
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
