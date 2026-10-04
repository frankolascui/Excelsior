// Convierte dist-single/index.html en un fragmento publicable como Artifact
// (el visor añade su propio doctype/head/body).
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist-single/index.html', 'utf8');
const headEnd = html.indexOf('</head>');
const head = html.slice(0, headEnd);
const sStart = head.indexOf('<script type="module"');
const sEnd = head.lastIndexOf('</script>') + '</script>'.length;
const script = head.slice(sStart, sEnd);
const rest = head.slice(0, sStart) + head.slice(sEnd);
const style = rest.slice(rest.indexOf('<style'), rest.lastIndexOf('</style>') + 8);
const links = rest.match(/<link [^>]+>/g).join('\n');
const out = `<title>Excelsior</title>\n${links}\n${style}\n<div id="root"></div>\n${script}\n`;
writeFileSync(process.argv[2], out);
console.log('bytes', out.length, 'script', script.length, 'style', style.length);
