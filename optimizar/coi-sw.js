// Service worker mínimo para el optimizador de FSRS (paso 12).
// El optimizador usa WebAssembly con hilos, que el navegador solo permite en una página «aislada»
// (cabeceras COOP y COEP). GitHub Pages no deja poner cabeceras, así que este worker se las añade
// a las respuestas de nuestra propia web. No guarda nada en caché: todo sigue viniendo de la red.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (new URL(req.url).origin !== self.location.origin) return; // Supabase, fuentes…: no se tocan
  event.respondWith(
    fetch(req).then((res) => {
      if (res.status === 0) return res;
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      // «credentialless» deja cargar las fuentes de Google sin cambiar nada (Chrome, Edge, Firefox).
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }),
  );
});
