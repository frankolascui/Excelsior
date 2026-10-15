// Invitaciones por enlace (V2): «…/Excelsior/?amigo=Nicolas%231234». Quien lo abre, al entrar con su cuenta,
// manda solicitud de amistad a quien le invitó (o la acepta si ya tenía una suya). El tag espera en este navegador
// mientras la persona se registra o crea su personaje.
import type { GameState } from './types';
import { acceptRequest, findByTag, parseTag, relationWith, sendRequest, type Friendship } from './social';

const KEY = 'excelsior:invite';
const PARAM = 'amigo';

/** Enlace para invitar con tu tag. */
export function inviteLink(tag: string, here: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${here.origin}${here.pathname}?${PARAM}=${encodeURIComponent(tag)}`;
}

/** Lee el tag de la URL (si lo hay), lo guarda y limpia la dirección. Devuelve el tag pendiente. */
export function captureInvite(): string | null {
  try {
    const url = new URL(location.href);
    const tag = parseTag(url.searchParams.get(PARAM) ?? '');
    if (tag) {
      localStorage.setItem(KEY, tag);
      url.searchParams.delete(PARAM);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Con cuenta y perfil publicado: manda la solicitud a quien te invitó (o acepta la suya).
 * Devuelve el mensaje para el aviso, o null si no había nada que hacer.
 */
export async function redeemInvite(me: { user_id: string; tag: string }, rows: Friendship[], s: GameState): Promise<string | null> {
  const tag = pendingInvite();
  if (!tag) return null;
  if (tag.toLowerCase() === me.tag.toLowerCase()) {
    clearInvite();
    return null;
  }
  let found: Awaited<ReturnType<typeof findByTag>>;
  try {
    found = await findByTag(tag);
  } catch {
    return null; // sin conexión: se reintenta en la próxima carga
  }
  clearInvite();
  if (!found || found === 'invalid') return `No encontramos a ${tag}, quien te invitó. Pídele su tag de nuevo.`;
  const rel = relationWith(me.user_id, found.user_id, rows);
  if (rel === 'friend' || rel === 'outgoing') return null;
  const err = rel === 'incoming' ? await acceptRequest(found.user_id, s) : await sendRequest(found, s);
  if (err) return err;
  return rel === 'incoming' ? `Ya eres amigo de ${found.name}` : `Solicitud de amistad enviada a ${found.name}, que te invitó`;
}
