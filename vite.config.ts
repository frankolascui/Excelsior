import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` produce un único HTML autocontenido (vista previa / Artifact).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  // Rutas relativas: funciona en GitHub Pages (/Exclesior/) y en cualquier carpeta.
  base: './',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
