# EXCELSIOR — Master Roadmap & Product Specification v0.1

> Fuente de verdad del producto, escrita por Nicolas (mensaje raíz del hilo "Crear una web rpg de excelsior", 2026-10-04). Copia fiel para que futuros hilos la usen como contexto.

## 1. VISIÓN
Excelsior es un Life RPG que convierte la mejora personal y la productividad en un juego.
Su objetivo es ayudar especialmente a personas desorganizadas, que procrastinan o tienen dificultades para mantener el foco, a convertir sus objetivos en acciones simples y visibles.

Excelsior combina: Productividad, Desarrollo personal, Gamificación, Deep Work, Hábitos, Misiones, Progreso, RPG, Competición/cooperación social, Gremios, Jefes, Recompensas.

La aplicación debe ser: **Muy estética + extremadamente sencilla + divertida + rápida de usar.**
La complejidad debe estar en el sistema interno, no en la experiencia del usuario.

## 2. PRINCIPIO FUNDAMENTAL
Excelsior no debe exigir que una persona organizada utilice Excelsior. Debe ocurrir lo contrario: una persona desorganizada entra en Excelsior y la aplicación le ayuda a saber qué hacer.

El usuario debe poder abrir la aplicación y entender en pocos segundos:
1. Qué tengo que hacer.
2. Qué puedo hacer ahora.
3. Qué progreso llevo.
4. Qué estoy intentando conseguir.
5. Qué puedo completar hoy.
6. Cómo estoy progresando respecto a mis objetivos.
7. Qué está haciendo mi gremio.

## 3. CORE LOOP
Loop individual: Abrir Excelsior → Ver qué hacer → Comenzar una misión / Deep Work → Completar la acción → Registrar automáticamente el resultado → Obtener XP / progreso → Ver progreso → Continuar.

Loop social: Crear/unirse a gremio → Aceptar misión o jefe → Cada miembro contribuye → El progreso colectivo aumenta → Se derrota el jefe / completa la misión → Todos reciben recompensa → Nuevo reto.

Loop de análisis externo: Excelsior registra el día → Exportar día → Enviar contexto + día a Claude/otra IA externa → La IA analiza el rendimiento → La IA decide/recomienda próximas acciones → El usuario introduce/ejecuta esas acciones en Excelsior.

IMPORTANTE: Excelsior NO tendrá IA integrada inicialmente. La IA será externa durante las primeras versiones.

## 4. USUARIO OBJETIVO
Persona desorganizada; procrastina; tiene problemas para mantener constancia; quiere mejorar; tiene objetivos pero le cuesta convertirlos en acciones; le gustan los videojuegos o la gamificación; quiere ver progreso visual; puede sentirse motivado por amigos y competición/cooperación; no quiere configurar un sistema complejo.

Excelsior NO debe estar diseñado inicialmente para usuarios obsesionados con la productividad que quieren configurar cientos de parámetros.

## 5. PRINCIPIOS UX
### 5.1 Simplicidad
La mayoría de acciones deben poder hacerse mediante: click, selección, drag & drop cuando sea realmente necesario, botones claros.
Evitar: formularios largos, configuraciones innecesarias, interfaces llenas de texto, sistemas que requieran aprender la aplicación.

### 5.2 Complejidad interna, simplicidad externa
El sistema puede tener una arquitectura compleja; el usuario no debería verla.
En lugar de: Crear objetivo → crear proyecto → crear categoría → crear métrica → configurar recompensa → configurar XP...
Debe poder hacer: **+ Nueva misión** y crearla rápidamente.

## 6. SISTEMA RPG
Cada usuario tiene un personaje con: Nivel, XP, Estadísticas, Habilidades, Misiones, Logros, Rachas, Progreso, Historial.

## 7. XP
Las acciones reales generan XP. Ejemplos iniciales:
- Deep Work → XP según duración.
- Completar misión → XP.
- Completar misión principal → más XP.
- Completar hábito → XP.
- Completar objetivo importante → XP.
- Participar en misión de gremio → XP.

