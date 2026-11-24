// Puente entre Academy y el juego: el repaso avisa al terminar y el RPG lo convierte en XP, racha y hábito.
// Academy no sabe nada del juego; AcademyApp rellena `onStudy` al montarse.
import type { Exam, ExamDate } from './study/types';

type ExamSummaryLike = Pick<Exam, 'id' | 'subject_id' | 'title' | 'topic_ids' | 'finished_at' | 'created_at'>;

export interface StudyReport {
  startedAt: number;
  /** Lo que tardaste en cada respuesta (ms), para contar solo el tiempo real de repaso. */
  durations: number[];
  /** true si se vació la cola de hoy entera (no solo una asignatura). */
  cleared: boolean;
  label: string;
}

/** Un simulacro entregado (en la app, con su tiempo) o marcado como hecho en papel (seconds null). */
export interface ExamReport {
  /** Id del simulacro (su misión se completa sola). */
  examId?: string;
  label: string;
  startedAt: number;
  seconds: number | null;
}

export const studyBridge: {
  onStudy: ((r: StudyReport) => void) | null;
  /** Entregar un simulacro también es estudiar: marca el hábito y la racha. */
  onExam: ((r: ExamReport) => void) | null;
  /** Minutos al día para Academy (null = sin límite). Vive en la partida del RPG, así viaja entre dispositivos. */
  budgetMin: number | null;
  setBudget: ((min: number | null) => void) | null;
  /** Pausa de las tarjetas en curso (vacaciones): «Hoy» lo dice en vez de contar repasos. `until` null = sin fecha de fin. */
  pause: { until: string | null } | null;
  /** Academy leyó sus exámenes con fecha (todos): el calendario del RPG se pone al día con esa lista. */
  onExamDates: ((exams: ExamDate[]) => void) | null;
  /** Academy leyó los simulacros de una asignatura (o, con null, creó uno): sus misiones se ponen al día. */
  onSims: ((subjectId: string, sims: ExamSummaryLike[] | null) => void) | null;
  /** Reservar un bloque de tiempo en el calendario del RPG (lo rellena App). */
  addBlock: ((title: string, when: { day: string; time: string; end: string }) => void) | null;
} = { onStudy: null, onExam: null, budgetMin: null, setBudget: null, pause: null, onExamDates: null, onSims: null, addBlock: null };
