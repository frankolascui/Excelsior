// Modo admin: una partida de pruebas aparte, con todo desbloqueado, para comprobar que todo funciona.
// No toca la partida real ni se sube a la nube.
const FLAG = 'excelsior:admin-mode';

// SHA-256 de la contraseña. Se puede cambiar sin tocar el código con la variable VITE_ADMIN_HASH (p. ej. en Netlify).
// Ojo: es una comprobación en el navegador, no seguridad real. Solo evita que alguien entre sin querer;
// como la partida de pruebas va aparte, entrar no da ventaja en la partida real.
const ADMIN_HASH = import.meta.env.VITE_ADMIN_HASH ?? '000a745bbb68ee0296c4fcd61e6d7fb6fb96fa3c999ebf8ec8f20f85d9b15c11';

function read(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export const ADMIN = read();

export async function checkAdminPassword(password: string): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false; // solo existe en https o localhost
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password.trim()));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === ADMIN_HASH;
}

export function setAdmin(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* ignorado */
  }
  location.reload();
}
