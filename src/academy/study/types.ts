// Las tres piezas del archivador, igual que las tablas de supabase/01-resumenes.sql.
/** Nivel de exigencia de una asignatura (supabase/03-niveles.sql). */
export type Level = 'minimo' | 'equilibrado' | 'detalle';

export interface Subject {
  id: string;
  name: string;
  color: string;
  position: number;
  level: Level;
}

export interface Topic {
  id: string;
  subject_id: string;
  title: string;
  position: number;
  exam_date: string | null; // 'AAAA-MM-DD'
}

export interface Page {
  id: string;
  topic_id: string;
  title: string;
  content: string; // Markdown
  position: number;
  updated_at: string;
}

/** Una flashcard con su estado de memoria (columnas de FSRS). */
export interface CardRow {
  id: string;
  topic_id: string;
  front: string;
  back: string;
  due: string; // fecha ISO
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3; // nueva, aprendiendo, repaso, reaprendiendo
  last_review: string | null;
  created_at: string;
  suspended?: boolean; // apartada: no sale en los repasos (06-repaso.sql)
  note_key?: string | null; // tarjetas hermanas comparten esta clave
}

/** Un simulacro (supabase/04-simulacros.sql). */
export interface Exam {
  id: string;
  subject_id: string;
  title: string;
  statement: string; // enunciado en Markdown
  topic_ids: string[];
  time_limit_min: number | null;
  answers: string;
  started_at: string | null;
  finished_at: string | null;
  duration_sec: number | null;
  correction: string; // Markdown
  grade: number | null; // sobre 10
  created_at: string;
}

/** Un examen real con fecha (supabase/05-fechas-examen.sql). */
export interface ExamDate {
  id: string;
  subject_id: string;
  title: string;
  date: string; // 'AAAA-MM-DD'
  topic_ids: string[]; // vacío = todos los temas de la asignatura
  created_at: string;
}
