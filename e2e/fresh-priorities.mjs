// Partida nueva (sin XP): «Elegir las 3 de hoy» tiene que salir igual.
// Uso: npm run build:single && node e2e/fresh-priorities.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const NOW = Date.now();
const q = (id, t) => ({ id, title: t, type: 'daily', impact: 'medio', createdAt: NOW - 1000, completedAt: null });
const st = { version: 5, profile: { name: 'N', createdAt: NOW }, quests: [q('a', 'Uno'), q('b', 'Dos'), q('c', 'Tres')], habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [], xp: [], tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '3.0', balance: 0, ascended: [] };
await page.goto(url);
await page.evaluate((s) => { localStorage.setItem('excelsior:v1', s); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(st));
await page.reload(); await page.waitForSelector('.now');
await page.click('.now button:has-text("Elegir las 3 de hoy")', { timeout: 3000 });
for (const t of ['Uno', 'Dos', 'Tres']) await page.click(`.prio-option:has-text("${t}")`);
await page.click('.now button:has-text("Fijar prioridades")');
const ok = (await page.textContent('.now .eyebrow')).includes('Las 3 de hoy · 0/3') && errs.length === 0;
console.log(ok ? 'ok: en una partida nueva (sin XP) también se eligen las 3 de hoy' : 'FALLO: partida nueva sin poder elegir las 3 de hoy ' + errs.join(' | '));
if (!ok) process.exitCode = 1;
await b.close();
