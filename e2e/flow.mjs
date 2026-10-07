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

/** Sesión libre de Deep Work de `minutes` minutos; cierra la subida de nivel salvo que se pida conservarla. */
async function deepWork(minutes, keepLevelUp = false) {
  await page.click('.nav-item:has-text("Deep Work")');
  await page.click('button.mode-card:has-text("Sesión libre")');
  await page.clock.fastForward(minutes * 60_000);
  await page.waitForTimeout(300);
  await page.click('text=Terminar sesión');
  if (!keepLevelUp && await seen('.levelup')) await page.click('.levelup button.primary');
  if (!keepLevelUp && await seen('.tour')) await page.click('.tour button:has-text("Saltar")');
}

const seen = (sel) => page.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);
const check = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

// 1. Crear cuenta / personaje
check(await seen('text=Entrar como invitado') && await page.isVisible('#login-email'), 'la entrada pide email y ofrece invitado');
await page.click('text=Entrar como invitado');
await page.fill('#hero-name', 'Nicolas');
await page.click('text=Crear personaje');
await page.waitForSelector('text=¿Qué hago ahora?');

// 1b. Tutorial con guía: aparece solo, obliga a elegir hábitos y no vuelve tras saltarlo
check(await seen('.tour .eyebrow:has-text("Hiperión · 1/6")'), 'el tutorial arranca con el guía');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('.nav-item.on:has-text("Hábitos")') && await seen('.tour-chips'), 'paso 2: Hiperión pide elegir hábitos');
check(!(await page.isVisible('.tour-chips .pick.on')), 'no hay hábitos predeterminados');
check(await page.isDisabled('.tour button:has-text("Siguiente")'), 'no se avanza sin elegir al menos uno');
await page.click('.tour-chips .pick:has-text("Leer")');
await page.click('.tour-chips .pick:has-text("Meditar")');
check(await seen('[data-tour="habits"] >> text=Meditar'), 'elegir un hábito en el tutorial lo crea');
await page.click('.tour-chips .pick:has-text("Meditar")');
check(!(await page.isVisible('[data-tour="habits"] >> text=Meditar')), 'y quitarlo lo borra');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('[data-tour="now"].tour-target'), 'paso 3 señala «¿Qué hago ahora?»');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('.nav-item.on:has-text("Misiones")') && await seen('[data-tour="quest-add"].tour-target'), 'paso 4 lleva a Misiones y señala el formulario');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/00-tutorial.png` });
await page.click('.tour button:has-text("Saltar")');
check(!(await page.$('.tour')) && !(await page.$('.tour-target')), 'saltar cierra el tutorial y quita el foco');
await page.reload();
await page.waitForSelector('.nav');
check(!(await seen('.tour')), 'el tutorial no vuelve a salir al recargar');
await page.click('.nav-item:has-text("Gremios")');
check(await seen('text=Se desbloquea en el nivel 7'), 'las secciones avanzadas están bloqueadas por nivel (Gremios, 7)');
await page.click('.nav-item:has-text("Reinos")');
check(await seen('text=Se desbloquea en el nivel 3'), 'Reinos se abre en el nivel 3');
await page.click('.nav-item:has-text("Hoy")');
// Entrenar se añade desde la lista de Hábitos (lo usan pasos siguientes)
await page.click('.nav-item:has-text("Hábitos")');
await page.fill('#new-habit', 'Entrenar');
await page.click('[data-tour="habits"] button:has-text("Añadir")');
await page.click('.nav-item:has-text("Hoy")');
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

// 2b. Fecha límite y calendario
await page.click('.nav-item:has-text("Misiones")');
await page.fill('#new-quest', 'Entregar el trabajo de Historia');
await page.fill('#new-quest-deadline', '2026-10-05');
await page.click('[data-tour="quest-add"] button:has-text("Crear")');
check(await seen('.item:has-text("Entregar el trabajo de Historia") .due-soon:has-text("vence mañana")'), 'misión con fecha límite: «vence mañana»');
await page.click('[role=radio]:has-text("Calendario")');
check(await seen('.cal-day.sel.today') && await seen('.cal-day:has(.cal-q:has-text("Entregar el trabajo"))'), 'el calendario muestra la misión en su fecha');
await page.click('.cal-day:has(.cal-q:has-text("Entregar el trabajo"))');
check(await seen('#cal-day-h:has-text("5 oct")'), 'pulsar un día muestra sus misiones');
await page.fill('.cal-add #new-quest', 'Repasar Física');
await page.click('.cal-add button:has-text("Crear")');
check(await seen('.cal-day:has(.cal-q:has-text("Repasar Física"))'), 'crear una misión desde el calendario le pone esa fecha');
await page.screenshot({ path: `${out}/02b-calendar.png`, fullPage: true });
await page.click('[role=radio]:has-text("Lista")');
for (const t of ['Entregar el trabajo de Historia', 'Repasar Física']) await page.click(`button[aria-label="Borrar ${t}"]`);
await page.click('.nav-item:has-text("Hoy")');

// 3. Completar misión → XP
await page.click('button[aria-label="Completar Responder emails"]');
check(await seen('.toast:has-text("+20 XP")'), 'toast +20 XP');
check(await seen('.achv-pop:has-text("Primer Juramento")'), 'logro épico al completar la primera misión');
await page.screenshot({ path: `${out}/03b-logro.png` });
await page.click('.achv-pop');
check(await seen('.nav-version:has-text("Excelsior RPG v1.")'), 'la versión de la app se ve en una esquina');
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

// 5b. Atributos y avatar: Diaria ⚔️3 + 45 min de «Terminar el tema 3» (teoría: ⚔️11,3 🧠22,5) + Principal (⚔️5 🔨5) + Leer (🧠3)
const attr = async (name) => (await page.textContent(`.attr:has-text("${name}") .attr-xp`)).trim();
check(await attr('Voluntad') === '19,3 XP', 'Voluntad 19,3 XP (con decimales)');
check(await attr('Maestría') === '5 XP', 'Maestría 5 XP (el Deep Work de un tema es teoría)');
check(await attr('Sabiduría') === '25,5 XP', 'Sabiduría 25,5 XP (Deep Work de estudio)');
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
check(!(await page.isVisible('.chronicle:has-text("Aceptar el reto")')), 'sin la Arena desbloqueada, la crónica no propone bosses');
await page.screenshot({ path: `${out}/04b-chronicle.png` });
await page.click('.chronicle button:has-text("Entendido")');
check(!(await page.$('.chronicle')), 'la crónica se cierra hasta la semana siguiente');
await page.click('.nav-item:has-text("Personaje")');
check((await page.$$('.hero-path .path-node')).length === 10, 'camino del héroe con 10 avatares en el mapa');
check(await seen('.hero-card .portrait.tier-0'), 'retrato con el aro de Aprendiz');
await page.click('.path-node:has-text("Titán")', { force: true }); // el aro gira: nunca está «quieto»
check(await seen('.path-detail:has-text("Titán") >> text=Más adelante'), 'pulsar un avatar del camino muestra sus requisitos');
check(await seen('text=125 XP global en total'), 'personaje muestra 125 XP totales');
check(await seen('.chart-sub:has-text("125 XP en 30 días")'), 'gráfica de XP: 125 XP en 30 días');
check((await page.$$('.day-strip rect')).length === 30, 'Actividad: un calendario con un cuadrado por día bajo la gráfica');
check(await seen('.day-strip rect.heat-4') && await seen('.day-strip rect.today.heat-0'), 'ayer brilla al máximo y hoy (sin XP) está vacío');
check(await seen('.chart-sub:has-text("racha")'), 'Actividad muestra días activos y rachas');
await page.click('[role=radio]:has-text("Todo")');
check(await seen('.chart-sub:has-text("125 XP en")') && (await page.$$('.day-strip rect')).length >= 7, 'Actividad «Todo»: todos los días desde el principio');
await page.click('[role=radio]:has-text("7 días")');
check(await seen('.chart-sub:has-text("en 7 días")'), 'la gráfica cambia a 7 días');
await page.hover('.chart svg rect[fill="transparent"]', { position: { x: 5, y: 60 } });
check(await seen('.chart-tip'), 'crosshair con tooltip al pasar por la gráfica');
await page.mouse.move(0, 0);
await (await page.$('section:has(#xp-chart-h)')).screenshot({ path: `${out}/05c-activity.png` });
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

// 7a2. Reinos: cada tarea es una construcción. Se abren en el nivel 3 (300 XP): 125 + 180 min de foco.
await page.click('.nav-item:has-text("Reinos")');
check(await seen('.locked-screen:has-text("nivel 3")'), 'en nivel 2 los Reinos siguen bloqueados');
await deepWork(180, true);
check(await seen('.unlock-line:has-text("Reinos")'), 'subir a nivel 3 anuncia los Reinos desbloqueados');
check(!(await page.$('.unlock-line:has-text("Ritual")')), 'Iniciado aún no tiene el ritual (falta la meta personal)');
await page.click('.levelup button:has-text("Ir a Reinos")');
check(await seen('.tour .tour-title:has-text("Los Reinos")'), 'al abrir Reinos por primera vez, Hiperión la presenta');
await page.click('.tour button:has-text("Siguiente")');
check(await seen('[data-tour="kingdom-add"].tour-target'), 'el tutorial de Reinos señala dónde fundar');
await page.click('.tour button:has-text("¡A por ello!")');
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
check(await seen('.kingdom-stage:has-text("Aldea · 1/2")'), 'con una construcción el reino pasa a Aldea 1/2');
check(await seen('.city-scene .bld.built') && await seen('.city-scene .palisade'), 'la ciudad dibuja el torreón y la empalizada de la villa');
check(await seen('.kingdom-node[aria-label*="Aldea, 1 construcciones"]'), 'el mapa muestra el reino como Aldea con 1 construcción');
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
check(await seen('.item:has-text("Tocar la guitarra") .rewards[aria-label="+2 Voluntad, +5 Impacto"]'), 'hábito a medida con varios atributos: +2 Voluntad, +5 Impacto');
check(await seen('.item:has-text("Tocar la guitarra") .xp-tag:has-text("+15 XP")'), 'hábito a medida da +15 XP');
await page.click('button[aria-label="Editar Tocar la guitarra"]');
await page.fill('[id$="-conexion"]', '3');
await page.click('.inline-edit button:has-text("Guardar")');
check(await seen('.item:has-text("Tocar la guitarra") .rewards[aria-label="+2 Voluntad, +3 Conexión, +5 Impacto"]'), 'editar un hábito añade otro atributo');

// 7a4. Arena: boss y tienda
await page.click('.nav-item:has-text("Arena")');
check(await seen('.locked-screen:has-text("nivel 5")'), 'en nivel 3 la Arena sigue bloqueada');
// La Arena se abre en el nivel 5 (1000 XP): sesiones largas de Deep Work hasta llegar.
await deepWork(240);
await deepWork(240);
await deepWork(180, true);
check(await seen('.unlock-line:has-text("Arena")'), 'subir a nivel 5 anuncia la Arena desbloqueada');
await page.click('.levelup button:has-text("Ir a Arena")');
check(await seen('.tour .tour-title:has-text("La Arena")'), 'Hiperión presenta la Arena');
await page.click('.tour button:has-text("Saltar")');
const coins = async () => Number((await page.textContent('.treasury-amount .coins')).replace(/[^0-9-]/g, ''));
const before = await coins();
check(before >= 25, `hay monedas para gastar (${before})`);
check(await seen('.saga:has-text("Saga del Héroe") .boss-template.locked:has-text("Medusa"):has-text("Nivel 8")'), 'Medusa aparece en silueta: «Nivel 8»');
check(await seen('.boss-template.locked:has-text("Tifón"):has-text("Nivel 30")'), 'Tifón, el jefe final, espera al nivel 30');
check((await page.$$('.boss-template:not(.locked) button:has-text("Invocar")')).length === 4, 'en nivel 5 hay 4 bosses para invocar');
await page.click('.boss-template:has-text("Hidra de la Procrastinación") button:has-text("Invocar")');
check(await seen('.summon-intro:has-text("Hidra de la Procrastinación")'), 'invocar la Hidra lanza su presentación');
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/09a-summon.png` });
await page.click('.summon-intro button:has-text("¡Al combate!")');
check(!(await page.$('.summon-intro')), 'la presentación se cierra');
check(await seen('.boss:has-text("Hidra de la Procrastinación")'), 'invocar la Hidra');
check(await seen('.boss-template.fighting:has-text("Hidra") >> text=En combate'), 'la Hidra figura en combate en su saga');
check(await seen('.shop-next:has-text("Tu próximo premio")'), 'la tienda señala el próximo premio');
await page.click('.shop-filter button:has-text("Premios grandes")');
check(await seen('.reward:has-text("Día libre sin culpa")') && !(await page.isVisible('.reward:has-text("Ver un episodio de una serie")')), 'filtrar la tienda por «Premios grandes»');
await page.click('.shop-filter button:has-text("Todo")');
await page.click('button[aria-label="Canjear Ver un episodio de una serie por 25 monedas"]');
check(await seen('.toast:has-text("guardado en tu cofre")'), 'canjear una recompensa la guarda en el cofre');
check(await coins() === before - 25, 'el canje resta 25 monedas');
check(await seen('.purchase:has-text("Ver un episodio de una serie"):has-text("en el cofre")'), 'el canje queda en el historial, en el cofre');
check(await seen('.chest-item:has-text("Ver un episodio de una serie")'), 'el cofre muestra el premio sin usar');
await page.click('.chest-item:has-text("Ver un episodio de una serie") button:has-text("Usar")');
check(await seen('.toast:has-text("A disfrutar de Ver un episodio")'), 'usar el premio');
check(!(await page.isVisible('.chest')) && await seen('.purchase:has-text("usado el")'), 'el premio usado sale del cofre y queda como usado');
await page.click('.nav-item:has-text("Hábitos")');
await page.click('button[aria-label="Completar Tocar la guitarra"]');
check(await seen('.toast:has-text("HP a Hidra")'), 'completar un hábito golpea a la Hidra');
await page.click('.nav-item:has-text("Arena")');
check(await seen('.boss .boss-hp:has-text("685 / 700")'), 'la Hidra baja a 685/700 HP');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/09-arena.png`, fullPage: true });
await (await page.$('[data-tour="shop"]')).screenshot({ path: `${out}/09b-shop.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'la Arena en móvil no tiene scroll horizontal');
await page.screenshot({ path: `${out}/09c-arena-mobile.png`, fullPage: true });
await page.setViewportSize({ width: 1280, height: 860 });

