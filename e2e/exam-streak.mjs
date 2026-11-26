// Simulacros y racha de Academy (V3.5): entregar un simulacro marca el hábito «Estudiar». Supabase simulado como academy.mjs.
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
  study_subjects: [{ id: 's1', user_id: ME, name: 'Matemáticas', color: '#a855f7', position: 0, level: 'equilibrado' }],
  study_topics: [{ id: 't1', subject_id: 's1', title: 'Derivadas', position: 0, exam_date: null }],
  study_cards: [card('c1', 't1', '¿Derivada de $x^2$?', '$2x$'), card('c2', 't1', '¿Derivada de $\\sin x$?', '$\\cos x$'), card('c3', 't1', 'Regla de la cadena', "$(f\\circ g)' = f'(g)\\,g'$", 0)],
  study_reviews: [], study_exam_dates: [], study_settings: [], study_pages: [], study_exams: [], nights: [], settings: [],
};

function filter(rows, params) {
  return rows.filter((r) => [...params].every(([k, v]) => {
    if (['select', 'on_conflict', 'order', 'limit', 'columns', 'offset'].includes(k)) return true;
    if (k === 'user_id' && !(k in r)) return true; // filas de prueba sin dueño: son tuyas
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
        const fresh = { id: `${table}-${rows.length + 1}`, created_at: iso(Date.now()), ...(table === "study_subjects" ? { user_id: ME } : {}), ...x };
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

const exam = (id, extra = {}) => ({ id, subject_id: 's1', title: `Simulacro ${id}`, statement: '1. Deriva $x^3$.', topic_ids: ['t1'], time_limit_min: null, answers: '', started_at: null, finished_at: null, duration_sec: null, correction: '', grade: null, created_at: iso(now - DAY), ...extra });
db.study_exams.push(exam('e1'), exam('e2'));
const studied = (g) => g.habitCompletions.filter((c) => c.habitId === 'sys-academy');

const page = await login({ width: 1280, height: 900 });
await page.evaluate(() => { location.hash = '#academy/a/s1/simulacros/e1'; });
await page.waitForSelector('.exam-start', { timeout: 8000 });
check(await page.isVisible('[data-testid="study-strip"]:has-text("simulacro")'), 'la franja dice que un simulacro también vale para el hábito');
let g = await game(page);
check(studied(g).length === 0 && g.habits.find((h) => h.id === 'sys-academy')?.name === 'Estudiar', 'el hábito se llama «Estudiar» y hoy aún no está');
await page.click('button:has-text("Empezar")');
await page.waitForSelector('#answers');
await page.fill('#answers', '1. 3x^2');
await page.click('.exam-bar button:has-text("Entregar")');
await page.click('.overlay button:has-text("Entregar"), [role=dialog] button:has-text("Entregar")');
await page.waitForTimeout(1500);
g = await game(page);
check(studied(g).length === 1, 'entregar el simulacro marca «Estudiar» (y la racha)');
check(await page.isVisible('[data-testid="study-strip"] .study-streak.on'), 'la racha de Academy se enciende');
await page.screenshot({ path: `${out}/exam-01-racha.png` });

await page.evaluate(() => { location.hash = '#academy/a/s1/simulacros/e2'; });
await page.waitForSelector('.exam-start', { timeout: 8000 });
await page.click('button:has-text("Ya lo he hecho en papel")');
await page.waitForTimeout(1200);
g = await game(page);
check(studied(g).length === 1, 'otro simulacro el mismo día no marca dos veces');
check(db.study_exams.find((x) => x.id === 'e2').finished_at, 'en papel queda como hecho');

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
