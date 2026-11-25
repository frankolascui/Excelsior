// Reinos y Arena (2026-11-17): edificios por atributo y tamaño por impacto, tributo, monumentos, reino parado y bosses a tu ritmo.
// Uso: npm run build:single && node e2e/reinos.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-17T20:30:00').getTime(); const DAY = 86_400_000;
const q = (id, title, focus, impact, done, kingdomId = 'k1', type = { alto: 'main', medio: 'daily', bajo: 'side' }[impact]) => ({
  id, title, type, impact, ...(focus ? { focus } : {}), kingdomId, createdAt: NOW - 10 * DAY, completedAt: done ? NOW - 5 * DAY : null,
});
const quests = [
  q('a', 'Leer la documentación', 'sabiduria', 'alto', true),
  q('b', 'Programar el motor', 'maestria', 'medio', true),
  q('c', 'Reunión con el equipo', 'conexion', 'bajo', true),
  q('d', 'Publicar la beta', 'creacion', 'alto', true),
  q('e', 'Madrugar para escribir', 'voluntad', 'medio', true),
  q('f', 'Torreón antiguo', null, 'alto', true),
  q('g', 'Estudiar el tema 4', 'sabiduria', 'medio', false),
  q('h', 'Lanzar a usuarios', 'creacion', 'bajo', false),
  q('i', 'Proyecto viejo', 'maestria', 'medio', true, 'k2'),
];
Object.assign(quests[8], { createdAt: NOW - 35 * DAY, completedAt: NOW - 30 * DAY });
const xp = Array.from({ length: 14 }, (_, d) => ({ id: `x${d}`, at: NOW - (d + 1) * DAY, amount: 150, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 2 } }));
xp.push({ id: 'big', at: NOW - 60 * DAY, amount: 5000, source: 'quest', sourceId: 'oldbig', label: 'Antes', attributes: { voluntad: 2 } });
const state = { version: 6, profile: { name: 'N', createdAt: NOW - 90 * DAY }, quests, habits: [], habitCompletions: [], sessions: [], activeTimer: null,
  kingdoms: [{ id: 'k1', name: 'Reino del Juego', createdAt: NOW - 20 * DAY }, { id: 'k2', name: 'Reino Olvidado', createdAt: NOW - 40 * DAY }],
  goals: [], rewards: [], purchases: [], bosses: [], xp,
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] };
const b = await chromium.launch();
const errs = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
async function open(viewport, hash) {
  const p = await (await b.newContext({ viewport, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.clock.install({ time: NOW });
  await p.goto(url);
  await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); localStorage.setItem('excelsior:built-seen', JSON.stringify(['a','b','c','d','e','f','i'])); }, [JSON.stringify(state)]);
  await p.reload(); await p.waitForSelector('.nav');
  await p.evaluate((h) => { location.hash = h; }, hash);
  await p.waitForTimeout(500);
  return p;
}
const game = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));

