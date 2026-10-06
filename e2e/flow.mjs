// Prueba de extremo a extremo del core loop sobre el build de un solo archivo.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dist-single/index.html')).href;
const out = process.argv[2] ?? 'e2e';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.clock.install({ time: new Date('2026-10-04T09:00:00') });
await page.goto(url);

const seen = (sel) => page.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

// 1. Crear cuenta / personaje
await page.fill('#hero-name', 'Nicolas');
await page.click('text=Crear personaje');
await page.waitForSelector('text=¿Qué hago ahora?');

// 1b. Tutorial con guía: aparece solo, señala cada pantalla y no vuelve tras saltarlo
check(await seen('.tour .eyebrow:has-text("Hiperión · 1/7")'), 'el tutorial arranca con el guía');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('[data-tour="now"].tour-target'), 'paso 2 señala «¿Qué hago ahora?»');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('.nav-item.on:has-text("Misiones")') && await seen('[data-tour="quest-add"].tour-target'), 'paso 3 lleva a Misiones y señala el formulario');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/00-tutorial.png` });
await page.click('.tour button:has-text("Saltar")');
check(!(await page.$('.tour')) && !(await page.$('.tour-target')), 'saltar cierra el tutorial y quita el foco');
await page.reload();
await page.waitForSelector('.nav');
check(!(await seen('.tour')), 'el tutorial no vuelve a salir al recargar');
await page.click('.nav-item:has-text("Hoy")');
check(await seen('text=Crea tu primera misión.'), 'dashboard guía a crear la primera misión');
await page.screenshot({ path: `${out}/01-empty.png`, fullPage: true });

// 2. Crear misiones
await page.fill('#new-quest', 'Terminar el tema 3 de Física');
await page.click('[role=radio]:has-text("Principal")');
await page.click('button:has-text("Crear")');
check(await seen('h2:has-text("Terminar el tema 3 de Física")'), '¿Qué hago ahora? sugiere la misión principal');
await page.fill('#new-quest', 'Responder emails');
await page.click('button:has-text("Crear")');

// 3. Completar misión → XP
await page.click('button[aria-label="Completar Responder emails"]');
check(await seen('.toast:has-text("+20 XP")'), 'toast +20 XP');
check((await page.textContent('.levelbar .levelbar-foot')).includes('20 / 100'), 'barra de XP en 20/100');

// 4. Deep Work vinculado a la misión principal (45 min simulados)
await page.click('button:has-text("Empezar Deep Work")');
await page.click('button.mode-card:has-text("Sesión libre")');
check(await seen('.phase-pill:has-text("Foco")'), 'cronómetro libre en marcha');
await page.clock.fastForward('45:10');
await page.waitForTimeout(300);
check((await page.textContent('.ring-time')).startsWith('45:1'), 'cronómetro marca 45:1x');
await page.click('button:has-text("Me distraje")');
await page.clock.fastForward('05:00');
await page.waitForTimeout(300);
check(await seen('.focus-stats >> text=90 %'), 'foco real 90 % tras 5 min de distracción');
await page.screenshot({ path: `${out}/02-timer.png` });
await page.click('button:has-text("Volver al foco")');
await page.click('text=Terminar sesión');
check(await seen('text=45 min de foco · +45 XP'), 'solo cuenta el foco: 45 min, +45 XP');
check(await seen('.result >> text=90 %'), 'resumen muestra 90 % de foco real');
await page.click('button:has-text("Completar «Terminar el tema 3 de Física»")');
// 20 + 45 + 50 = 115 → nivel 2
check(await seen('#lvl-h:has-text("Nivel 2")'), 'sube a nivel 2');
await page.screenshot({ path: `${out}/03-levelup.png` });
await page.click('.levelup button');

// 5. Hábitos
await page.click('.nav-item:has-text("Hoy")');
await page.click('button[aria-label="Completar Leer"]');
check(await seen('.toast:has-text("+10 XP")'), 'hábito +10 XP');
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/04-dashboard.png`, fullPage: true });
await page.emulateMedia({ colorScheme: 'light' });

// 5b. Atributos y avatar: Diaria ⚔️3 + 45 min (🔨45 ⚔️22) + Principal (⚔️5 🔨5) + Leer (🧠3)
const attr = async (name) => (await page.textContent(`.attr:has-text("${name}") .attr-xp`)).trim();
check(await attr('Voluntad') === '30,5 XP', 'Voluntad 30,5 XP (con decimales)');
check(await attr('Maestría') === '50 XP', 'Maestría 50 XP');
check(await attr('Sabiduría') === '3 XP', 'Sabiduría 3 XP');
check((await page.textContent('.avatar-card')).includes('hacia Iniciado · 0 de 2 requisitos'), 'avatar: siguiente es Iniciado (nivel 3 + 3 días)');
const order = await page.$$eval('.screen > *', (els) => els.map((e) => e.className.split(' ')[0] + (e.className.includes('avatar') ? ':avatar' : '')));
console.log('orden Home:', order.join(' > '));

