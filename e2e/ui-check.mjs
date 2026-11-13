// Revisión de interfaz: errores de consola, scroll horizontal, botones cortados o partidos en dos líneas (PC, tablet y móvil).
// Uso: npm run build:single && STATE="$(json de partida)" node e2e/ui-check.mjs  (sin STATE prueba una partida nueva).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const state = JSON.parse(process.env.STATE ?? 'null');
const tabs = ['hoy', 'misiones', 'habitos', 'deepwork', 'reinos', 'arena', 'amigos', 'gremios', 'personaje', 'ajustes'];
const browser = await chromium.launch();
for (const [name, vp] of [['pc', { width: 1440, height: 900 }], ['movil', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1000 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  await page.goto(url);
  if (state) await page.evaluate((st) => { localStorage.setItem('excelsior:v1', st); localStorage.setItem('excelsior:guest', '1'); localStorage.setItem('excelsior:chronicle-seen', '2026-11-03'); }, JSON.stringify(state));
  for (const t of tabs) {
    await page.goto(`${url}#${t}`); await page.reload(); await page.waitForTimeout(700);
    for (let i = 0; i < 3; i++) { const b = await page.$('.overlay button.primary, .tour button:has-text("Saltar")'); if (b) { await b.click().catch(() => {}); await page.waitForTimeout(300); } }
    const r = await page.evaluate(() => {
      const out = [];
      const W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > W + 1) out.push('scroll horizontal ' + document.documentElement.scrollWidth);
      for (const b of document.querySelectorAll('button, a')) {
        const rc = b.getBoundingClientRect(); if (!rc.width) continue;
        if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') out.push('cortado: ' + (b.textContent || b.getAttribute('aria-label')).trim().slice(0, 40) + ` (${b.scrollWidth}>${b.clientWidth})`);
        if (rc.right > W + 1) out.push('fuera: ' + (b.textContent || '').trim().slice(0, 40));
        if (b.matches('.primary,.secondary,.ghost,.link')) {
          const tops = new Set();
          const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode(); n; n = tw.nextNode()) {
            if (!n.textContent.trim()) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const x of rg.getClientRects()) if (x.width > 2) tops.add(Math.round(x.top));
          }
          const ys = [...tops].sort((a, c) => a - c); const lines = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 6).length;
          tops.clear(); for (let i = 0; i < lines; i++) tops.add(i);
          if (tops.size > 1) out.push('2 líneas: ' + b.textContent.trim().slice(0, 40));
        }
      }
      return out;
    });
    if (r.length) console.log(name, t, JSON.stringify([...new Set(r)]));
  }
  if (errs.length) console.log(name, 'ERRORES', [...new Set(errs)]);
  await ctx.close();
}
await browser.close();
