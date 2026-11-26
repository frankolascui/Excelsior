// Grupos de estudio de Academy contra un Supabase simulado: crear/ver grupo, compartir (amigos y enlaces),
// entrar por enlace como lector, ver una asignatura compartida sin poder editarla y copiarla a tu estantería.
// Las reglas de verdad (quién ve y edita qué) se prueban en SQL: docs/supabase-grupos-estudio.sql.
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
const ANA = '11111111-1111-1111-1111-111111111111';
const BEA = '22222222-2222-2222-2222-222222222222';
const CRIS = '33333333-3333-3333-3333-333333333333';
const DANI = '44444444-4444-4444-4444-444444444444';
const TOKEN = '0123456789abcdef0123456789abcdef';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const DAY = 86_400_000;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const version = readFileSync('src/version.ts', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const state = {
  version: 6, profile: { name: 'Ana', createdAt: now - 30 * DAY }, quests: [], habits: [], habitCompletions: [], sessions: [], activeTimer: null,
  kingdoms: [], goals: [], rewards: [], purchases: [], bosses: [], xp: [{ id: 'old', at: now - 5 * DAY, amount: 500, source: 'quest', sourceId: 'o', label: 'x', attributes: {} }],
  tours: ['intro', 'reinos', 'arena', 'gremios', 'v3'], newsSeen: version,
};
const card = (id, user, topic, front, back) => ({
  id, user_id: user, topic_id: topic, front, back, due: iso(now - DAY), stability: 3, difficulty: 5, elapsed_days: 3, scheduled_days: 3,
  learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: iso(now - 4 * DAY), created_at: iso(now - 10 * DAY), suspended: false, note_key: null,
});
const profile = (user_id, name, tag) => ({ user_id, name, tag, bio: '', photo: null, level: 6, xp: 900, avatar_index: 0, avatar_name: '', stats: {} });
const db = {
  saves: { state, updated_at: iso(now) },
  profiles: [profile(ANA, 'Ana', 'Ana#1111'), profile(BEA, 'Bea', 'Bea#2222'), profile(CRIS, 'Cris', 'Cris#3333'), profile(DANI, 'Dani', 'Dani#4444')],
  friendships: [{ requester: ANA, addressee: BEA, status: 'accepted' }, { requester: DANI, addressee: ANA, status: 'accepted' }],
  study_subjects: [
    { id: 's1', user_id: ANA, name: 'Biología', color: '#22c55e', position: 0, level: 'equilibrado' },
    { id: 's2', user_id: BEA, name: 'Química', color: '#3fb6ff', position: 0, level: 'equilibrado' },
  ],
  study_topics: [
    { id: 't1', user_id: ANA, subject_id: 's1', title: 'La célula', position: 0, exam_date: null },
    { id: 't2', user_id: BEA, subject_id: 's2', title: 'Enlace químico', position: 0, exam_date: null },
  ],
  study_pages: [{ id: 'p2', user_id: BEA, topic_id: 't2', title: 'Enlace iónico', content: '## Enlace iónico\n\nSe forma entre un **metal** y un **no metal**.', position: 0, updated_at: iso(now - DAY) }],
  study_cards: [card('c1', ANA, 't1', '¿Qué es la mitocondria?', 'La central energética de la célula'), card('c2', BEA, 't2', '¿Qué es un enlace covalente?', 'Compartir electrones')],
  study_groups: [{ id: 'g1', owner_id: ANA, name: 'Bio y Quími 2.º B', created_at: iso(now - 3 * DAY) }],
  study_group_members: [
    { group_id: 'g1', user_id: ANA, role: 'owner', joined_at: iso(now - 3 * DAY) },
    { group_id: 'g1', user_id: BEA, role: 'editor', joined_at: iso(now - 2 * DAY) },
  ],
  study_group_subjects: [
    { group_id: 'g1', subject_id: 's1', shared_by: ANA, shared_at: iso(now - 3 * DAY) },
    { group_id: 'g1', subject_id: 's2', shared_by: BEA, shared_at: iso(now - 2 * DAY) },
  ],
  study_group_links: [{ group_id: 'g1', role: 'reader', token: TOKEN }],
  study_reviews: [], study_exam_dates: [], study_settings: [], study_exams: [], nights: [], settings: [],
};
const calls = [];

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

/** Lo que el servidor deja ver a cada uno (resumen de las reglas por fila). */
function visible(table, me) {
  const myGroups = db.study_group_members.filter((m) => m.user_id === me).map((m) => m.group_id);
  const sharedSubjects = db.study_group_subjects.filter((g) => myGroups.includes(g.group_id)).map((g) => g.subject_id);
  const okSubject = (id) => db.study_subjects.some((s) => s.id === id && (s.user_id === me || sharedSubjects.includes(id)));
  const okTopic = (id) => db.study_topics.some((t) => t.id === id && okSubject(t.subject_id));
  const rows = db[table];
  if (table === 'study_subjects') return rows.filter((s) => okSubject(s.id));
  if (table === 'study_topics') return rows.filter((t) => okSubject(t.subject_id));
  if (table === 'study_pages' || table === 'study_cards') return rows.filter((p) => okTopic(p.topic_id));
  if (table === 'study_groups') return rows.filter((g) => myGroups.includes(g.id));
  if (table === 'study_group_members' || table === 'study_group_subjects') return rows.filter((g) => myGroups.includes(g.group_id));
  if (table === 'study_group_links') return rows.filter((l) => db.study_group_members.some((m) => m.group_id === l.group_id && m.user_id === me && m.role !== 'reader'));
  return rows;
}

async function fake(ctx, me) {
  const USER = { id: me, email: `${me.slice(0, 4)}@test.com`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: iso(now) };
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const one = (r.headers().accept ?? '').includes('pgrst.object');
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const outRows = (rows) => json(200, one ? rows[0] ?? null : rows);
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'saves') {
      if (r.method() === 'GET') return outRows([{ user_id: me, ...db.saves }]);
      return json(200, [{ updated_at: db.saves.updated_at }]);
    }
    if (table.startsWith('rpc/')) {
      const b = r.postDataJSON() ?? {};
      calls.push({ fn: table.slice(4), by: me, args: b });
      if (table === 'rpc/study_group_peek') {
        const l = db.study_group_links.find((x) => x.token === b.link);
        const g = l && db.study_groups.find((x) => x.id === l.group_id);
        return json(200, g ? [{ group_id: g.id, name: g.name, role: l.role, members: db.study_group_members.filter((m) => m.group_id === g.id).length, owner_name: 'Ana', already: db.study_group_members.find((m) => m.group_id === g.id && m.user_id === me)?.role ?? null }] : []);
      }
      if (table === 'rpc/study_group_join') {
        const l = db.study_group_links.find((x) => x.token === b.link);
        db.study_group_members.push({ group_id: l.group_id, user_id: me, role: l.role, joined_at: iso(Date.now()) });
        return json(200, l.group_id);
      }
      if (table === 'rpc/study_group_add_friend') {
        db.study_group_members.push({ group_id: b.g, user_id: b.friend, role: b.new_role, joined_at: iso(Date.now()) });
        return json(200, null);
      }
      if (table === 'rpc/study_copy_subject') {
        const src = db.study_subjects.find((s) => s.id === b.src);
        db.study_subjects.push({ ...src, id: 'copia', user_id: me, position: 9 });
        db.study_topics.filter((t) => t.subject_id === src.id).forEach((t) => db.study_topics.push({ ...t, id: `${t.id}-copia`, user_id: me, subject_id: 'copia' }));
        return json(200, 'copia');
      }
      return json(200, []);
    }
    const rows = db[table];
    if (!rows) return r.method() === 'GET' ? outRows([]) : json(201, []);
    if (r.method() === 'GET') return outRows(filter(visible(table, me), u.searchParams));
    if (r.method() === 'POST') {
      const b = r.postDataJSON();
      const added = (Array.isArray(b) ? b : [b]).map((x) => {
        const fresh = { id: `${table}-${rows.length + 1}`, created_at: iso(Date.now()), ...x };
        if (table === 'study_group_links') fresh.token = 'fedcba9876543210fedcba9876543210';
        rows.push(fresh);
        return fresh;
      });
      return json(201, one ? added[0] : added);
    }
    if (r.method() === 'PATCH') {
      const changed = filter(visible(table, me), u.searchParams);
      changed.forEach((x) => Object.assign(x, r.postDataJSON()));
      return json(200, one ? changed[0] ?? null : changed);
    }
    if (r.method() === 'DELETE') {
      const gone = new Set(filter(visible(table, me), u.searchParams));
      db[table] = rows.filter((x) => !gone.has(x));
    }
    return route.fulfill({ status: 204, headers: cors });
  });
}

