// Calendario como Google: al cambiar, mover o borrar un evento que se repite pregunta «Este / Este y los siguientes / Todos».
// Y las acciones de misiones y hábitos a un toque. Uso: npm run build:single && node e2e/calendar-scope.mjs [carpeta]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const DAY = 86_400_000;
const MON = new Date('2026-11-23T08:00:00').getTime(); // lunes
const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const news = readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
function state(extra = {}) {
  return { version: 6, profile: { name: 'N', createdAt: MON - 60 * DAY }, quests: [],
    habits: [
      { id: 'h1', name: 'Leer', frequency: 'daily', createdAt: MON - 30 * DAY, rewards: { sabiduria: 1 } },
      { id: 'h2', name: 'Entrenar', frequency: 'weekly', perWeek: 3, createdAt: MON - 30 * DAY, rewards: { voluntad: 1 } },
    ],
    habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
    xp: Array.from({ length: 10 }, (_, d) => ({ id: `x${d}`, at: MON - (d + 1) * DAY, amount: 50, source: 'quest', sourceId: `o${d}`, label: 'Antes', attributes: { voluntad: 1 } })),
    tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: news, newsLatest: news, ascended: [], ...extra };
}
const b = await chromium.launch();
const errs = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
async function open(st, now, viewport = { width: 1280, height: 900 }) {
  const p = await (await b.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: now });
  await p.goto(url);
  await p.evaluate(([s]) => { localStorage.setItem('excelsior:v1', s); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(st)]);
  await p.reload(); await p.waitForSelector('.nav');
  await p.evaluate(() => { location.hash = '#misiones'; });
  await p.waitForSelector('.screen');
  return p;
}
const game = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));
const gym = { id: 'g1', title: 'Gimnasio', day: '2026-11-02', time: '18:00', end: '19:00', kind: 'bloque', repeat: 'weekly', createdAt: 1 };
const quests = [{ id: 'q1', title: 'Llamar al banco', type: 'side', impact: 'medio', createdAt: MON - DAY, completedAt: null }];
let p = await open(state({ events: [gym], quests }), MON);

// Acciones a un toque en misiones (sin ⋯)
check(!(await p.isVisible('.more-btn')) && await p.isVisible('.item:has-text("Llamar al banco") .item-quick button[aria-label="Bloque de tiempo para Llamar al banco"]'), 'misiones: bloque, fecha, editar y borrar al lado, sin los tres puntitos');
await p.waitForTimeout(900);
await p.locator('.item:has-text("Llamar al banco")').hover();
await p.screenshot({ path: `${out}/cal-00-misiones.png` });

// Ficha: cambiar la hora de una repetición y guardar «Este y los siguientes»
await p.click('[role=radio]:has-text("Calendario")');
await p.click('[role=radio]:text-is("Día")');
await p.click('.tg-block:has-text("Gimnasio")');
await p.waitForSelector('.sheet');
await p.click('.sheet button[aria-label="Empieza: 18:00"]');
await p.click('[role=listbox][aria-label="Empieza"] [data-t="19:00"]');
let g = await game(p);
check(g.events.length === 1 && g.events[0].time === '18:00', 'en un evento que se repite, nada cambia hasta guardar (ya no sale otro bloque)');
await p.click('.sheet button:has-text("Guardar")');
check(await p.isVisible('.scope-card:has-text("Este y los siguientes")'), 'al guardar pregunta como Google: este, este y los siguientes, todos');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/cal-01-pregunta.png` });
await p.click('.scope-opt:has-text("Este y los siguientes")');
await p.click('.scope-card button:has-text("Aceptar")');
g = await game(p);
const later = g.events.find((e) => e.id !== 'g1');
check(g.events.length === 2 && g.events.find((e) => e.id === 'g1').until === '2026-11-22' && later?.day === '2026-11-23' && later.time === '19:00', '«Este y los siguientes» corta la serie y sigue con el cambio');

// Borrar: también pregunta
await p.click('.tg-block:has-text("Gimnasio")');
await p.click('.sheet button:has-text("Borrar")');
check(await p.isVisible('.scope-card h3:has-text("Borrar evento periódico")'), 'borrar un evento que se repite también pregunta');
await p.click('.scope-card button:has-text("Cancelar")');
check(!(await p.isVisible('.scope-card')), 'cancelar no borra');

// Hábitos: bloque y editar al lado
await p.keyboard.press('Escape');
await p.evaluate(() => { location.hash = '#habitos'; });
await p.waitForSelector('.item:has-text("Leer")');
check(await p.isVisible('.item:has-text("Leer") .item-quick button[aria-label="Bloque de tiempo para Leer"]'), 'hábitos: bloque y editar al lado, sin abrir el hábito');
await p.click('.item:has-text("Leer") .item-quick button[aria-label="Bloque de tiempo para Leer"]');
check(await p.isVisible('.habit-block .block-add'), 'el bloque se pone ahí mismo');
await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/cal-02-habitos.png` });

check(errs.length === 0, `sin errores ${errs.join(' | ')}`);
await b.close();
