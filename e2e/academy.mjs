// Academy dentro de Deep Work (V3) contra un Supabase simulado: cola, repaso, XP, hábito, añadir tarjetas. También Salud con cuenta.
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
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
check((await page.locator('[data-testid="academy-panel"]').boundingBox()).width > 900, 'Academy usa todo el ancho en escritorio');
check(page.url().includes('#academy'), 'la pestaña Academy tiene su dirección (#academy)');
check(await page.isVisible('[data-testid="study-strip"]'), 'encima, la franja del juego: racha y hábito');
check(await page.isVisible('.today-num:has-text("3 tarjetas")'), 'la estantería dice cuántas tocan hoy (repaso y nuevas)');
let g = await game(page);
check(g.habits.some((h) => h.system === 'academy'), 'abrir Academy con cuenta crea el hábito «Repasar las tarjetas»');
await page.screenshot({ path: `${out}/academy-01-inicio.png` });

await page.click('.today a:has-text("Repasar todo")');
await page.waitForSelector('.flashcard .katex', { timeout: 8000 });
check(true, 'las fórmulas se pintan con KaTeX');
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForSelector('.grades');
  if (i === 0) await page.screenshot({ path: `${out}/academy-02-tarjeta.png` });
  await page.keyboard.press('4'); // Fácil: no vuelve hoy
}
await page.waitForSelector('.review-done', { timeout: 5000 });
await page.waitForTimeout(800);
g = await game(page);
check(db.study_reviews.length === 3, 'cada respuesta se guarda en study_reviews');
check(db.study_cards.every((c) => c.state !== 0 && c.due > iso(Date.now())), 'las tarjetas se reprograman con FSRS');
const s = g.sessions.find((x) => x.study);
check(s && s.area === 'estudio' && s.study.cards === 3 && s.study.cleared, 'el repaso se guarda como Deep Work de estudio');
check(g.habitCompletions.some((c) => c.habitId === 'sys-academy'), 'vaciar la cola marca el hábito del día');
check(g.xp.some((t) => t.sourceId.startsWith('study-clear:')), 'y da el bonus de cola vacía');
check(await page.isVisible('[data-testid="study-strip"]:has-text("Hábito de hoy cumplido")'), 'la franja lo celebra');
await page.screenshot({ path: `${out}/academy-03-hecho.png` });

// La carpeta de la asignatura, las estadísticas y el ajuste de FSRS: Academy entera, sin salir del juego.
await page.click('.review-done a:has-text("Volver")');
await page.click('.binder-cover:has-text("Matemáticas")');
await page.waitForSelector('text=Derivadas', { timeout: 5000 });
check(page.url().includes('#academy/a/s1'), 'la carpeta de la asignatura se abre dentro de Deep Work');
await page.screenshot({ path: `${out}/academy-05-carpeta.png` });
await page.goBack();
await page.waitForSelector('.shelf', { timeout: 5000 });
check(true, '«atrás» del navegador vuelve a la estantería');
await page.evaluate(() => { location.hash = '#academy/estadisticas'; });
await page.waitForSelector('.acad h1:has-text("Estadísticas"), .acad .section-title', { timeout: 5000 });
await page.screenshot({ path: `${out}/academy-06-estadisticas.png` });
await page.evaluate(() => { location.hash = '#academy/ajustar'; });
await page.waitForSelector('.tune', { timeout: 5000 });
check(await page.isVisible('.tune-wait:has-text("Aún es pronto")'), 'ajustar FSRS espera a tener historial');
await page.evaluate(() => { location.hash = '#hoy'; });
await page.waitForSelector('text=¿Qué hago ahora?');
check(true, 'salir de Academy a otra pestaña funciona');

// Reino de la Salud con cuenta: la noche sube a health.nights.
await page.evaluate(() => { location.hash = '#reinos'; });
await page.click('[data-testid="open-health"]');
await page.click('[data-testid="found-health"]');
await page.fill('#night-cama', '23:00');
await page.fill('#night-levantado', '07:00');
await page.fill('#night-h', '7');
await page.click('button:has-text("Apuntar la noche")');
await page.waitForTimeout(2500);
check(db.nights.length === 1 && db.nights[0].data.percibido.cama === '23:00', 'con cuenta, la noche se sube a la tabla de Health');

const m = await login({ width: 390, height: 844 });
await m.evaluate(() => { location.hash = '#deepwork'; });
await m.click('[data-testid="tab-academy"]');
await m.waitForSelector('[data-testid="academy-panel"]');
await m.waitForTimeout(800);
check(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'móvil: Academy sin scroll horizontal');
await m.screenshot({ path: `${out}/academy-04-movil.png`, fullPage: true });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