// 7a5. Tema y copia de seguridad, en la rueda de ajustes
await page.click('button[aria-label="Ajustes"]');
check(await seen('h1:has-text("Ajustes")'), 'la rueda abre Ajustes');
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

// 7b. Pomodoro con «¿Qué vas a hacer?»
await page.click('.nav-item:has-text("Deep Work")');
await page.click('.chip-btn:has-text("Lluvia")');
check(await seen('.chip-btn[aria-pressed=true]:has-text("Lluvia")') && await seen('.ambient-dock:has-text("Lluvia")'), 'sonido de lluvia de fondo');
await page.click('.ambient-dock button[aria-label="Parar sonido de fondo"]');
await page.fill('#ambient-link', 'https://www.youtube.com/watch?v=jfKfPfyJRdk');
check(await page.isEnabled('.ambient-link button:has-text("Reproducir")'), 'acepta un enlace de YouTube');
await page.fill('#dw-intent', 'Ejercicios de derivadas');
check(await seen('.dw-area:has-text("Maestría")'), '«¿Qué vas a hacer?» deduce que es práctica (Maestría)');
await page.click('[role=radio]:has-text("50 / 10")');
await page.click('button:has-text("Empezar Pomodoro")');
check(await seen('.focus-label:has-text("Ejercicios de derivadas")') && await seen('.eyebrow:has-text("Pomodoro 1")'), 'Pomodoro en marcha con lo que vas a hacer');
await page.clock.fastForward('50:02');
await page.waitForTimeout(500);
check(await seen('.phase-pill:has-text("Descanso")') && (await page.$$('.pomo-dots i.on')).length === 1, 'al acabar los 50 min empieza el descanso y cuenta 1 pomodoro');
await page.clock.fastForward('10:01');
await page.waitForTimeout(500);
check(await seen('.phase-pill:has-text("Descanso terminado")'), 'avisa cuando acaba el descanso');
await page.screenshot({ path: `${out}/09-pomodoro.png` });
await page.click('button:has-text("Siguiente pomodoro")');
check(await seen('.eyebrow:has-text("Pomodoro 2")'), 'empieza el segundo pomodoro');
await page.click('text=Terminar sesión');
check(await seen('text=50 min de foco · +50 XP'), 'Pomodoro: el descanso no da XP (50 min, +50 XP)');
check(await seen('.result:has-text("Ejercicios de derivadas")'), 'la sesión se llama como lo que ibas a hacer');

