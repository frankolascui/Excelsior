// Tarjetas de huecos (cloze), como en Anki: «La mitocondria produce {{c1::ATP}} en la {{c2::respiración celular}}».
// Cada número es una tarjeta: en la 1 se tapa «ATP», en la 2 «respiración celular». Pista opcional: {{c1::ATP::molécula}}.
const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function isCloze(text: string): boolean {
  return /\{\{c\d+::/.test(text);
}

/** Números de hueco que hay en el texto, sin repetir y en orden: «c1, c3, c1» → [1, 3]. */
export function clozeNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(CLOZE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

type Style = 'html' | 'md';
const bold = (t: string, style: Style) => (style === 'html' ? `<b>${t}</b>` : `**${t}**`);

/** Anverso del hueco n: ese hueco se tapa ([…] o la pista) y los demás se ven. */
export function clozeFront(text: string, n: number, style: Style = 'html'): string {
  return text.replace(CLOZE, (_m, num: string, ans: string, hint?: string) => (Number(num) === n ? bold(`[${hint ?? '…'}]`, style) : ans));
}

/** Reverso del hueco n: el texto completo con la respuesta de ese hueco en negrita. */
export function clozeBack(text: string, n: number, style: Style = 'html'): string {
  return text.replace(CLOZE, (_m, num: string, ans: string) => (Number(num) === n ? bold(ans, style) : ans));
}

/** Una frase con huecos → una tarjeta por hueco (en Markdown). `extra` se añade al reverso de todas. */
export function clozeCards(text: string, extra = ''): { front: string; back: string }[] {
  return clozeNumbers(text).map((n) => ({
    front: clozeFront(text, n, 'md'),
    back: clozeBack(text, n, 'md') + (extra.trim() ? `\n\n${extra.trim()}` : ''),
  }));
}
