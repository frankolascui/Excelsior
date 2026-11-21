// Capturas de Hábitos con una partida realista (para revisar cómo se ve).
// Uso: npm run build:single && node e2e/habits-look.mjs <carpeta> [prefijo]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const pre = process.argv[3] ?? 'hab';
const DAY = 86_400_000;
const NOW = new Date('2026-11-26T18:30:00').getTime(); // jueves
const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const news = readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const comp = (id, days, n = 1) => days.flatMap((d) => Array.from({ length: n }, (_, k) => ({ id: `${id}-${d}-${k}`, habitId: id, day: key(NOW - d * DAY), at: NOW - d * DAY - k * 1000 })));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const state = {
  version: 6, profile: { name: 'Nicolas', createdAt: NOW - 90 * DAY }, quests: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], bosses: [],
  habits: [
    { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: NOW - 60 * DAY, rewards: { sabiduria: 1 }, minimum: '1 página',
      progression: { kind: 'amount', unit: 'min', value: 30, step: 10, max: 60, since: NOW - 9 * DAY, history: [{ value: 20, at: NOW - 40 * DAY }] } },
    { id: 'h2', name: 'Entrenar', frequency: 'weekly', perWeek: 4, createdAt: NOW - 60 * DAY, rewards: { voluntad: 1, maestria: 1 }, perDay: 2 },
    { id: 'h3', name: 'Meditar 10 min', frequency: 'daily', createdAt: NOW - 50 * DAY, rewards: { voluntad: 1 }, minimum: '3 respiraciones' },
    { id: 'h4', name: 'Hablar con un desconocido', frequency: 'weekly', perWeek: 2, createdAt: NOW - 30 * DAY, rewards: { conexion: 1 } },
    { id: 'ladder-s1', name: 'Escribir diario', frequency: 'daily', createdAt: NOW - 10 * DAY, rewards: { sabiduria: 1 }, minimum: '3 líneas' },
    { id: 'h5', name: 'Dormir antes de las 23:30', frequency: 'daily', createdAt: NOW - 40 * DAY, rewards: { voluntad: 1 },
      progression: { kind: 'time', value: 23 * 60 + 30, step: -15, max: 22 * 60 + 30, since: NOW - 20 * DAY } },
  ],
  habitCompletions: [
    ...comp('h1', range(0, 30).filter((d) => d % 9 !== 4)),
    ...comp('h2', [1, 3, 8, 10, 12, 13]), ...comp('h2', [0], 2),
    ...comp('h3', range(2, 25)),
    ...comp('h4', [2, 9]),
    ...comp('ladder-s1', [0, 2, 3, 4, 5, 6]),
    ...comp('h5', range(1, 18).filter((d) => d % 5 !== 0)),
  ],
  purchases: [{ id: 'p1', rewardId: 'shield', name: 'Escudo', cost: 150, at: NOW - 5 * DAY, shield: null }],
  ladder: { steps: [{ id: 's1', kind: 'new', name: 'Escribir diario', minimum: '3 líneas', perWeek: 7 }, { id: 's2', kind: 'rest' }, { id: 's3', kind: 'new', name: 'Ducha fría', minimum: '30 s', perWeek: 7 }, { id: 's4', kind: 'audit' }],
    startedOn: key(NOW - 10 * DAY - 0 * DAY), current: 0, week: key(NOW - 3 * DAY), log: [{ id: 'l1', week: key(NOW - 10 * DAY), step: 's1', result: 'repeat', below: ['Hablar con un desconocido'] }] },
  retiredHabits: [{ id: 'r1', name: 'Beber 2 L de agua', frequency: 'daily', createdAt: NOW - 120 * DAY, retiredAt: NOW - 20 * DAY, rewards: { voluntad: 1 } }],
  xp: Array.from({ length: 30 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 120, source: 'quest', sourceId: `o${d}`, label: 'Antes', attributes: { voluntad: 2 } })),
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: news, newsLatest: news, ascended: [],
};
const b = await chromium.launch();
for (const [name, vp] of [['pc', { width: 1440, height: 1000 }], ['movil', { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.clock.install({ time: NOW });
  await p.goto(url);
  await p.evaluate((s) => { localStorage.setItem('excelsior:v1', s); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(state));
  await p.reload(); await p.waitForSelector('.nav');
  await p.evaluate(() => { location.hash = '#habitos'; });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${pre}-${name}.png`, fullPage: true });
  await p.click('[data-habit="h1"] .habit-open');
  await p.waitForTimeout(300);
  await p.locator('[data-habit="h1"]').screenshot({ path: `${out}/${pre}-${name}-abierto.png` });
}
await b.close();