// 7c. Modo admin: con contraseña, partida de pruebas con todo desbloqueado, sin tocar la real
const realLevel = (await page.textContent('.nav-level')).match(/Nv \d+/)[0];
await page.click('button[aria-label="Ajustes"]');
await page.click('button:has-text("Avanzado")');
await page.fill('#admin-pw', 'no-es-la-buena');
await page.click('button:has-text("Entrar en modo admin")');
check(await seen('text=Contraseña incorrecta.'), 'el modo admin pide contraseña y rechaza una incorrecta');
check(!(await page.$('.admin-bar')), 'con contraseña incorrecta no entra');
if (process.env.ADMIN_PW) {
  await page.fill('#admin-pw', process.env.ADMIN_PW);
  await page.click('button:has-text("Entrar en modo admin")');
} else {
  console.log('aviso: sin ADMIN_PW, se entra en modo admin a mano');
  await page.evaluate(() => { localStorage.setItem('excelsior:admin-mode', '1'); location.reload(); });
}
await page.waitForSelector('#hero-name');
await page.fill('#hero-name', 'Pruebas');
await page.click('text=Crear personaje');
check(await seen('.admin-bar'), 'modo admin: barra visible y partida de pruebas nueva');
await page.click('.tour button:has-text("Saltar")');
check(!(await page.$('.nav-item.locked')), 'modo admin: todas las secciones desbloqueadas');
await page.click('button[aria-label="Ajustes"]');
await page.click('.admin-panel button:has-text("+2000 XP")');
check(await seen('.levelup'), 'modo admin: +2000 XP sube de nivel');
await page.click('.levelup button.primary');
if (await seen('.tour')) await page.click('.tour button:has-text("Saltar")');
await page.click('button[aria-label="Ajustes"]');
await page.fill('#admin-level', '9');
await page.click('.admin-panel button:has-text("Saltar al nivel")');
check(await seen('#lvl-h:has-text("Nivel 9")'), 'modo admin: saltar al nivel 9');
await page.click('.levelup button.primary');
if (await seen('.tour')) await page.click('.tour button:has-text("Saltar")');