const p = await open({ width: 1280, height: 900 }, '#reinos');
await p.screenshot({ path: `${out}/reinos-01-mapa.png` });
await p.click('.kingdom-pick >> text=Reino del Juego');
await p.waitForSelector('.city-scene');
const stage = await p.locator('.kingdom-stage').innerText();
check(stage.includes('tributo +60'), `tributo con 6 levantadas y 2 pendientes: «${stage}»`);
await p.click('.city-view >> text=Frontal').catch(() => {});
await p.waitForTimeout(400);
await p.locator('.city-scene').screenshot({ path: `${out}/reinos-02-frontal.png` });
await p.click('.city-view .seg >> nth=1');
await p.waitForTimeout(400);
await p.locator('.city-scene').screenshot({ path: `${out}/reinos-03-arriba.png` });
// Formulario: el edificio se propone por el nombre
await p.fill('#b-k1', 'Estudiar el capítulo 2');
check((await p.locator('.building-pick .seg.on').innerText()).includes('Biblioteca'), 'el nombre propone la biblioteca');
await p.locator('.kingdom .quick-add').first().screenshot({ path: `${out}/reinos-04-form.png` });
await p.click('.building-pick .seg >> text=Templo');
await p.click('.kingdom .quick-add button[type=submit]');
const added = (await game(p)).quests.at(-1);
check(added.focus === 'creacion' && added.kingdomId === 'k1', 'se crea con el atributo elegido (templo)');
check((await p.locator('.kingdom-stage').innerText()).includes('tributo +60'), 'añadir una pendiente no quita el tributo');
// Reino parado: aviso y cerrar como monumento
await p.click('.kingdom-tabs >> text=Reino Olvidado');
await p.waitForSelector('.kingdom-idle');
await p.screenshot({ path: `${out}/reinos-05-parado.png` });
await p.click('.kingdom-idle button');
await p.waitForSelector('[data-testid=sure-dialog]');
await p.screenshot({ path: `${out}/reinos-05b-confirmar.png` });
await p.click('[data-testid=sure-dialog] button[type=submit]');
await p.waitForSelector('.kingdom-monument');
check(!!(await game(p)).kingdoms.find((k) => k.id === 'k2').closedAt, 'el reino queda cerrado como monumento');
await p.screenshot({ path: `${out}/reinos-06-monumento.png` });
await p.click('text=Mapa del reino');
await p.waitForTimeout(400);
await p.locator('.realm').screenshot({ path: `${out}/reinos-07-mapa-monumento.png` });
// Reino con ciudades: fundar una ciudad dentro del reino, construir en ella y verla en el mapa del reino.
await p.click('.kingdom-pick >> text=Reino del Juego');
await p.waitForSelector('#new-city');
await p.fill('#new-city', 'Calculadora');
await p.click('.city-list button[type=submit]');
await p.waitForSelector('.kingdom-back >> text=Reino del Juego');
check((await p.locator('.kingdom-name').innerText()).includes('Calculadora'), 'la ciudad nueva se abre sola');
await p.fill('[id^="b-"]', 'Programar la suma');
await p.click('.kingdom .quick-add button[type=submit]');
const st = await game(p);
const city = st.kingdoms.find((k) => k.name === 'Calculadora');
check(city.parentId === 'k1' && st.quests.some((q) => q.kingdomId === city.id), 'la ciudad es del reino y tiene su construcción');
await p.click('.kingdom-back >> text=Reino del Juego');
await p.waitForSelector('.city-list');
check(await p.locator('.district-label:has-text("Calculadora")').count() === 1 && await p.locator('.realm-iso .district').count() === 2, 'el reino muestra su ciudad como un barrio del mapa (y el solar para fundar otra)');
check(await p.locator('.realm').count() === 0, 'dentro de un reino no hay otro mapa');
await p.locator('.realm-iso').screenshot({ path: `${out}/reinos-09-mapa-ciudades.png` });
await p.click('.district-label:has-text("Fundar ciudad")');
check(await p.evaluate(() => document.activeElement?.id) === 'new-city', 'el solar libre lleva a fundar una ciudad');
await p.click('.district-label:has-text("Calculadora")');
await p.waitForSelector('.kingdom-back');
check(await p.locator('.kingdom .kingdom-name').first().innerText().then((t) => t.includes('Calculadora')), 'pulsar un barrio abre su ciudad');
await p.click('.kingdom-back >> text=Reino del Juego');
await p.waitForSelector('.realm-iso');
await p.screenshot({ path: `${out}/reinos-10-reino.png`, fullPage: true });
await p.reload(); await p.waitForSelector('.nav');
const after = await game(p);
check(after.kingdoms.find((k) => k.id === 'k2').closedAt && after.kingdoms.find((k) => k.name === 'Calculadora').parentId === 'k1', 'al recargar se conservan el monumento y la ciudad');
// Arena: bosses a tu ritmo
await p.evaluate(() => { location.hash = '#arena'; });
await p.waitForSelector('.boss-template');
const stats = await p.locator('.boss-template:has-text("Hidra de la") .tpl-stats').first().innerText();
check(stats.includes('1170'), `la Hidra pide lo que sueles hacer en 7 días +20 % (13 días de 150 XP en la ventana): «${stats}»`);
await p.locator('.boss-template:has-text("Hidra de la")').first().screenshot({ path: `${out}/arena-01-ritmo.png` });
// Móvil
const m = await open({ width: 390, height: 844 }, '#reinos');
await m.click('.kingdom-pick >> text=Reino del Juego');
await m.waitForSelector('.city-scene');
await m.screenshot({ path: `${out}/reinos-08-movil.png`, fullPage: true });
check(errs.length === 0, `sin errores de consola${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