async function login(me, viewport, hash = '', ready = 'text=¿Qué hago ahora?') {
  const ctx = await browser.newContext(viewport.isMobile ? { ...viewport } : { viewport, deviceScaleFactor: 2 });
  await fake(ctx, me);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
  await page.goto(url + hash);
  await page.fill('#login-email', 'x@test.com');
  await page.click('text=Enviarme un código');
  await page.fill('#login-code', '123456');
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector(ready, { timeout: 8000 });
  return page;
}

// ---------- Ana, propietaria (escritorio) ----------
const ana = await login(ANA, { width: 1280, height: 900 });
await ana.evaluate(() => { location.hash = '#academy/'; });
await ana.waitForSelector('[data-testid="groups-shelf"] .group-tile:has-text("Bio y Quími")', { timeout: 8000 });
check(await ana.locator('.shelf .binder-cover').count() === 1, 'la estantería solo tiene tus asignaturas (la de Bea no se cuela)');
check(await ana.isVisible('.binder-cover:has-text("Biología") .binder-label:has-text("Compartida")'), 'tu asignatura compartida lleva la marca «Compartida»');
await ana.screenshot({ path: `${out}/grupos-01-estanteria.png`, fullPage: true });

await ana.click('.group-tile:has-text("Bio y Quími")');
await ana.waitForSelector('[data-testid="group-page"] .member-row:has-text("Bea")', { timeout: 8000 });
check(await ana.isVisible('.binder-cover:has-text("Química") .binder-label:has-text("De Bea")'), 'el grupo enseña de quién es cada asignatura');
await ana.screenshot({ path: `${out}/grupos-02-grupo.png` });

