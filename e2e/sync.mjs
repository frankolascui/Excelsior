// Sincronización entre dispositivos contra un Supabase simulado (REST + canal Realtime falso).
// Build: VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build --mode single --outDir dist-cloud
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'nico@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

// "Servidor": una fila de `saves` compartida y un registro de peticiones.
let remote = null;
const log = [];
// Realtime falso: reenvía cada broadcast a los demás sockets del mismo canal (si `live`).
const hub = { live: true, sockets: new Set(), sent: 0 };
async function fake(ctx) {
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    log.push(`${r.method()} ${u.pathname}${u.search.includes('select=updated_at') && r.method() === 'GET' ? ' (versión)' : ''}`);
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    if (u.pathname === '/rest/v1/saves' && r.method() === 'GET') return json(200, remote ? [{ state: remote.state, updated_at: remote.updated_at }] : []);
    if (u.pathname === '/rest/v1/saves') {
      const body = r.postDataJSON();
      const row = Array.isArray(body) ? body[0] : body;
      if (r.method() === 'PATCH') {
        if (!remote || remote.updated_at !== u.searchParams.get('updated_at')?.replace(/^eq\./, '')) return json(200, []);
        remote = { ...remote, ...row };
        return json(200, [{ updated_at: remote.updated_at }]);
      }
      if (remote) return json(409, { code: '23505', message: 'duplicate key value' });
      remote = row;
      return json(201, [{ updated_at: row.updated_at }]);
    }
    return json(200, []); // perfiles, gremios…: vacío
  });
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    const sock = { ws, topics: new Set() };
    hub.sockets.add(sock);
    ws.onClose(() => hub.sockets.delete(sock));
    ws.onMessage((raw) => {
      if (typeof raw !== 'string') {
        // Broadcast del cliente (binario, tipo 3): cabecera de longitudes + JSON.
        const b = Buffer.from(raw);
        const [, jl, rl, tl, el, ml] = b;
        let o = 7 + jl + rl;
        const topic = b.subarray(o, (o += tl)).toString();
        const event = b.subarray(o, (o += el)).toString();
        o += ml;
        const payload = JSON.parse(b.subarray(o).toString());
        hub.sent++;
        if (!hub.live) return;
        for (const s of hub.sockets) if (s !== sock && s.topics.has(topic)) s.ws.send(JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event, payload }]));
        return;
      }
      const [joinRef, ref, topic, event] = JSON.parse(raw);
      if (event === 'phx_join') sock.topics.add(topic);
      if (event === 'phx_leave') sock.topics.delete(topic);
      if (['phx_join', 'phx_leave', 'heartbeat', 'access_token'].includes(event)) ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: event === 'phx_join' ? { postgres_changes: [] } : {} }]));
    });
  });
}

const errors = [];
async function device(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  return p;
}
async function login(p) {
  await p.fill('#login-email', 'nico@test.com');
  await p.click('text=Enviarme un código');
  await p.fill('#login-code', '123456');
  await p.click('button:has-text("Entrar")');
}
async function addQuest(p, title) {
  await p.evaluate(() => { location.hash = 'misiones'; });
  await p.fill('input[placeholder^="+ Nueva misión"]', title);
  await p.click('button:has-text("Crear")');
}
const quests = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('excelsior:v1')).quests.map((q) => q.title));
const remoteHas = (t) => Boolean(remote?.state?.quests?.some((q) => q.title === t));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };

// PC: crea personaje como invitado y entra con su email (sube la partida).
const pcCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await fake(pcCtx);
const pc = await device(pcCtx);
await pc.click('text=Entrar como invitado');
await pc.fill('#hero-name', 'Nicolas');
await pc.click('text=Crear personaje');
await pc.click('.tour button:has-text("Saltar")');
await pc.click('button[aria-label="Ajustes"]');
await login(pc);
check(await until(() => remote?.state?.profile?.name === 'Nicolas'), 'el PC sube su partida al entrar');

