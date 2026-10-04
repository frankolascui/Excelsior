# Excelsior — Life RPG

Life RPG según `docs/EXCELSIOR_SPEC.md`. Web app Vite + React + TypeScript, datos guardados en `localStorage`.

## Qué funciona
- Crear personaje (registro local, sin servidor) con hábitos iniciales.
- **Hoy**: nivel y XP, "¿Qué hago ahora?", resumen del día, misiones pendientes y hábitos.
- **Misiones**: crear (Diaria 20 XP, Principal 50, Secundaria 15), completar, deshacer, borrar.
- **Deep Work**: Sesión libre (cronómetro) o Con minutos (cuenta atrás de foco que se registra sola al llegar a 0). Botones Descanso y Me distraje; solo el foco da XP (1 XP/min). Foco real = foco ÷ (foco + distracción) × 100; los descansos no penalizan. Sobrevive a recargar la página.
- **Sonido**: efectos sintetizados con Web Audio (`src/sfx.ts`), botón de silencio arriba a la derecha.
- **Estilo**: negro puro con degradados rosa → morado → violeta y texto blanco, sin tema claro.
- **Hábitos**: ✓ diario (+10 XP), racha y últimos 7 días.
- **Personaje**: nivel, avatar, metas, atributos, totales, gráfica de XP diario (7/30/90 días, con tooltip y vista de tabla), actividad en cuadraditos (`src/charts.tsx`, datos en `src/activity.ts`), historial y ajustes.
- **Tutorial** (`src/tutorial.tsx`): un guía (por defecto «Maestro Sun», renombrable en Personaje → Ajustes) recorre las pantallas señalando cada parte. Sale una vez por personaje y se repite desde Ajustes. Se guarda en `localStorage` (`excelsior:tutorial`), fuera del estado de la partida.
- **Personalización**: al crear una misión, construcción o hábito se puede elegir el atributo que entrena (✨ Auto = deducido del nombre).

## Atributos y avatar (src/attributes.ts)
- 5 atributos: ⚔️ Voluntad, 🧠 Sabiduría, 🔨 Maestría, ❤️ Conexión, 🌍 Creación. Cada transacción de XP guarda también el XP de atributo; XP, nivel (25·L·(L−1)) e historial de cada atributo se derivan de ahí.
- Misiones: Principal ⚔️5 🔨5 · Secundaria ⚔️3 · Diaria ⚔️3, +3 ❤️ Conexión o 🌍 Creación si el título lo indica (llamar, amigos, familia… / crear, escribir, grabar, publicar…). Deep Work (cualquier área): 🔨1/min y ⚔️0,5/min. El XP de atributo admite decimales.
- Hábitos según su nombre: meditar ⚔️3 🧠2 · entrenar ⚔️5 · journaling/diario 🧠4 · leer/estudiar 🧠3 · llamar/amigos/familia ❤️4 · escribir/crear/dibujar 🌍4 · resto ⚔️2. Se guardan en `Habit.rewards`.
- Atributo elegido a mano: misión = recompensa del tipo +3 en ese atributo; hábito = +4 en ese atributo.
- Avatar: requiere nivel global + niveles de atributo (Disciplinado: Nv3 + Voluntad 2 · Artífice: Nv6 + Voluntad 3 + Maestría 3 · Arquitecto: Nv10 + Voluntad 4 + Maestría 4 + Sabiduría 3 · Fundador: Nv15 + todos 4 · Prime: Nv25 + todos 6) + las metas que asignes. La barra es la media del progreso de los requisitos. Se desbloquean en orden.
- **Reinos** (`src/kingdoms.ts`, mapa en `src/realm.tsx`): proyectos medievales que se construyen como una ciudad. Cada construcción es una misión normal con `kingdomId` (🛖 Cabaña = Secundaria, ⚒️ Herrería = Diaria, 🏰 Torreón = Principal), así que da XP y atributos. Etapas: Tierras baldías → Campamento → Aldea → Villa (34 %) → Ciudad amurallada (67 %) → Reino glorioso (100 %). El mapa muestra tu fortaleza en el centro y un camino hacia cada reino que se ilumina según su %, más el dominio total.
- **Metas** (`Goal`): metas reales medibles (dinero, peso, personas…) de un valor inicial a un objetivo (subiendo o bajando), asignadas al siguiente avatar.
- Datos guardados de versiones anteriores se migran solos al cargar y recalculan el XP de atributo con las reglas actuales (`migrate` en `src/game.ts`, estado versión 4).

## Reglas (src/game.ts)
- Nivel L requiere 50·L·(L−1) XP acumulado (Nv2 = 100, Nv5 = 1.000, Nv10 = 4.500, Nv20 = 19.000, Nv50 = 122.500).
- Anti-farmeo: tope diario de 200 XP por misiones y 100 XP por hábitos; deshacer retira el XP; sesiones < 1 min no cuentan y > 240 min cuentan como 240.

## Comandos
```bash
npm install
npm run dev            # desarrollo
npm test               # tests de reglas (vitest)
npm run build          # build normal en dist/
npm run build:single   # un único HTML en dist-single/ (vista previa)
node e2e/flow.mjs out  # prueba de extremo a extremo con Playwright (requiere build:single)
```

## Estructura
- `src/types.ts` modelo de datos · `src/game.ts` reglas puras · `src/attributes.ts` atributos y avatar · `src/store.ts` estado + guardado (único módulo a cambiar al añadir backend)
- `src/kingdoms.ts` reinos · `src/activity.ts` actividad diaria · `src/charts.tsx` gráficas · `src/realm.tsx` mapa · `src/tutorial.tsx` tutorial
- `src/ui.tsx` componentes compartidos · `src/screens.tsx` pantallas · `src/App.tsx` navegación

## Publicar en GitHub Pages
Cada push a `main` pasa los tests y publica `dist/` (`.github/workflows/deploy.yml`). Requisito una sola vez: Settings → Pages → Source: «GitHub Actions».