// 6. Guardado: recargar conserva todo
await page.reload();
await page.waitForSelector('.levelbar');
check((await page.textContent('.levelbar .levelbar-foot')).includes('25 / 200'), 'tras recargar: 125 XP total (nivel 2, 25/200)');

// 7. Volver al día siguiente: racha y progreso
await page.clock.fastForward('24:00:00');
await page.reload();
await page.click('.nav-item:has-text("Hoy")');
check(await seen('.chronicle:has-text("La semana pasada ganaste")'), 'el lunes aparece la crónica semanal');
check(await seen('.chronicle:has-text("Aceptar el reto")'), 'la crónica propone un boss como reto');
await page.screenshot({ path: `${out}/04b-chronicle.png` });
await page.click('.chronicle button:has-text("Entendido")');
check(!(await page.$('.chronicle')), 'la crónica se cierra hasta la semana siguiente');
await page.click('.nav-item:has-text("Personaje")');
check((await page.$$('.ladder .rung')).length === 10, 'escalera con 10 avatares');
check(await seen('text=125 XP global en total'), 'personaje muestra 125 XP totales');
check(await seen('.chart-sub:has-text("125 XP en 30 días")'), 'gráfica de XP: 125 XP en 30 días');
check((await page.$$('.heat rect')).length >= 175, 'mapa de actividad con al menos 26 semanas de cuadraditos en escritorio');
check(await seen('.heat rect.heat-4') && await seen('.heat rect.today.heat-0'), 'ayer brilla al máximo y hoy (sin XP) está vacío');
await page.hover('.heat rect.heat-4');
check(await seen('.chart-tip:has-text("125 XP")'), 'tooltip del cuadradito: 125 XP ese día');
await page.click('[role=radio]:has-text("7 días")');
check(await seen('.chart-sub:has-text("en 7 días")'), 'la gráfica cambia a 7 días');
await page.hover('.chart svg rect[fill="transparent"]', { position: { x: 5, y: 60 } });
check(await seen('.chart-tip'), 'crosshair con tooltip al pasar por la gráfica');
check(await seen('.req:has-text("Nivel global 3")'), 'Personaje muestra los requisitos del siguiente avatar');
await page.screenshot({ path: `${out}/05-character.png`, fullPage: true });

// 7a. Metas del siguiente avatar
await page.fill('#goal-name', 'Hablar con desconocidos');
await page.fill('#goal-start', '0');
await page.fill('#goal-target', '10');
await page.fill('#goal-unit', 'personas');
await page.click('.goal-form button:has-text("Añadir")');
await page.click('.goal button:has-text("+1")');
check(await seen('.goal >> text=1 / 10 personas'), 'meta personal suma +1');
check(await seen('.req:has-text("Hablar con desconocidos")'), 'la meta aparece como requisito del avatar');
await page.screenshot({ path: `${out}/05b-goals.png`, fullPage: true });

