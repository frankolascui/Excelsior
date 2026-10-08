// Amigos (V2) contra un Supabase simulado.
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const ME = '11111111-1111-1111-1111-111111111111';
const ANA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LEO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = { id: ME, email: 'nico@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

// Semana actual y anterior (lunes, hora local), como las publica la app.
const monday = (weeksAgo) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * weeksAgo); return d; };
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weeks = (xp, prev) => ({ week: { key: key(monday(0)), xp, deep: 95, habits: 4 }, prev: { key: key(monday(1)), xp: prev, deep: 0, habits: 0 } });
const prof = (user_id, tag, name, level, extra = {}) => ({
  user_id, tag, name, bio: '', photo: null, level, xp: level * 100, avatar_index: 1, avatar_name: 'Iniciado',
  stats: { attrs: { voluntad: 3, sabiduria: 2 }, achievements: 7, deepHours: 12, bosses: 2 }, ...extra,
});
const db = {
  saves: null,
  profiles: [prof(ANA, 'Ana#0001', 'Ana', 4), prof(LEO, 'Leo#0002', 'Leo', 6, { bio: 'Opositando y entrenando.' })]
    .map((p) => ({ ...p, stats: { ...p.stats, ...(p.user_id === LEO ? weeks(240, 90) : weeks(0, 0)) } })),
  friendships: [{ requester: LEO, addressee: ME, status: 'pending', created_at: new Date().toISOString() }],
};
const val = (v) => decodeURIComponent(v);
function filter(rows, params) {
  return rows.filter((r) => [...params].every(([k, v]) => {
    if (k === 'select' || k === 'on_conflict') return true;
    if (k === 'or') {
      const pairs = [...v.matchAll(/requester\.eq\.([\w-]+),addressee\.eq\.([\w-]+)/g)];
      return pairs.some(([, a, b]) => r.requester === a && r.addressee === b);
    }
    const [op, ...rest] = v.split('.');
    const arg = rest.join('.');
    if (op === 'eq') return String(r[k]) === arg;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(r[k]));
    if (op === 'ilike') return String(r[k]).toLowerCase() === arg.replace(/\\(.)/g, '$1').toLowerCase();
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
    if (u.pathname === '/rest/v1/saves') {
      if (r.method() === 'GET') return json(200, db.saves ? [db.saves] : []);
      const b = r.postDataJSON();
      db.saves = Array.isArray(b) ? b[0] : b;
      return route.fulfill({ status: 201, headers: cors });
    }
    const p = u.searchParams;
    if (u.pathname === '/rest/v1/profiles') {
      if (r.method() === 'GET') return out(filter(db.profiles, p));
      if (r.method() === 'POST') {
        const b = r.postDataJSON();
        if (b.user_id !== ME) return json(403, { code: '42501', message: 'rls' });
        if (db.profiles.some((x) => x.tag.toLowerCase() === b.tag.toLowerCase())) return json(409, { code: '23505', message: 'duplicate key' });
        const row = { bio: '', photo: null, ...b };
        db.profiles.push(row);
        return out([row]);
      }
      if (r.method() === 'PATCH') {
        const rows = filter(db.profiles, p).filter((x) => x.user_id === ME);
        rows.forEach((x) => Object.assign(x, r.postDataJSON()));
        return out(rows);
      }
    }
    if (u.pathname === '/rest/v1/friendships') {
      const mine = db.friendships.filter((f) => f.requester === ME || f.addressee === ME);
      if (r.method() === 'GET') return out(mine);
      if (r.method() === 'POST') {
        const b = r.postDataJSON();
        db.friendships.push({ status: 'pending', created_at: new Date().toISOString(), ...b });
        return route.fulfill({ status: 201, headers: cors });
      }
      if (r.method() === 'PATCH') {
        filter(mine, p).filter((f) => f.addressee === ME).forEach((f) => Object.assign(f, r.postDataJSON()));
        return route.fulfill({ status: 204, headers: cors });
      }
      if (r.method() === 'DELETE') {
        const gone = new Set(filter(mine, p));
        db.friendships = db.friendships.filter((f) => !gone.has(f));
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (u.pathname === '/rest/v1/rpc/recommended_friends') {
      const related = new Set(db.friendships.flatMap((f) => [f.requester, f.addressee]));
      return json(200, db.profiles.filter((x) => x.user_id !== ME && !related.has(x.user_id)).map((x) => ({ ...x, mutual: 0 })));
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

// Invitado: Amigos pide cuenta.
await page.click('text=Entrar como invitado');
await page.fill('#hero-name', 'Nicolas');
await page.click('text=Crear personaje');
await page.click('.tour button:has-text("Saltar")');
await page.click('.nav-item:has-text("Amigos")');
check(await page.isVisible('text=Necesitas registrarte para tener amigos'), 'invitado: Amigos pide registrarse');

// Entra con su email desde ahí mismo.
await page.fill('#login-email', 'nico@test.com');
await page.click('text=Enviarme un código');
await page.fill('#login-code', '123456');
await page.click('button:has-text("Entrar")');
check(await page.waitForSelector('#myp-h', { timeout: 5000 }).then(() => true, () => false), 'con cuenta se ve Tu perfil');
const tag = await page.waitForSelector('.tag-chip', { timeout: 5000 }).then((e) => e.innerText(), () => '');
check(/^Nicolas#\d{4}/.test(tag), `se crea su tag (${tag.trim()})`);
check(db.profiles.some((x) => x.user_id === ME && x.name === 'Nicolas' && x.level === 1), 'su perfil público se guarda en el servidor');
check(db.profiles.find((x) => x.user_id === ME)?.stats?.week?.key === key(monday(0)), 'publica lo de esta semana para los rankings');
check(await page.isVisible('section.leaderboard >> text=Añade amigos con su tag'), 'sin amigos, el ranking explica cómo empezar');

// Foto y biografía.
await page.setInputFiles('[data-testid="photo-input"]', 'e2e/04-dashboard.png');
await page.waitForSelector('text=Foto de perfil actualizada');
check(await page.locator('.my-profile svg image').count() === 1, 'la foto aparece en su aro');
await page.fill('#bio', 'Construyendo Excelsior. Matemáticas y gimnasio.');
await page.click('text=Guardar biografía');
await page.waitForTimeout(3800);
const me = db.profiles.find((x) => x.user_id === ME);
check(me.bio === 'Construyendo Excelsior. Matemáticas y gimnasio.', 'la biografía se publica');
check(me.photo?.startsWith('data:image/jpeg') && me.photo.length < 60000, `la foto se publica reducida (${Math.round((me.photo?.length ?? 0) / 1024)} KB)`);

// Solicitud recibida de Leo.
check(await page.isVisible('#inc-h'), 've la solicitud recibida');
check(await page.isVisible('.person:has-text("Leo")'), 'de Leo');

// Recomendados: Ana.
check(await page.isVisible('.rec-card:has-text("Ana")'), 'Ana aparece en recomendados');

// Añadir por tag (minúsculas y con espacio).
await page.fill('#friend-tag', 'ana #0001');
await page.click('button:has-text("Buscar")');
await page.waitForSelector('section:has(#add-h) .person:has-text("Ana")');
await page.click('section:has(#add-h) button:has-text("+ Añadir")');
await page.waitForSelector('text=Solicitud enviada a Ana');
check(db.friendships.some((f) => f.requester === ME && f.addressee === ANA && f.status === 'pending'), 'la solicitud a Ana llega al servidor');
await page.waitForTimeout(400);
check(await page.isVisible('text=Esperando respuesta'), 'Ana queda como «esperando respuesta»');
check(!(await page.isVisible('.rec-card:has-text("Ana")')), 'y sale de recomendados');

// Tag inexistente y tag mal escrito.
await page.fill('#friend-tag', 'Nadie#9999');
await page.click('button:has-text("Buscar")');
check(await page.waitForSelector('text=No hay nadie con ese tag').then(() => true, () => false), 'tag que no existe: aviso claro');
await page.fill('#friend-tag', 'Nadie');
await page.click('button:has-text("Buscar")');
check(await page.waitForSelector('text=Un tag es así').then(() => true, () => false), 'tag mal escrito: explica el formato');

// Acepta a Leo y abre su perfil.
await page.click('section:has(#inc-h) button:has-text("Aceptar")');
await page.waitForSelector('section:has(#fr-h) .person:has-text("Leo")');
check(db.friendships.find((f) => f.requester === LEO).status === 'accepted', 'aceptar a Leo se guarda');
check(!(await page.isVisible('#inc-h')), 'ya no quedan solicitudes');

// Ranking de amigos: Leo va primero esta semana y ganó la pasada.
const lb = 'section.leaderboard:has(#lb-friends-h)';
const rows = async () => page.locator(`${lb} .lb-row`).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
let r = await rows();
check(r.length === 2 && r[0].includes('Leo') && r[0].includes('240 XP') && r[1].includes('Nicolas (tú)'), `ranking de amigos: Leo primero y tú después (${r.join(' / ')})`);
check(await page.isVisible(`${lb} .lb-row.p1:has-text("Leo") .lb-crown`), 'Leo lleva la corona de la semana pasada');
check(await page.isVisible(`${lb} .lb-row.p1:has-text("🥇")`) && /Termina en/.test(await page.innerText(lb)), 'medalla de oro y cuenta atrás de la semana');
check(/1 h 35 min de foco · 4 hábitos/.test(r[0]), 'cada fila dice el foco y los hábitos de la semana');
await page.click(`${lb} button[role="radio"]:has-text("Semana pasada")`);
r = await rows();
check(r[0].includes('Leo') && r[0].includes('90 XP') && /Del \d+/.test(await page.innerText(lb)), 'semana pasada: 90 XP de Leo y las fechas');
await page.click(`${lb} button[role="radio"]:has-text("Siempre")`);
r = await rows();
check(r[0].includes('600 XP') && r[0].includes('Nv 6'), 'siempre: XP total y nivel');
await page.click(`${lb} button[role="radio"]:has-text("Esta semana")`);
await page.locator(lb).screenshot({ path: 'e2e/14-ranking.png' });
await page.click('section:has(#fr-h) button[aria-label="Ver perfil de Leo"]');
check(await page.isVisible('.profile-card:has-text("Opositando y entrenando.")'), 'el perfil de Leo muestra su biografía');
check(await page.isVisible('.profile-card:has-text("7 logros")') && await page.isVisible('.profile-card >> text=✓ Amigos'), 'y sus estadísticas y que sois amigos');
await page.screenshot({ path: 'e2e/12-friend-profile.png' });
await page.click('.profile-card >> text=Eliminar amigo');
await page.click('.profile-card >> text=Sí, eliminar a Leo');
await page.waitForTimeout(400);
check(!db.friendships.some((f) => f.requester === LEO), 'eliminar amigo borra la amistad');
check(await page.isVisible('.rec-card:has-text("Leo")'), 'Leo vuelve a recomendados');
await page.screenshot({ path: 'e2e/12-friends.png', fullPage: true });

// La foto también sale en Personaje.
await page.click('.nav-item:has-text("Personaje")');
check(await page.locator('svg image').count() > 0, 'la foto de perfil se ve en Personaje');

// Móvil: sin scroll horizontal.
const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
await fake(m);
const mp = await m.newPage();
await mp.goto(url);
await mp.fill('#login-email', 'nico@test.com');
await mp.click('text=Enviarme un código');
await mp.fill('#login-code', '123456');
await mp.click('button:has-text("Entrar")');
await mp.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 });
await mp.goto(url + '#amigos');
await mp.waitForSelector('.tag-chip', { timeout: 5000 });
await mp.waitForTimeout(500);
check(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'móvil: Amigos sin scroll horizontal');
await mp.screenshot({ path: 'e2e/13-friends-mobile.png', fullPage: true });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
