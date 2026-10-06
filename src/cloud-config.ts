// Proyecto de Supabase para el login y el guardado en la nube.
// Ambos valores son públicos (la seguridad la dan las reglas por fila de la tabla `saves`).
// Vacíos = la app funciona solo en local, sin pantalla de cuenta.
// Las variables VITE_* permiten probar contra otro proyecto sin tocar este archivo.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