Los valores exactos deberán balancearse durante el testing.
IMPORTANTE: la gamificación debe premiar acciones reales, no simplemente abrir la aplicación. Evitar sistemas donde el usuario pueda farmear XP sin realizar trabajo significativo.

## 8. NIVELES
El usuario sube de nivel acumulando XP. El nivel representa progreso acumulado.
Ejemplo conceptual: Nivel 1 → Novato; Nivel 5 → Aprendiz; Nivel 10 → Competente; Nivel 20 → Experto; Nivel 50 → Maestro. Nombres y fórmulas podrán cambiar.

## 9. HABILIDADES
Ejemplos: Programación, Matemáticas, Comunicación, Edición, Escritura, Fitness, Lectura, Creatividad, Deep Work, Disciplina.
Una skill tiene: Nivel, XP, Progreso, Historial. Las acciones pueden estar asociadas a una skill (60 min programando → +XP en Programación).

## 10. MISIONES
Unidad principal de acción. Tipos: Daily Quest (tarea diaria), Main Quest (objetivo importante), Side Quest (objetivo secundario), Habit Quest (acción recurrente), Guild Quest (misión cooperativa), Boss (objetivo colectivo de mayor dificultad).

## 11. DEEP WORK
Temporizador extremadamente sencillo: Seleccionar misión/skill → Iniciar timer → Trabajar → Terminar → Registrar automáticamente duración → Obtener XP.
Ejemplo: programar 45 min → sesión completada → +45 min Deep Work → +XP → progreso de Programación.
El usuario no debería tener que introducir manualmente la duración si el timer ya la conoce.

## 12. HABITS
Cada hábito: Nombre, Frecuencia, Completado/no completado, Racha, Historial.
Ejemplos: Meditar, Entrenar, Leer, Dormir correctamente, Caminar, Estudiar.
Interacción principal: **✓ Completado**.

## 13. CALENDARIO
Mucho más sencillo que un calendario profesional; no competir con Google Calendar.
Funciones: Día, Semana, Eventos/tareas, Misiones programadas, Sesiones de Deep Work.
Debe responder: ¿Qué tengo que hacer hoy?

## 14. DASHBOARD
La pantalla más importante. Muestra de forma visual:
- **Hoy:** misiones pendientes, misiones completadas, hábitos, Deep Work, progreso diario, XP ganado.
- **RPG:** nivel, XP, progreso al siguiente nivel, skills.
- **Social:** gremio, progreso del gremio, jefe activo, contribución personal.
- **Acción principal:** una acción claramente visible: **¿Qué hago ahora?** La interfaz debe reducir la fricción para empezar.

## 15. GREMIOS
Grupo de amigos que progresa conjuntamente. Un usuario puede: crear gremio, unirse, invitar amigos, ver miembros, ver progreso colectivo, participar en misiones y jefes.

## 16. GUILD QUESTS
Misiones colectivas. Ejemplo: "Los 100 minutos" — completar 100 minutos de Deep Work entre todos esta semana. Cada miembro contribuye con acciones reales; el progreso se actualiza automáticamente.

## 17. JEFES
Objetivos colectivos grandes. Ejemplo: ⚔️ EL DRAGÓN DE LA PROCRASTINACIÓN — 40 horas de Deep Work esta semana. Barra `████████████░░░░░░░░ 60%`. Cada miembro contribuye con Deep Work real. Al alcanzar el objetivo: JEFE DERROTADO, el gremio recibe recompensas.

## 18. LÍMITE DE CONTRIBUCIÓN DEL 30%
Ningún miembro puede aportar más del 30% del requisito total de una misión/jefe.
Ejemplo: Boss de 40 horas → máximo por persona 40 × 0.30 = 12 horas. Si un jugador hace 20 h: reales 20, contabilizadas 12. Evita que una persona carree al gremio.

## 19. OBJETIVOS SOCIALES MÁS COMPLEJOS
Deep Work (30 h colectivas); Hábitos (50 completados); Consistencia (4 miembros activos 7 días); Mixto (20 h Deep Work + 30 hábitos + mínimo 4 participantes). Obliga a la cooperación real.

