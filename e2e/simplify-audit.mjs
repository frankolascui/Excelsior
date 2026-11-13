// Auditoría de simplificación: partida realista, mide cada pantalla (alto, botones, paneles) en PC y móvil.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2];
const NOW = new Date('2026-11-10T09:00:00').getTime(); // martes
const DAY = 86_400_000;
const dk = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const habits = ['Entrenar', 'Leer 20 min', 'Meditar', 'Dormir antes de las 23', 'Inglés'].map((n, i) => ({ id: `h${i}`, name: n, frequency: 'daily', createdAt: NOW - 40 * DAY, rewards: { voluntad: 3 } }));
const habitCompletions = []; const xp = []; const sessions = [];
for (let d = 1; d <= 30; d++) {
  habits.forEach((h, i) => { if ((d + i) % 4 !== 0) { const id = `c${d}${i}`; habitCompletions.push({ id, habitId: h.id, day: dk(NOW - d * DAY), at: NOW - d * DAY }); xp.push({ id: `xh${id}`, at: NOW - d * DAY, amount: 10, source: 'habit', sourceId: id, label: h.name, attributes: { voluntad: 3 } }); } });
  const sid = `s${d}`; const start = NOW - d * DAY + 3600_000;
  sessions.push({ id: sid, questId: null, label: 'Estudiar cálculo', area: 'estudio', startedAt: start, endedAt: start + 90 * 60_000, minutes: 85, focusPct: 92, rating: { performance: 4, mindset: 4 } });
  xp.push({ id: `xs${sid}`, at: start + 90 * 60_000, amount: 85, source: 'deepwork', sourceId: sid, label: 'Estudiar cálculo', attributes: { voluntad: 20, sabiduria: 40 } });
}
const q = (id, title, type, extra = {}) => ({ id, title, type, createdAt: NOW - 3 * DAY, completedAt: null, ...extra });
const state = {
  version: 5, profile: { name: 'Nicolas', createdAt: NOW - 40 * DAY },
  quests: [
    q('q1', 'Terminar el tema 4 de cálculo', 'main', { impact: 'alto', deadline: dk(NOW + 2 * DAY) }),
    q('q2', 'Preparar la presentación del proyecto', 'main', { impact: 'alto' }),
    q('q3', 'Responder correos', 'daily', { impact: 'bajo' }),
    q('q4', 'Leer 20 páginas', 'daily', { impact: 'medio' }),
    q('q5', 'Llamar al banco', 'side'),
    q('q6', 'Diseñar la pantalla de login', 'main', { kingdomId: 'k1' }),
    q('q7', 'Configurar Supabase', 'main', { kingdomId: 'k1', completedAt: NOW - 5 * DAY }),
  ],
  habits, habitCompletions, sessions, xp, activeTimer: null,
  kingdoms: [{ id: 'k1', name: 'Reino de la App', createdAt: NOW - 20 * DAY }], goals: [], rewards: [], purchases: [], bosses: [],
  events: [{ id: 'e1', title: 'Examen de cálculo', day: dk(NOW + 3 * DAY), time: '10:00', kind: 'examen', createdAt: NOW - 5 * DAY }],
  reminders: [{ id: 'r1', title: 'Comprar la cena', day: dk(NOW), createdAt: NOW - DAY }],
  priorities: [{ day: dk(NOW), ids: ['q1', 'q2', 'q4'] }],
  weeklyReviews: [{ week: '2026-11-02', at: NOW - DAY, change: 'Móvil fuera durante el foco', focus: 'Aprobar cálculo' }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: '3.0', balance: 2, ascended: ['aprendiz'],
};
const browser = await chromium.launch();
const tabs = ['hoy', 'misiones', 'habitos', 'deepwork', 'reinos', 'arena', 'amigos', 'gremios', 'personaje', 'ajustes'];
for (const [name, vp] of [['pc', { width: 1440, height: 900 }], ['movil', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); localStorage.setItem('excelsior:chronicle-seen', '2026-11-03'); }, JSON.stringify(state));
  for (const t of tabs) {
    await page.goto(`${url}#${t}`); await page.reload(); await page.waitForTimeout(900);
    for (let i = 0; i < 3; i++) { const b = await page.$('.overlay button.primary, .tour button:has-text("Saltar")'); if (b) { await b.click().catch(() => {}); await page.waitForTimeout(300); } }
    const m = await page.evaluate(() => {
      const main = document.querySelector('.screen') ?? document.body;
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return {
        alto: Math.round(document.documentElement.scrollHeight),
        botones: [...main.querySelectorAll('button, input, textarea, select, a')].filter(vis).length,
        paneles: [...main.querySelectorAll('.panel, section')].filter(vis).length,
        titulos: [...main.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.textContent.trim().slice(0, 40)),
      };
    });
    console.log(JSON.stringify({ vista: name, tab: t, ...m }));
    await page.screenshot({ path: `${out}/${name}-${t}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
