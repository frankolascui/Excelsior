// Escalera de hábitos: crearla, la regla del 80 % al cambiar de semana (repite o sube) y cómo se ve en móvil.
// Uso: npm run build:single && node e2e/ladder.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const DAY = 86_400_000;
const MON = new Date('2026-11-23T19:00:00').getTime(); // lunes
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
  await p.evaluate(() => { location.hash = '#habitos'; });
  await p.waitForSelector('.ladder');
  return p;
}
const game = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));

// 1) Crear la escalera
let p = await open(state(), MON);
await p.getByRole('button', { name: 'Crear mi escalera' }).click();
await p.getByLabel('Hábito del escalón 1').fill('Escribir diario');
await p.getByLabel('Mínimo del escalón 1').fill('3 líneas');
await p.getByRole('button', { name: 'Consolidar', exact: true }).click();
await p.getByRole('button', { name: 'Hábito nuevo', exact: true }).click();
await p.getByLabel('Hábito del escalón 3').fill('Hablar con un desconocido');
await p.getByRole('button', { name: 'Auditoría', exact: true }).click();
await p.locator('[data-testid="ladder-editor"]').screenshot({ path: `${out}/ladder-01-editor.png` });
await p.getByRole('button', { name: 'Empezar la escalera' }).click();
await p.waitForSelector('[data-testid="ladder"]');
let g = await game(p);
check(g.ladder?.current === 0 && g.ladder.steps.length === 4, 'escalera creada en el escalón 1');
check(g.habits.some((h) => h.name === 'Escribir diario' && h.minimum === '3 líneas' && h.id.startsWith('ladder-')), 'entra el hábito del escalón 1 con su mínimo');

// 2) Semana siguiente: un hábito por debajo del 80 % → repite
const ladder = { ...g.ladder };
const comps = (ids, days) => ids.flatMap((id) => days.map((n) => ({ id: `${id}-${n}`, habitId: id, day: key(MON + n * DAY), at: MON + n * DAY })));
const diario = g.habits.find((h) => h.name === 'Escribir diario');
const week1 = state({ ladder, habits: g.habits, habitCompletions: [...comps(['h1'], [0, 1, 2, 3, 4, 5, 6]), ...comps(['h2'], [0, 2, 4]), ...comps([diario.id], [0, 1, 2, 3])] });
p = await open(week1, MON + 7 * DAY);
await p.waitForTimeout(300);
g = await game(p);
check(g.ladder.current === 0 && g.ladder.log.at(-1).result === 'repeat', 'con «Escribir diario» al 57 % se repite la semana');
check((await p.locator('[data-testid="ladder-last"]').innerText()).includes('Escribir diario'), 'dice qué hábito quedó por debajo');
await p.locator('[data-testid="ladder"]').screenshot({ path: `${out}/ladder-02-repite.png` });

// 3) Todo al 80 % → sube y, al pasar consolidar, entra el siguiente
const week1ok = { ...week1, habitCompletions: [...week1.habitCompletions, ...comps([diario.id], [4, 5])] };
p = await open(week1ok, MON + 7 * DAY);
await p.waitForTimeout(300);
g = await game(p);
check(g.ladder.current === 1 && g.ladder.log.at(-1).result === 'up', 'con todo ≥ 80 % sube a consolidar');
// marca algo de esta semana para ver las barras en vivo
const live = { ...g, habitCompletions: [...g.habitCompletions, ...comps(['h1', diario.id], [7, 8, 9]), ...comps(['h2'], [8])] };
p = await open(live, MON + 10 * DAY);
await p.locator('.ladder-plan summary').click();
await p.locator('[data-testid="ladder"]').screenshot({ path: `${out}/ladder-03-sube.png` });
const mob = await open(live, MON + 10 * DAY, { width: 390, height: 844 });
await mob.locator('.ladder-plan summary').click();
await mob.locator('[data-testid="ladder"]').screenshot({ path: `${out}/ladder-04-movil.png` });
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check(!overflow, 'sin scroll horizontal en móvil');
const week2ok = { ...live, habitCompletions: [...live.habitCompletions, ...comps(['h1', diario.id], [10, 11, 12, 13]), ...comps(['h2'], [10, 12])] };
p = await open(week2ok, MON + 14 * DAY);
await p.waitForTimeout(300);
g = await game(p);
check(g.ladder.current === 2 && g.habits.some((h) => h.name === 'Hablar con un desconocido'), 'tras consolidar entra «Hablar con un desconocido»');
check(errs.length === 0, `sin errores ${errs.join(' | ')}`);
await b.close();
