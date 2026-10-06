// Login por código y guardado en la nube contra un Supabase simulado (build: dist-cloud).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-cloud/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'nico@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

// "Servidor": una partida guardada en memoria, compartida entre dos dispositivos.
let remote = null;
const log = [];
async function fake(ctx) {
  await ctx.route('https://fake.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    log.push(`${r.method()} ${u.pathname}`);
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') {
      const body = r.postDataJSON();
      if (body.token !== '123456') return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return json(200, { access_token: 'at', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt', user: USER });
    }
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/rest/v1/saves' && r.method() === 'GET') {
      const rows = remote ? [{ state: remote.state, updated_at: remote.updated_at }] : [];
      return json(200, rows);
    }
    if (u.pathname === '/rest/v1/saves' && r.method() === 'POST') {
      const body = r.postDataJSON();
      remote = Array.isArray(body) ? body[0] : body;
      return route.fulfill({ status: 201, headers: cors });
    }
    return json(404, {});
  });
}

// Dispositivo 1 (PC): crea personaje, entra con su email y sube la partida.
const pc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await fake(pc);
const page = await pc.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.click('text=Entrar como invitado');
await page.fill('#hero-name', 'Nicolas');
await page.click('text=Crear personaje');
await page.click('.tour button:has-text("Saltar")');
await page.click('.nav-item:has-text("Personaje")');
check(await page.isVisible('#account-h'), 'Ajustes muestra la sección Cuenta');
await page.fill('#login-email', 'nico@test.com');
await page.click('text=Enviarme un código');
await page.waitForSelector('#login-code');
check(log.includes('POST /auth/v1/otp'), 'pide el código al servidor');
await page.fill('#login-code', '000000');
await page.click('button:has-text("Entrar")');
check(await page.waitForSelector('text=Código incorrecto o caducado', { timeout: 3000 }).then(() => true, () => false), 'código malo: mensaje claro');
await page.fill('#login-code', '123456');
await page.click('button:has-text("Entrar")');
check(await page.waitForSelector('text=Has entrado como', { timeout: 3000 }).then(() => true, () => false), 'código bueno: sesión iniciada');
await page.waitForFunction(() => document.body.innerText.includes('Guardado en la nube'), null, { timeout: 5000 }).catch(() => {});
check(remote?.state?.profile?.name === 'Nicolas', 'la partida local se sube a la nube');

// Cambio en el PC → se sube solo.
await page.click('.nav-item:has-text("Misiones")');
await page.fill('input[placeholder^="+ Nueva misión"]', 'Misión del PC');
await page.click('button:has-text("Crear")');
await page.waitForFunction(() => true);
await page.waitForTimeout(2500);
check(remote?.state?.quests?.some((q) => q.title === 'Misión del PC'), 'un cambio nuevo se guarda en la nube solo');

// Dispositivo 2 (móvil, vacío): entra con el email y recupera la partida.
const phone = await browser.newContext({ viewport: { width: 390, height: 800 } });
await fake(phone);
const p2 = await phone.newPage();
await p2.goto(url);
await p2.fill('#login-email', 'nico@test.com');
await p2.click('text=Enviarme un código');
await p2.fill('#login-code', '123456');
await p2.click('button:has-text("Entrar")');
check(await p2.waitForSelector('text=¿Qué hago ahora?', { timeout: 5000 }).then(() => true, () => false), 'el otro dispositivo carga la partida de la nube');
await p2.click('.tour button:has-text("Saltar")').catch(() => {});
await p2.goto(url + '#misiones');
check(await p2.isVisible('text=Misión del PC'), 'y ve las misiones creadas en el PC');

// Dispositivo 3 con otra partida local: elige cuál se queda.
const other = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await fake(other);
const p3 = await other.newPage();
await p3.goto(url);
await p3.click('text=Entrar como invitado');
await p3.fill('#hero-name', 'Otro');
await p3.click('text=Crear personaje');
await p3.click('.tour button:has-text("Saltar")');
await p3.click('.nav-item:has-text("Personaje")');
await p3.fill('#login-email', 'nico@test.com');
await p3.click('text=Enviarme un código');
await p3.fill('#login-code', '123456');
await p3.click('button:has-text("Entrar")');
check(await p3.waitForSelector('text=Tienes dos partidas', { timeout: 5000 }).then(() => true, () => false), 'con dos partidas pregunta cuál quedarse');
await p3.screenshot({ path: 'e2e/11-conflict.png' });
await p3.click('button:has-text("La de la nube")');
check(await p3.waitForSelector('text=Nicolas', { timeout: 3000 }).then(() => true, () => false), 'elegir la nube carga la partida de Nicolas');
check(remote.state.profile.name === 'Nicolas', 'la nube conserva la partida elegida');

// Dispositivo 4 con otro email nuevo: entra desde la portada y crea su personaje en la nube.
const fresh = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await fake(fresh);
const p4 = await fresh.newPage();
const saved = remote;
remote = null;
await p4.goto(url);
await p4.fill('#login-email', 'nuevo@test.com');
await p4.click('text=Enviarme un código');
await p4.fill('#login-code', '123456');
await p4.click('button:has-text("Entrar")');
check(await p4.waitForSelector('#hero-name', { timeout: 5000 }).then(() => true, () => false), 'cuenta nueva: pasa a crear el personaje');
await p4.fill('#hero-name', 'Nueva');
await p4.click('text=Crear personaje');
await p4.waitForTimeout(2500);
check(remote?.state?.profile?.name === 'Nueva', 'el personaje nuevo se guarda en la nube');
await p4.click('.tour button:has-text("Saltar")');
await p4.click('.nav-item:has-text("Gremios")');
check(await p4.isVisible('text=Próximamente'), 'con cuenta, los gremios no piden registro');
remote = saved;

check(errors.length === 0, `sin errores de la app ${errors.join(' | ')}`);
await browser.close();
