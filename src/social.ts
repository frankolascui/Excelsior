// Amigos (V2): perfil público, tag para añadir, solicitudes y recomendados (Supabase: docs/supabase-amigos.sql).
import { useSyncExternalStore } from 'react';
import type { GameState } from './types';
import { levelInfo, totalXp } from './game';
import { attributeLevel, attributeXp, avatarInfo } from './attributes';
import { bossStatus } from './bosses';
import { cloudClient, getUserId } from './cloud';

// ---------- Reglas puras ----------

export const BIO_MAX = 280;
export const PHOTO_MAX = 60000;

export interface PublicStats {
  attrs: Record<string, number>; // nivel de cada atributo
  achievements: number;
  deepHours: number;
  bosses: number;
}

export interface PublicProfile {
  user_id: string;
  tag: string;
  name: string;
  bio: string;
  photo: string | null;
  level: number;
  xp: number;
  avatar_index: number;
  avatar_name: string;
  stats: Partial<PublicStats>;
  mutual?: number;
}

/** Lo que de tu partida se publica para tus amigos. */
export function publicFields(s: GameState, now: number) {
  const xp = totalXp(s);
  const av = avatarInfo(s, now);
  const attrs = Object.fromEntries(Object.entries(attributeXp(s)).map(([id, n]) => [id, attributeLevel(n).level]));
  return {
    name: (s.profile?.name ?? '').trim().slice(0, 40) || 'Héroe',
    bio: (s.profile?.bio ?? '').slice(0, BIO_MAX),
    photo: s.profile?.photo ?? null,
    level: levelInfo(xp).level,
    xp: Math.floor(xp),
    avatar_index: av.index,
    avatar_name: av.current.name,
    stats: {
      attrs,
      achievements: (s.achievements ?? []).length,
      deepHours: Math.floor(s.sessions.reduce((n, x) => n + x.minutes, 0) / 60),
      bosses: s.bosses.filter((b) => bossStatus(s, b, now).defeated).length,
    } satisfies PublicStats,
  };
}

/** Parte del tag antes de «#»: tu nombre sin «#» ni espacios de sobra. */
export function tagBase(name: string): string {
  const base = name.replace(/#/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
  return base || 'Heroe';
}

export function makeTag(name: string, rnd: () => number = Math.random): string {
  return `${tagBase(name)}#${String(Math.floor(rnd() * 10000)).padStart(4, '0')}`;
}

/** Acepta «nicolas#4821», «Nicolas #4821», «  Nicolas#4821 ». Devuelve null si no parece un tag. */
export function parseTag(input: string): string | null {
  const m = input.trim().match(/^(.{1,24}?)\s*#\s*(\d{4})$/);
  return m ? `${m[1].trim()}#${m[2]}` : null;
}

/** Escapa los comodines de ILIKE para buscar el tag exacto (sin distinguir mayúsculas). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function setBio(s: GameState, bio: string): GameState {
  if (!s.profile) return s;
  return { ...s, profile: { ...s.profile, bio: bio.trim().slice(0, BIO_MAX) || undefined } };
}

export function setPhoto(s: GameState, photo: string | null): GameState {
  if (!s.profile) return s;
  if (photo && photo.length > PHOTO_MAX) return s;
  return { ...s, profile: { ...s.profile, photo: photo ?? undefined } };
}

export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

export interface Friendship {
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at?: string;
}

export function relationWith(me: string, other: string, rows: Friendship[]): Relation {
  if (me === other) return 'self';
  const r = rows.find((f) => (f.requester === me && f.addressee === other) || (f.requester === other && f.addressee === me));
  if (!r) return 'none';
  if (r.status === 'accepted') return 'friend';
  return r.requester === me ? 'outgoing' : 'incoming';
}

/** Reduce una imagen a un cuadrado de `size` px (recorte centrado) en JPEG. */
export async function shrinkPhoto(file: Blob, size = 192): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= PHOTO_MAX) return url;
  }
  throw new Error('La foto es demasiado pesada');
}

// ---------- Estado compartido de amigos ----------

interface SocialState {
  me: PublicProfile | null;
  rows: Friendship[];
  people: Record<string, PublicProfile>; // perfiles de amigos y solicitudes
  recommended: PublicProfile[];
  loading: boolean;
  error: string | null;
}
let social: SocialState = { me: null, rows: [], people: {}, recommended: [], loading: false, error: null };
const listeners = new Set<() => void>();
function set(patch: Partial<SocialState>) {
  social = { ...social, ...patch };
  listeners.forEach((l) => l());
}
export function useSocial(): SocialState {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => social);
}

const FIELDS = 'user_id, tag, name, bio, photo, level, xp, avatar_index, avatar_name, stats';
const NETWORK = 'No se pudo conectar con el servidor.';

// ---------- Publicar tu perfil ----------