// 7a2. Reinos: cada tarea es una construcción
await page.click('.nav-item:has-text("Reinos")');
await page.fill('#new-kingdom', 'Reino de la Programación');
await page.click('button:has-text("Fundar")');
await page.fill('.kingdom input', 'Terminar una calculadora');
await page.click('.kingdom [role=radio]:has-text("Torreón")');
await page.click('.kingdom button:has-text("Construir")');
await page.fill('.kingdom input', 'Aprender Git');
await page.click('.kingdom button:has-text("Construir")');
check(await seen('.kingdom-stage:has-text("Campamento · 0/2")'), 'reino con 2 cimientos: Campamento');
await page.waitForSelector('.city-scene .scaffold');
await page.click('button[aria-label="Completar Terminar una calculadora"]');
check(await seen('.toast:has-text("+50 XP")'), 'construir la torre da +50 XP');
check(await seen('.kingdom-stage:has-text("Villa · 1/2")'), 'el reino pasa a Villa 1/2');
check(await seen('.city-scene .bld.built') && await seen('.city-scene .palisade'), 'la ciudad dibuja el torreón y la empalizada de la villa');
check(await seen('.kingdom-node[aria-label*="50 %"]'), 'el mapa muestra el reino al 50 %');
check(await seen('.realm .chart-sub:has-text("Dominio 50 %")'), 'dominio del mapa 50 %');
await page.click('.kingdom-node');
check(await seen('.kingdom.flash'), 'pulsar el reino en el mapa lleva a su ciudad');
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${out}/08-kingdom.png`, fullPage: true });

// 7a3. Atributo elegido a mano al crear un hábito
await page.click('.nav-item:has-text("Hábitos")');
await page.fill('#new-habit', 'Tocar la guitarra');
await page.click('[data-tour="habits"] .customize');
await page.fill('#new-habit-xp', '15');
await page.fill('#new-habit-creacion', '5');
await page.click('[data-tour="habits"] button:has-text("Añadir")');
check(await seen('.item:has-text("Tocar la guitarra") .rewards[aria-label="+2 Voluntad, +5 Creación"]'), 'hábito a medida con varios atributos: +2 Voluntad, +5 Creación');
check(await seen('.item:has-text("Tocar la guitarra") .xp-tag:has-text("+15 XP")'), 'hábito a medida da +15 XP');
await page.click('button[aria-label="Editar Tocar la guitarra"]');
await page.fill('[id$="-conexion"]', '3');
await page.click('.inline-edit button:has-text("Guardar")');
check(await seen('.item:has-text("Tocar la guitarra") .rewards[aria-label="+2 Voluntad, +3 Conexión, +5 Creación"]'), 'editar un hábito añade otro atributo');

// 7a4. Arena: boss y tienda
await page.click('.nav-item:has-text("Arena")');
const coins = async () => Number((await page.textContent('.treasury-amount .coins')).replace(/[^0-9-]/g, ''));
const before = await coins();
check(before >= 25, `hay monedas para gastar (${before})`);
await page.click('.boss-template:has-text("Hidra") button:has-text("Invocar")');
check(await seen('.boss:has-text("Hidra de la Procrastinación")'), 'invocar la Hidra');
await page.click('button[aria-label="Canjear Ver un episodio de una serie por 25 monedas"]');
check(await seen('.toast:has-text("¡Disfrútalo!")'), 'canjear una recompensa');
check(await coins() === before - 25, 'el canje resta 25 monedas');
await page.click('.nav-item:has-text("Hábitos")');
await page.click('button[aria-label="Completar Tocar la guitarra"]');
check(await seen('.toast:has-text("HP a Hidra")'), 'completar un hábito golpea a la Hidra');
await page.click('.nav-item:has-text("Arena")');
check(await seen('.boss .mono:has-text("685 / 700 HP")'), 'la Hidra baja a 685/700 HP');
await page.screenshot({ path: `${out}/09-arena.png`, fullPage: true });

// 7a5. Tema y copia de seguridad
await page.click('.nav-item:has-text("Personaje")');
await page.click('.theme-swatch:has-text("Olimpo")');
check((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c1').trim())) === '#ffd166', 'el tema Olimpo cambia los colores');
await page.screenshot({ path: `${out}/10-theme.png`, fullPage: true });
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar partida")')]);
const backupPath = `${out}/backup.json`;
await download.saveAs(backupPath);
await page.setInputFiles('input[type=file]', backupPath);
check(await seen('.import-confirm:has-text("Copia de Nicolas")'), 'importar muestra la copia antes de sustituir');
await page.click('button:has-text("Sí, importar")');
await page.waitForSelector('.nav');
check((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c1').trim())) === '#ffd166', 'tras importar se conserva el tema');
await page.click('.nav-item:has-text("Arena")');
check(await seen('.boss:has-text("Hidra")'), 'tras importar se conserva la partida (Hidra activa)');

// 7b. Cuenta atrás: se termina sola al llegar a 0
await page.click('.nav-item:has-text("Deep Work")');
await page.click('.chip-btn:has-text("Lluvia")');
check(await seen('.chip-btn[aria-pressed=true]:has-text("Lluvia")') && await seen('.ambient-dock:has-text("Lluvia")'), 'sonido de lluvia de fondo');
await page.click('.ambient-dock button[aria-label="Parar sonido de fondo"]');
await page.fill('#ambient-link', 'https://www.youtube.com/watch?v=jfKfPfyJRdk');
check(await page.isEnabled('.ambient-link button:has-text("Reproducir")'), 'acepta un enlace de YouTube');
await page.click('[role=radio]:has-text("25")');
await page.click('button:has-text("Empezar 25 min")');
await page.clock.fastForward('25:02');
await page.waitForTimeout(500);
check(await seen('text=25 min de foco · +25 XP'), 'cuenta atrás de 25 min se registra sola');

// 8. Móvil
await page.setViewportSize({ width: 390, height: 844 });
await page.click('.nav-item:has-text("Hoy")');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, 'sin scroll horizontal en móvil');
await page.screenshot({ path: `${out}/06-mobile.png`, fullPage: true });
await page.emulateMedia({ colorScheme: 'light' });
await page.screenshot({ path: `${out}/07-mobile-light.png`, fullPage: true });

// Las fuentes de Google pueden fallar sin red; no es un error de la app.
const appErrors = errors.filter((e) => !/Failed to load resource/.test(e));
check(appErrors.length === 0, `sin errores de la app ${appErrors.join(' | ')}`);
await browser.close();
