// Gremios (V2) contra un Supabase simulado.
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

// Partida en la nube de nivel 7+ (Gremios se abre en el 7). El XP viejo no cuenta para los retos.
const backup = JSON.parse(readFileSync('e2e/backup.json', 'utf8')).state;
const now = Date.now();
const state = {
  ...backup,
  profile: { ...backup.profile, createdAt: now - 30 * DAY },
  xp: [{ id: 'old', at: now - 20 * DAY, amount: 6000, source: 'quest', sourceId: 'old', label: 'Mucho trabajo', attributes: { voluntad: 10 } }],
  sessions: [],
  tours: ['intro', 'reinos', 'arena', 'gremios'],
};

const prof = (user_id, tag, name, level) => ({
  user_id, tag, name, bio: '', photo: null, level, xp: level * 100, avatar_index: 1, avatar_name: 'Iniciado', stats: { attrs: {}, achievements: 3, deepHours: 4, bosses: 0 },
});
const db = {
  saves: { user_id: ME, state, updated_at: iso(now) },
  profiles: [prof(ME, 'Nicolas#1234', 'Nicolas', 7), prof(ANA, 'Ana#0001', 'Ana', 4), prof(LEO, 'Leo#0002', 'Leo', 6)],
  friendships: [
    { requester: ANA, addressee: ME, status: 'accepted', created_at: iso(now) },
    { requester: ME, addressee: LEO, status: 'accepted', created_at: iso(now) },
  ],
  guilds: [{ id: ALBA, name: 'Orden del Alba', emblem: '🌅', motto: '', owner: LEO, created_at: iso(now - DAY) }],
  guild_members: [{ user_id: LEO, guild_id: ALBA, joined_at: iso(now - DAY) }],
  guild_invites: [{ guild_id: ALBA, user_id: ME, invited_by: LEO, created_at: iso(now) }],
  guild_challenges: [],
  guild_contributions: [],
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
const KEYS = { guilds: ['id'], guild_members: ['user_id'], guild_invites: ['guild_id', 'user_id'], guild_challenges: ['id'], guild_contributions: ['challenge_id', 'user_id'] };

async function fake(ctx) {
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const one = (r.headers().accept ?? '').includes('pgrst.object');
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = (rows) => json(200, one ? rows[0] ?? null : rows);
    const done = () => route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    if (u.pathname === '/rest/v1/saves') {
      if (r.method() === 'GET') return out(db.saves ? [db.saves] : []);
      const b = r.postDataJSON();
      db.saves = Array.isArray(b) ? b[0] : b;
      return route.fulfill({ status: 201, headers: cors });
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
    if (KEYS[table]) {
      const rows = db[table];
      if (r.method() === 'GET') return out(filter(rows, p));
      if (r.method() === 'POST') {
        const b = r.postDataJSON();
        for (const row of Array.isArray(b) ? b : [b]) {
          if (table === 'guild_members' && rows.filter((m) => m.guild_id === row.guild_id).length >= 8) return json(400, { code: 'P0001', message: 'El gremio está lleno (8 miembros)' });
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

async function login(page) {
  await page.goto(url);
  await page.fill('#login-email', 'nico@test.com');
  await page.click('text=Enviarme un código');
  await page.fill('#login-code', '123456');
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 });
}
async function openGuilds(page) {
  await page.click('.nav-item:has-text("Personaje")');
  await page.click('.nav-item:has-text("Gremios")');
  const tour = page.locator('.tour button:has-text("Saltar")');
  if (await tour.isVisible().catch(() => false)) await tour.click();
  await page.waitForSelector('.guild-card, #gnew-h', { timeout: 5000 });
  await page.waitForTimeout(300);
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await fake(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await login(page);
await openGuilds(page);

// Invitación de Leo: se ve y se rechaza.
check(await page.isVisible('section:has(#ginv-h) :text("Orden del Alba")'), 've la invitación a la Orden del Alba');
await page.click('section:has(#ginv-h) button:has-text("Rechazar")');
await page.waitForTimeout(400);
check(db.guild_invites.length === 0 && !(await page.isVisible('#ginv-h')), 'rechazar borra la invitación');

// Funda su gremio.
await page.click('.emblem-opt >> nth=2');
const emblem = await page.locator('.emblem-opt >> nth=2').innerText();
await page.fill('#guild-name', '  Los Constantes ');
await page.fill('#guild-motto', 'Un día más.');
await page.click('button:has-text("Fundar gremio")');
await page.waitForSelector('.guild-card', { timeout: 5000 });
const mine = db.guilds.find((g) => g.name === 'Los Constantes');
check(mine && mine.owner === ME && mine.emblem === emblem && mine.motto === 'Un día más.', 'el gremio se guarda con nombre, emblema y lema');
check(db.guild_members.some((m) => m.user_id === ME && m.guild_id === mine?.id), 'el fundador entra como miembro');
check(await page.isVisible('.guild-card :text("Nivel de gremio")') && await page.isVisible('#gm-h + .count, .count:has-text("1/8")'), 'ficha del gremio: nivel y 1/8 miembros');
check(await page.isVisible('#pick-h'), 'sin reto: elige el próximo');

// Invita a Ana (amiga); Leo ya está en otro gremio pero también es amigo, así que sale.
await page.click('section:has(#gm-h) li:has-text("Ana") button:has-text("Invitar")');
await page.waitForTimeout(400);
check(db.guild_invites.some((i) => i.user_id === ANA && i.guild_id === mine.id && i.invited_by === ME), 'invitar a Ana llega al servidor');
check(await page.isVisible('section:has(#gm-h) li:has-text("Ana") :text("Invitado · cancelar")'), 'Ana queda como invitada');

// Ana acepta desde su móvil.
db.guild_members.push({ user_id: ANA, guild_id: mine.id, joined_at: iso(Date.now()) });
db.guild_invites = db.guild_invites.filter((i) => i.user_id !== ANA);
await openGuilds(page);
check(await page.isVisible('.count:has-text("2/8")'), 'con Ana son 2/8');
check(await page.isVisible('.pick-card:has-text("1 h 40 min")') || await page.isVisible('.pick-card:has-text("100")'), 'las metas se recalculan para 2 miembros (mínimo 100 min)');

// Empieza la misión de los cien minutos.
await page.click('.pick-card:has-text("Los 100 minutos") button');
await page.waitForSelector('.challenge.st-active', { timeout: 5000 });
const ch = db.guild_challenges[0];
check(ch && ch.template === 'cien-minutos' && ch.goal.deep === 100 && ch.goal.cap === 0.5 && ch.created_by === ME, `el reto se guarda con meta y tope (${JSON.stringify(ch?.goal)})`);
check(await page.isVisible('.challenge :text("tope por persona: 50 %")'), 'explica el tope por persona');

// Ana hace 80 min: solo cuentan 50 (tope del 50 % con dos miembros).
db.guild_contributions.push({ challenge_id: ch.id, user_id: ANA, deep: 80, habits: 0, xp: 0 });
await openGuilds(page);
check(await page.isVisible('.ch-members li:has-text("Ana") :text("🔒")'), 'Ana llega al tope (🔒)');
check(await page.isVisible('.ch-metric :text("reales")'), 'se ven los minutos reales y los que cuentan');
check(db.guild_contributions.some((c) => c.user_id === ME && c.challenge_id === ch.id), 'su app sube su aportación');

// Nicolas hace 50 min de foco dentro del reto: se gana.
const t0 = Date.now() - 60 * 60_000;
ch.starts_at = iso(t0 - 60_000);
await page.evaluate(({ t0 }) => {
  const KEY = 'excelsior:v1';
  const st = JSON.parse(localStorage.getItem(KEY));
  st.sessions.push({ id: 'dw1', questId: null, label: 'Foco', area: 'estudio', startedAt: t0, endedAt: t0 + 50 * 60_000, minutes: 50 });
  localStorage.setItem(KEY, JSON.stringify(st));
}, { t0 });
await page.reload(); // sigue en Gremios con la partida local (más nueva que la de la nube)
await page.waitForSelector('.guild-card', { timeout: 5000 });
await page.waitForTimeout(600);
const meC = db.guild_contributions.find((c) => c.user_id === ME && c.challenge_id === ch.id);
check(meC?.deep === 50, `su aportación sube 50 min (${meC?.deep})`);
check(!!db.guild_challenges[0].completed_at, 'al cumplir la meta el reto se marca como ganado');
await openGuilds(page);
check(await page.isVisible('.challenge.st-won :text("¡Encargo cumplido!")'), 've la victoria');
await page.click('.challenge.st-won button:has-text("Cobrar +40 XP")');
await page.waitForTimeout(400);
check(await page.isVisible('.challenge.st-won :text("Recompensa cobrada")'), 'cobra la recompensa una vez');
const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('excelsior:v1')));
check(saved.guildClaims?.includes(ch.id) && saved.xp.some((x) => x.source === 'guild' && x.amount === 40), '+40 XP de gremio en su partida');
check(await page.isVisible('.guild-card :text("50 XP de gremio")'), 'el gremio gana 50 XP de gremio');
check(await page.isVisible('#pick-h'), 'y puede elegir el siguiente reto');
await page.screenshot({ path: 'e2e/17-guild.png', fullPage: true });

// Rangos: el líder nombra colíder a Ana.
await page.click('section:has(#gm-h) li:has-text("Ana") button:has-text("Hacer colíder")');
await page.waitForTimeout(400);
check(db.guild_members.find((m) => m.user_id === ANA)?.role === 'officer', 'Ana pasa a colíder en el servidor');
check(await page.isVisible('section:has(#gm-h) li:has-text("Ana") .rank-tag.officer'), 'y se ve su rango ⚔️ Colíder');
check(await page.isVisible('section:has(#gm-h) li:has-text("Nicolas") .rank-tag.leader'), 'él aparece como 👑 Líder');

// Sale del gremio: el liderazgo pasa a Ana (colíder más antigua).
await page.click('text=Salir del gremio');
check(await page.isVisible('text=Ana será el nuevo líder'), 'avisa de quién hereda el gremio');
await page.click('button:has-text("Sí, salir")');
await page.waitForSelector('#gnew-h', { timeout: 5000 });
check(db.guilds.find((g) => g.id === mine.id)?.owner === ANA, 'al salir, Ana pasa a ser la líder');
check(!db.guild_members.some((m) => m.user_id === ME), 'y él ya no es miembro');
check(db.guild_members.find((m) => m.user_id === ANA)?.role === 'member', 'Ana deja de contar como colíder al ser líder');

// Vuelve como miembro raso: no acepta encargos, no invita, no expulsa.
db.guild_members.push({ user_id: ME, guild_id: mine.id, joined_at: iso(Date.now()), role: 'member' });
await openGuilds(page);
check(await page.isVisible('.rank-note:has-text("Solo el líder y los colíderes aceptan encargos")'), 'miembro: ve el tablón pero no puede aceptar encargos');
check(await page.locator('.pick-card button').count() === 0, 'miembro: sin botones de aceptar');
check(await page.isVisible('text=Solo el líder y los colíderes pueden invitar'), 'miembro: no puede invitar');
check(await page.locator('section:has(#gm-h) button:has-text("Expulsar")').count() === 0, 'miembro: no puede expulsar');
db.guild_members = db.guild_members.filter((m) => m.user_id !== ME);

// Móvil: sin scroll horizontal con un reto activo.
db.guild_members.push({ user_id: ME, guild_id: mine.id, joined_at: iso(Date.now()) });
db.guild_challenges.unshift({ id: crypto.randomUUID(), guild_id: mine.id, template: 'dragon', goal: { deep: 960, minParticipants: 1, cap: 0.5 }, starts_at: iso(Date.now() - DAY), ends_at: iso(Date.now() + 6 * DAY), completed_at: null, created_by: ANA });
db.guild_contributions.push({ challenge_id: db.guild_challenges[0].id, user_id: ANA, deep: 300, habits: 0, xp: 0 });
const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
await fake(m);
const mp = await m.newPage();
mp.on('pageerror', (e) => errors.push(e.message));
await login(mp);
await openGuilds(mp);
await mp.waitForSelector('.challenge.st-active', { timeout: 5000 });
check(await mp.isVisible('.guild-fight :text("Jefe de gremio")') && await mp.isVisible('.guild-fight .pixel-boss.has-img img'), 'el jefe de gremio sale como combate con su ilustración');
const hp = Number((await mp.locator('.guild-fight .fight-hp .mono').last().innerText()).split('/')[0]);
check(hp > 0 && hp <= 69, `su vida baja con lo que aporta el gremio (${hp} / 100)`);
check(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'móvil: Gremios sin scroll horizontal');
await mp.screenshot({ path: 'e2e/17-guild-mobile.png', fullPage: true });

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
