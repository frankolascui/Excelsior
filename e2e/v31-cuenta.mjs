// V3.1 con cuenta (Supabase simulado): Academy con el tema, botones del repaso, «Cambiar la anterior», distracción al terminar y novedades: cola, repaso, XP, hábito, añadir tarjetas. También Salud con cuenta.
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const THEME = process.argv[3] ?? 'gaia';
const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const ME = '11111111-1111-1111-1111-111111111111';
const USER = { id: ME, email: 'nico@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const DAY = 86_400_000;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const version = readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const state = {
  version: 6, profile: { name: 'Nicolas', createdAt: now - 30 * DAY }, quests: [], habits: [], habitCompletions: [], sessions: [], activeTimer: null,
  kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [], xp: [{ id: 'old', at: now - 5 * DAY, amount: 500, source: 'quest', sourceId: 'o', label: 'x', attributes: {} }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: version,
};
const card = (id, topic, front, back, st = 2) => ({
  id, topic_id: topic, front, back, due: iso(st ? now - DAY : now), stability: st ? 3 : 0, difficulty: st ? 5 : 0, elapsed_days: st ? 3 : 0, scheduled_days: st ? 3 : 0,
  learning_steps: 0, reps: st ? 2 : 0, lapses: 0, state: st, last_review: st ? iso(now - 4 * DAY) : null, created_at: iso(now - 10 * DAY), suspended: false, note_key: null,
});
const db = {
  saves: { user_id: ME, state, updated_at: iso(now) },
  study_subjects: [{ id: 's1', name: 'Matemáticas', color: '#a855f7', position: 0, level: 'equilibrado' }],
  study_topics: [{ id: 't1', subject_id: 's1', title: 'Derivadas', position: 0, exam_date: null }],
  study_cards: [card('c1', 't1', '¿Derivada de $x^2$?', '$2x$'), card('c2', 't1', '¿Derivada de $\\sin x$?', '$\\cos x$'), card('c3', 't1', 'Regla de la cadena', "$(f\\circ g)' = f'(g)\\,g'$", 0)],
  study_reviews: [], study_exam_dates: [], study_settings: [], study_pages: [], study_exams: [], nights: [], settings: [],
};

function filter(rows, params) {
  return rows.filter((r) => [...params].every(([k, v]) => {
    if (['select', 'on_conflict', 'order', 'limit', 'columns', 'offset'].includes(k)) return true;
    const [op, ...rest] = v.split('.');
    const arg = rest.join('.');
    if (op === 'eq') return String(r[k]) === arg;
    if (op === 'neq') return String(r[k]) !== arg;
    if (op === 'lte') return String(r[k]) <= arg;
    if (op === 'gte' || op === 'gt') return String(r[k]) >= arg;
    if (op === 'in') return arg.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(r[k]));
    return true;
  }));
}

async function fake(ctx) {
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const one = (r.headers().accept ?? '').includes('pgrst.object');
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = (rows) => json(200, one ? rows[0] ?? null : rows);
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'saves') {
      if (r.method() === 'GET') return out(db.saves ? [db.saves] : []);
      const b = r.postDataJSON();
      const row = Array.isArray(b) ? b[0] : b;
      db.saves = { ...db.saves, ...row };
      return json(200, [{ updated_at: db.saves.updated_at }]);
    }
    const rows = db[table];
    if (!rows) return r.method() === 'GET' ? out([]) : (table.startsWith('rpc/') ? json(200, []) : json(201, []));
    if (r.method() === 'GET') return out(filter(rows, u.searchParams));
    if (r.method() === 'POST') {
      const b = r.postDataJSON();
      const added = (Array.isArray(b) ? b : [b]).map((x) => {
        const fresh = { id: `${table}-${rows.length + 1}`, created_at: iso(Date.now()), ...x };
        if (table === 'study_cards') Object.assign(fresh, { ...card(fresh.id, x.topic_id, x.front, x.back, 0), ...x });
        if (table === 'nights' || table === 'settings') fresh.updated_at = iso(Date.now());
        const at = table === 'nights' ? rows.findIndex((y) => y.fecha === x.fecha) : -1;
        if (at >= 0) rows[at] = fresh; else rows.push(fresh);
        return fresh;
      });
      return json(201, one ? added[0] : added);
    }
    if (r.method() === 'PATCH') {
      filter(rows, u.searchParams).forEach((x) => Object.assign(x, r.postDataJSON()));
      return route.fulfill({ status: 204, headers: cors });
    }
    return route.fulfill({ status: 204, headers: cors });
  });
}