// Móvil: entra y carga la partida de la nube.
const phoneCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await fake(phoneCtx);
const phone = await device(phoneCtx);
await login(phone);
check(await phone.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 }).then(() => true, () => false), 'el móvil carga la partida de la nube');
await until(() => [...hub.sockets].filter((s) => s.topics.size > 0).length >= 2);
check([...hub.sockets].filter((s) => s.topics.size > 0).length >= 2, 'los dos dispositivos escuchan el canal en tiempo real');

// Tiempo real: lo que se hace en uno aparece en el otro sin tocar nada.
await addQuest(phone, 'M1 móvil');
check(await until(() => remoteHas('M1 móvil')), 'el móvil guarda en la nube');
check(await until(async () => (await quests(pc)).includes('M1 móvil')), 'el PC recibe la misión del móvil al momento');
await addQuest(pc, 'M2 PC');
check(await until(async () => (await quests(phone)).includes('M2 PC')), 'y el móvil la del PC');
check(remoteHas('M1 móvil') && remoteHas('M2 PC'), 'la nube tiene las dos');
check(!(await pc.isVisible('text=Tienes dos partidas')) && !(await phone.isVisible('text=Tienes dos partidas')), 'sin conflictos al usarlos por turnos');

// Sin cambios no se sube nada.
const before = log.length;
await pc.waitForTimeout(4000);
check(!log.slice(before).some((l) => l.startsWith('PATCH') || l.startsWith('POST')), 'en reposo no se escribe nada en Supabase');

// Sin tiempo real (p. ej. la conexión cayó): el PC desfasado no pisa lo del móvil.
hub.live = false;
await addQuest(phone, 'M3 móvil');
check(await until(() => remoteHas('M3 móvil')), 'el móvil guarda M3');
await addQuest(pc, 'M4 PC');
check(await pc.waitForSelector('text=Tienes dos partidas', { timeout: 6000 }).then(() => true, () => false), 'el PC desfasado pregunta en vez de pisar');
check(remoteHas('M3 móvil') && !remoteHas('M4 PC'), 'la nube conserva lo del móvil hasta que el jugador elija');
await pc.click('button:has-text("La de este dispositivo")');
check(await until(() => remoteHas('M4 PC')), 'elegir este dispositivo lo sube');

// Al volver a la app (o recuperar la conexión) se lee la nube: el móvil sin cambios carga lo del PC.
await phone.evaluate(() => window.dispatchEvent(new Event('online')));
check(await until(async () => (await quests(phone)).includes('M4 PC')), 'al recuperar la conexión el móvil carga lo último');
check(!(await phone.isVisible('text=Tienes dos partidas')), 'sin preguntar, porque el móvil no tenía cambios');
hub.live = true;

// Dos pestañas en el mismo navegador: no se pisan.
const tab2 = await device(pcCtx);
await tab2.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 });
await addQuest(pc, 'M5 pestaña 1');
check(await until(async () => (await tab2.evaluate(() => document.body.innerText)).includes('M5 pestaña 1') || (await tab2.evaluate(() => location.hash)) !== '#misiones' && (await quests(tab2)).includes('M5 pestaña 1')), 'la otra pestaña ve el cambio');
await addQuest(tab2, 'M6 pestaña 2');
check(await until(() => remoteHas('M5 pestaña 1') && remoteHas('M6 pestaña 2')), 'la nube tiene lo de las dos pestañas');
check(await until(async () => (await quests(phone)).includes('M6 pestaña 2')), 'y el móvil también');
check(!(await tab2.isVisible('text=Tienes dos partidas')) && !(await pc.isVisible('text=Tienes dos partidas')), 'sin conflictos entre pestañas');

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
console.log('peticiones:', log.reduce((m, l) => ((m[l] = (m[l] ?? 0) + 1), m), {}));
await browser.close();