## 20. REGLA DE DISEÑO SOCIAL
Cooperación > Carrying. No queremos que 1 jugador haga el 90% y 4 miren. El límite del 30% es una primera solución.

## 21. RECOMPENSAS DE GREMIOS
XP personal, XP del gremio, logros, insignias, cosméticos, títulos, progreso del gremio. Evitar inicialmente economías virtuales complejas.

## 22. SOCIAL
Futuro: perfil, amigos, gremios, invitaciones, ranking entre amigos, ranking de gremios, actividad reciente, logros, progreso compartido. Debe fomentar cooperación y motivación, no convertirse en una red social.

## 23. PROGRESS
Muestra: XP, nivel, Deep Work acumulado, skills, hábitos, rachas, misiones completadas, progreso semanal y mensual, historial. El usuario debe poder pensar: "Estoy avanzando."

## 24. EXPORTACIÓN A IA
Sin IA integrada inicialmente; exportar información del usuario.
- **Persistent Context** (`EXCELSIOR_CONTEXT.md`): objetivos, valores, proyectos, skills, hábitos, preferencias, contexto relevante.
- **Daily Report** (`YYYY-MM-DD.md`): fecha, Deep Work, sesiones, misiones completadas y fallidas, hábitos, entrenamiento, aprendizaje, notas, energía, estado general, sueño, XP, nivel, progreso, información del gremio.

## 25. OBJETIVO DE LA IA EXTERNA
El usuario envía EXCELSIOR_CONTEXT.md + Daily Report a Claude, que analiza qué ocurrió, qué funcionó, qué falló, cuellos de botella, patrones, progreso y qué hacer después, y genera instrucciones que el usuario ejecuta en Excelsior.
Excelsior = Registrar + visualizar + ejecutar. IA externa = Analizar + razonar + decidir.

## 26. PANTALLAS PRINCIPALES
1. Dashboard 2. Quests 3. Deep Work 4. Habits 5. Calendar 6. Character 7. Skills 8. Progress 9. Guild 10. Boss 11. Friends 12. Export. No todas en el MVP.

## 27. MVP
Objetivo: demostrar que el core loop funciona.
- **MVP 1:** Registro/login, Dashboard, Crear misión, Completar misión, Deep Work timer, Hábitos, XP, Nivel, Progreso básico, Perfil/personaje, Guardado de datos.
- **MVP 1.1:** Skills, Calendario, Historial, Exportación diaria.
- **MVP 1.2:** Amigos, Gremios, Misiones cooperativas, Jefes, Sistema del 30%.

## 28. POST-MVP
- V0.2: mejor UX, animaciones, feedback visual, mejor sistema RPG, más personalización, logros.
- V0.3: gremios avanzados, jefes más complejos, rankings, eventos, misiones cooperativas avanzadas.
- V0.4: integraciones externas, mejor exportación, automatizaciones.
- V1.0: producto estable y completo. La IA integrada podría evaluarse después.

## 29. ROADMAP DE DESARROLLO
- **Fase 0 — Product Vision:** problema, usuario, propuesta de valor, diferenciación, core loop, principios. Output: Product Vision Document.
- **Fase 1 — Game Design:** XP, levels, skills, quests, habits, streaks, rewards, guilds, bosses, regla del 30%. Output: Game Design Document.
- **Fase 2 — UX:** user flows, navegación, dashboard, quests, timer, habits, character, guild, boss. Prioridad: Usabilidad > estética; después Estética > efectos.
- **Fase 3 — Data Model:** User, Profile, Quest, Habit, HabitCompletion, DeepWorkSession, Skill, XPTransaction, Achievement, Guild, GuildMember, GuildQuest, Boss, BossContribution, Friend, CalendarEvent. Definir relaciones y reglas antes de programar.
- **Fase 4 — Technical Foundation:** web app, frontend, backend, database, authentication, routing, component system, deployment, git. Claude Code debe construir siguiendo el documento, no improvisar arquitectura.
- **Fase 5 — Core Product:** 1. Authentication 2. Dashboard 3. Quests 4. Deep Work 5. Habits 6. XP 7. Level 8. Profile 9. Basic Progress. Al finalizar, un usuario debe poder usar Excelsior un día completo.
- **Fase 6 — RPG:** skills, skill XP, achievements, streaks, rewards, character progression, animaciones/feedback.
- **Fase 7 — Social RPG:** friends, guild creation, invitations, members, guild quests, bosses, contributions, 30% cap, guild progress, guild rewards.
- **Fase 8 — Calendar + Export:** calendar, daily report, persistent context export, markdown export, data summary.
- **Fase 9 — Testing:** con usuarios reales. ¿Entienden qué hacer? ¿Empiezan rápido? ¿Usan el timer? ¿Completan misiones? ¿Entienden XP, gremio, jefe? ¿El 30% es intuitivo? ¿Vuelven al día siguiente?

