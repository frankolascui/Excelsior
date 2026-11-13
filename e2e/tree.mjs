// Árbol de misiones con el ejemplo de Nicolas: Académico › Mates › Examen › sesiones.
// Uso: npm run build:single && node e2e/tree.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

const NOW = new Date('2026-11-10T09:00:00').getTime(); // martes
const DAY = 86_400_000;
const q = (id, title, impact, extra = {}) => ({ id, title, type: { alto: 'main', medio: 'daily', bajo: 'side' }[impact], impact, createdAt: NOW - 3 * DAY + Number(id.slice(1)), completedAt: null, ...extra });
const state = {
  version: 5, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [
    q('q1', 'Académico: media de 9 en Bachillerato', 'alto'),
    q('q2', 'Mates: 10 de media', 'alto', { parentId: 'q1' }),
    q('q3', 'Examen tema 4: derivadas', 'alto', { parentId: 'q2', deadline: '2026-11-14' }),
    q('q4', 'Examen tema 5: integrales', 'alto', { parentId: 'q2', deadline: '2026-11-27' }),
    q('q5', 'Física: 9 de media', 'alto', { parentId: 'q1' }),
    q('q6', 'Leer 20 páginas', 'medio'),
    q('q7', 'Responder correos', 'bajo', { steps: [{ id: 's1', title: 'Universidad', done: true }, { id: 's2', title: 'Academia', done: false }] }),
  ],
  habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [1, 2].map((d) => ({ id: `x${d}`, at: NOW - d * DAY, amount: 40, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } })),
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '3.0', balance: 2, ascended: [],
};

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(state));
  await page.reload();
  await page.waitForSelector('.nav');
  return page;
}
const seen = (sel, p = page) => p.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);

const page = await open({ width: 1280, height: 900 });
await page.click('.nav-item:has-text("Misiones")');
if (await page.isVisible('.calendar')) await page.click('[role=radio]:has-text("Lista")');
check(await seen('.item.has-sub:has-text("Académico") .tree-count:has-text("0/3")'), 'la raíz cuenta sus hojas a cualquier profundidad');
check(await seen('.item.has-sub:has-text("Responder correos") .tree-count:has-text("1/2")'), 'los pasos antiguos pasan a ser submisiones');
check(await seen('.item:has-text("Examen tema 4") .due:has-text("vence en 4 días")'), 'el examen lleva su fecha');

// Repartir sesiones para el examen del tema 4
await page.click('button[aria-label="Más acciones de Examen tema 4: derivadas"]');
await page.click('button[aria-label="Partir Examen tema 4: derivadas en submisiones"]');
check(await seen('.sub-add .split-row:has-text("hasta el 14 nov (4 días)")'), 'repartir sabe cuántos días quedan');
await page.fill('.sub-add .split-n', '4');
await page.click('.sub-add button:has-text("Repartir")');
check(await seen('.item:has-text("Sesión 2") .starts'), 'cada sesión sale el día que le toca');
await page.click('button[aria-label="Añadir submisión a Examen tema 4: derivadas"]');
await page.fill('[aria-label="Nueva submisión de Examen tema 4: derivadas"]', 'Simulacro con tiempo');
await page.press('[aria-label="Nueva submisión de Examen tema 4: derivadas"]', 'Enter');
check(await seen('.item.has-sub:has-text("Examen tema 4") .tree-count:has-text("0/5")'), 'se añaden submisiones a mano');
check(await seen('.item.has-sub:has-text("Académico") .tree-count:has-text("0/7")'), 'y suben hasta la raíz');
await page.click('.sub-add button[aria-label="Cerrar"]');
await page.screenshot({ path: `${out}/arbol-misiones-pc.png`, fullPage: true });

// Hoy: solo hojas, con su ruta
await page.click('.nav-item:has-text("Hoy")');
check(await seen('.now h2:has-text("Sesión 1")'), '¿Qué hago ahora? propone la sesión del examen cercano');
check(await seen('.now .now-path:has-text("Académico: media de 9 en Bachillerato › Mates: 10 de media › Examen tema 4")'), 'y dice de dónde cuelga');
check(await seen('.now .now-sub:has-text("vence en 4 días")'), 'con la fecha heredada del examen');
await page.click('.now button:has-text("Elegir las 3 de hoy")');
const opts = await page.$$eval('.prio-options .prio-title', (els) => els.map((e) => e.textContent));
check(!opts.some((t) => t.endsWith('Mates: 10 de media') || t.endsWith('Examen tema 4: derivadas')), 'Las 3 de hoy solo ofrece hojas');
check(opts.some((t) => t.includes('Física: 9 de media')), 'una rama sin partir aún es una hoja');
await page.click('.prio-option:has-text("Sesión 1")');
await page.click('.prio-option:has-text("Simulacro")');
await page.click('.prio-option:has-text("Leer 20")');
await page.click('.now button:has-text("Fijar prioridades")');
await page.waitForTimeout(500);
await page.locator('.now').screenshot({ path: `${out}/arbol-hoy-pc.png` });
await page.click('.now button:has-text("Ya la terminé")');
await page.waitForTimeout(600);
if (await page.isVisible('.levelup button.primary')) await page.click('.levelup button.primary');
await page.click('.nav-item:has-text("Misiones")');
check(await seen('.item.has-sub:has-text("Examen tema 4") .tree-count:has-text("1/5")'), 'cerrar una sesión cuenta en el examen');

// Móvil
const m = await open({ width: 390, height: 844 });
await m.click('nav >> text=Misiones');
if (await m.isVisible('.calendar')) await m.click('[role=radio]:has-text("Lista")');
await m.waitForSelector('.item.has-sub');
await m.waitForTimeout(800);
await m.locator('.item.has-sub:has-text("Académico")').first().screenshot({ path: `${out}/arbol-misiones-movil.png` });

check(errors.length === 0, `sin errores en consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