// 7d. Rituales: cumplir los requisitos no asciende solo; Hiperión hace el ritual
await page.click('button[aria-label="Ajustes"]');
await page.click('.admin-panel button:has-text("7 días")');
check(await seen('.toast:has-text("Ritual disponible: Iniciado")'), 'simular 7 días cumple Iniciado y avisa del ritual');
await page.click('.nav-item:has-text("Personaje")');
check(await seen('.nav-item:has-text("Personaje") .nav-new:has-text("ritual")'), 'Personaje marca el ritual pendiente');
check((await page.textContent('.avatar-card .avatar-name')).trim() === 'Aprendiz', 'sin ritual sigues siendo Aprendiz');
await page.click('.avatar-card .ritual-cta');
check(await seen('.ritual:has-text("Ritual de ascensión")'), 'se abre el ritual con Hiperión');
await page.click('.ritual button:has-text("Empezar")');
check(await page.isDisabled('.ritual button:has-text("Siguiente")'), 'no se avanza sin responder');
await page.fill('#ritual-answer', 'Quiero dejar de posponer mi proyecto.');
await page.click('.ritual button:has-text("Siguiente")');
await page.fill('#ritual-answer', 'Programo 3 horas cada mañana y entreno.');
await page.click('.ritual button:has-text("Siguiente")');
check(await seen('.ritual:has-text("objetivos medibles a 3 meses")'), 'el Ritual del Iniciado pide objetivos a 3 meses');
check(await page.isDisabled('.ritual button:has-text("Siguiente")'), 'hace falta al menos un objetivo');
await page.fill('[aria-label="Objetivo 1"]', 'Ahorrar');
await page.fill('[aria-label="Valor actual del objetivo 1"]', '0');
await page.fill('[aria-label="Meta del objetivo 1"]', '1500');
await page.fill('[aria-label="Unidad del objetivo 1"]', '€');
await page.screenshot({ path: `${out}/12-ritual.png` });
await page.click('.ritual button:has-text("Siguiente")');
check(await seen('.oath:has-text("Juro encender la llama")'), 'el ritual termina con un juramento');
await page.click('.ritual button:has-text("Lo juro")');
check(await seen('#ascend-h:has-text("Ahora eres Iniciado")'), 'ceremonia: asciendes a Iniciado');
await page.screenshot({ path: `${out}/13-ascension.png` });
await page.click('.ascension button:has-text("Continuar")');
check((await page.textContent('.avatar-card .avatar-name')).trim() === 'Iniciado', 'la tarjeta de avatar ya dice Iniciado');
check(await seen('#timed-goals-h') && await seen('.goal:has-text("Ahorrar") >> text=quedan 90 días'), 'Objetivos a 3 meses con cuenta atrás');
check(await seen('.goal:has-text("Ahorrar") >> text=requisito de Forjador'), 'los objetivos cuentan para Forjador');
check(await seen('.journal:has-text("Quiero dejar de posponer mi proyecto.")'), 'Tu camino guarda tus respuestas');
await page.screenshot({ path: `${out}/14-camino.png`, fullPage: true });

