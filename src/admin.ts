// Modo admin: una partida de pruebas aparte, con todo desbloqueado, para comprobar que todo funciona.
// No toca la partida real ni se sube a la nube.
const FLAG = 'excelsior:admin-mode';

function read(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export const ADMIN = read();

export function setAdmin(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* ignorado */
  }
  location.reload();
}
