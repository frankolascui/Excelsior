// Capturas de «Pasar a mañana» (Hoy) y del bloque «Mañana» (Misiones), PC y móvil.
// Uso: npm run build:single && node e2e/tomorrow-shots.mjs [carpeta]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-09T19:00:00').getTime();
const DAY = 86_400_000;
const q = (id, title, impact, daysAgo, extra = {}) => ({ id, title, type: { alto: 'main', medio: 'daily', bajo: 'side' }[impact], impact, createdAt: NOW - daysAgo * DAY, completedAt: null, ...extra });
const state = {
  version: 5, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [
    q('q1', 'Terminar el tema 4 de cálculo', 'alto', 3),
    q('q2', 'Preparar la presentación del proyecto', 'alto', 5),
    q('q3', 'Leer 20 páginas', 'medio', 2),
    q('q4', 'Entregar la práctica de redes', 'medio', 1, { deadline: '2026-11-10' }),
    q('q5', 'Llamar al tutor del TFG', 'alto', 1, { startsOn: '2026-11-10' }),
  ],
  priorities: [{ day: '2026-11-09', ids: ['q1', 'q2', 'q3'] }],
  habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [{ id: 'x1', at: NOW - DAY, amount: 40, source: 'quest', sourceId: 'old1', label: 'Antes', attributes: { voluntad: 2 } }], tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '3.0', balance: 2, ascended: [],
  weeklyReviews: [{ week: '2026-11-02', at: NOW - DAY, change: 'Móvil fuera durante el foco', focus: 'Dejar lista la presentación' }],
};
const browser = await chromium.launch();
for (const [name, viewport] of [['pc', { width: 1280, height: 900 }], ['movil', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(state));
  await page.reload();
  await page.waitForSelector('.now');
  await page.waitForTimeout(800);
  await page.click('.now-rest button[aria-label="Pasar a mañana Leer 20 páginas"]');
  await page.waitForTimeout(800);
  await page.locator('.now').screenshot({ path: `${out}/manana-hoy-${name}.png` });
  await page.screenshot({ path: `${out}/manana-panel-hoy-${name}.png`, fullPage: true });
  await page.click(name === 'pc' ? '.nav-item:has-text("Misiones")' : 'nav >> text=Misiones');
  if (await page.isVisible('.calendar')) await page.click('[role=radio]:has-text("Lista")');
  await page.waitForSelector('.tomorrow-panel');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/manana-misiones-${name}.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
