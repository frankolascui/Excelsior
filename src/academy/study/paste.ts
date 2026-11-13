// Pegar desde Word, Google Docs o una web: el portapapeles trae HTML con negritas,
// títulos, listas y tablas. Lo pasamos a Markdown para no perder ese formato.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { tidyText } from './format';

let service: TurndownService | null = null;

export function turndown(): TurndownService {
  if (service) return service;
  service = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
  service.use(gfm);
  // Google Docs envuelve todo en <b style="font-weight:normal">: no es negrita de verdad.
  service.addRule('falsa-negrita', {
    filter: (node) => node.nodeName === 'B' && /font-weight:\s*normal/.test(node.getAttribute('style') ?? ''),
    replacement: (content) => content,
  });
  // Estilos de Word y Docs que no aportan nada.
  service.remove(['style', 'script', 'meta', 'title']);
  return service;
}

/** Texto a insertar al pegar: Markdown si hay HTML con formato; si no, el texto limpio. */
export function pastedMarkdown(data: DataTransfer): string {
  const html = data.getData('text/html');
  const text = data.getData('text/plain');
  // Si el HTML no trae ninguna etiqueta de formato, el texto plano es más fiable.
  if (html && /<(h[1-6]|b|strong|em|i|ul|ol|li|table)\b/i.test(html)) {
    try {
      return tidyText(turndown().turndown(html));
    } catch {
      /* si falla, seguimos con el texto plano */
    }
  }
  return tidyText(text);
}