await ana.click('[data-testid="share-group"]');
await ana.waitForSelector('[data-testid="share-dialog"] .member-row:has-text("Dani")');
check(!(await ana.isVisible('[data-testid="share-dialog"] .member-row:has-text("Bea")')), 'en «Añadir amigos» no salen los que ya están');
check(await ana.isVisible('[data-testid="link-reader"] button:has-text("Copiar")'), 'el enlace de lector existe y se copia');
check(await ana.isVisible('[data-testid="link-editor"] button:has-text("Crear enlace")'), 'el de editor se crea con un toque');
await ana.screenshot({ path: `${out}/grupos-03-compartir.png` });
await ana.click('[data-testid="share-dialog"] [role="radio"]:has-text("Editor")');
await ana.click('[data-testid="share-dialog"] .member-row:has-text("Dani") button');
await ana.waitForTimeout(400);
check(calls.some((c) => c.fn === 'study_group_add_friend' && c.args.friend === DANI && c.args.new_role === 'editor'), 'añadir a Dani como editor llama al servidor con su papel');
await ana.click('[data-testid="link-editor"] button:has-text("Crear enlace")');
await ana.waitForSelector('[data-testid="link-editor"] button:has-text("Copiar")');
check(db.study_group_links.some((l) => l.role === 'editor'), 'el enlace de editor queda creado');
await ana.click('.modal-head .icon-btn');
await ana.waitForSelector('.member-row:has-text("Dani")');
check(true, 'Dani aparece en Personas al cerrar');