## 30. DOGFOODING
Usar Excelsior personalmente 2–4 semanas antes de añadir muchas funcionalidades. Registrar fricciones, funciones inútiles, funciones que faltan, cosas que no se entienden, acciones con demasiados clicks, momentos de abandono. Primero solucionar los problemas reales encontrados.

## 31. WHAT NOT TO BUILD
Chatbot IA; red social completa; marketplace; economía virtual compleja; sistema de monedas complejo; 100 tipos de estadísticas; calendario avanzado; integración con todas las apps; personalización infinita; funciones "porque quedan cool".
Regla: si una feature no mejora claramente el core loop, queda fuera.

## 32. MÉTRICA PRINCIPAL
¿Excelsior consigue que el usuario haga más acciones importantes de las que habría hecho sin Excelsior?
Secundarias: misiones completadas, Deep Work, hábitos completados, retención, sesiones por semana, gremios activos, jefes completados.

## 33. PRINCIPIO DE DESARROLLO
No construir Excelsior entero de una vez. Desarrollar verticalmente:
Dashboard → Quest → completar Quest → XP → guardar → mostrar XP. Después: Timer → sesión → XP → progreso. Después: Guild → Quest → contribución → Boss → recompensa. Cada módulo debe funcionar de extremo a extremo.

## 34. PRINCIPIO DE CLAUDE CODE
Antes de implementar: 1. Entender el objetivo. 2. Revisar arquitectura existente. 3. Identificar dependencias. 4. Proponer implementación. 5. Implementar. 6. Probar. 7. Verificar que no rompe nada.
No generar código innecesario, no crear abstracciones prematuras, no añadir features no solicitadas, no cambiar arquitectura sin justificarlo.
Priorizar: Funcionamiento → simplicidad → mantenibilidad → estética → optimización.

## 35. DEFINICIÓN DE ÉXITO DEL MVP
Una persona puede: 1. Crear una cuenta. 2. Entrar en Dashboard. 3. Entender qué hacer. 4. Crear una misión. 5. Iniciar Deep Work. 6. Completar una misión. 7. Ganar XP. 8. Ver subir su progreso. 9. Completar hábitos. 10. Volver al día siguiente.
Después: 11. Crear/unirse a un gremio. 12. Aceptar un jefe. 13. Contribuir. 14. Ver el progreso colectivo. 15. Derrotar el jefe junto a sus amigos.

## 36. IDEA CENTRAL
No "un habit tracker con XP", sino "Mi vida tiene un sistema de progresión". El usuario abre Excelsior para jugar su vida y progresar en ella.

## 37. PREGUNTA CENTRAL DE PRODUCTO
¿Esto hace que el usuario tenga más facilidad para actuar, progresar o disfrutar del proceso? Si no: no construirlo.

## 38. ORDEN DE PRIORIDAD
1. Core loop. 2. Facilidad de uso. 3. Registro fiable de acciones. 4. Feedback de progreso. 5. Gamificación. 6. Social/Gremios. 7. Estética. 8. Integraciones. 9. IA.
La IA NO debe ocultar un producto base débil.

## 39. VISIÓN FINAL
Tu vida real → acciones → XP → progreso → niveles y habilidades → capacidad real. Los amigos forman gremios que afrontan misiones y jefes, mientras una IA externa analiza el historial y ayuda a decidir qué hacer después.
La experiencia final: **un RPG construido alrededor de tu vida real.**
