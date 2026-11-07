// Priorización estratégica: impacto, «Las 3 de hoy», limpieza, las de mañana y revisión semanal.
// Uso: npm run build:single && node e2e/priorities.mjs [carpeta de capturas]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

const NOW = new Date('2026-11-09T09:00:00').getTime(); // lunes
const DAY = 86_400_000;
const q = (id, title, type, daysAgo, extra = {}) => ({ id, title, type, createdAt: NOW - daysAgo * DAY, completedAt: null, ...extra });
const state = {
  version: 5,
  profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [
    q('q1', 'Terminar el tema 4 de cálculo', 'main', 3, { impact: 'alto' }),
    q('q2', 'Responder correos', 'daily', 1, { impact: 'bajo' }),
    q('q3', 'Preparar la presentación del proyecto', 'main', 5, { impact: 'alto', deadline: '2026-11-12' }),
    q('q4', 'Ordenar el escritorio', 'side', 20, { impact: 'bajo' }),
    q('q5', 'Ver el curso de Notion', 'side', 35),
    q('q6', 'Leer 20 páginas', 'daily', 2, { impact: 'medio' }),
  ],
  habits: [], habitCompletions: [], sessions: [], activeTimer: null, kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [],
  xp: [1, 2, 3, 4].map((d) => ({ id: `x${d}`, at: NOW - d * DAY, amount: 60, source: 'quest', sourceId: `old${d}`, label: 'Antes', attributes: { voluntad: 3 } })),
  tours: ['intro', 'reinos', 'arena', 'gremios'], newsSeen: '2.0', balance: 2, ascended: [],
  weeklyReviews: [{ week: '2026-10-26', at: NOW - 8 * DAY, change: 'Deep Work antes de mirar el móvil' }],
};

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  await page.goto(url);
  // la partida de prueba se siembra una sola vez (no en cada recarga)
  await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); }, JSON.stringify(state));
  await page.reload();
  await page.waitForSelector('.nav');
  return page;
}
/** Cierra la subida de nivel o un tutorial si han salido. */
async function calm(page) {
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    if (await page.isVisible('.levelup button.primary')) await page.click('.levelup button.primary');
    else if (await page.isVisible('.tour button:has-text("Saltar")')) await page.click('.tour button:has-text("Saltar")');
    else break;
  }
  // la subida de nivel puede llevar a una sección recién desbloqueada: volver a Hoy
  if (!(await page.isVisible('.top-three'))) await page.click('.nav-item:has-text("Hoy")');
}
const seen = (page, sel) => page.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);

const page = await open({ width: 1280, height: 900 });

// Revisión semanal en la crónica
check(await seen(page, '.chronicle'), 'el lunes sale la crónica de la semana');
await page.click('.chronicle button:has-text("Revisar la semana")');
check(await seen(page, '.weekly-review .wr-prev:has-text("Deep Work antes de mirar el móvil")'), 'pregunta si sirvió el cambio de la semana anterior');
await page.click('.wr-prev [role=radio]:has-text("A medias")');
await page.fill('#wr-worked', 'Estudiar por la mañana, antes de clase.');
await page.fill('#wr-failed', 'Perdí las tardes con el móvil.');
await page.fill('#wr-change', 'Móvil en otra habitación durante el foco');
await page.fill('#wr-focus', 'Dejar lista la presentación del proyecto');
await page.screenshot({ path: `${out}/p1-revision-semanal.png`, fullPage: true });
await page.click('.weekly-review button:has-text("Guardar la revisión")');
check(!(await page.isVisible('.chronicle')), 'guardar la revisión cierra la crónica');

