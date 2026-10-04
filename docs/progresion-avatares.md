# Progresión de avatares

Diez avatares, de **Aprendiz** a **Excelsior**. Los requisitos fijos son iguales para todo el mundo (están en `AVATARS`, `src/attributes.ts`). Además, cada persona puede añadir metas reales (dinero, peso, personas…) a su siguiente avatar.

## Principios
1. **Tres tipos de prueba en cada avatar:** constancia (nivel global, días activos, rachas), equilibrio (niveles de atributo) y hazañas (horas de Deep Work, reinos completados, bosses derrotados).
2. **Curva casi geométrica:** cada avatar cuesta aproximadamente el doble de tiempo que el anterior. Los primeros llegan en días para enganchar, y el último en un año.
3. **No se puede farmear:** los topes diarios limitan el XP, y las hazañas exigen tiempo real (días distintos, rachas, plazos de los bosses).

## Escalera y ritmo estimado
Los ritmos son **una estimación, no un dato**. Suponen un «día comprometido» de unos 220 XP: 1 misión principal, 2 diarias, 4 hábitos y 90 min de Deep Work. Con esas reglas, cada día se gana aproximadamente esto en cada atributo: Voluntad 64, Maestría 95, Sabiduría 9, Conexión 4 y Creación 4. En un día flojo (unos 80 XP) todo va unas 2,5 veces más lento.

| # | Avatar | Requisitos | Llega en (día comprometido) |
|---|---|---|---|
| 1 | 🪓 Aprendiz | — | inicio |
| 2 | 🕯️ Iniciado | Nv 3 · 3 días con progreso | 3 días |
| 3 | 🛡️ Disciplinado | Nv 5 · Voluntad 3 · racha de 7 días | 1 semana |
| 4 | ⚒️ Artífice | Nv 8 · Maestría 5 · 10 h de Deep Work | 2 semanas |
| 5 | 📐 Arquitecto | Nv 12 · Sabiduría 3 · 1 reino completado · 30 días con progreso | 1 mes |
| 6 | 🏹 Cazador de Bestias | Nv 16 · Voluntad 6 · 3 bosses | 2 meses |
| 7 | 🔥 Forjador | Nv 20 · Maestría 8 · Conexión 3 · 50 h de Deep Work | 3 meses |
| 8 | 🏰 Fundador | Nv 25 · todos los atributos a 4 · 3 reinos · racha de 21 | 4–5 meses |
| 9 | ⚡ Titán | Nv 32 · todos a 6 · 10 bosses · racha de 30 | 7–8 meses |
| 10 | 🌟 Excelsior | Nv 40 · todos a 8 · 200 h de Deep Work · 300 días con progreso | ~1 año |

## Riesgo detectado: atributos desequilibrados
Con las reglas automáticas, Conexión y Creación suben unas 20 veces más despacio que Maestría. A partir de Fundador («todos los atributos a N»), ese será el cuello de botella. Hay dos salidas:
- **Ya disponible:** asignar a mano esos atributos con ⚙/✎ en hábitos y misiones (por ejemplo, «Quedar con amigos» → Conexión 5, «Escribir» → Creación 5).
- **Pendiente de decidir:** reducir el Deep Work a +0,5 de Maestría por minuto, o subir lo que dan Conexión y Creación. No lo he cambiado porque la regla del Deep Work la fijó Nicolas.