// 7e. Revisión de Hiperión al día 30 de los objetivos
for (let i = 0; i < 4; i++) await page.clock.fastForward(8 * 24 * 3600 * 1000); // 32 días, en tramos (el reloj no admite saltos tan grandes)
await page.reload();
await page.click('.nav-item:has-text("Hoy")');
check(await seen('.review-banner:has-text("Día 30")'), 'a los 30 días Hiperión pide revisar los objetivos');
await page.click('.review-banner button:has-text("Revisar")');
await page.fill('[aria-label="Valor actual de Ahorrar"]', '400');
await page.fill('#review-note', 'Gasto demasiado en comida fuera.');
await page.click('.ritual button:has-text("Guardar revisión")');
check(!(await page.$('.review-banner')), 'tras revisar, el aviso desaparece hasta el día 60');
await page.click('.nav-item:has-text("Personaje")');
check(await seen('.goal:has-text("Ahorrar") >> text=400 / 1500'), 'la revisión actualiza el objetivo');

await page.click('button[aria-label="Ajustes"]');
await page.click('.admin-panel button:has-text("Salir del modo admin")');
await page.waitForSelector('.nav');
check(!(await page.$('.admin-bar')) && (await page.textContent('.nav-level')).includes(realLevel), `al salir vuelve la partida real intacta (${realLevel})`);

