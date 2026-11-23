// Exámenes de Academy en el calendario: salen en el mes, se crean, cambian y borran desde ahí. Supabase simulado como academy.mjs.
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
  study_reviews: [], study_exam_dates: [{ id: 'x1', subject_id: 's1', title: 'Parcial de derivadas', date: new Date(now + 6 * DAY).toISOString().slice(0, 10), topic_ids: [], created_at: iso(now) }], study_settings: [], study_pages: [], study_exams: [], nights: [], settings: [],
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
    if (r.method() === 'DELETE') {
      const gone = new Set(filter(rows, u.searchParams));
      db[table] = rows.filter((x) => !gone.has(x));
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


const dayOf = (n) => new Date(now + n * DAY).toISOString().slice(0, 10);
const evs = (g) => (g.events ?? []).filter((e) => e.academy);
const page = await login({ width: 1280, height: 900 });
await page.waitForTimeout(1200);
let g = await game(page);
check(evs(g).length === 1 && evs(g)[0].day === dayOf(6) && evs(g)[0].kind === 'examen', 'el examen de Academy entra en el calendario');
check(await page.isVisible('.upcoming .ev-chip:has-text("Matemáticas · Parcial de derivadas")'), 'Hoy lo enseña en Próximos eventos, con la asignatura');

await page.click('.nav-item:has-text("Misiones")');
await page.click('[role=radio]:has-text("Calendario")');
await page.click('[role=radio]:has-text("Mes")');
check(await page.isVisible('.key-events .key-ev:has-text("Parcial de derivadas")'), 'arriba del calendario, con su cuenta atrás');
check(await page.isVisible('.cal-day.has-key .cal-ev:has-text("Parcial de derivadas")'), 'en el mes, en su día');
await page.screenshot({ path: `${out}/acal-01-mes.png` });

// Crear un examen desde el calendario, ligado a una asignatura
await page.click(`.cal-day[aria-label^="${new Date(now + 9 * DAY).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}"]`).catch(() => {});
await page.click('.cal-add-fold .fold-btn');
await page.fill('#ev-title', 'Final de integrales');
await page.click('button[aria-label^="Asignatura de Academy"]');
await page.click('.pop-select button[role=option]:has-text("Matemáticas")');
check(await page.isVisible('.ev-form-academy:has-text("También sale en Academy")') && !(await page.isVisible('.ev-form button[aria-label^="Repetir"]')), 'con asignatura avisa de que va a Academy y no se repite');
await page.screenshot({ path: `${out}/acal-02-nuevo.png` });
await page.click('.ev-form button[type=submit]');
await page.waitForTimeout(800);
check(db.study_exam_dates.some((x) => x.title === 'Final de integrales' && x.subject_id === 's1'), 'se crea en Academy');
g = await game(page);
check(evs(g).length === 2, 'y su evento en el calendario (sin duplicar)');

// Abrir el examen y cambiarle el nombre
await page.click('.key-events .key-ev:has-text("Parcial de derivadas")');
await page.click('[role=radio]:has-text("Día")');
await page.click('.tg-chip:has-text("Parcial de derivadas")');
check(await page.isVisible('.sheet .ev-academy:has-text("Examen · Matemáticas")') && !(await page.isVisible('.sheet .kind-select')), 'la ficha dice que es de Academy (sin cambiar de tipo ni repetir)');
await page.screenshot({ path: `${out}/acal-03-ficha.png` });
await page.fill('.sheet-title-input', 'Parcial 1: derivadas');
await page.press('.sheet-title-input', 'Enter');
await page.waitForTimeout(600);
check(db.study_exam_dates.find((x) => x.id === 'x1').title === 'Parcial 1: derivadas', 'cambiar el nombre en el calendario lo cambia en Academy');

// Borrar
await page.click('.sheet button:has-text("Borrar")');
check(await page.isVisible('text=También se borra de Academy'), 'borrar avisa de que también se va de Academy');
await page.click('[data-testid=sure-dialog] button[type=submit]');
await page.waitForTimeout(600);
check(!db.study_exam_dates.some((x) => x.id === 'x1'), 'se borra en Academy');
g = await game(page);
check(evs(g).length === 1, 'y del calendario');

// Academy → calendario: lo que se añade en Academy aparece en el calendario sin recargar
db.study_exam_dates.push({ id: 'x9', subject_id: 's1', title: 'Oral', date: dayOf(3), topic_ids: [], created_at: iso(now) });
await page.evaluate(() => { location.hash = '#academy/a/s1/simulacros'; });
await page.waitForSelector('.exam-date:has-text("Oral")', { timeout: 8000 });
await page.screenshot({ path: `${out}/acal-05-academy.png` });
await page.waitForTimeout(800);
g = await game(page);
check(evs(g).some((e) => e.title === 'Oral'), 'al abrir los exámenes en Academy, sus exámenes pasan al calendario');

const mob = await login({ width: 390, height: 844 });
await mob.waitForTimeout(1000);
await mob.evaluate(() => { location.hash = '#misiones'; });
await mob.click('[role=radio]:has-text("Calendario")').catch(() => {});
await mob.click('[role=radio]:has-text("Mes")').catch(() => {});
await mob.screenshot({ path: `${out}/acal-04-movil.png` });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