let published = '';
let publishTimer: number | undefined;
let publishing: Promise<void> | null = null;

/** Crea tu perfil (con un tag libre) o actualiza sus datos públicos. */
export async function publishProfile(s: GameState, now = Date.now()): Promise<PublicProfile | null> {
  const userId = getUserId();
  if (!userId || !s.profile) return null;
  const db = cloudClient();
  const fields = publicFields(s, now);
  const { data: existing, error } = await db.from('profiles').select(FIELDS).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (existing) {
    const { data, error: e2 } = await db.from('profiles').update({ ...fields, updated_at: new Date(now).toISOString() })
      .eq('user_id', userId).select(FIELDS).single();
    if (e2) throw e2;
    published = JSON.stringify(fields);
    set({ me: data as PublicProfile });
    return data as PublicProfile;
  }
  for (let i = 0; i < 6; i++) {
    const { data, error: e3 } = await db.from('profiles').insert({ user_id: userId, tag: makeTag(fields.name), ...fields }).select(FIELDS).single();
    if (!e3) {
      published = JSON.stringify(fields);
      set({ me: data as PublicProfile });
      return data as PublicProfile;
    }
    if (e3.code !== '23505') throw e3; // 23505: tag repetido, se prueba otro número
  }
  throw new Error('No se encontró un tag libre');
}

/** Tras cada cambio de la partida: si cambió algo público, se sube (agrupando cambios seguidos). */
export function schedulePublish(s: GameState) {
  if (!getUserId() || !s.profile) return;
  if (JSON.stringify(publicFields(s, Date.now())) === published) return;
  clearTimeout(publishTimer);
  publishTimer = window.setTimeout(() => {
    publishing ??= publishProfile(s).then(() => undefined, () => undefined).finally(() => { publishing = null; });
  }, 3000);
}

// ---------- Leer amigos ----------

export async function refreshSocial(s: GameState): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  set({ loading: true, error: null });
  try {
    const db = cloudClient();
    const me = social.me?.user_id === userId ? social.me : await publishProfile(s);
    const { data: rows, error } = await db.from('friendships').select('requester, addressee, status, created_at');
    if (error) throw error;
    const ids = [...new Set((rows ?? []).flatMap((r) => [r.requester, r.addressee]))].filter((id) => id !== userId);
    let people: Record<string, PublicProfile> = {};
    if (ids.length) {
      const { data, error: e2 } = await db.from('profiles').select(FIELDS).in('user_id', ids);
      if (e2) throw e2;
      people = Object.fromEntries((data ?? []).map((p) => [p.user_id, p as PublicProfile]));
    }
    const { data: rec, error: e3 } = await db.rpc('recommended_friends', { max_rows: 12 });
    if (e3) throw e3;
    set({ me, rows: (rows ?? []) as Friendship[], people, recommended: (rec ?? []) as PublicProfile[], loading: false });
  } catch (e) {
    set({ loading: false, error: describe(e) });
  }
}

function describe(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network|load failed/i.test(m)) return NETWORK;
  if (/relation .* does not exist|recommended_friends|schema cache/i.test(m)) return 'Falta preparar la base de datos de amigos (docs/supabase-amigos.sql).';
  return `Algo falló con los amigos. (${m})`;
}

export async function findByTag(input: string): Promise<PublicProfile | null | 'invalid'> {
  const tag = parseTag(input);
  if (!tag) return 'invalid';
  const { data, error } = await cloudClient().from('profiles').select(FIELDS).ilike('tag', escapeLike(tag)).maybeSingle();
  if (error) throw new Error(describe(error));
  return (data as PublicProfile) ?? null;
}

// ---------- Solicitudes ----------

async function run(op: PromiseLike<{ error: unknown }>, s: GameState): Promise<string | null> {
  const { error } = await op;
  if (error) return describe(error);
  await refreshSocial(s);
  return null;
}

export function sendRequest(to: PublicProfile, s: GameState) {
  set({ people: { ...social.people, [to.user_id]: to } });
  return run(cloudClient().from('friendships').insert({ requester: getUserId(), addressee: to.user_id }), s);
}

export function acceptRequest(from: string, s: GameState) {
  return run(cloudClient().from('friendships').update({ status: 'accepted' }).eq('requester', from).eq('addressee', getUserId()!), s);
}

/** Rechaza, cancela o elimina: borra la relación sea quien sea quien la pidió. */
export function removeRelation(other: string, s: GameState) {
  const me = getUserId()!;
  return run(cloudClient().from('friendships').delete().or(`and(requester.eq.${me},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${me})`), s);
}

/** Al cerrar sesión, se olvida todo lo de la cuenta anterior. */
export function clearSocial() {
  published = '';
  set({ me: null, rows: [], people: {}, recommended: [], loading: false, error: null });
}
