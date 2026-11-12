// Reino de la Salud (V3): fundarlo, apuntar la noche, hábito del sistema, obras y móvil.
// Uso: npm run build:single && node e2e/health.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

const NOW = new Date('2026-11-12T08:30:00').getTime(); // jueves
const DAY = 86_400_000;
const day = (n) => { const d = new Date(NOW + n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const state = {
  version: 5, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [], habits: [{ id: 'h1', name: 'Leer 20 páginas', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { sabiduria: 1 } }],
  habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [{ id: 'k1', name: 'Reino de la Programación', createdAt: NOW - 20 * DAY }], goals: [], rewards: [], purchases: [], bosses: [],
  xp: Array.from({ length: 12 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 100, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } })),
  tours: ['intro', 'reinos', 'arena', 'gremios'], newsSeen: '3.0', ascended: [],
};
// Noches ya apuntadas (lunes a miércoles), como si vinieran de la web de Health.
const night = (fecha, peso) => ({ fecha, percibido: { cama: '23:05', levantado: '07:00' }, reloj: { total_dormido_min: 440 }, preguntas: { descanso: 4, entrenos_ayer: 1 }, cuerpo: { peso_kg: peso } });
const health = { nights: [night(day(-3), 70.4), night(day(-2), 70.2), night(day(-1), null)], settings: { levantar: '07:00', horas: 8, entrenosPlan: 4, entrenosMin: 3 } };

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate(([st, h]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:health', h); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state), JSON.stringify(health)]);
  await page.reload();
  await page.waitForSelector('.nav');
  return page;
}
const game = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));

const page = await open({ width: 1280, height: 900 });
await page.evaluate(() => { location.hash = '#reinos'; });
await page.click('[data-testid="open-health"]');
check(await page.locator('[data-testid="found-health"]').isVisible(), 'el Reino de la Salud se presenta antes de fundarlo');
await page.screenshot({ path: `${out}/health-01-fundar.png` });
await page.click('[data-testid="found-health"]');
await page.waitForSelector('[data-testid="night-form"]');
let g = await game(page);
check(g.version === 6, 'la partida pasa a la versión 6');
check(g.habits.some((h) => h.id === 'sys-salud' && h.system === 'health'), 'fundar crea el hábito «Apuntar la noche»');
check(g.habitCompletions.filter((c) => c.habitId === 'sys-salud').length === 3, 'las 3 noches que ya había marcan sus días');

await page.fill('#night-cama', '23:10');
await page.fill('#night-levantado', '07:05');
await page.fill('#night-h', '7');
await page.fill('#night-m', '25');
await page.fill('#night-peso', '70,1');
await page.click('.night-form [aria-label="Descanso de 1 a 5"] button:has-text("4")');
await page.click('.night-form [aria-label="Entrenos de ayer"] button:has-text("1")');
await page.click('button:has-text("Apuntar la noche")');
await page.waitForSelector('.night-summary');
g = await game(page);
check(g.habitCompletions.filter((c) => c.habitId === 'sys-salud').length === 4, 'apuntar la noche marca el hábito de hoy');
check((g.health?.works ?? []).some((w) => w.kind === 'balanza'), 'tres pesajes levantan la Balanza');
check((g.health?.works ?? []).some((w) => w.kind === 'palestra'), 'tres entrenos levantan la Palestra');
check(!(g.health?.works ?? []).some((w) => w.kind === 'templo'), 'con 4 noches aún no hay Templo del Sueño');
const h = JSON.parse(await page.evaluate(() => localStorage.getItem('excelsior:health')));
check(h.nights.length === 4 && h.nights[0].reloj.total_dormido_min === 445, 'la noche se guarda aparte de la partida');
check(!JSON.stringify(g).includes('total_dormido_min'), 'y no viaja dentro de la partida');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/health-02-reino.png`, fullPage: true });

// El hábito del sistema no se marca a mano: lleva al reino.
await page.evaluate(() => { location.hash = '#habitos'; });
await page.waitForSelector('[data-habit="sys-salud"]');
check(await page.locator('[data-habit="sys-salud"] .edit-btn').count() === 0, 'el hábito del sistema no se edita ni se borra');
await page.click('[data-habit="sys-salud"] .check');
await page.waitForSelector('#health-h');
g = await game(page);
check(g.habitCompletions.filter((c) => c.habitId === 'sys-salud').length === 4, 'pulsarlo no lo desmarca: abre el Reino de la Salud');

// Borrar la noche de hoy devuelve el XP y desmarca.
await page.click('.night-summary button:has-text("Editar")');
await page.click('.night-form button:has-text("Borrar")');
g = await game(page);
check(g.habitCompletions.filter((c) => c.habitId === 'sys-salud').length === 3, 'borrar la noche desmarca el hábito');

const m = await open({ width: 390, height: 844 });
await m.evaluate(() => { location.hash = '#reinos'; });
await m.click('[data-testid="open-health"]');
await m.click('[data-testid="found-health"]');
await m.waitForSelector('[data-testid="night-form"]');
check(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'móvil: sin scroll horizontal');
await m.screenshot({ path: `${out}/health-03-movil.png`, fullPage: true });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
