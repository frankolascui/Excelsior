// Invitaciones por enlace (V2): «…/Excelsior/?amigo=Nicolas%231234». Quien lo abre, al entrar con su cuenta,
// ve quién le invitó y, si confirma, le manda solicitud (o acepta la suya). El tag espera en este navegador
// mientras la persona se registra o crea su personaje.
import type { GameState } from './types';
import { acceptRequest, findByTag, parseTag, relationWith, sendRequest, type Friendship, type PublicProfile } from './social';

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

export type InviteOffer = { kind: 'offer'; person: PublicProfile; incoming: boolean };

/**
 * Con cuenta y perfil publicado: busca a quien te invitó. No manda nada: devuelve una oferta para que la persona
 * confirme (un enlace abierto sin querer, o de un desconocido, no debe crear amistades solo).
 * Devuelve un mensaje si no se encontró, o null si no hay nada que preguntar.
 */
export async function prepareInvite(me: { user_id: string; tag: string }, rows: Friendship[]): Promise<InviteOffer | string | null> {
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
  if (!found || found === 'invalid') {
    clearInvite();
    return `No encontramos a ${tag}, quien te invitó. Pídele su tag de nuevo.`;
  }
  const rel = relationWith(me.user_id, found.user_id, rows);
  if (rel === 'friend' || rel === 'outgoing') {
    clearInvite();
    return null;
  }
  return { kind: 'offer', person: found, incoming: rel === 'incoming' };
}

/** La persona dijo que sí: manda la solicitud (o acepta la que ya había). */
export async function acceptInvite(offer: InviteOffer, s: GameState): Promise<string> {
  clearInvite();
  const err = offer.incoming ? await acceptRequest(offer.person.user_id, s) : await sendRequest(offer.person, s);
  if (err) return err;
  return offer.incoming ? `Ya eres amigo de ${offer.person.name}` : `Solicitud de amistad enviada a ${offer.person.name}`;
}