async function login(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await fake(ctx);
  const page = await ctx.newPage();
  await page.addInitScript((THEME) => { try { if (!localStorage.getItem('excelsior:theme')) localStorage.setItem('excelsior:theme', JSON.stringify({ id: THEME })); } catch {} }, THEME);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
  await page.clock.install();
  await page.goto(url);
  await page.fill('#login-email', 'nico@test.com');
  await page.click('text=Enviarme un código');
  await page.fill('#login-code', '123456');
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector('text=¿Qué hago ahora?', { timeout: 8000 });
  return page;
}
const game = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')));

const page = await login({ width: 1280, height: 900 });
await page.evaluate(() => { location.hash = '#deepwork'; });
await page.click('[data-testid="tab-academy"]');
await page.waitForSelector('[data-testid="academy-panel"] .shelf', { timeout: 8000 });
await page.waitForTimeout(1200);
check(await page.evaluate(() => getComputedStyle(document.querySelector('.acad')).getPropertyValue('--c1').trim()) === (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c1').trim())), `Academy usa el color del tema (${THEME})`);
await page.screenshot({ path: `${out}/v31-academy-tema.png` });
await page.click('.today a:has-text("Repasar todo")');
await page.waitForSelector('.flashcard .katex', { timeout: 8000 });
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForSelector('.grades');
await page.waitForTimeout(400);
const whens = await page.locator('.grade .when').allTextContents();
check(new Set(whens).size === 4, `los 4 botones con intervalos distintos (${whens.join(' / ')})`);
await page.screenshot({ path: `${out}/v31-academy-botones.png` });
await page.keyboard.press('3');
await page.waitForTimeout(400);
check(await page.isVisible('.reveal-row button:has-text("Cambiar la anterior")'), '«Cambiar la anterior» junto a «Mostrar respuesta»');
const btn = await page.evaluate(() => {
  const r = document.querySelector('.reveal-row .reveal'), c = document.querySelector('.reveal-row .change-answer'), f = document.querySelector('.flashcard');
  return { ink: getComputedStyle(r).color, want: getComputedStyle(document.documentElement).getPropertyValue('--on-btn').trim(), h: r.getBoundingClientRect().height, hc: c.getBoundingClientRect().height, card: f.getBoundingClientRect().height };
});
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
check(btn.ink === rgb(btn.want), `Academy: texto del botón principal igual que en el resto de la app (${btn.ink} = ${btn.want})`);
check(btn.h <= 42 && btn.hc <= 42, `Mostrar/Cambiar respuesta de tamaño normal (${btn.h}/${btn.hc} px)`);
check(btn.card >= 320, `la tarjeta es grande (${btn.card} px)`);
await page.screenshot({ path: `${out}/v31-academy-cambiar.png` });
await page.click('.reveal-row button:has-text("Cambiar la anterior")');
await page.waitForTimeout(400);
check(await page.isVisible('.grades'), 'vuelve a la tarjeta anterior con la respuesta a la vista');
await page.keyboard.press('4');

// Minutos al día: se eligen en «Hoy» de la estantería y se guardan en la partida.
await page.evaluate(() => { location.hash = '#academy/'; });
await page.waitForSelector('[data-testid="academy-budget"]', { timeout: 8000 });
await page.click('[data-testid="academy-budget"] button:has-text("Ponte minutos al día")');
await page.click('[data-testid="academy-budget"] .budget-chips button:has-text("10 min")');
await page.waitForTimeout(800);
check(await page.isVisible('[data-testid="academy-budget"]:has-text("de tus 10 min")'), 'Academy: minutos al día con la estimación de hoy');
check((await game(page)).academyBudgetMin === 10, 'los minutos al día se guardan en la partida');
await page.screenshot({ path: `${out}/v31b-academy-minutos.png` });

// Bandeja de revisión: lo pegado no entra al repaso hasta aprobarlo.
await page.evaluate(() => { location.hash = '#academy/a/s1/t/t1'; });
await page.click('.mode-tabs button:has-text("Tarjetas")');
await page.waitForSelector('.review-cta');
const before = db.study_cards.length;
await page.click('.review-cta button:has-text("Importar")');
await page.fill('.modal textarea', '¿Derivada de x^2?;2x\n¿Qué es una derivada?;La pendiente de la tangente\n¿Integral de 1/x?;ln|x| + C');
await page.click('.modal button.primary:has-text("bandeja")');
await page.waitForSelector('[data-testid="draft-tray"]');
check(db.study_cards.length === before, 'lo pegado va a la bandeja: aún no hay tarjetas nuevas en el repaso');
check(await page.isVisible('.draft .draft-flag:has-text("ya existe")'), 'la bandeja avisa de una duplicada');
await page.screenshot({ path: `${out}/v31b-bandeja.png` });
await page.click('[data-testid="draft-tray"] .draft-tray-head button.primary');
await page.waitForTimeout(800);
check(db.study_cards.length === before + 2, `aprobar mete solo las que no tienen aviso (${db.study_cards.length - before})`);
check(await page.isVisible('[data-testid="draft-tray"]'), 'la duplicada se queda en la bandeja para que decidas');

// Deep Work: pregunta de distracción y valoración al terminar.
await page.evaluate(() => { location.hash = '#deepwork'; });
await page.click('[data-testid="tab-focus"], .deep-tabs-row button:has-text("Foco")').catch(() => {});
await page.waitForTimeout(500);
await page.fill('#dw-intent', 'Ejercicios de derivadas');
await page.click('button.mode-card:has-text("Sesión libre")');
await page.waitForTimeout(500);
check(!(await page.isVisible('button:has-text("Me distraje")')), 'sin «Me distraje» durante la sesión');
await page.clock.fastForward('52:00');
await page.waitForTimeout(500);
await page.click('text=Terminar sesión');
await page.waitForTimeout(600);
if (await page.isVisible('.levelup')) await page.click('.levelup button.primary');
await page.waitForSelector('#rate-h', { timeout: 5000 });
await page.click('[aria-labelledby="rate-h"] .rate-chips button:has-text("10 min")');
await page.click('[aria-labelledby="rate-h"] [aria-label="Rendimiento"] [aria-label^="5"]');
await page.click('[aria-labelledby="rate-h"] [aria-label="Sentido"] [aria-label^="5"]');
await page.click('[aria-labelledby="rate-h"] [aria-label="Mentalidad"] [aria-label^="4"]');
await page.waitForTimeout(400);
check(await page.isVisible('[aria-labelledby="rate-h"] .rate-foot:has-text("0,7 h productivas de 0,7 h")'), 'con 5 en rendimiento y sentido, horas productivas = tiempo real');
await page.screenshot({ path: `${out}/v31-deepwork-terminar.png` });
await page.click('[aria-labelledby="rate-h"] button:has-text("Listo")');
await page.click('.nav .version-btn');
await page.waitForSelector('.news-center');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/v31-novedades.png` });

const m = await login({ width: 390, height: 844 });
await m.evaluate(() => { location.hash = '#academy/repasar'; });
await m.waitForSelector('.flashcard', { timeout: 8000 });
await m.waitForTimeout(500);
await m.click('.reveal');
await m.waitForTimeout(400);
await m.screenshot({ path: `${out}/v31-academy-movil.png` });
check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
