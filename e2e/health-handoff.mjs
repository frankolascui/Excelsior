// Traer las noches de la web antigua del Diario de Sueño con el enlace «#traer-salud=…».
// Uso: npm run build:single && node e2e/health-handoff.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const NOW = new Date('2026-11-23T08:30:00').getTime();
const DAY = 86_400_000;
const version = fs.readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const state = {
  version: 5, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [], habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [], tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '3.1', ascended: [],
};
// 200 noches, como alguien que usó la web antigua muchos meses.
const nights = Array.from({ length: 200 }, (_, i) => {
  const d = new Date(NOW - (i + 1) * DAY);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { fecha, percibido: { cama: '23:05', dormido: '23:20', despertar: '06:50', levantado: '07:00' }, reloj: { dormido: '23:18', despertar: '06:52', total_dormido_min: 440, fases_min: { despierto: 20, rem: 100, ligero: 240, profundo: 80 } }, preguntas: { calidad: 4, descanso: 4, estres: 2, entrenos_ayer: i % 2, notas: i === 0 ? 'Dormí bien, sin café' : null }, cuerpo: { peso_kg: 70 + (i % 5) / 10, mismas_condiciones: true }, actualizado: new Date(NOW - i * DAY).toISOString() };
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: NOW });
await page.goto(url);
await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(state));
// Lo mismo que hace la web antigua al pulsar «Llevar mis noches».
const payload = await page.evaluate(async (list) => {
  const bytes = new TextEncoder().encode(JSON.stringify(list));
  const z = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let s = ''; for (const b of z) s += String.fromCharCode(b);
  return 'z' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, nights);
console.log(`enlace: ${payload.length} caracteres para ${nights.length} noches`);
await page.goto(`${url}#traer-salud=${payload}`);
await page.reload(); // en la vida real llega como página nueva
await page.waitForSelector('.nav');
check(!page.url().includes('traer-salud'), 'el enlace se limpia de la barra de direcciones');
const dlg = page.getByTestId('sure-dialog');
await dlg.waitFor({ timeout: 8000 });
check((await dlg.textContent()).includes('¿Traer 200 noches del Diario de Sueño?'), 'pregunta antes de traer las noches');
check(await page.locator('[aria-labelledby="news-h"]').count() === 0, 'las novedades no se abren encima');
await dlg.getByRole('button', { name: 'Traer mis noches' }).click();
await page.waitForTimeout(300);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:health') ?? '{}'));
check(stored.nights?.length === 200, `200 noches guardadas (hay ${stored.nights?.length})`);
check(stored.nights?.some((n) => n.preguntas?.notas === 'Dormí bien, sin café'), 'conserva las notas con acentos');
check(await page.locator('.toast').filter({ hasText: '200 noches traídas' }).count() === 1, 'avisa de cuántas noches trajo');
check(await page.evaluate(() => localStorage.getItem('excelsior:health-incoming')) === null, 'no vuelve a preguntar');
await page.locator('[aria-labelledby="news-h"]').waitFor({ timeout: 8000 });
check(true, 'las novedades de la 3.5 salen después');
await page.reload();
await page.waitForSelector('.nav');
await page.waitForTimeout(500);
check(await page.getByText('¿Traer 200 noches').count() === 0, 'tras recargar no pregunta otra vez');
check(errors.length === 0, `sin errores en la consola ${errors.join(' | ')}`);
await browser.close();
