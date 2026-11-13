// Importar mazos de Anki (.apkg).
// Un .apkg es un .zip que dentro lleva la base de datos de Anki (SQLite):
//   - collection.anki21b → formato nuevo (Anki 2.1.50+), comprimida con zstd;
//   - collection.anki21  → formato de 2.1.x antiguo;
//   - collection.anki2   → formato muy antiguo. En los .apkg nuevos es solo un aviso de «actualiza Anki».
// Leemos la mejor que haya, sacamos notas, tarjetas y mazos, y las convertimos a nuestras tarjetas.
import { unzipSync } from 'fflate';
import { decompress } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { State } from 'ts-fsrs';
import type { CardRow } from './types';
import { clozeBack, clozeFront, isCloze } from './cloze';
export { clozeBack, clozeFront, isCloze };

/** Una tarjeta lista para guardar (sin tema todavía). */
export interface ImportedCard {
  deckId: string;
  front: string; // HTML de Anki, se pasa a Markdown después
  back: string;
  suspended: boolean;
  noteKey: string; // las tarjetas de la misma nota de Anki son hermanas
  /** Progreso de Anki traducido a FSRS; null = la tarjeta entra como nueva. */
  sched: Omit<CardRow, 'id' | 'topic_id' | 'front' | 'back' | 'created_at'> | null;
}

export interface ApkgResult {
  decks: { id: string; name: string; count: number }[];
  cards: ImportedCard[];
}

const SEP = '\x1f'; // Anki separa los campos de una nota con este carácter invisible

/** Abre el .zip y devuelve la base de datos SQLite que contiene. */
export function openCollection(bytes: Uint8Array, SQL: SqlJsStatic): Database {
  const files = unzipSync(bytes);
  if (files['collection.anki21b']) return new SQL.Database(decompress(files['collection.anki21b']));
  const raw = files['collection.anki21'] ?? files['collection.anki2'];
  if (!raw) throw new Error('Este archivo no parece un mazo de Anki (.apkg).');
  return new SQL.Database(raw);
}

function rows<T>(db: Database, sql: string): T[] {
  const res = db.exec(sql)[0];
  if (!res) return [];
  return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])) as T);
}

function hasTable(db: Database, name: string): boolean {
  return rows(db, `select name from sqlite_master where type='table' and name='${name}'`).length > 0;
}

/** Nombres de los mazos: en el formato nuevo están en la tabla `decks`; en el viejo, en un JSON dentro de `col`. */
function deckNames(db: Database): Map<string, string> {
  const names = new Map<string, string>();
  if (hasTable(db, 'decks')) {
    for (const d of rows<{ id: number; name: string }>(db, 'select id, name from decks')) names.set(String(d.id), d.name.split(SEP).join('::'));
  } else {
    const [col] = rows<{ decks: string }>(db, 'select decks from col');
    if (col?.decks) for (const [id, d] of Object.entries(JSON.parse(col.decks) as Record<string, { name: string }>)) names.set(id, d.name);
  }
  return names;
}

// Los huecos (cloze) están en cloze.ts: los usa también el editor de tarjetas.

// ---------- Progreso de Anki → FSRS ----------
interface AnkiCard {
  id: number; nid: number; did: number; ord: number; type: number; queue: number;
  due: number; ivl: number; factor: number; reps: number; lapses: number; odue: number; odid: number; data: string;
}

/**
 * Traduce el estado de una tarjeta de Anki al de FSRS.
 * - Si en Anki usabas FSRS, la tarjeta guarda su estabilidad (s) y dificultad (d) en `data`: se copian tal cual.
 * - Si no, es una aproximación: estabilidad ≈ intervalo actual en días y dificultad media (5).
 * `crt` es el día en que se creó la colección: Anki cuenta las fechas de repaso en días desde ese día.
 */
export function ankiSchedule(c: AnkiCard, crt: number, now: Date): ImportedCard['sched'] {
  if (c.type === 0) return null; // nueva en Anki → nueva aquí
  let mem: { s?: number; d?: number } = {};
  try { mem = c.data ? JSON.parse(c.data) : {}; } catch { /* sin datos de FSRS */ }
  const due = c.odid ? c.odue : c.due; // las tarjetas en un mazo filtrado guardan su fecha real en odue
  const DAY = 86_400_000;
  let dueDate: Date;
  if (c.type === 2) dueDate = new Date(crt * 1000 + due * DAY); // repaso: días desde crt
  else if (c.queue === 1) dueDate = new Date(due * 1000); // aprendiendo: segundos desde 1970
  else if (c.queue === 3) dueDate = new Date(crt * 1000 + due * DAY);
  else dueDate = now;
  const ivl = Math.max(c.ivl, 0);
  const state = c.type === 1 ? State.Learning : c.type === 3 ? State.Relearning : State.Review;
  return {
    due: dueDate.toISOString(),
    stability: mem.s && mem.s > 0 ? mem.s : Math.max(ivl, 1),
    difficulty: mem.d && mem.d >= 1 && mem.d <= 10 ? mem.d : 5,
    elapsed_days: 0,
    scheduled_days: ivl,
    learning_steps: 0,
    reps: c.reps,
    lapses: c.lapses,
    state: state as CardRow['state'],
    last_review: state === State.Review ? new Date(dueDate.getTime() - ivl * DAY).toISOString() : now.toISOString(),
  };
}

/** Lee todo el mazo. Las tarjetas salen en HTML; quien llama las pasa a Markdown. */
export function readApkg(db: Database, now = new Date()): ApkgResult {
  const names = deckNames(db);
  const [col] = rows<{ crt: number }>(db, 'select crt from col');
  const crt = col?.crt ?? 0;
  const notes = new Map(rows<{ id: number; flds: string }>(db, 'select id, flds from notes').map((n) => [n.id, n.flds.split(SEP)]));
  const cards = rows<AnkiCard>(db, 'select id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odue, odid, data from cards order by did, nid, ord');

  const out: ImportedCard[] = [];
  for (const c of cards) {
    const fields = notes.get(c.nid);
    if (!fields) continue;
    let front: string;
    let back: string;
    if (isCloze(fields[0])) {
      // Nota de huecos: la tarjeta número `ord` corresponde al hueco c(ord+1).
      front = clozeFront(fields[0], c.ord + 1);
      back = clozeBack(fields[0], c.ord + 1) + (fields[1] ? `<br><br>${fields[1]}` : '');
    } else if (c.ord === 1 && fields.length >= 2) {
      // Segunda tarjeta de una nota «básica con inversa»: al revés.
      front = fields[1];
      back = fields[0];
    } else {
      front = fields[0];
      back = fields.slice(1).filter((f) => f.trim()).join('<br><br>');
    }
    const deckId = String(c.odid || c.did);
    out.push({ deckId, front, back, suspended: c.queue === -1, noteKey: `anki:${c.nid}`, sched: ankiSchedule(c, crt, now) });
  }

  const counts = new Map<string, number>();
  for (const c of out) counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1);
  const decks = [...counts].map(([id, count]) => ({ id, name: names.get(id) ?? 'Mazo', count })).sort((a, b) => a.name.localeCompare(b.name));
  return { decks, cards: out };
}

/** Limpia lo que no podemos mostrar: sonidos [sound:...] e imágenes (de momento no se importan). */
export function stripMedia(html: string): string {
  return html.replace(/\[sound:[^\]]*\]/g, '').replace(/<img[^>]*>/gi, ' [imagen no importada] ');
}