// ---------- Cris abre el enlace de lector (móvil) ----------
const cris = await login(CRIS, { ...(await import('playwright')).devices['iPhone 13'] }, `#academy/unirse/${TOKEN}`, '[data-testid="join-card"]');
check(true, 'abrir el enlace sin sesión: tras entrar con tu cuenta sale la invitación');
await cris.waitForSelector('[data-testid="join-card"]:has-text("Bio y Quími")', { timeout: 8000 });
check(await cris.isVisible('[data-testid="join-card"]:has-text("lector")'), 'la invitación dice con qué papel entras');
await cris.screenshot({ path: `${out}/grupos-04-invitacion-movil.png` });
await cris.click('[data-testid="join-group"]');
await cris.waitForSelector('[data-testid="group-page"]', { timeout: 8000 });
check(db.study_group_members.some((m) => m.user_id === CRIS && m.role === 'reader'), 'Cris entra como lector');
check(!(await cris.isVisible('[data-testid="share-group"]')), 'un lector no ve «Compartir»');
check(!(await cris.isVisible('[data-testid="add-group-subject"]')), 'ni «Añadir una asignatura»');
await cris.screenshot({ path: `${out}/grupos-05-grupo-movil.png`, fullPage: true });

await cris.click('.binder-cover:has-text("Química")');
await cris.waitForSelector('[data-testid="shared-note"]', { timeout: 8000 });
check(!(await cris.isVisible('.add-tab')), 'un lector no puede añadir temas');
check(!(await cris.isVisible('.exams-tab')), 'ni ve los simulacros del dueño');
check(!(await cris.isVisible('button:has-text("Hoja nueva")')), 'ni crear hojas');
await cris.screenshot({ path: `${out}/grupos-06-compartida-movil.png`, fullPage: true });
await cris.click('.page-row a:has-text("Enlace iónico")');
await cris.waitForSelector('.paper .page-title:has-text("Enlace iónico")', { timeout: 8000 });
check(!(await cris.isVisible('.paper-head button:has-text("Editar")')), 'la hoja se lee pero no se edita');
await cris.goBack();
await cris.waitForSelector('[data-testid="shared-note"]');
await cris.click('[role="tab"]:has-text("Tarjetas")');
await cris.waitForSelector('.card-row:has-text("enlace covalente")');
check(!(await cris.isVisible('.composer')) && !(await cris.isVisible('a:has-text("Repasar")')), 'las tarjetas se ven, sin añadir ni repasar (la memoria es de Bea)');
await cris.click('[data-testid="shared-note"] button:has-text("Copiar")');
await cris.click('.dialog button:has-text("Copiar")');
await cris.waitForFunction(() => location.hash.includes('#academy/a/copia'), null, { timeout: 8000 });
await cris.waitForSelector('.binder-title:has-text("Química")');
check(!(await cris.isVisible('[data-testid="shared-note"]')), 'la copia es tuya: sin aviso de compartida');
check(await cris.isVisible('.add-tab'), 'y en tu copia ya puedes añadir temas');

// ---------- Bea, editora: edita la hoja compartida ----------
const bea = await login(BEA, { width: 1280, height: 900 });
await bea.evaluate(() => { location.hash = '#academy/a/s1'; });
await bea.waitForSelector('[data-testid="shared-note"]:has-text("puedes cambiar")', { timeout: 8000 });
check(await bea.isVisible('.add-tab'), 'una editora puede añadir temas en la asignatura de Ana');
check(!(await bea.isVisible('.level-picker')), 'pero no cambia el nivel de exigencia de Ana');
await bea.click('[role="tab"]:has-text("Tarjetas")');
await bea.waitForSelector('.composer');
check(!(await bea.isVisible('.review-cta a:has-text("Repasar")')), 'y no repasa las tarjetas de Ana');
await bea.screenshot({ path: `${out}/grupos-07-editora.png` });

check(errors.length === 0, `sin errores en consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
