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

export const studyBridge: {
  onStudy: ((r: StudyReport) => void) | null;
  /** Minutos al día para Academy (null = sin límite). Vive en la partida del RPG, así viaja entre dispositivos. */
  budgetMin: number | null;
  setBudget: ((min: number | null) => void) | null;
  /** Pausa de las tarjetas en curso (vacaciones): «Hoy» lo dice en vez de contar repasos. `until` null = sin fecha de fin. */
  pause: { until: string | null } | null;
} = { onStudy: null, budgetMin: null, setBudget: null, pause: null };
