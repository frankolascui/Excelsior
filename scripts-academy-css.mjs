// Genera src/academy/academy.css a partir del CSS de Excelsior Academy, con todo dentro de `.acad`
// para que no choque con los estilos del RPG. Uso: node scripts-academy-css.mjs <ruta a styles.css de Academy>
import postcss from 'postcss';
import fs from 'node:fs';

const src = process.argv[2];
const css = fs.readFileSync(src, 'utf8');
const root = postcss.parse(css);
const frames = new Set();
root.walkAtRules('keyframes', (a) => { frames.add(a.params); a.params = `ac-${a.params}`; });
root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((sel) => {
    const s = sel.trim();
    if (s === ':root' || s === 'html' || s === 'body' || s === 'html, body') return '.acad';
    if (s === '*') return '.acad, .acad *';
    if (/^(html|body)\b/.test(s)) return s.replace(/^(html|body)\b\s*/, '.acad ');
    return `.acad ${s}`;
  });
});
root.walkDecls(/^(animation|animation-name)$/, (d) => {
  for (const f of frames) d.value = d.value.replace(new RegExp(`\\b${f}\\b`, 'g'), `ac-${f}`);
});
const header = '/* Generado por scripts-academy-css.mjs desde Excelsior Academy: no editar a mano (ajustes en academy-extra.css). */\n';
fs.writeFileSync('src/academy/academy.css', header + root.toString());
console.log('ok', frames);
