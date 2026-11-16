// Modo admin + Academy: se ven tus tarjetas reales y se puede repasar para probar, sin guardar nada en la cuenta. Supabase simulado.
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const browser = await chromium.launch();
const errors = [];
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const ME = '11111111-1111-1111-1111-111111111111';
const EMAIL = process.env.TEST_ACCOUNT ? 'nico+pruebas@test.com' : 'nico@test.com'; // TEST_ACCOUNT=1: cuenta de pruebas (email con «+»)
const USER = { id: ME, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
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

let admin = false;
const writes = [];
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
    if (r.method() !== 'GET' && u.pathname.startsWith('/rest/v1/') && admin && !u.pathname.endsWith('rpc/recommended_friends')) writes.push(`${r.method()} ${u.pathname.replace('/rest/v1/', '')}`);
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
  await page.fill('#login-email', EMAIL);
  await page.click('text=Enviarme un código');
  await page.fill('#login-code', '123456');
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector('text=¿Qué hago ahora?', { timeout: 8000 });
  return page;
}

const page = await login({ width: 1280, height: 900 });
await page.waitForTimeout(5000); // deja terminar lo que publica la cuenta real
const cardsBefore = JSON.stringify(db.study_cards);
admin = true;
await page.evaluate(() => { localStorage.setItem('excelsior:admin-mode', '1'); location.reload(); });
await page.waitForTimeout(1500);
if (await page.isVisible('#hero-name').catch(() => false)) {
  await page.fill('#hero-name', 'Prueba admin');
  await page.click('text=Crear personaje');
}
for (let i = 0; i < 4; i++) {
  const b = page.locator('.tour button:has-text("Saltar"), .levelup button.primary').first();
  if (await b.isVisible().catch(() => false)) await b.click(); else break;
  await page.waitForTimeout(300);
}
await page.evaluate(() => { location.hash = '#deepwork'; });
await page.click('[data-testid="tab-academy"]');
await page.waitForSelector('[data-testid="academy-panel"] .shelf', { timeout: 8000 });
if (process.env.TEST_ACCOUNT) {
  // Con una cuenta de pruebas el modo admin sí guarda: es otra cuenta, no la real.
  check(!(await page.isVisible('[data-testid="academy-panel"] .admin-note')), 'cuenta de pruebas: sin aviso de solo lectura');
  check((await page.locator('[data-testid="admin-account"]').innerText()).includes('cuenta de pruebas'), 'cuenta de pruebas: la barra de admin lo dice');
  await page.click('.today a:has-text("Repasar todo")');
  await page.waitForSelector('.flashcard', { timeout: 8000 });
  await page.keyboard.press('Space');
  await page.waitForSelector('.grades');
  await page.keyboard.press('4');
  await page.waitForTimeout(1500);
  check(db.study_reviews.length === 1, 'cuenta de pruebas: el repaso se guarda en esa cuenta');
  check(errors.length === 0, `sin errores de página ${errors.join(' | ')}`);
  await browser.close();
  process.exit(process.exitCode ?? 0);
}
check(await page.isVisible('[data-testid="academy-panel"] .admin-note'), 'modo admin: Academy avisa de que no se guarda nada en la cuenta');
check(await page.waitForSelector('.today-num:has-text("3 tarjetas")', { timeout: 8000 }).then(() => true, () => false), 'modo admin: se ven las tarjetas reales');
await page.click('.today a:has-text("Repasar todo")');
await page.waitForSelector('.flashcard', { timeout: 8000 });
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForSelector('.grades');
  await page.keyboard.press('4');
}
await page.waitForSelector('.review-done', { timeout: 5000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/claude-0/-home-user/cea986b7-8317-59db-aa4e-b5236fdb5a12/scratchpad/acad-admin.png' });
const sandbox = await page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:admin-sandbox')));
check(db.study_reviews.length === 0, 'modo admin: el repaso no se guarda en study_reviews');
check(JSON.stringify(db.study_cards) === cardsBefore, 'modo admin: las tarjetas reales mantienen sus fechas');
check(sandbox.sessions.some((x) => x.area === 'estudio'), 'modo admin: el repaso cuenta en la partida de pruebas');
// Borrar una tarjeta en modo admin no la borra de la cuenta real.
await page.evaluate(() => { location.hash = '#academy/'; });
await page.click('.today a:has-text("Repasar todo")');
await page.waitForSelector('.flashcard', { timeout: 8000 });
await page.click('.delete-card');
await page.click('.acad [role="dialog"] button:has-text("Borrar tarjeta"), [role="dialog"] button:has-text("Borrar tarjeta")');
await page.waitForTimeout(800);
check(JSON.stringify(db.study_cards) === cardsBefore, 'modo admin: borrar una tarjeta no la borra de tu cuenta');
console.log('escrituras en modo admin:', writes.join(', ') || 'ninguna');
check(writes.length === 0, 'modo admin: ninguna escritura en la base de datos');
check(!(await page.isVisible('text=No se ha podido guardar')), 'modo admin: sin mensaje de error rojo al repasar');
check(errors.length === 0, `sin errores de página ${errors.join(' | ')}`);
await browser.close();
