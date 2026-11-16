// Hábitos: sobrecarga a la vista (meta, escalones, cuánto falta) y varias veces al día con bolitas.
// Uso: npm run build:single && node e2e/habits.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-16T20:30:00').getTime(); const DAY = 86_400_000;
const day = (n) => { const d = new Date(NOW + n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const comps = [];
for (let i = 1; i <= 9; i++) comps.push({ id: `c${i}`, habitId: 'h1', day: day(-i), at: NOW - i * DAY });
for (let i = 1; i <= 5; i++) comps.push({ id: `d${i}`, habitId: 'h3', day: day(-i), at: NOW - i * DAY });
comps.push({ id: 'e1', habitId: 'h3', day: day(0), at: NOW - 3600e3 });
const state = { version: 6, profile: { name: 'N', createdAt: NOW - 40 * DAY }, quests: [],
  habits: [
    { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { sabiduria: 1 }, progression: { kind: 'amount', value: 20, step: 5, unit: 'min', max: 60, since: NOW - 9 * DAY, history: [{ value: 10, at: NOW - 25 * DAY }, { value: 15, at: NOW - 18 * DAY }] } },
    { id: 'h2', name: 'Correr', frequency: 'weekly', perWeek: 3, createdAt: NOW - 30 * DAY, rewards: { voluntad: 1 }, progression: { kind: 'freq', value: 3, step: 1, max: 5, since: NOW - 4 * DAY, history: [] } },
    { id: 'h3', name: 'Beber agua', frequency: 'daily', perDay: 3, createdAt: NOW - 30 * DAY, rewards: { voluntad: 1 } },
    { id: 'h4', name: 'Meditar', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { voluntad: 1 } },
  ],
  habitCompletions: comps, sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [], xp: Array.from({ length: 12 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 100, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } })), tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] };
const b = await chromium.launch();
const errs = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
async function open(viewport) {
  const p = await (await b.newContext({ viewport, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.clock.install({ time: NOW });
  await p.goto(url);
  await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state)]);
  await p.reload(); await p.waitForSelector('.nav');
  await p.evaluate(() => { location.hash = '#habitos'; });
  await p.waitForSelector('[data-habit="h1"]');
  return p;
}
const game = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));
const count = async (p) => (await game(p)).habitCompletions.filter((c) => c.habitId === 'h3' && c.day === day(0)).length;

const p = await open({ width: 1280, height: 900 });
const leer = p.locator('[data-habit="h1"] [data-testid="habit-goal"]');
check(await leer.isVisible(), 'la sobrecarga se ve en la tarjeta del hábito');
const t = await leer.innerText();
check(t.includes('20 min') && t.includes('siguiente 25 min') && t.includes('final 60 min'), 'meta actual, siguiente y final');
check(await leer.locator('.goal-steps i').count() === 10 && await leer.locator('.goal-steps i.on').count() === 2, 'escalones: 2 de 10 subidos');
check(t.includes('Llevas 9 de 14'), 'cuánto falta para que Hiperión proponga subir');
check((await p.locator('[data-habit="h2"] [data-testid="habit-goal"]').innerText()).includes('3 veces/sem'), 'también la de veces por semana');
check(await p.locator('[data-habit="h4"] [data-testid="habit-goal"]').count() === 0, 'sin sobrecarga, sin bloque');

check(await p.isVisible('[data-habit="h3"] .day-pips') && (await p.locator('[data-habit="h3"] .check').innerText()) === '1/3', 'varias veces al día: bolitas y el aro dice 1/3');
await p.screenshot({ path: `${out}/habits-01.png` });
await p.click('[data-habit="h3"] .pip >> nth=2');
check(await count(p) === 3, 'pulsar la tercera bolita deja el día en 3 de 3');
check(await p.locator('[data-habit="h3"].done').count() === 1, 'con 3 de 3 queda cumplido');
await p.click('[data-habit="h3"] .pip >> nth=2');
check(await count(p) === 2, 'pulsar la última encendida quita solo esa');
await p.click('[data-habit="h3"] .check');
check(await count(p) === 3, 'el aro suma otra');

// El editor enseña las veces al día con botones, antes de la meta.
await p.click('[data-habit="h4"] .edit-btn');
check(await p.isVisible('.perday-input [role="radiogroup"]'), 'veces al día con botones en el editor');
await p.click('.perday-input button:has-text("2 veces")');
await p.click('li.item.editing button:has-text("Guardar")');
check((await game(p)).habits.find((h) => h.id === 'h4').perDay === 2, 'y se guarda');

const m = await open({ width: 390, height: 844 });
check(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'móvil: sin scroll horizontal');
await m.screenshot({ path: `${out}/habits-02-movil.png`, fullPage: true });

check(errs.length === 0, `sin errores de la app ${errs.join(' | ')}`);
await b.close();
