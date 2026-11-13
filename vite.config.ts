import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` produce un único HTML autocontenido (vista previa / Artifact).
// SITE_URL (p. ej. https://frankolascui.github.io/Excelsior/) vuelve absoluta la imagen al compartir un enlace,
// que WhatsApp y otras apps necesitan así. Sin ella queda relativa.
const siteUrl = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : '';
const ogImage = { name: 'og-image', transformIndexHtml: (html: string) => html.replace(/content="og\.png"/, `content="${siteUrl}og.png"`) };

export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), ogImage],
  // Rutas relativas: funciona en GitHub Pages (/Exclesior/) y en cualquier carpeta.
  base: './',
  // Además de la app, la página del optimizador de FSRS de Academy (optimizar/index.html). En `single` no va.
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    ...(mode === 'single' ? {} : { rollupOptions: { input: { main: 'index.html', optimizar: 'optimizar/index.html' } } }),
  },
  // El optimizador (fsrs-browser) usa WebAssembly con hilos: sus workers deben ser módulos ES
  // y Vite no debe pre-empaquetarlo (rompería la ruta a su .wasm y a su worker auxiliar).
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['fsrs-browser'] },
}));
