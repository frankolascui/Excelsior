// Inventario: cofre con congelados y «Ya usados» (devolver en 24 h) y trofeos de amigos.
// Uso: npm run build:single && node e2e/inventory.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const NOW = new Date('2026-11-20T18:00:00').getTime(); const H = 3_600_000; const DAY = 24 * H;
const buy = (id, name, icon, at, usedAt = null) => ({ id, rewardId: `r-${name}`, name, icon, cost: 25, at, usedAt });
const state = { version: 6, profile: { name: 'N', createdAt: NOW - 40 * DAY }, quests: [], habits: [], habitCompletions: [], sessions: [], activeTimer: null,
  kingdoms: [], goals: [], rewards: [], bosses: [],
  purchases: [
    buy('p1', 'Episodio de serie', 'film', NOW - 2 * DAY), buy('p2', 'Episodio de serie', 'film', NOW - DAY), buy('p3', 'Salir con amigos', 'beer', NOW - DAY),
    buy('u1', 'Pizza', 'pizza', NOW - 3 * DAY, NOW - 2 * H), buy('u2', 'Día libre', 'palm', NOW - 9 * DAY, NOW - 5 * DAY),
    { id: 's1', rewardId: 'streak-shield', name: 'Escudo de racha', icon: 'shield', cost: 150, at: NOW - DAY, usedAt: null },
  ],
  trophies: [
    { id: 't1', kind: 'friends', sourceId: 'friends-1', name: 'Primer aliado', icon: 'user-check', at: NOW - 6 * DAY, detail: 'Tu primer amigo en Excelsior', title: 'Leal' },
    { id: 't2', kind: 'friends', sourceId: 'friends-3', name: 'La compañía', icon: 'users', at: NOW - DAY, detail: '3 amigos en Excelsior', title: 'Camarada' },
    { id: 't3', kind: 'crown', sourceId: '2026-11-09', name: 'Corona de la semana', icon: 'crown', at: NOW - 4 * DAY, detail: 'Semana del 9 nov entre amigos', coins: 50, title: 'Corona de la semana' },
  ],
  title: 'Camarada',
  xp: [{ id: 'x', at: NOW - 20 * DAY, amount: 6000, source: 'quest', sourceId: 'old', label: 'Antes', attributes: { voluntad: 2 } }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], ascended: [] };
const b = await chromium.launch();
const errs = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
for (const [w, h, tag] of [[1280, 900, 'pc'], [390, 844, 'movil']]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' })).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: NOW });
  await p.goto(url);
  await p.evaluate(([st]) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, [JSON.stringify(state)]);
  await p.reload(); await p.waitForSelector('.nav, .mobile-nav, main');
  await p.evaluate(() => { location.hash = '#personaje'; });
  const inv = p.locator('.inventory');
  await inv.waitFor(); await inv.scrollIntoViewIfNeeded();
  if (tag === 'pc') {
    check(await inv.locator('.chest-item').count() === 2, 'cofre agrupa: 2 filas (serie ×2 y salir)');
    check((await inv.locator('.inv-shields').innerText()).includes('1 congelado'), 'enseña el congelado guardado');
    await inv.locator('.inv-used summary').click();
    check(await inv.locator('.inv-used li').count() === 2, '2 usados');
    check(await inv.locator('.inv-used button').count() === 1, 'solo el de hace 2 h se puede devolver');
    await inv.screenshot({ path: `${out}/inventario-cofre-${tag}.png` });
    await inv.locator('.inv-used button').click();
    const g = await p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));
    check(g.purchases.find((x) => x.id === 'u1').usedAt === null, 'devolver lo pone otra vez en el cofre');
    check(await inv.locator('.chest-item').count() === 3, 'ahora 3 filas en el cofre');
  } else {
    await inv.locator('.inv-used summary').click();
    await inv.screenshot({ path: `${out}/inventario-cofre-${tag}.png` });
  }
  await inv.locator('.inv-tabs button', { hasText: 'Trofeos' }).click();
  check(await inv.locator('.trophy.k-friends').count() === 2, 'trofeos de amigos visibles');
  check(await inv.locator('.title-opt', { hasText: 'Leal' }).count() === 1, 'título «Leal» elegible');
  await inv.screenshot({ path: `${out}/inventario-trofeos-${tag}.png` });
}
check(errs.length === 0, `sin errores de página ${errs.join(' | ')}`);
await b.close();
