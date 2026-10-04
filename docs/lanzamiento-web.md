# Excelsior: qué falta para lanzar la web

Estado a 2026-10-04. Distingo hechos (lo que hay), recomendaciones (lo que haría) y preguntas (lo que tienes que decidir tú).

## 1. Lo que ya hay (hechos)
- App web (React + TypeScript) con personaje, misiones, Deep Work (libre / minutos, descanso, distracción, % de foco), hábitos con racha, XP global, 5 atributos, avatares con requisitos, sonidos y estilo negro con degradados.
- 21 tests de reglas y una prueba de navegador de un día completo (21 comprobaciones).
- Los datos viven **solo en el navegador** donde se usa (localStorage). Otro dispositivo = otra partida; borrar datos del navegador = perderlo todo.
- El código está en la carpeta compartida del proyecto, **no en un repositorio Git**, y **no está publicado en ninguna dirección web propia** (solo la vista previa privada en claude.ai).

## 2. Lo que falta para lanzar (por orden recomendado)

### Bloque A: ponerla en tu móvil y usarla a diario (barato, sin backend)
1. **Repositorio en GitHub**: control de versiones y base para publicar. Necesita que conectes un repo en Project settings.
2. **Publicarla en una URL propia** con un hosting de sitios estáticos (p. ej. Vercel, Netlify o Cloudflare Pages; los tres tienen plan gratuito para esto). Hoy la app no necesita servidor, así que se puede publicar tal cual.
3. **App instalable (PWA)**: icono en la pantalla de inicio y funcionamiento sin conexión.
4. **Copia de seguridad**: exportar e importar tus datos en un archivo, para no perderlos mientras no haya cuentas.
5. **Dogfooding 2–4 semanas** (§30 del spec): usarla tú cada día y apuntar fricciones antes de añadir más cosas.

### Bloque B: que otras personas la usen
6. **Cuentas y base de datos** (registro real, datos en la nube, varios dispositivos). Es un requisito para amigos, gremios y jefes. Hay que elegir servicio (Supabase, Firebase u otro).
7. **Privacidad y legal**: con cuentas de usuarios en España/UE necesitas al menos política de privacidad y aviso de cookies (RGPD). No soy abogado: conviene revisarlo con alguien que lo sea si va a ser público.
8. **Página de inicio (landing)** que explique Excelsior en 10 segundos.
9. **Medir la métrica principal** (§32): retención y acciones importantes por semana, con analítica respetuosa.
10. **Dominio** (nombre web propio).

### Bloque C: producto pendiente del spec
- MVP 1.1: skills, calendario sencillo, historial, **exportación diaria a IA** (EXCELSIOR_CONTEXT.md + informe del día).
- MVP 1.2: amigos, gremios, misiones cooperativas, jefes, límite del 30 %.
- Reinos (solo está el tipo de dato), requisitos reales de los avatares, editor de recompensas de atributos.

## 3. Limitaciones conocidas (para que no te sorprendan)
- **Temporizador en el móvil**: el tiempo se calcula bien aunque cierres la pestaña, pero si el móvil suspende el navegador, el sonido de fin de cuenta atrás no suena hasta que vuelves a abrirla. Avisos fiables en segundo plano requieren PWA con notificaciones o app nativa.
- **Atributos por palabras clave**: Conexión y Creación dependen de palabras del título («llamar», «escribir»…). Es frágil; a medio plazo conviene elegir el atributo con un toque al crear la misión.
- **XP por misiones**: crear y completar misiones sigue siendo farmeable dentro del tope diario (200 XP).

## 4. Mi recomendación
Hacer el Bloque A ya (repo + publicar + PWA + copia de seguridad), usarla tú 2 semanas y decidir el Bloque B con datos reales de uso. Construir cuentas y gremios antes de saber si tú mismo la usas a diario es el error más caro posible aquí.
