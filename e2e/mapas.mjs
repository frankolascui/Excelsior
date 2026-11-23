// Capturas de los mapas de reinos (general y dentro de un reino). Uso: npm run build:single && node e2e/mapas.mjs [carpeta]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-23T17:00:00').getTime(); const DAY = 86_400_000;
const K = (id, name, parentId, extra = {}) => ({ id, name, createdAt: NOW - 20 * DAY, ...(parentId ? { parentId } : {}), ...extra });
const kingdoms = [
  K('p', 'Programación'), K('p1', 'Calculadora', 'p'), K('p2', 'Timer', 'p'), K('p3', 'Web personal', 'p'), K('p4', 'Bot de Discord', 'p'), K('p5', 'App de notas', 'p'),
  K('f', 'Forma física'), K('f1', 'Media maratón', 'f'),
  K('m', 'Música'), K('e', 'Estudios'), K('e1', 'Selectividad', 'e'), K('e2', 'Inglés C1', 'e'),
  K('n', 'Negocio'), K('o', 'Viejo blog', null, { closedAt: NOW - 5 * DAY }),
];
let n = 0;
const quests = [];
const add = (kid, total, done) => { for (let i = 0; i < total; i++) quests.push({ id: `q${n++}`, title: `Tarea ${n}`, type: 'daily', impact: 'medio', kingdomId: kid, createdAt: NOW - 10 * DAY, completedAt: i < done ? NOW - 2 * DAY : null }); };
add('p', 3, 3); add('p1', 6, 6); add('p2', 4, 1); add('p3', 8, 5); add('p4', 2, 0); add('p5', 12, 11);
add('f', 4, 2); add('f1', 5, 3); add('m', 3, 1); add('e', 2, 2); add('e1', 10, 4); add('e2', 6, 6); add('n', 1, 0); add('o', 4, 4);
const state = { version: 6, profile: { name: 'Nicolas', createdAt: NOW - 90 * DAY }, quests, habits: [], habitCompletions: [], sessions: [], activeTimer: null,
  kingdoms, goals: [], rewards: [], purchases: [], bosses: [], xp: [{ id: 'x0', at: NOW - 30 * DAY, amount: 6000, source: 'quest', sourceId: 'old', label: 'Antes', attributes: { voluntad: 2 } }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] };
const b = await chromium.launch();
const errs = [];
for (const [tag, viewport] of [['pc', { width: 1280, height: 900 }], ['movil', { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: NOW });
  await p.goto(url);
  await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); localStorage.setItem('excelsior:built-seen', '[]'); }, [JSON.stringify(state)]);
  await p.reload(); await p.waitForSelector('.nav');
  await p.evaluate(() => { location.hash = '#reinos'; });
  await p.waitForTimeout(700);
  await p.locator('.realm').first().screenshot({ path: `${out}/mapa-${tag}-general.png` });
  await p.locator('.realm .kingdom-node').filter({ hasText: 'Programación' }).first().click({ force: true });
  await p.waitForTimeout(700);
  await p.locator('.realm').first().screenshot({ path: `${out}/mapa-${tag}-reino.png` });
}
await b.close();
if (errs.length) { console.error('Errores:', errs); process.exitCode = 1; } else console.log('ok: sin errores');
