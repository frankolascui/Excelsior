// La parte del importador de .apkg que necesita el navegador: carga SQLite (sql.js, en WebAssembly)
// y pasa el HTML de Anki a Markdown. Se carga solo cuando eliges un .apkg, para no hacer la web más pesada.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { openCollection, readApkg, stripMedia, type ApkgResult } from './apkg';
import { turndown } from './paste';

export async function loadApkg(file: File): Promise<ApkgResult> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = openCollection(new Uint8Array(await file.arrayBuffer()), SQL);
  try {
    const res = readApkg(db);
    for (const c of res.cards) {
      c.front = htmlToMd(c.front);
      c.back = htmlToMd(c.back);
    }
    res.cards = res.cards.filter((c) => c.front);
    return res;
  } finally {
    db.close();
  }
}

/** HTML de un campo de Anki → Markdown (negritas, listas, saltos de línea). */
export function htmlToMd(html: string): string {
  return turndown()
    .turndown(stripMedia(html))
    .replace(/\\\[([^\]\n]*?)\\\]/g, '[$1]') // turndown escapa los corchetes de los huecos […]
    .trim();
}
