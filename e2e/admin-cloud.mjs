// Modo admin con sesión iniciada: la partida de pruebas no puede tocar los datos reales de la cuenta
// (perfil público, aportes al gremio, partida). Supabase simulado.
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const ME = '11111111-1111-1111-1111-111111111111';
const ANA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LEO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ALBA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER = { id: ME, email: 'nico@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString();

// Partida en la nube de nivel 10+ (Gremios se abre en el 5 y se funda en el 10). El XP viejo no cuenta para los retos.
const backup = JSON.parse(readFileSync('e2e/backup.json', 'utf8')).state;
const now = Date.now();
const state = {
  ...backup,
  profile: { ...backup.profile, createdAt: now - 30 * DAY },
  xp: [{ id: 'old', at: now - 20 * DAY, amount: 6000, source: 'quest', sourceId: 'old', label: 'Mucho trabajo', attributes: { voluntad: 10 } }],
  sessions: [],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], // sin el aviso de novedades encima
};

const mondayKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const prof = (user_id, tag, name, level) => ({
  user_id, tag, name, bio: '', photo: null, level, xp: level * 100, avatar_index: 1, avatar_name: 'Iniciado', stats: { attrs: {}, achievements: 3, deepHours: 4, bosses: 0 },
});
const db = {
  saves: { user_id: ME, state, updated_at: iso(now) },
  profiles: [prof(ME, 'Nicolas#1234', 'Nicolas', 7), { ...prof(ANA, 'Ana#0001', 'Ana', 4), stats: { attrs: {}, achievements: 3, deepHours: 4, bosses: 0, week: { key: mondayKey(), xp: 5000, deep: 300, habits: 9 } } }, prof(LEO, 'Leo#0002', 'Leo', 6)],
  friendships: [
    { requester: ANA, addressee: ME, status: 'accepted', created_at: iso(now) },
    { requester: ME, addressee: LEO, status: 'accepted', created_at: iso(now) },
  ],
  guilds: [{ id: ALBA, name: 'Orden del Alba', emblem: '🌅', motto: '', owner: LEO, created_at: iso(now - DAY) }],
  guild_members: [{ user_id: LEO, guild_id: ALBA, joined_at: iso(now - DAY) }, { user_id: ME, guild_id: ALBA, joined_at: iso(now - DAY) }],
  guild_invites: [],
  guild_challenges: [{ id: 'reto', guild_id: ALBA, template: 'cien-minutos', goal: { deep: 100000, habits: 0, xp: 0, cap: 1, minParticipants: 1 }, starts_at: iso(now - DAY), ends_at: iso(now + 6 * DAY), completed_at: null, mvp: null, created_at: iso(now - DAY) }],
  guild_contributions: [],
  guild_events: [],
};

function filter(rows, params) {
  return rows.filter((r) => [...params].every(([k, v]) => {
    if (['select', 'on_conflict', 'order', 'limit', 'columns'].includes(k)) return true;
    const [op, ...rest] = v.split('.');
    const arg = rest.join('.');
    if (op === 'eq') return String(r[k]) === arg;
    if (op === 'is') return arg === 'null' ? r[k] == null : true;
    if (op === 'in') return arg.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(r[k]));
    if (op === 'ilike') return String(r[k]).toLowerCase() === arg.replace(/\\(.)/g, '$1').toLowerCase();
    return true;
  }));
}
const writes = [];
const KEYS = { guilds: ['id'], guild_members: ['user_id'], guild_invites: ['guild_id', 'user_id'], guild_challenges: ['id'], guild_contributions: ['challenge_id', 'user_id'], guild_events: ['id'] };

