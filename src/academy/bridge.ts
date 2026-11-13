// Puente entre Academy y el juego: el repaso avisa al terminar y el RPG lo convierte en XP, racha y hábito.
// Academy no sabe nada del juego; AcademyApp rellena `onStudy` al montarse.
export interface StudyReport {
  startedAt: number;
  /** Lo que tardaste en cada respuesta (ms), para contar solo el tiempo real de repaso. */
  durations: number[];
  /** true si se vació la cola de hoy entera (no solo una asignatura). */
  cleared: boolean;
  label: string;
}

export const studyBridge: { onStudy: ((r: StudyReport) => void) | null } = { onStudy: null };
