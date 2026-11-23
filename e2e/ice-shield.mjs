// Escudo de racha (congelado): máximo 2, solo para ayer, precio 150 y efecto de hielo.
// Uso: npm run build:single && node e2e/ice-shield.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-18T18:00:00').getTime(); const DAY = 86_400_000;
const day = (n) => { const d = new Date(NOW + n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const comps = [];
for (let i = 2; i <= 8; i++) comps.push({ id: `c${i}`, habitId: 'h1', day: day(-i), at: NOW - i * DAY }); // ayer fallado
for (const i of [1, 3, 4, 5]) comps.push({ id: `d${i}`, habitId: 'h2', day: day(-i), at: NOW - i * DAY }); // anteayer fallado, ayer hecho
const state = { version: 6, profile: { name: 'N', createdAt: NOW - 40 * DAY }, quests: [],
  habits: [
    { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { sabiduria: 1 } },
    { id: 'h2', name: 'Meditar', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { voluntad: 1 } },
  ],
  habitCompletions: comps, sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [{ id: 'x', at: NOW - 20 * DAY, amount: 3000, source: 'quest', sourceId: 'old', label: 'Antes', attributes: { voluntad: 2 } }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] };
const b = await chromium.launch();
const errs = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', (e) => errs.push(e.message));
await p.clock.install({ time: NOW });
await p.goto(url);
await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state)]);
await p.reload(); await p.waitForSelector('.nav');
const game = () => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));
const shields = async () => (await game()).purchases.filter((x) => x.rewardId === 'streak-shield' && x.usedAt === null).length;

// Tienda: 150 monedas, máximo 2
await p.evaluate(() => { location.hash = '#arena'; });
await p.locator('.shop-jump').click();
const card = p.locator('.shop-shield');
await card.waitFor();
await card.scrollIntoViewIfNeeded();
check((await card.innerText()).includes('150'), 'el escudo cuesta 150');
await card.locator('button').click(); await card.locator('button').click();
check(await shields() === 2, 'se compran 2');
check(await card.locator('button').isDisabled(), 'con 2 guardados no deja comprar más');
check((await card.innerText()).includes('tienes 2 de 2'), 'dice cuántos tienes de 2');
await card.screenshot({ path: `${out}/ice-01-tienda.png` });

// Hábitos: solo se ofrece para ayer
await p.evaluate(() => { location.hash = '#habitos'; });
await p.waitForSelector('[data-habit="h1"]');
check(await p.locator('[data-habit="h1"] .ice-link').count() === 1, 'Leer (ayer fallado): se puede congelar ayer');
check(await p.locator('[data-habit="h2"] .ice-link').count() === 0, 'Meditar (anteayer fallado): no se ofrece');
await p.locator('[data-habit="h1"] .ice-link').click();
await p.clock.runFor(500);
check(await p.locator('[data-habit="h1"] .ice-burst').count() === 1, 'al usarlo sale el destello de hielo');
await p.locator('[data-habit="h1"]').screenshot({ path: `${out}/ice-02-congelando.png` });
check(await shields() === 1, 'queda 1 escudo');
await p.clock.runFor(3000);
await p.locator('[data-habit="h1"] .check').click(); await p.locator('[data-habit="h1"] .check').click(); // fuerza un repintado
check(await p.locator('[data-habit="h1"].iced').count() === 1, 'el hábito queda con hielo (racha congelada)');
check(await p.locator('[data-habit="h1"] .dot.shield').count() === 1, 'el punto de ayer es de hielo');
await p.locator('[data-habit="h1"] .habit-open').click();
await p.mouse.move(5, 5);
await p.locator('[data-habit="h1"]').screenshot({ path: `${out}/ice-03-congelado.png` });
check(errs.length === 0, `sin errores en consola ${errs.join(' | ')}`);
await b.close();
