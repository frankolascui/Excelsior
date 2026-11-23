// Desgaste por inactividad: aviso en Hoy y XP perdido al abrir tras días parado.
// Uso: npm run build:single && node e2e/decay.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const since = readFileSync('src/decay.ts', 'utf8').match(/since: '([^']+)'/)[1];
const START = new Date(`${since}T12:00:00`).getTime(); const DAY = 86_400_000;
const state = (now) => ({ version: 6, profile: { name: 'N', createdAt: START - 30 * DAY }, quests: [], habits: [{ id: 'h1', name: 'Leer', frequency: 'daily', createdAt: START - 30 * DAY, rewards: { sabiduria: 1 } }],
  habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [{ id: 'x', at: START - 5 * DAY, amount: 1150, source: 'quest', sourceId: 'q', label: 'Antes', attributes: { voluntad: 2 } }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] });
const b = await chromium.launch();
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
async function open(now) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: now });
  await p.goto(url);
  await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state(now))]);
  await p.reload(); await p.waitForSelector('.nav');
  return { p, errs };
}
// Ayer parado: aviso de que hoy empieza a costar
let { p, errs } = await open(START + DAY - 2 * 3600e3);
const note = p.locator('[data-testid="decay-note"]');
check((await note.innerText()).includes('Ayer no hiciste nada'), 'avisa si ayer no hiciste nada');
await note.screenshot({ path: `${out}/decay-01-aviso.png` });
// Cuatro días después: desgaste apuntado
({ p, errs } = await open(START + 4 * DAY));
await p.waitForTimeout(300);
const g = await p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));
check((g.decay ?? []).length === 3 && g.decay.every((d) => d.amount > 0), `se apuntan 3 días de desgaste (${JSON.stringify(g.decay)})`);
const nt = await p.locator('[data-testid="decay-note"]').innerText(); check(/perdido\s*20\s*XP/.test(nt), 'dice cuánto has perdido: ' + nt);
await p.locator('.today-strip').evaluate((el) => el.parentElement.scrollIntoView());
await p.screenshot({ path: `${out}/decay-02-perdido.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } });
check(errs.length === 0, `sin errores ${errs.join(' | ')}`);
await b.close();
