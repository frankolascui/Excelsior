// Exámenes de Academy ↔ calendario: leer de Supabase, y subir lo que se cambia desde el calendario.
// Lecturas mínimas: al entrar con cuenta, al volver a la app tras un rato, y cuando Academy ya leyó su lista.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Game } from './screens';
import type { CalendarEvent, GameState } from './types';
import type { ExamDate, Subject } from './academy/study/types';
import { createExamDate, deleteExamDate, listAllExams, listExamDates, listSubjects, updateExam, updateExamDate } from './academy/study/api';
import { studyBridge } from './academy/bridge';
import { useCloud } from './cloud';
import { addAcademyEvent, simDeadline, syncAcademyExams, syncPlannedSims, syncSimulacros, type SimSummary } from './academy-exams';
import { addEvent } from './life';
import { sfx } from './sfx';
import { shortDate } from './ui';

/**
 * Lo último que se sabe de Academy: asignaturas (para elegir una al crear un examen) y exámenes con fecha.
 * null = aún no se sabe o sin cuenta. Es la fuente de verdad del nombre y el día: la partida se ajusta a esto
 * cada vez que cambia (también si llega una partida de la nube o de otra pestaña con datos viejos).
 */
let subjects: Pick<Subject, 'id' | 'name'>[] | null = null;
let exams: ExamDate[] | null = null;
let sims: SimSummary[] | null = null;
let version = 0;
const listeners = new Set<() => void>();
function setCache(patch: { subjects?: typeof subjects; exams?: typeof exams; sims?: typeof sims }) {
  if ('subjects' in patch) subjects = patch.subjects!;
  if ('exams' in patch) exams = patch.exams!;
  if ('sims' in patch) sims = patch.sims!;
  version++;
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useAcademySubjects = () => useSyncExternalStore(subscribe, () => subjects);
const useVersion = () => useSyncExternalStore(subscribe, () => version);

let active = false;
let lastPull = 0;
const AGAIN_MS = 10 * 60_000;

async function pull(force = false) {
  if (!active || (!force && Date.now() - lastPull < AGAIN_MS)) return;
  lastPull = Date.now();
  try {
    const [ex, subs, sm] = await Promise.all([listExamDates(), listSubjects(), listAllExams().catch(() => null)]);
    if (active) setCache({ exams: ex, subjects: subs.map((x) => ({ id: x.id, name: x.name })), ...(sm ? { sims: sm } : {}) });
  } catch {
    /* sin tabla de exámenes, sin red o sin Academy: el calendario sigue con lo que tenía */
  }
}

/** En App: mantiene los exámenes de Academy dentro del calendario mientras hay cuenta. */
export function useAcademyExamsSync(game: Game) {
  const userId = useCloud().userId;
  const v = useVersion();
  const gameRef = useRef(game);
  gameRef.current = game;
  useEffect(() => {
    if (!userId) return;
    active = true;
    studyBridge.onExamDates = (list) => {
      // Una asignatura nueva aún no está en la lista: se vuelve a leer todo.
      if (!subjects || list.some((e) => !subjects!.some((x) => x.id === e.subject_id))) void pull(true);
      else setCache({ exams: list });
    };
    studyBridge.onSims = (subjectId, list) => {
      if (!list || !sims) return void pull(true);
      setCache({ sims: [...sims.filter((x) => x.subject_id !== subjectId), ...list] });
    };
    studyBridge.addBlock = (title, when) => {
      gameRef.current.act((s) => addEvent(s, { title, kind: 'bloque', ...when }, Date.now()));
      sfx.place();
      gameRef.current.toast(`{i:ev-bloque} Bloque puesto: ${shortDate(when.day)}, ${when.time}–${when.end}. Está en el calendario.`, 'info', 4000);
    };
    void pull(true);
    const onVisible = () => document.visibilityState === 'visible' && void pull();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      studyBridge.onExamDates = null;
      studyBridge.onSims = null;
      studyBridge.addBlock = null;
      active = false;
      setCache({ exams: null, subjects: null, sims: null });
    };
  }, [userId]);
  useEffect(() => {
    if (!userId || !exams || !subjects) return;
    const list = exams, subs = subjects, sm = sims, now = Date.now();
    // Una misión de simulacro completada aquí (a mano) = simulacro hecho en papel en Academy.
    if (sm) {
      for (const q of game.state.quests) {
        const sim = q.academy && q.completedAt ? sm.find((x) => x.id === q.academy!.simId && !x.finished_at) : undefined;
        if (!sim) continue;
        const at = new Date(q.completedAt!).toISOString();
        setCache({ sims: sm.map((x) => (x.id === sim.id ? { ...x, finished_at: at } : x)) });
        void updateExam(sim.id, { finished_at: at }).catch(() => pull(true));
        return; // el efecto vuelve a pasar con la caché nueva
      }
    }
    const deadline = (x: SimSummary) => simDeadline(x, sm ?? [], list);
    const apply = (s: GameState) => {
      const a = syncAcademyExams(s, list, subs, now);
      return sm ? syncPlannedSims(syncSimulacros(a, sm, subs, deadline, now), sm, list, subs, now) : a;
    };
    // Solo se toca la partida si algo cambió (si no, cada lectura sería un guardado).
    if (apply(game.state) !== game.state) game.act(apply);
  }, [game.state, v, userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Nuevo examen desde el calendario: se crea en Academy y su evento, aquí. Devuelve el error, si lo hay. */
export async function createAcademyExam(game: Game, f: { subjectId: string; title: string; day: string } & Pick<CalendarEvent, 'time' | 'end' | 'color'>): Promise<string | null> {
  try {
    const exam = await createExamDate({ subject_id: f.subjectId, title: f.title.trim(), date: f.day, topic_ids: [] });
    if (exams) setCache({ exams: [...exams, exam] });
    const name = subjects?.find((x) => x.id === f.subjectId)?.name ?? 'Academy';
    game.act((s) => addAcademyEvent(s, exam, name, { time: f.time, end: f.end, color: f.color }, Date.now()));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Nombre o día cambiados desde el calendario: también en Academy. Si falla, se vuelve a leer lo de Academy. */
export async function pushAcademyExam(ev: Pick<CalendarEvent, 'academy' | 'title' | 'day'>): Promise<string | null> {
  if (!ev.academy) return null;
  try {
    const id = ev.academy.examId, patch = { title: ev.title.trim(), date: ev.day };
    // Primero aquí, para que el calendario no lo devuelva a como estaba mientras se guarda.
    if (exams) setCache({ exams: exams.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    await updateExamDate(id, patch);
    return null;
  } catch (e) {
    void pull(true);
    return (e as Error).message;
  }
}

export async function deleteAcademyExam(examId: string): Promise<string | null> {
  try {
    await deleteExamDate(examId);
    if (exams) setCache({ exams: exams.filter((x) => x.id !== examId) });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
