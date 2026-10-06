// Proyecto de Supabase para el login y el guardado en la nube.
// Ambos valores son públicos (la seguridad la dan las reglas por fila de la tabla `saves`).
// Las variables VITE_* permiten probar contra otro proyecto sin tocar este archivo.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://hvymuwscxxhsaymfkaup.supabase.co';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eW11d3NjeHhoc2F5bWZrYXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODk1ODQsImV4cCI6MjEwNjg2NTU4NH0.dqOBdJz2R4yTb7OszJxdq7bwmwpDX7FZsGpM7KxZ4nw';