// Las 3 de hoy
check(await seen(page, '.top-three button:has-text("Elegir las 3 de hoy")'), 'Hoy pide elegir las 3 de hoy');
check(await seen(page, '.top-three .top3-change:has-text("Dejar lista la presentación")'), 'muestra lo importante de la semana');
check(await seen(page, '.top-three .top3-change:has-text("Móvil en otra habitación")'), 'muestra el cambio que pruebas esta semana');
await page.click('.top-three button:has-text("Elegir las 3 de hoy")');
const first = await page.textContent('.prio-options li:first-child .prio-title');
check(first.includes('Terminar el tema 4') || first.includes('Preparar la presentación'), 'las candidatas salen por impacto');
await page.click('.prio-option:has-text("Preparar la presentación")');
await page.click('.prio-option:has-text("Terminar el tema 4")');
await page.click('.prio-option:has-text("Leer 20 páginas")');
check(await page.isDisabled('.prio-option:has-text("Responder correos")'), 'no deja elegir más de 3');
await page.click('.top-three button:has-text("Fijar prioridades")');
check(await seen(page, '.top3-list li:has-text("Preparar la presentación")'), 'las 3 quedan fijadas');
const now = await page.textContent('.now h2');
check(now.includes('Preparar la presentación') || now.includes('Terminar el tema 4'), '«¿Qué hago ahora?» propone una de las 3, la de más impacto');
check(await seen(page, '.now .prio-tag'), 'y dice que es prioridad de hoy');
await page.screenshot({ path: `${out}/p2-las-3-de-hoy.png`, fullPage: true });

// Bonus al cerrar las tres
await page.click('.top3-list li:has-text("Leer 20 páginas") button.check');
await calm(page);
await page.click('.top3-list li:has-text("Terminar el tema 4") button.check');
await calm(page);
await page.click('.top3-list li:has-text("Preparar la presentación") button.check');
await calm(page);
check(await seen(page, '.top-three:has-text("Las tres hechas")'), 'cerrar las tres lo celebra con el bonus');

// Misiones: impacto y limpieza
await page.click('.nav-item:has-text("Misiones")');
if (await page.isVisible('.calendar')) await page.click('[role=radio]:has-text("Lista")');
check(await seen(page, '.cleanup .cleanup-item:has-text("Ordenar el escritorio")'), 'limpieza: impacto bajo con más de 14 días');
check(await seen(page, '.cleanup .cleanup-item:has-text("Ver el curso de Notion")'), 'limpieza: sin impacto con más de 30 días');
check(!(await page.isVisible('.cleanup .cleanup-item:has-text("Responder correos")')), 'lo bajo pero reciente no sale');
await page.fill('#new-quest', 'Llamar al tutor del TFG');
await page.click('#new-quest-impact');
await page.click('.pop-impact-opt:has-text("Alto")');
await page.screenshot({ path: `${out}/p3-impacto-al-crear.png` });
await page.click('.quick-add button:has-text("Crear")');
check(await seen(page, '.item:has-text("Llamar al tutor") .impact-tag.imp-alto'), 'la misión nueva lleva su impacto');
await page.screenshot({ path: `${out}/p4-misiones-limpieza.png`, fullPage: true });
await page.click('.cleanup-item:has-text("Ver el curso de Notion") button:has-text("Eliminar")');
check(!(await page.isVisible('.item:has-text("Ver el curso de Notion")')), 'eliminar la quita');
await page.click('.cleanup-item:has-text("Ordenar el escritorio") button:has-text("Posponer")');
check(!(await page.isVisible('.cleanup')), 'posponer la quita de la limpieza');

// Cierre del día: las 3 de mañana
await page.click('.nav-item:has-text("Hoy")');
await page.click('.dayclose-folded button:has-text("Hacerlo ahora")');
await page.fill('#day-advanced', 'Presentación terminada.');
await page.click('.tomorrow button:has-text("Elegir")');
await page.click('.tomorrow .prio-option:has-text("Llamar al tutor")');
await page.click('.tomorrow button:has-text("Fijar prioridades")');
check(await seen(page, '.tomorrow-list li:has-text("Llamar al tutor")'), 'las de mañana quedan elegidas');
await page.click('.day-close button:has-text("Guardar el día")');
await page.locator('.day-close').screenshot({ path: `${out}/p5-cierre-manana.png` });
await page.clock.fastForward('24:00:00');
await page.reload();
await page.waitForSelector('.nav');
const nextDay = await seen(page, '.top3-list li:has-text("Llamar al tutor")');
check(nextDay, 'al día siguiente ya están en Las 3 de hoy');

// Móvil
const m = await open({ width: 390, height: 844 });
await m.click('.chronicle button:has-text("Entendido")').catch(() => {});
await m.click('.top-three button:has-text("Elegir las 3 de hoy")');
await m.screenshot({ path: `${out}/p6-movil.png`, fullPage: false });

check(errors.length === 0, `sin errores en consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