// Lo que hace guild_check_victory en Supabase: regla del tope, participantes mínimos y MVP.
function checkVictory(id) {
  const ch = db.guild_challenges.find((c) => c.id === id);
  if (!ch) return false;
  if (ch.completed_at) return true;
  const rows = db.guild_contributions.filter((x) => x.challenge_id === id);
  const metrics = ['deep', 'habits', 'xp'].filter((m) => ch.goal[m] > 0);
  const cap = (m) => Math.ceil(ch.goal[m] * ch.goal.cap);
  const counted = (x, m) => Math.min(x[m] ?? 0, cap(m));
  const won = metrics.every((m) => Math.min(ch.goal[m], rows.reduce((n, x) => n + counted(x, m), 0)) >= ch.goal[m]);
  const parts = rows.filter((x) => metrics.some((m) => (x[m] ?? 0) > 0)).length;
  if (!won || parts < (ch.goal.minParticipants ?? 1)) return false;
  const score = (x) => metrics.reduce((n, m) => n + counted(x, m) / ch.goal[m], 0) * 1e6 + metrics.reduce((n, m) => n + (x[m] ?? 0), 0);
  const best = [...rows].sort((a, b) => score(b) - score(a))[0];
  ch.completed_at = iso(Date.now());
  ch.mvp = best?.user_id ?? null;
  db.guild_events.push({ id: db.guild_events.length + 1, guild_id: ch.guild_id, kind: 'victory', actor: ch.mvp, target: null, data: { template: ch.template }, day: iso(Date.now()).slice(0, 10), created_at: iso(Date.now()) });
  return true;
}

async function fake(ctx) {
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (r.method() !== 'GET' && u.pathname.startsWith('/rest/v1/') && !u.pathname.endsWith('rpc/recommended_friends')) writes.push(`${r.method()} ${u.pathname.replace('/rest/v1/', '')}`);
    const one = (r.headers().accept ?? '').includes('pgrst.object');
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = (rows) => json(200, one ? rows[0] ?? null : rows);
    const done = () => route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    if (u.pathname === '/rest/v1/saves') {
      if (r.method() === 'GET') return out(db.saves ? [db.saves] : []);
      // Escritura condicional (PATCH … updated_at=eq.X) o alta (POST), como hace cloud.ts.
      const b = r.postDataJSON();
      const row = Array.isArray(b) ? b[0] : b;
      if (r.method() === 'PATCH') {
        if (!db.saves || db.saves.updated_at !== u.searchParams.get('updated_at')?.replace(/^eq\./, '')) return out(200, []);
        db.saves = { ...db.saves, ...row };
        return out(200, [{ updated_at: db.saves.updated_at }]);
      }
      if (db.saves) return out(409, { code: '23505', message: 'duplicate key value' });
      db.saves = row;
      return out(201, [{ updated_at: row.updated_at }]);
    }
    const p = u.searchParams;
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'profiles') {
      if (r.method() === 'GET') return out(filter(db.profiles, p));
      const rows = db.profiles.filter((x) => x.user_id === ME);
      rows.forEach((x) => Object.assign(x, r.postDataJSON()));
      return out(rows);
    }
    if (table === 'friendships') return out(db.friendships);
    if (table === 'rpc/recommended_friends') return json(200, []);
    if (table === 'rpc/guild_check_victory') return json(200, checkVictory(r.postDataJSON().c));
    if (KEYS[table]) {
      const rows = db[table];
      if (r.method() === 'GET') return out(filter(rows, p));
      if (r.method() === 'POST') {
        const b = r.postDataJSON();
        for (const row of Array.isArray(b) ? b : [b]) {
          if (table === 'guild_members' && rows.filter((m) => m.guild_id === row.guild_id).length >= 8) return json(400, { code: 'P0001', message: 'El gremio está lleno (8 miembros)' });
          if (table === 'guild_events') {
            const day = iso(Date.now()).slice(0, 10);
            if (rows.some((e) => e.kind === 'cheer' && e.actor === row.actor && e.target === row.target && e.day === day)) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "guild_events_cheer"' });
            rows.push({ ...row, id: rows.length + 1, data: {}, day, created_at: iso(Date.now()) });
            continue;
          }
          const fresh = { created_at: iso(Date.now()), joined_at: iso(Date.now()), id: crypto.randomUUID(), completed_at: null, ...row };
          const at = rows.findIndex((x) => KEYS[table].every((k) => x[k] === fresh[k]));
          if (at >= 0) Object.assign(rows[at], row); // upsert
          else rows.push(fresh);
        }
        return route.fulfill({ status: 201, headers: cors });
      }
      if (r.method() === 'PATCH') {
        filter(rows, p).forEach((x) => Object.assign(x, r.postDataJSON()));
        return done();
      }
      if (r.method() === 'DELETE') {
        const gone = new Set(filter(rows, p));
        db[table] = rows.filter((x) => !gone.has(x));
        if (table === 'guilds') {
          const ids = new Set([...gone].map((g) => g.id));
          for (const t of ['guild_members', 'guild_invites', 'guild_challenges']) db[t] = db[t].filter((x) => !ids.has(x.guild_id));
        }
        return done();
      }
    }
    return json(404, {});
  });
}


