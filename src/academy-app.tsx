// Excelsior Academy entera dentro de Deep Work (V3): estantería, asignaturas, hojas de apuntes, tarjetas,
// simulacros, fechas de examen, estadísticas, importar de Anki y ajustar FSRS. Va en su propio trozo de código
// (se carga al abrir la pestaña) y con sus estilos dentro de `.acad`.
// El juego la envuelve: racha y hábito «Estudiar» (tarjetas o simulacros), y cada repaso se convierte en Deep Work de estudio.
import { useEffect, useRef, useState } from 'react';
import type { Game } from './screens';
import { adminReadOnly, useCloud } from './cloud';
import { Icon } from './icons';
import { InfoTip } from './infotip';
import { confetti } from './confetti';
import { academyFounded, cardsToday, foundAcademy, recordExam, recordStudy, STUDY_RULES } from './academy-game';
import { currentStudyPause, dayKey, habitStreak, markPauseShifted, pausesToShift, studyPausedOn } from './game';
import { StudyPauseControl } from './study-pause-ui';
import { shiftDueForPause } from './academy/study/api';
import { resetTodayCache } from './academy/ui/Review';
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

/** Evita mover las fechas dos veces a la vez (la pestaña puede volver a montarse a mitad). */
let shiftLock = false;

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
  const paused = studyPausedOn(state, dayKey(now));
  return (
    <section className="panel study-strip" data-testid="study-strip" aria-label="Tu estudio en el juego">
      <span className={`study-streak${doneToday ? ' on' : ''}`} title="Días seguidos estudiando"><Icon name="flame" /> {streak} {streak === 1 ? 'día' : 'días'}</span>
      <span className="study-today-line">
        {doneToday
          ? <><Icon name="check" /> Hábito de hoy cumplido · {today} {today === 1 ? 'tarjeta' : 'tarjetas'}</>
          : paused
            ? <>Hoy descansas: el hábito no cuenta como fallado</>
            : <>Hoy {today} {today === 1 ? 'tarjeta' : 'tarjetas'} · repasa {left} más o haz un simulacro para el hábito</>}
      </span>
      <InfoTip label="Cómo da XP Academy">
        <p>Repasar cuenta como Deep Work de estudio: 1 XP por minuto de repaso real (como mucho 2 min por tarjeta) y sube Sabiduría. Vaciar la cola del día da +{STUDY_RULES.clearBonus} XP una vez al día. Tu hábito «Estudiar» (y la racha) se marca solo al vaciar la cola, al repasar {STUDY_RULES.habitCards} tarjetas o al entregar un simulacro. El tiempo de un simulacro hecho aquí también cuenta como Deep Work de estudio.</p>
      </InfoTip>
      <StudyPauseControl game={game} />
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
  studyBridge.budgetMin = game.state.academyBudgetMin ?? null;
  studyBridge.setBudget = (min) => actRef.current((s) => {
    const { academyBudgetMin: _old, ...rest } = s;
    return min ? { ...rest, academyBudgetMin: min } : rest;
  });
  studyBridge.onExam = (r) => {
    actRef.current((s) => recordExam(s, r, Date.now()), undefined, { sound: 'reward' });
  };
  studyBridge.onStudy = (r) => {
    const save = (cleared: boolean) => {
      actRef.current((s) => recordStudy(s, { ...r, cleared }, Date.now()), undefined, { sound: 'reward', party: cleared });
      if (cleared) confetti({ count: 120 });
    };
    if (r.cleared) save(true);
    else loadQueue().then((q) => save(q.queue.length === 0), () => save(false));
  };

  // Pausa de las tarjetas: «Hoy» lo enseña; al terminar, las fechas de repaso se mueven los días de pausa (una vez).
  const pauseNow = currentStudyPause(game.state, Date.now());
  studyBridge.pause = pauseNow && pauseNow.from <= dayKey(Date.now()) ? { until: pauseNow.until } : null;
  const toShift = cloud.userId && !adminReadOnly() ? pausesToShift(game.state, Date.now()) : [];
  const [shifting, setShifting] = useState<{ done: number; total: number; error?: string } | null>(null);
  const blocked = shifting ?? (toShift.length ? { done: 0, total: 0, error: undefined } : null);
  const shiftKey = toShift.map((x) => x.pause.id).join(',');
  useEffect(() => {
    if (!toShift.length || shiftLock) return;
    shiftLock = true;
    setShifting({ done: 0, total: 0 });
    (async () => {
      for (const { pause, days } of toShift) {
        const fromIso = new Date(`${pause.from}T00:00:00`).toISOString();
        await shiftDueForPause(fromIso, days, (done, total) => setShifting({ done, total }));
        act((s) => markPauseShifted(s, pause.id, days));
      }
      resetTodayCache();
      setShifting(null);
    })().catch((e: Error) => setShifting({ done: 0, total: 0, error: e.message }))
      .finally(() => { shiftLock = false; });
  }, [shiftKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {adminReadOnly() && (
        <section className="panel admin-note">
          <p className="hint"><Icon name="wrench" /> <strong>Modo admin:</strong> ves tus apuntes y tarjetas reales y puedes repasar para probar, pero nada se guarda en tu cuenta: tus tarjetas siguen con sus fechas de siempre. El XP del repaso va a la partida de pruebas.</p>
        </section>
      )}
      <StudyStrip game={game} />
      {blocked ? (
        <section className="panel" data-testid="pause-shifting" role="status">
          {blocked.error
            ? <p><Icon name="alert" /> No se pudieron mover las fechas de repaso tras la pausa: {blocked.error}. Se volverá a intentar al abrir Academy.</p>
            : <p><Icon name="palm" /> Bienvenido de vuelta. Moviendo las fechas de repaso los días de pausa{blocked.total ? ` (${blocked.done} de ${blocked.total} tarjetas)` : ''}…</p>}
        </section>
      ) : <>
      {route.view === 'estanteria' && <Shelf />}
      {route.view === 'asignatura' && <Binder subjectId={route.subjectId} topicId={route.topicId} />}
      {route.view === 'ajustar' && <Tune />}
      {route.view === 'estadisticas' && <Stats key={route.subjectId ?? 'todas'} subjectId={route.subjectId} />}
      {route.view === 'simulacros' && <Binder subjectId={route.subjectId} section="simulacros" />}
      {route.view === 'simulacro' && <ExamView subjectId={route.subjectId} examId={route.examId} />}
      {route.view === 'repasar' && <Review key={location.hash} subjectId={route.subjectId} topicIds={route.topicIds} />}
      {route.view === 'hoja' && <PageView subjectId={route.subjectId} topicId={route.topicId} pageId={route.pageId} edit={route.edit} />}
      </>}
      <DialogHost />
    </div>
  );
}
