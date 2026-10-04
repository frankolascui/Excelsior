# Plan: atributos, avatar y Home (evolución del MVP 1)

## 1. Arquitectura actual
- `src/types.ts`: modelo de datos (GameState, Quest, Habit, DeepWorkSession, XPTransaction).
- `src/game.ts`: reglas puras (XP, niveles, rachas, timer, «¿Qué hago ahora?»). Cada acción devuelve un estado nuevo.
- `src/store.ts`: estado en React + guardado en localStorage (`excelsior:v1`).
- `src/ui.tsx` / `src/screens.tsx` / `src/App.tsx`: interfaz.
- Todo el XP vive en una lista de transacciones (`xp`). El total y el nivel se calculan a partir de ella, por eso «Deshacer» funciona sin estado duplicado.

## 2. Archivos que cambian
| Archivo | Cambio |
|---|---|
| `src/types.ts` | `AttributeId`, `AttributeRewards`, recompensas en `Habit` y `XPTransaction`, `area` en sesiones, tipo `Kingdom` y `kingdoms: []`. Versión 2. |
| `src/attributes.ts` (nuevo) | Tabla de recompensas hardcodeada, niveles de atributo, avatar actual/siguiente/% |
| `src/game.ts` | Las acciones añaden XP de atributo a la misma transacción |
| `src/store.ts` | Migración v1 → v2 (no se pierden datos) |
| `src/screens.tsx`, `src/ui.tsx`, `src/styles.css` | Home reordenado, elegir área en Deep Work, atributos en Personaje |
| `src/*.test.ts`, `e2e/flow.mjs` | Tests nuevos |

## 3. Nuevo modelo de datos
- `XPTransaction.attributes?: { voluntad?: n, sabiduria?: n, ... }`: cada acción guarda el XP global **y** el de cada atributo en el mismo registro.
- El XP, el nivel y el historial de cada atributo se calculan sumando esas transacciones. Así, «Deshacer» también retira el XP de atributo y no hay dos contadores que puedan desincronizarse.
- `Habit.rewards`: recompensas del hábito, asignadas al crearlo según su nombre (meditar, entrenar, journaling…). Queda guardado, de modo que un editor futuro solo tendría que cambiar este campo.
- `DeepWorkSession.area`: Programación, Edición, Estudio o General.
- `Kingdom { id, name, progress }` y `GameState.kingdoms: []`, sin UI.

## 4. Problemas detectados y decisión tomada
1. **Conexión y Creación no reciben XP** con la tabla dada. Se quedan a 0 hasta que haya acciones que las alimenten (propuesta: elegir atributo al crear misión).
2. **Misión Diaria y hábitos sin regla** (Leer, Caminar…): uso +3 Voluntad para la Diaria, +3 Sabiduría para Leer/Estudiar y +2 Voluntad para cualquier otro hábito.
3. **0,5 XP/min** produce decimales: se redondea hacia abajo (45 min = 22 Voluntad).
4. **Datos ya guardados**: la migración recalcula el XP de atributo de las acciones pasadas a partir de su origen (tipo de misión, minutos, nombre del hábito).
5. **Avatar**: sale del XP total de atributos (0 / 250 / 1.000 / 3.000 / 7.500 / 15.000). Sustituye a los títulos Novato/Aprendiz en la interfaz para no mostrar dos nombres de rango a la vez.
6. **Topes anti-farmeo**: si una acción llega al tope diario y da 0 XP global, tampoco da XP de atributo.
7. **Hábitos y resumen del día** no están en tu orden del Home: los hábitos se quedan junto a las misiones pendientes y el resumen pasa a una línea en el bloque de XP global.