const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await fake(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.fill('#login-email', 'nico@test.com');
await page.click('text=Enviarme un código');
await page.fill('#login-code', '123456');
await page.click('button:has-text("Entrar")');
await page.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 });
await page.waitForTimeout(5500); // carga de amigos y gremio de la cuenta real

const realProfile = JSON.stringify(db.profiles.find((x) => x.user_id === ME));
const realSave = JSON.stringify(db.saves);
const realContrib = JSON.stringify(db.guild_contributions);
console.log('perfil real:', db.profiles.find((x) => x.user_id === ME).level, 'aportes:', realContrib);

// Entra en modo admin (la contraseña la prueba flow.mjs) y juega en la partida de pruebas.
writes.length = 0;
await page.evaluate(() => { localStorage.setItem('excelsior:admin-mode', '1'); location.reload(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/claude-0/-home-user/cea986b7-8317-59db-aa4e-b5236fdb5a12/scratchpad/admin1.png' });
if (await page.isVisible('#hero-name').catch(() => false)) {
  await page.fill('#hero-name', 'Prueba admin');
  await page.click('text=Crear personaje');
}
const skip = page.locator('.tour button:has-text("Saltar")');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.evaluate(() => { location.hash = '#ajustes'; });
await page.waitForSelector('#admin-level', { timeout: 5000 });
await page.fill('#admin-level', '30');
await page.click('.admin-panel button:has-text("Saltar al nivel")');
const clear = async () => {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    const btn = page.locator('.levelup button.primary, .tour button:has-text("Saltar")').first();
    if (await btn.isVisible().catch(() => false)) await btn.click(); else break;
  }
};
await clear();
await page.evaluate(() => { location.hash = '#hoy'; location.hash = '#ajustes'; });
await page.click('.admin-panel button:has-text("7 días")');
await clear();
// Abre Amigos y Gremios como haría Nicolas para probarlos.
for (const h of ['#amigos', '#gremios']) {
  await page.evaluate((x) => { location.hash = x; }, h);
  await page.waitForTimeout(1500);
  await clear();
}
await page.waitForTimeout(6000);
console.log('escrituras en modo admin:', writes.join(', ') || 'ninguna');

check(JSON.stringify(db.profiles.find((x) => x.user_id === ME)) === realProfile, 'modo admin: el perfil público real no cambia (nivel, nombre, estadísticas)');
check(JSON.stringify(db.guild_contributions) === realContrib, 'modo admin: no sube aportes falsos al gremio real');
check(JSON.stringify(db.saves) === realSave, 'modo admin: la partida de la nube no se toca');
check(writes.length === 0, 'modo admin: ninguna escritura en la base de datos');
check(await page.isVisible('.admin-note').catch(() => false), 'modo admin: se avisa en Amigos/Gremios de que la cuenta real es solo de lectura');

// Borrar en modo admin borra solo la partida de pruebas (mismo email, pero tu personaje real no se toca).
const realLocal = await page.evaluate(() => localStorage.getItem('excelsior:v1'));
await page.evaluate(() => { location.hash = '#hoy'; location.hash = '#ajustes'; });
await page.waitForSelector('[data-testid="admin-danger-note"]');
check(!(await page.isVisible('button:has-text("Borrar mi cuenta")')), 'modo admin: no se ofrece borrar la cuenta');
await page.click('button:has-text("Borrar la partida de pruebas")');
await page.click('button:has-text("Sí, borrar todo")');
await page.waitForTimeout(3000);
check(await page.evaluate(() => localStorage.getItem('excelsior:v1')) === realLocal, 'modo admin: borrar no toca la partida real de este navegador');
check(JSON.stringify(db.saves) === realSave && writes.length === 0, 'modo admin: ni la de la nube');

// Al salir, la cuenta real sigue igual y vuelve a funcionar.
await page.evaluate(() => { localStorage.removeItem('excelsior:admin-mode'); location.hash = ''; location.reload(); });
await page.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 });
await page.waitForTimeout(5500);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')).profile?.name) === 'Nicolas', 'al salir sigue tu personaje real');
check(!(await page.$('.admin-bar')), 'al salir no queda la barra de admin');
check(db.profiles.find((x) => x.user_id === ME).name === 'Nicolas', 'al salir el perfil sigue siendo el real');
check(errors.length === 0, `sin errores de página ${errors.join(' | ')}`);
await browser.close();