// 7f. Tu vida real: medidas, hábitos semanales, Deep Work por tipo, estado del día y eventos
await page.click('.nav-item:has-text("Personaje")');
await page.click('.metric-presets button:has-text("Dinero")');
await page.fill('[aria-label="Valor de hoy de Dinero"]', '500');
await page.click('.metric:has-text("Dinero") button:has-text("Apuntar")');
check(await seen('.metric:has-text("Dinero") .metric-value:has-text("500 €")'), 'medida: Dinero 500 €');
check(await seen('.attr:has-text("Impacto")'), 'el quinto atributo se llama Impacto');
check(await seen('.achievements .achv.got:has-text("Primer Juramento")'), 'Personaje muestra los logros conseguidos');
check(await seen('.attr-desc:has-text("disciplina")'), 'los atributos tienen descripción');
await page.click('.nav-item:has-text("Hábitos")');
await page.fill('#new-habit', 'Gimnasio');
await page.selectOption('#new-habit-freq', '3');
await page.click('[data-tour="habits"] button:has-text("Añadir")');
check(await seen('.item:has-text("Gimnasio") .freq-tag:has-text("0/3 esta semana")'), 'hábito 3 veces por semana');
await page.click('button[aria-label="Completar Gimnasio"]');
check(await seen('.item:has-text("Gimnasio") .freq-tag:has-text("1/3 esta semana")'), 'marcarlo suma a la semana');
await page.click('.nav-item:has-text("Deep Work")');
check(await seen('#dw-intent') && !(await page.$('[aria-label="Tipo de trabajo"]')), 'Deep Work pregunta qué vas a hacer (sin tipos fijos)');
await page.click('.nav-item:has-text("Hoy")');
await page.click('[aria-label="Energía 4 de 5"]');
await page.click('[aria-label="Ánimo 5 de 5"]');
await page.fill('#day-sleep', '7,5');
await page.fill('#day-note', 'Mañana empiezo antes.');
await page.click('.day-close button:has-text("Guardar el día")');
check(await seen('.day-close >> text=Guardado a las'), 'estado del día guardado');
await page.click('.nav-item:has-text("Misiones")');
if (!(await page.isVisible('.calendar'))) await page.click('[role=radio]:has-text("Calendario")');
await page.selectOption('.ev-form select', 'examen');
await page.fill('#ev-title', 'Examen de cálculo');
await page.fill('#ev-time', '10:00');
await page.click('.ev-form button:has-text("Evento")');
check(await seen('.cal-day.sel .cal-ev:has-text("Examen de cálculo")'), 'el evento aparece en el calendario');
await page.screenshot({ path: `${out}/15-calendar-events.png`, fullPage: true });
await page.click('.nav-item:has-text("Hoy")');
check(await seen('.upcoming:has-text("Examen de cálculo")'), 'Hoy muestra los próximos eventos');
await page.screenshot({ path: `${out}/16-today-life.png`, fullPage: true });

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

