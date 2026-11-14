// V3.1: Reino de la Salud (configuración al fundar, en el mapa), diario sin reloj y 6 medidas en una línea,
// reloj de Hoy y el color del tema en todas las pantallas. Uso: npm run build:single && node e2e/v31.mjs [carpeta]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const theme = process.argv[3] ?? 'gaia';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const version = readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const NOW = new Date('2026-11-14T21:40:00').getTime();
const DAY = 86_400_000;
const day = (n) => { const d = new Date(NOW + n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const state = {
  version: 6, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [],
  habits: [{ id: 'h1', name: 'Leer 20 páginas', frequency: 'daily', createdAt: NOW - 30 * DAY, rewards: { sabiduria: 1 } }],
  habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [{ id: 'k1', name: 'Reino de la Programación', createdAt: NOW - 20 * DAY }], goals: [], rewards: [], purchases: [], bosses: [],
  xp: Array.from({ length: 12 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 120, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } })),
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: version, ascended: [],
};
const night = (fecha, peso) => ({ fecha, percibido: { cama: '23:05', levantado: '07:00' }, reloj: { total_dormido_min: 440 }, preguntas: { descanso: 4, entrenos_ayer: 1 }, cuerpo: { peso_kg: peso } });
const health = { nights: [night(day(-3), 70.4), night(day(-2), 70.2), night(day(-1), 70.1)], settings: { levantar: '07:00', horas: 8, entrenosPlan: 4, entrenosMin: 3 } };

async function open(viewport, founded = false) {
  const st = founded ? { ...state, habits: [...state.habits, { id: 'sys-salud', name: 'Apuntar la noche', frequency: 'daily', createdAt: NOW, rewards: { voluntad: 1 }, system: 'health' }], health: { works: [] } } : state;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate(([st, h, t]) => {
    localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:health', h); localStorage.setItem('excelsior:guest', '1');
    localStorage.setItem('excelsior:theme', JSON.stringify({ id: t }));
  }, [JSON.stringify(st), JSON.stringify(health), theme]);
  await page.reload();
  await page.waitForSelector('.nav, .mob-nav', { timeout: 8000 }).catch(async () => { await page.screenshot({ path: '/tmp/claude-0/v31/debug.png' }); throw new Error('no carga: ' + errors.join(' | ')); });
  return page;
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(1500); };

const page = await open({ width: 1280, height: 900 });
await go(page, '#reinos');
await page.click('[data-testid="open-health"]');
await page.waitForTimeout(1500);
check(await page.isVisible('[data-testid="health-setup"]'), 'la primera vez sale el panel de configuración (horario y entrenos)');
await page.screenshot({ path: `${out}/v31-salud-configurar.png` });
await page.click('[data-testid="health-setup"] #health-horas');
await page.click('[role="option"]:has-text("7,5 h")');
check(await page.isVisible('[data-testid="health-setup"] >> text=23:30'), 'cambiar las horas mueve la hora de acostarse');
await page.click('[data-testid="found-health"]');
await page.waitForSelector('[data-testid="night-form"]');
const ess = await page.locator('.night-essential > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
check(ess.length === 6 && new Set(ess).size === 1, `los 6 campos de la noche en una línea (${ess.join(',')})`);
await page.click('.kingdom-back button:has-text("Mapa del reino")');
await page.waitForTimeout(500);
check(await page.isVisible('.realm-map .kingdom-node[aria-label^="Reino de la Salud"]'), 'el Reino de la Salud aparece en el mapa');
check(!(await page.isVisible('.realm-empty')), 'y el mapa ya no dice que no hay reinos');
await page.screenshot({ path: `${out}/v31-mapa.png` });
await page.click('.realm-map .kingdom-node[aria-label^="Reino de la Salud"]');
await page.click('[data-testid="health-tab-diario"]');
await page.waitForSelector('[data-testid="diary-today"]');
await page.waitForTimeout(1500);
check(!(await page.isVisible('[data-testid="diary-today"] .sleep-dial')), 'el diario ya no repite el reloj');
const tiles = await page.locator('.diary-stat').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
check(tiles.length === 6 && new Set(tiles).size === 1, `las 6 medidas del diario en una línea (${tiles.join(',')})`);
await page.screenshot({ path: `${out}/v31-diario.png` });
await go(page, '#hoy');
check(await page.isVisible('[data-testid="hoy-sleep"] .sleep-dial'), 'Hoy: reloj del sueño con esfera de 24 h');
await page.locator('[data-testid="hoy-sleep"]').screenshot({ path: `${out}/v31-hoy-reloj.png` });

// El tema en cada pantalla (capturas para revisar a ojo que nada se queda en rosa).
for (const h of ['#hoy', '#misiones', '#habitos', '#deepwork', '#reinos', '#arena', '#personaje', '#amigos', '#gremios', '#ajustes']) {
  await go(page, h);
  await page.screenshot({ path: `${out}/v31-tema-${theme}-${h.slice(1)}.png`, fullPage: true });
}

const m = await open({ width: 390, height: 844 }, true);
await go(m, '#hoy');
check(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'móvil: Hoy sin scroll horizontal');
await m.locator('[data-testid="hoy-sleep"]').screenshot({ path: `${out}/v31-hoy-reloj-movil.png` });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
