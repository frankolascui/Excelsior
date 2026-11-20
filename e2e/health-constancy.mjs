// Reino de la Salud: constancia a largo plazo (semanas constantes, racha y monumentos en la ciudad).
// Uso: npm run build:single && node e2e/health-constancy.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

const NOW = new Date('2026-11-12T08:30:00').getTime(); // jueves
const DAY = 86_400_000;
const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MON = new Date('2026-11-09T12:00:00').getTime();
// 13 semanas constantes: las 5 últimas seguidas (sin contar esta) y 8 más atrás con huecos.
const weeks = [1, 2, 3, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17].map((i) => key(MON - i * 7 * DAY));
const works = weeks.flatMap((w, i) => [
  { id: `t${i}`, kind: 'templo', week: w, at: NOW - (i + 1) * 7 * DAY },
  ...(i % 2 ? [{ id: `p${i}`, kind: 'palestra', week: w, at: NOW - (i + 1) * 7 * DAY }] : []),
  ...(i % 3 === 0 ? [{ id: `b${i}`, kind: 'balanza', week: w, at: NOW - (i + 1) * 7 * DAY }] : []),
]);
const state = {
  version: 6, profile: { name: 'Nicolas', createdAt: NOW - 140 * DAY },
  quests: [], habits: [{ id: 'sys-salud', name: 'Apuntar la noche', frequency: 'daily', createdAt: NOW - 130 * DAY, rewards: { voluntad: 1 }, system: 'health' }],
  habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: Array.from({ length: 12 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 100, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } })),
  health: { works },
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: fs.readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [],
};
const health = { nights: [], settings: { levantar: '07:00', horas: 8, entrenosPlan: 4, entrenosMin: 3 } };

for (const [name, viewport] of [['pc', { width: 1280, height: 900 }], ['movil', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate(([st, h]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:health', h); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state), JSON.stringify(health)]);
  await page.reload();
  await page.waitForSelector('.nav, .bottom-nav');
  await page.evaluate(() => { location.hash = '#reinos'; });
  await page.click('[data-testid="open-health"]');
  const panel = page.locator('[data-testid="health-constancy"]');
  await panel.waitFor();
  const text = await panel.innerText();
  if (name === 'pc') {
    check(/13\s*semanas constantes/.test(text), 'cuenta 13 semanas constantes');
    check(/5\s*semanas seguidas/.test(text), 'racha de 5 semanas seguidas (esta semana aún no rompe)');
    check(/Columnata de Panacea con 13 semanas constantes más/.test(text), 'siguiente monumento: Columnata, faltan 13');
    check((await panel.locator('.health-monuments li.done').count()) === 2, 'Fuente y Estatua levantadas');
    const head = await page.locator('.kingdom.health .kingdom-count').innerText();
    check(head.includes(String(works.length + 2)), `estructuras = obras + monumentos (${works.length + 2})`);
  }
  await page.waitForTimeout(1500); // fin de la animación de entrada
  await page.locator('.kingdom.health').getByRole('button', { name: 'Desde arriba' }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('.kingdom.health').screenshot({ path: `${out}/salud-constancia-ciudad-${name}.png` });
  await panel.screenshot({ path: `${out}/salud-constancia-${name}.png` });
  await ctx.close();
}
check(errors.length === 0, `sin errores en la consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
