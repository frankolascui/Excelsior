// Traer las noches de la web antigua del Diario de Sueño (que se cierra en la V3.5).
// Aquella web abre Excelsior con «#traer-salud=<datos>»: las noches van en el propio enlace
// (comprimidas), nunca pasan por un servidor y no hace falta descargar ni subir un archivo.
// Formato: «z» + base64url(deflate-raw(JSON)) o «j» + base64url(JSON) si el navegador no comprime.
import { useEffect, useRef } from 'react';
import { askSure } from './confirm';
import { importNights } from './health-store';

export const HANDOFF_PREFIX = '#traer-salud=';
const KEY = 'excelsior:health-incoming';

/** Al arrancar: guarda lo que trae el enlace y lo quita de la barra de direcciones (antes de leer la pestaña). */
export function stashHealthHandoff() {
  if (!location.hash.startsWith(HANDOFF_PREFIX)) return;
  const payload = location.hash.slice(HANDOFF_PREFIX.length);
  try {
    if (payload) localStorage.setItem(KEY, payload);
  } catch { /* sin almacenamiento: se pierde, la web antigua sigue teniendo la descarga */ }
  try { history.replaceState(null, '', `${location.pathname}${location.search}#hoy`); } catch { /* nada */ }
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Devuelve la lista de noches (sin validar: eso lo hace importNights) o null si el enlace está roto. */
export async function decodeHandoff(payload: string): Promise<unknown[] | null> {
  try {
    const kind = payload[0];
    let bytes = fromB64url(payload.slice(1));
    if (kind === 'z') {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (kind !== 'j') return null;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const list = Array.isArray(data) ? data : data?.noches;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/** ¿Hay noches esperando a que se pregunte? (para no abrir las novedades encima) */
export function hasHealthHandoff(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

/** Cuando la app ya está lista (sesión comprobada, sin otros avisos), pregunta y trae las noches. */
export function HealthHandoff({ ready, blocked, toast, onDone }: {
  ready: boolean; blocked: boolean; toast: (text: string, tone?: 'info' | 'level', ms?: number) => void; onDone: () => void;
}) {
  const busy = useRef(false);
  useEffect(() => {
    if (!ready || blocked || busy.current) return;
    let payload: string | null = null;
    try { payload = localStorage.getItem(KEY); } catch { /* nada */ }
    if (!payload) return;
    busy.current = true;
    const drop = () => { try { localStorage.removeItem(KEY); } catch { /* nada */ } };
    void (async () => {
      const list = await decodeHandoff(payload);
      if (!list || !list.length) {
        drop();
        if (!list) toast('El enlace del Diario de Sueño llegó roto. Descarga tus noches allí e impórtalas en Salud → Datos.', 'info', 7000);
        busy.current = false;
        onDone();
        return;
      }
      const n = list.length;
      const ok = await askSure({
        icon: 'moon', confirmLabel: 'Traer mis noches',
        title: `¿Traer ${n} ${n === 1 ? 'noche' : 'noches'} del Diario de Sueño?`,
        message: 'Se guardan en Salud → Diario. Si ya tenías una noche con la misma fecha, se sustituye por la que traes.',
      });
      drop();
      if (ok) {
        const got = importNights(list);
        toast(got > 0 ? `${got} ${got === 1 ? 'noche traída' : 'noches traídas'} del Diario de Sueño` : 'No había noches válidas que traer', 'info', 5000);
      }
      busy.current = false;
      onDone();
    })();
  }, [ready, blocked, toast, onDone]);
  return null;
}
