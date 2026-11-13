// Lógica pura del archivador: no habla con Supabase ni con la pantalla,
// así que se puede probar sola (logic.test.ts).

/** Colores de los lomos de las carpetas, en el estilo de Excelsior. */
export const SUBJECT_COLORS = ['#ff4fa3', '#a54dff', '#6c5cff', '#3fb6ff', '#2fd2a1', '#ffb547', '#ff6b5c', '#9aa0b4'];

interface Ordered { position: number }

/** Ordena por posición sin cambiar la lista original. */
export function byPosition<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** Posición para un elemento nuevo: al final de la lista. */
export function nextPosition(items: readonly Ordered[]): number {
  return items.reduce((max, i) => Math.max(max, i.position + 1), 0);
}

/**
 * Mueve un elemento una casilla arriba (-1) o abajo (+1).
 * Devuelve las posiciones nuevas que hay que guardar, o [] si no se puede mover.
 */
export function swapWithNeighbour<T extends Ordered & { id: string }>(
  items: readonly T[],
  id: string,
  dir: -1 | 1,
): { id: string; position: number }[] {
  const sorted = byPosition(items);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  // Se usan los índices como posiciones nuevas: así se arreglan también posiciones repetidas.
  return [
    { id: sorted[i].id, position: j },
    { id: sorted[j].id, position: i },
  ];
}

/**
 * Título para una hoja importada desde un archivo .md:
 * el primer encabezado "# ..." si lo tiene; si no, el nombre del archivo limpio.
 */
export function titleFromMarkdown(fileName: string, content: string): string {
  const heading = content.match(/^#{1,2}\s+(.+?)\s*#*\s*$/m);
  if (heading) return heading[1].slice(0, 120);
  const base = fileName.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
  const clean = base.charAt(0).toUpperCase() + base.slice(1);
  return (clean || 'Hoja sin título').slice(0, 120);
}

/** Días que faltan para el examen (0 = hoy, negativo = ya pasó), o null si no hay fecha. */
export function daysUntil(examDate: string | null, today: Date = new Date()): number | null {
  if (!examDate) return null;
  const [y, m, d] = examDate.split('-').map(Number);
  const exam = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exam - now) / 86_400_000);
}

// ---------- Rutas (la parte de la dirección después de #) ----------
// Con # la web funciona en GitHub Pages y el botón "atrás" del navegador va donde esperas.

export type Route =
  | { view: 'estanteria' }
  | { view: 'asignatura'; subjectId: string; topicId?: string }
  | { view: 'estadisticas'; subjectId?: string }
  | { view: 'ajustar' }
  | { view: 'simulacros'; subjectId: string }
  | { view: 'simulacro'; subjectId: string; examId: string }
  | { view: 'hoja'; subjectId: string; topicId: string; pageId: string; edit: boolean }
  | { view: 'repasar'; subjectId?: string; topicIds?: string[] };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#(academy)?\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'repasar') {
    const subjectId = parts[1] === 'a' ? parts[2] : undefined;
    // Varios temas van separados por comas: #/repasar/a/<asignatura>/t/<tema1>,<tema2>
    const topicIds = subjectId && parts[3] === 't' && parts[4] ? parts[4].split(',').filter(Boolean) : undefined;
    return { view: 'repasar', subjectId, topicIds };
  }
  if (parts[0] === 'ajustar') return { view: 'ajustar' };
  if (parts[0] === 'estadisticas') return { view: 'estadisticas', subjectId: parts[1] === 'a' ? parts[2] : undefined };
  if (parts[0] === 'a' && parts[1]) {
    if (parts[2] === 'simulacros') {
      return parts[3] ? { view: 'simulacro', subjectId: parts[1], examId: parts[3] } : { view: 'simulacros', subjectId: parts[1] };
    }
    if (parts[2] === 't' && parts[3] && parts[4] === 'h' && parts[5]) {
      return { view: 'hoja', subjectId: parts[1], topicId: parts[3], pageId: parts[5], edit: parts[6] === 'editar' };
    }
    return { view: 'asignatura', subjectId: parts[1], topicId: parts[2] === 't' ? parts[3] : undefined };
  }
  return { view: 'estanteria' };
}

export function routeToHash(r: Route): string {
  if (r.view === 'asignatura') return `#academy/a/${r.subjectId}${r.topicId ? `/t/${r.topicId}` : ''}`;
  if (r.view === 'repasar') return `#academy/repasar${r.subjectId ? `/a/${r.subjectId}` : ''}${r.subjectId && r.topicIds?.length ? `/t/${r.topicIds.join(',')}` : ''}`;
  if (r.view === 'ajustar') return '#academy/ajustar';
  if (r.view === 'estadisticas') return `#academy/estadisticas${r.subjectId ? `/a/${r.subjectId}` : ''}`;
  if (r.view === 'simulacros') return `#academy/a/${r.subjectId}/simulacros`;
  if (r.view === 'simulacro') return `#academy/a/${r.subjectId}/simulacros/${r.examId}`;
  if (r.view === 'hoja') return `#academy/a/${r.subjectId}/t/${r.topicId}/h/${r.pageId}${r.edit ? '/editar' : ''}`;
  return '#academy/';
}

/**
 * Una fórmula escrita en una sola línea como $$ ... $$ se mostraría pequeña, dentro del texto.
 * La pasamos a tres líneas ($$ / fórmula / $$) para que salga grande y centrada.
 */
export function blockMath(markdown: string): string {
  return markdown.replace(/^([ \t]*)\$\$([^\n$]+)\$\$[ \t]*$/gm, (_m, indent: string, f: string) => `${indent}$$\n${indent}${f.trim()}\n${indent}$$`);
}
