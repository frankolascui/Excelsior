// Ordenar apuntes pegados o escritos a mano para que se vean bien.
// Todo es lógica pura (texto entra, texto sale): se prueba en format.test.ts.
import GithubSlugger from 'github-slugger';

// Símbolos que la gente usa como viñetas al copiar de Word, PDF o el móvil.
const BULLET = /^(\s*)(?:[•●◦○▪▫■□·‣⁃➤➢►▶→⇒✓✔︎✗]|[-–—*](?=\s))\s*/; // «*» solo si va seguido de espacio: «**negrita**» no es viñeta
const NUMBERED = /^(\s*)(\d{1,2})[).]\s+/;
const LETTERED = /^(\s*)([a-zA-Z])\)\s+/;

/**
 * Arreglo suave, el que se aplica solo al pegar o importar:
 * viñetas raras → "- ", "1)" → "1.", tabuladores → sangría, y como mucho una línea en blanco seguida.
 */
export function tidyText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((raw) => {
    const line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');
    if (/^\s*[-*]\s*[-*]\s*[-*][-*\s]*$/.test(line)) return '---'; // línea separadora
    const b = line.match(BULLET);
    if (b) return `${indent(b[1])}- ${line.slice(b[0].length)}`;
    const n = line.match(NUMBERED);
    if (n) return `${indent(n[1])}${n[2]}. ${line.slice(n[0].length)}`;
    const l = line.match(LETTERED);
    if (l) return `${indent(l[1])}- **${l[2]})** ${line.slice(l[0].length)}`;
    return line;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Sangría de lista: cada 2-4 espacios de antes cuentan como un nivel (2 espacios en Markdown). */
function indent(spaces: string): string {
  const level = Math.round(spaces.length / 3);
  return '  '.repeat(level);
}

const isMarkdownLine = (l: string) => /^\s*(#|[-*+]\s|\d+\.\s|>|\||```|\$\$|---)/.test(l);

/**
 * El botón «Ordenar formato»: además de tidyText, adivina la estructura.
 * - Línea en MAYÚSCULAS y corta → apartado (##).
 * - Línea corta que acaba en ":" sola → subapartado (###).
 * - "Concepto: definición" → el concepto en negrita.
 * Solo toca líneas que todavía no tienen formato Markdown.
 */
export function smartFormat(text: string): string {
  const lines = tidyText(text).split('\n');
  const out = lines.map((line, i) => {
    const t = line.trim();
    if (!t || isMarkdownLine(line) || /\*\*/.test(t)) return line;
    const letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    if (letters.length >= 3 && t.length <= 60 && letters === letters.toUpperCase() && !/[.]$/.test(t)) {
      return `## ${sentenceCase(t)}`;
    }
    const next = lines[i + 1]?.trim() ?? '';
    if (/^[^:]{2,50}:$/.test(t) && (next === '' || /^(- |\d+\. )/.test(next) || next.length > 0)) {
      return `### ${t.slice(0, -1)}`;
    }
    const def = t.match(/^([^:.!?]{2,40}):\s+(.+)$/);
    if (def && !/https?$/i.test(def[1])) return `**${def[1].trim()}:** ${def[2]}`;
    return line;
  });
  return out.join('\n');
}

function sentenceCase(s: string): string {
  const lower = s.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

export interface Heading { level: 2 | 3; text: string; slug: string }

/**
 * Índice de una hoja: sus apartados (##) y subapartados (###), con el mismo
 * identificador que pone rehype-slug a cada encabezado, para poder saltar a él.
 */
export function headingsOf(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let inCode = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/\*\*|__|`|\$/g, '').trim();
    const slug = slugger.slug(text); // se cuentan todos los niveles, como hace rehype-slug
    if (m[1].length === 2 || m[1].length === 3) out.push({ level: m[1].length as 2 | 3, text, slug });
  }
  return out;
}

/** Texto plano para las listas: quita las marcas de Markdown más comunes (**negrita**, _cursiva_, `código`, $). */
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/\*\*|__|`|\$\$?/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}
