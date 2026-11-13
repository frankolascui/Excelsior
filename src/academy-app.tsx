// Excelsior Academy entera dentro de Deep Work (V3): estantería, asignaturas, hojas de apuntes, tarjetas,
// simulacros, fechas de examen, estadísticas, importar de Anki y ajustar FSRS. Va en su propio trozo de código
// (se carga al abrir la pestaña) y con sus estilos dentro de `.acad`.
// El juego la envuelve: racha y hábito «Repasar las tarjetas», y cada repaso se convierte en Deep Work de estudio.
import { useEffect, useRef, useState } from 'react';
import type { Game } from './screens';
import { useCloud } from './cloud';
import { Icon } from './icons';
import { InfoTip } from './infotip';
import { confetti } from './confetti';
import { academyFounded, cardsToday, foundAcademy, recordStudy, STUDY_RULES } from './academy-game';
import { dayKey, habitStreak } from './game';
import { parseRoute, type Route } from './academy/study/logic';
import { studyBridge } from './academy/bridge';
import { loadQueue, Review } from './academy/ui/Review';
import { Binder } from './academy/ui/Binder';
import { PageView } from './academy/ui/PageView';
import { DialogHost } from './academy/ui/Dialog';
import { ExamView } from './academy/ui/ExamView';
import { Shelf } from './academy/ui/Shelf';
import { Stats } from './academy/ui/Stats';
import { Tune } from './academy/ui/Tune';
import './academy/academy.css';
import './academy.css';

function useAcademyRoute(): Route {
  const read = () => parseRoute(location.hash.startsWith('#academy') ? location.hash : '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** La franja del juego encima de Academy: racha, tarjetas de hoy y qué falta para el hábito. */
function StudyStrip({ game }: { game: Game }) {
  const { state } = game;
  const now = Date.now();
  const habit = state.habits.find((h) => h.system === 'academy');
  const streak = habit ? habitStreak(state, habit.id, now) : 0;
  const doneToday = !!habit && state.habitCompletions.some((c) => c.habitId === habit.id && c.day === dayKey(now));
  const today = cardsToday(state, now);
  const left = Math.max(0, STUDY_RULES.habitCards - today);
  return (
    <section className="panel study-strip" data-testid="study-strip" aria-label="Tu estudio en el juego">
      <span className={`study-streak${doneToday ? ' on' : ''}`} title="Días seguidos repasando"><Icon name="flame" /> {streak} {streak === 1 ? 'día' : 'días'}</span>
      <span className="study-today-line">
        {doneToday
          ? <><Icon name="check" /> Hábito de hoy cumplido · {today} {today === 1 ? 'tarjeta' : 'tarjetas'}</>
          : <>Hoy {today} {today === 1 ? 'tarjeta' : 'tarjetas'} · vacía la cola o repasa {left} más para el hábito</>}
      </span>
      <InfoTip label="Cómo da XP Academy">
        <p>Repasar cuenta como Deep Work de estudio: 1 XP por minuto de repaso real (como mucho 2 min por tarjeta) y sube Sabiduría. Vaciar la cola del día da +{STUDY_RULES.clearBonus} XP una vez al día. Vaciarla o repasar {STUDY_RULES.habitCards} tarjetas marca solo tu hábito «Repasar las tarjetas».</p>
      </InfoTip>
    </section>
  );
}

export default function AcademyApp({ game }: { game: Game }) {
  const cloud = useCloud();
  const route = useAcademyRoute();
  const { act } = game;

  useEffect(() => {
    if (cloud.userId && !academyFounded(game.state)) act((s) => foundAcademy(s, Date.now()));
  }, [cloud.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada repaso que termina pasa por aquí. Si repasaste una sola asignatura, se mira si ya no queda nada en todo el día.
  // Sin limpiar al desmontar: salir de la pestaña a mitad de repaso también debe contar.
  const actRef = useRef(act);
  actRef.current = act;
  studyBridge.onStudy = (r) => {
    const save = (cleared: boolean) => {
      actRef.current((s) => recordStudy(s, { ...r, cleared }, Date.now()), undefined, { sound: 'reward', party: cleared });
      if (cleared) confetti({ count: 120 });
    };
    if (r.cleared) save(true);
    else loadQueue().then((q) => save(q.queue.length === 0), () => save(false));
  };

  if (!cloud.userId) {
    return (
      <section className="panel">
        <h2 className="kingdom-name"><Icon name="graduate-cap" /> Academy</h2>
        <p>Academy guarda tus apuntes y tarjetas en tu cuenta, así que necesita que entres con tu email (Ajustes → Cuenta).</p>
      </section>
    );
  }

  return (
    <div className="acad" data-testid="academy-panel">
      <StudyStrip game={game} />
      {route.view === 'estanteria' && <Shelf />}
      {route.view === 'asignatura' && <Binder subjectId={route.subjectId} topicId={route.topicId} />}
      {route.view === 'ajustar' && <Tune />}
      {route.view === 'estadisticas' && <Stats key={route.subjectId ?? 'todas'} subjectId={route.subjectId} />}
      {route.view === 'simulacros' && <Binder subjectId={route.subjectId} section="simulacros" />}
      {route.view === 'simulacro' && <ExamView subjectId={route.subjectId} examId={route.examId} />}
      {route.view === 'repasar' && <Review key={location.hash} subjectId={route.subjectId} topicIds={route.topicIds} />}
      {route.view === 'hoja' && <PageView subjectId={route.subjectId} topicId={route.topicId} pageId={route.pageId} edit={route.edit} />}
      <DialogHost />
    </div>
  );
}
