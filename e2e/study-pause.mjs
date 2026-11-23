// Pausa de las tarjetas (vacaciones): al terminar, las fechas de repaso se mueven los días de pausa y la racha sigue. Supabase simulado.
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
const EMAIL = 'nico@test.com';
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
const dk = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
state.habits = [{ id: 'sys-academy', name: 'Repasar las tarjetas', frequency: 'daily', createdAt: now - 30 * DAY, rewards: { sabiduria: 1 }, system: 'academy' }];
state.habitCompletions = [-9, -8, -7].map((n) => ({ id: `c${n}`, habitId: 'sys-academy', day: dk(now + n * DAY), at: now + n * DAY }));
state.studyPauses = [{ id: 'vac', from: dk(now - 6 * DAY), until: dk(now - 2 * DAY) }];
const card = (id, topic, front, back, st = 2) => ({
  id, topic_id: topic, front, back, due: iso(st ? now - DAY : now), stability: st ? 3 : 0, difficulty: st ? 5 : 0, elapsed_days: st ? 3 : 0, scheduled_days: st ? 3 : 0,
  learning_steps: 0, reps: st ? 2 : 0, lapses: 0, state: st, last_review: st ? iso(now - 8 * DAY) : null, created_at: iso(now - 10 * DAY), suspended: false, note_key: null,
});
const db = {
  saves: { user_id: ME, state, updated_at: iso(now) },
  study_subjects: [{ id: 's1', name: 'Matemáticas', color: '#a855f7', position: 0, level: 'equilibrado' }],
  study_topics: [{ id: 't1', subject_id: 's1', title: 'Derivadas', position: 0, exam_date: null }],
  study_cards: [card('c1', 't1', '¿Derivada de $x^2$?', '$2x$'), card('c2', 't1', '¿Derivada de $\\sin x$?', '$\\cos x$'), card('c3', 't1', 'Regla de la cadena', "$(f\\circ g)' = f'(g)\\,g'$", 0)],
  study_reviews: [], study_exam_dates: [], study_settings: [], study_pages: [], study_exams: [], nights: [], settings: [],
};

let admin = false;
let upserts = 0;
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
      if (u.searchParams.get('on_conflict')) {
        for (const x of (Array.isArray(b) ? b : [b])) { const at = rows.findIndex((y) => y.id === x.id); if (at >= 0) rows[at] = { ...rows[at], ...x }; else rows.push(x); }
        upserts++;
        return json(201, []);
      }
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
const dueBefore = Object.fromEntries(db.study_cards.map((c) => [c.id, c.due]));
await page.evaluate(() => { location.hash = '#deepwork'; });
await page.click('[data-testid="tab-academy"]');
await page.waitForSelector('[data-testid="academy-panel"] .shelf', { timeout: 10000 });
await page.waitForTimeout(800);
check(upserts === 1, 'al volver de la pausa se mueven las fechas en una sola petición');
check(db.study_cards.filter((c) => c.state !== 0).every((c) => new Date(c.due).getTime() - new Date(dueBefore[c.id]).getTime() === 5 * DAY), 'las tarjetas empezadas se mueven los 5 días de pausa');
check(db.study_cards.filter((c) => c.state === 0).every((c) => c.due === dueBefore[c.id]), 'las nuevas no se tocan');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1') ?? 'null'));
check(saved?.studyPauses?.[0]?.shifted === 5, 'la pausa queda marcada como movida');
check((await page.locator('.study-streak').innerText()).includes('3'), 'la racha de antes de la pausa sigue (3 días)');
check(await page.waitForSelector('.today-num:has-text("1 tarjetas"), .today-num:has-text("1 tarjeta")', { timeout: 8000 }).then(() => true, () => false), 'Hoy solo enseña la nueva: los repasos ya no están atrasados');
await page.screenshot({ path: '/tmp/claude-0/-home-user/7080170e-e934-5104-b204-04713e3a6b17/scratchpad/pausa-0-vuelta.png' });
// Programar una pausa nueva desde hoy hasta dentro de una semana.
await page.click('.study-pause .link:has-text("Pausar las tarjetas")');
await page.click('.study-pause-fields label:has-text("Hasta") .pick-btn');
await page.click('.pop-chip:has-text("En una semana")');
await page.screenshot({ path: '/tmp/claude-0/-home-user/7080170e-e934-5104-b204-04713e3a6b17/scratchpad/pausa-1-form.png' });
await page.click('.study-pause-actions .primary');
await page.waitForTimeout(400);
check(await page.isVisible('.study-pause-on'), 'la pausa en curso se ve en la franja');
check(await page.isVisible('[data-testid="today-paused"]'), 'Hoy dice que las tarjetas están en pausa');
await page.screenshot({ path: '/tmp/claude-0/-home-user/7080170e-e934-5104-b204-04713e3a6b17/scratchpad/pausa-2-activa.png' });
// En Hoy, el hábito sale en pausa.
await page.evaluate(() => { location.hash = '#hoy'; });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/claude-0/-home-user/7080170e-e934-5104-b204-04713e3a6b17/scratchpad/pausa-3-hoy.png', fullPage: false });
const tag = await page.locator('[data-habit="sys-academy"] .paused-tag').count();
check(tag > 0, 'el hábito «Repasar las tarjetas» sale como «En pausa» en Hoy');
// Móvil
const m = await page.context().newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(page.url().split('#')[0] + '#deepwork');
await m.click('[data-testid="tab-academy"]').catch(() => {});
await m.waitForTimeout(1500);
await m.screenshot({ path: '/tmp/claude-0/-home-user/7080170e-e934-5104-b204-04713e3a6b17/scratchpad/pausa-4-movil.png' });
// Reanudar
await page.evaluate(() => { location.hash = '#deepwork'; });
await page.click('[data-testid="tab-academy"]');
await page.click('.study-pause .link:has-text("Reanudar hoy")');
await page.waitForTimeout(400);
check(await page.isVisible('.study-pause .link:has-text("Pausar las tarjetas")'), 'reanudar hoy quita la pausa');
check(errors.length === 0, `sin errores de página ${errors.join(' | ')}`);
await browser.close();
