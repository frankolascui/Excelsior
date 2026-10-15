# Login por email con código — propuesta (6 oct 2026)

## Qué cambia
Hasta ahora la partida vive solo en el navegador (localStorage). Un login real implica **un servidor** que guarde las cuentas y las partidas. Esto levanta la regla anterior de "sin backend", así que antes de programar necesito tu visto bueno.

## Flujo para el usuario
1. Pantalla de entrada: escribe su email → **Enviar código**.
2. Le llega un correo con un **código de 6 dígitos**.
3. Lo escribe → entra. Sin contraseñas.
4. Su partida se guarda en la nube y la ve igual en el PC y en el móvil.
5. Si ya tenía una partida local, al entrar por primera vez se sube a su cuenta (no pierde nada).

## Opción recomendada: Supabase
- Trae de serie el login por email con código (OTP): `signInWithOtp` envía el código y `verifyOtp` lo comprueba.
- Base de datos Postgres con reglas por fila: cada usuario solo puede leer y escribir su propia partida.
- Plan gratuito suficiente para ti y tus amigos.
- Encaja con la arquitectura actual: solo cambia `src/store.ts` (ya estaba previsto así).

Alternativas descartadas:
- **Firebase:** su login por email nativo es por enlace, no por código; los códigos exigirían programar funciones de servidor aparte.
- **Servidor propio:** más trabajo y más mantenimiento sin ventaja para tu caso.

## Modelo de datos
Una tabla `saves`:
| columna | tipo | nota |
|---|---|---|
| user_id | uuid (clave) | el usuario de Supabase |
| state | jsonb | el GameState completo, como hoy |
| updated_at | timestamptz | para saber qué copia es más nueva |

Regla de seguridad: `user_id = auth.uid()` para leer y escribir.

## Sincronización
- localStorage sigue siendo la caché: la app funciona igual de rápido y sin conexión.
- Cada cambio se sube a la nube con un pequeño retraso (agrupando cambios), y en el acto al cambiar de app o cerrar la pestaña. Si la partida no cambió de verdad, no se sube nada.
- `updated_at` hace de versión: cada dispositivo solo escribe si la nube sigue en la versión que vio (update condicional). Si otro dispositivo se adelantó, primero lee lo nuevo; si allí no había cambios lo carga sin preguntar, y si había cambios en los dos lados pregunta «Tienes dos partidas».
- Tiempo real: al guardar, el dispositivo manda un aviso diminuto por un canal Broadcast de Realtime (nombre derivado del id y el email, sin SQL ni carga en la base de datos). Los demás dispositivos con la app a la vista comprueban la versión y cargan lo nuevo. El canal se cierra cuando la app queda en segundo plano.
- Además se comprueba la versión (una lectura de unos bytes) al volver a la app, al recuperar el foco o la conexión. Varias pestañas del mismo navegador se pasan los cambios por el evento `storage`.
- Si en Supabase se desactiva el acceso público a los canales de Realtime, todo sigue funcionando salvo el aviso al instante: los cambios llegan al volver a la app.
- Prueba: `e2e/sync.mjs` (dos dispositivos, sin tiempo real, dos pestañas).

## Lo que necesito de ti
1. **Aprobar Supabase** (o elegir otra opción).
2. **Crear el proyecto** en supabase.com (gratis, con tu cuenta) y pasarme la URL del proyecto y la clave pública "anon". Ninguna de las dos es secreta, pero la clave "service_role" nunca me la pegues aquí.
3. **Correos:** el servicio de correo que trae Supabase por defecto está muy limitado y es solo para pruebas. Para tus amigos conviene conectar un proveedor de correo (p. ej. Resend, que tiene plan gratuito). Te guío cuando llegue el momento.

## Riesgos y avisos
- En el plan gratuito, Supabase pausa los proyectos que pasan una semana sin actividad; se reactivan desde su panel.
- Con cuentas reales aparecen obligaciones de privacidad (guardas emails). Para amigos es asumible; antes de cobrar habría que añadir política de privacidad.
- Esto es el paso que abre la puerta a gremios y red social más adelante.

## Orden de trabajo propuesto
1. Login con código y pantalla de entrada.
2. Guardado en la nube + subida de la partida local.
3. Indicador de "guardado" y cerrar sesión.
4. Probar con 2 dispositivos.

## Puesta en marcha (estado: código listo, falta tu proyecto)
El código ya está hecho y probado contra un Supabase simulado: login con código, subida automática, recuperar la partida en otro dispositivo y elegir partida si hay dos. Mientras `src/cloud-config.ts` esté vacío, la app funciona solo en local como siempre.

Pasos (tú, una vez):
1. Crea un proyecto en supabase.com.
2. **SQL Editor** → pega y ejecuta [`docs/supabase.sql`](supabase.sql) (crea la tabla `saves` con sus reglas).
3. **Authentication → Emails → Templates**: en «Magic Link» y en «Confirm signup» pon el código en el correo, p. ej. `Tu código de Excelsior: {{ .Token }}`. Sin esto llega un enlace en vez de un código.
4. **Project Settings → API**: pásame la **Project URL** y la clave **anon public**. Yo las pongo en `src/cloud-config.ts`, publico y lo probamos juntos.
