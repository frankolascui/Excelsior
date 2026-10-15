// Cuenta por email con código (Supabase) y copia de la partida en la nube.
// localStorage sigue siendo la fuente inmediata; la nube es la copia que viaja entre dispositivos.
import { createClient, type RealtimeChannel, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import type { GameState } from './types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './cloud-config';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
export const cloudClient = sb;
export const getUserId = () => cloud.userId;

// ---------- Estado de la cuenta (compartido entre pantallas) ----------

export type SyncStatus = 'off' | 'saving' | 'saved' | 'error';
interface CloudState {
  email: string | null;
  userId: string | null;
  status: SyncStatus;
  ready: boolean; // ya sabemos si hay sesión
}
let cloud: CloudState = { email: null, userId: null, status: 'off', ready: !cloudEnabled };
const listeners = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  cloud = { ...cloud, ...patch };
  listeners.forEach((l) => l());
}
export function useCloud(): CloudState {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => cloud);
}

function applySession(s: Session | null) {
  set({ email: s?.user.email ?? null, userId: s?.user.id ?? null, status: s ? cloud.status : 'off', ready: true });
}

if (cloudEnabled) {
  sb().auth.getSession().then(({ data }) => applySession(data.session)).catch(() => set({ ready: true }));
  sb().auth.onAuthStateChange((_e, s) => applySession(s));
}

// ---------- Login ----------

/** Traduce el error de Supabase y deja el original entre paréntesis para poder diagnosticarlo. */
function friendly(err: { message: string; code?: string; status?: number }, step: 'send' | 'verify'): string {
  const m = `${err.code ?? ''} ${err.message}`;
  let text: string;
  if (/rate|too many|seconds/i.test(m)) text = 'Has pedido demasiados códigos. Espera un poco y vuelve a intentarlo.';
  else if (/sending|smtp|mail.*(send|deliver)/i.test(m)) text = 'El servidor no pudo enviar el correo. Revisa la configuración SMTP en Supabase.';
  else if (/signup.*(disabled|not allowed)/i.test(m)) text = 'Los registros nuevos están desactivados en Supabase (Authentication → Sign In / Providers → Email).';
  else if (step === 'verify' && /expired|invalid|token|otp/i.test(m)) text = 'Código incorrecto o caducado. Pide uno nuevo.';
  else if (step === 'send' && /email_address_invalid|invalid.*email|email.*invalid|validate email/i.test(m)) text = 'Ese email no parece válido.';
  else if (/fetch|network|load failed/i.test(m)) text = 'No se pudo conectar con el servidor. Revisa tu conexión.';
  else text = 'Algo falló al conectar con el servidor.';
  return `${text} (${err.message})`;
}

export async function sendCode(email: string): Promise<string | null> {
  const { error } = await sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? friendly(error, 'send') : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  return error ? friendly(error, 'verify') : null;
}

export async function signOut() {
  await sb().auth.signOut();
}

// ---------- Partida en la nube ----------
// La columna updated_at de `saves` hace de versión. Cada dispositivo recuerda la última versión que vio
// y solo escribe si la nube sigue en ella (concurrencia optimista); si otro dispositivo escribió antes,
// primero lee lo nuevo. Así un PC olvidado abierto ya no pisa lo hecho en el móvil.
// Para gastar poco: las comprobaciones leen solo updated_at; la partida entera se baja solo si cambió,
// y se sube solo si hay cambios de verdad (huella del JSON). El aviso «he guardado» viaja por un canal
// Broadcast de Realtime (un mensaje diminuto, sin tocar la base de datos) mientras la app está a la vista.

export interface RemoteSave {
  state: GameState;
  updatedAt: number;
  version: string; // updated_at tal cual lo devuelve Supabase
}

export async function pullSave(): Promise<RemoteSave | null> {
  if (!cloud.userId) return null;
  const { data, error } = await sb().from('saves').select('state, updated_at').eq('user_id', cloud.userId).maybeSingle();
  if (error) throw error;
  return data ? { state: data.state as GameState, updatedAt: Date.parse(data.updated_at), version: data.updated_at } : null;
}

/** Solo la versión de la nube (unos bytes): basta para saber si hay algo nuevo. */
async function pullVersion(): Promise<string | null> {
  const { data, error } = await sb().from('saves').select('updated_at').eq('user_id', cloud.userId!).maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}

/** Huella corta del JSON (cyrb53): dice si la partida cambió sin guardar copias enteras. */
export function digest(s: GameState): string {
  const str = JSON.stringify(s);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Lo último en lo que este dispositivo y la nube coincidieron: versión de la nube y huella de la partida.
// (Las versiones antiguas guardaban solo la hora: `at`. Se respetan una vez y se sustituyen.)
const SYNC_KEY = 'excelsior:cloud-sync';
type SyncRec = { ver: string; hash: string } | { legacyAt: number };
function readRec(userId: string): SyncRec | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null');
    if (raw?.userId !== userId) return null;
    if (typeof raw.ver === 'string') return { ver: raw.ver, hash: String(raw.hash ?? '') };
    return typeof raw.at === 'number' ? { legacyAt: raw.at } : null;
  } catch {
    return null;
  }
}
function writeRec(ver: string, hash: string) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ userId: cloud.userId, ver, hash }));
  } catch {
    /* ignorado */
  }
}

// Última vez que el jugador cambió algo en este dispositivo (solo para decidir con las marcas antiguas).
const LOCAL_KEY = 'excelsior:local-at';
export function markLocalChange() {
  try {
    localStorage.setItem(LOCAL_KEY, String(Date.now()));
  } catch {
    /* ignorado */
  }
}
function localChangedAt(): number {
  try {
    return Number(localStorage.getItem(LOCAL_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Lo que la tienda del juego pone para que la nube pueda leer y sustituir la partida. */
export interface SyncHooks {
  get(): GameState;
  /** Carga la partida de la nube y devuelve cómo quedó tras migrarla. */
  adopt(remote: GameState): GameState;
  /** Las dos partidas cambiaron por separado: el jugador elige. */
  conflict(remote: RemoteSave): void;
}
let hooks: SyncHooks | null = null;
let paused = false; // hay un conflicto esperando respuesta: no se sube nada

// Las operaciones van en fila para que una subida y una lectura nunca se crucen.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
}

/** Siguiente versión: la hora actual, pero siempre posterior a la anterior aunque el reloj vaya atrasado. */
function nextVersion(prev: string | null): string {
  const after = prev ? Date.parse(prev) + 1 : 0;
  return new Date(Math.max(Date.now(), after)).toISOString();
}

let retry: number | undefined;
function failed() {
  set({ status: 'error' });
  clearTimeout(retry);
  retry = window.setTimeout(() => requestCheck(true), 60_000); // y también al volver la conexión o la pestaña
}

/** Escribe solo si la nube sigue en `expected`. Devuelve false si otro dispositivo se adelantó. */
async function write(state: GameState, hash: string, expected: string | null): Promise<boolean> {
  set({ status: 'saving' });
  const row = { state, updated_at: nextVersion(expected) };
  const res = expected
    ? await sb().from('saves').update(row).eq('user_id', cloud.userId!).eq('updated_at', expected).select('updated_at')
    : await sb().from('saves').insert({ user_id: cloud.userId!, ...row }).select('updated_at');
  if (res.error) {
    if (res.error.code === '23505') return false; // otro dispositivo creó la fila a la vez
    throw res.error;
  }
  const ver = res.data?.[0]?.updated_at;
  if (!ver) return false;
  writeRec(ver, hash);
  set({ status: 'saved' });
  announce(ver);
  return true;
}

function adoptRemote(remote: RemoteSave) {
  const next = hooks!.adopt(remote.state);
  writeRec(remote.version, digest(next));
  set({ status: 'saved' });
}

/** Con la nube distinta de lo último visto: cargar, quedarse igual o preguntar. */
function decide(remote: RemoteSave, rec: SyncRec | null) {
  const local = hooks!.get(); // se relee: el jugador pudo tocar algo mientras llegaba la respuesta
  const hash = digest(local);
  if (digest(remote.state) === hash) {
    writeRec(remote.version, hash);
    return set({ status: 'saved' });
  }
  if (!local.profile) return adoptRemote(remote);
  let dirty: boolean;
  if (!rec) dirty = true; // primera vez aquí con partidas en los dos lados
  else if ('legacyAt' in rec) dirty = localChangedAt() > rec.legacyAt;
  else dirty = hash !== rec.hash;
  if (!dirty) return adoptRemote(remote);
  paused = true;
  hooks!.conflict(remote);
}

async function sync(mode: 'push' | 'check'): Promise<void> {
  if (!cloud.userId || !hooks || paused) return;
  const rec = readRec(cloud.userId);
  try {
    if (rec && 'ver' in rec) {
      const local = hooks.get();
      const hash = digest(local);
      const dirty = hash !== rec.hash;
      if (mode === 'push' && !dirty) return;
      const ver = mode === 'check' ? await pullVersion() : rec.ver;
      if (ver === rec.ver) {
        if (!dirty || (await write(local, hash, rec.ver))) return set({ status: 'saved' });
      }
    }
    // Primera vez, marca antigua, o la nube ya no está donde la dejamos: se baja la partida entera.
    const remote = await pullSave();
    if (!remote) {
      const local = hooks.get();
      if (local.profile && !(await write(local, digest(local), null))) return sync('check');
      return;
    }
    if (rec && 'legacyAt' in rec && remote.updatedAt <= rec.legacyAt) {
      // Marca antigua y la nube no cambió desde entonces: lo de aquí es lo último.
      const local = hooks.get();
      if (await write(local, digest(local), remote.version)) return;
      return sync('check');
    }
    decide(remote, rec);
  } catch (e) {
    failed();
    throw e;
  }
}

let timer: number | undefined;
/** Sube la partida agrupando cambios seguidos (si no hay cambios reales, no hace nada). */
export function scheduleSave() {
  if (!cloud.userId) return;
  clearTimeout(timer);
  timer = window.setTimeout(flush, 2000);
}
function flush() {
  clearTimeout(timer);
  timer = undefined;
  void serial(() => sync('push')).catch(() => undefined);
}

// Comprobación barata de si otro dispositivo guardó algo. Se agrupan las que llegan seguidas.
let lastCheck = 0;
let checkQueued = false;
function requestCheck(force = false) {
  if (!cloud.userId || !hooks || checkQueued) return;
  if (!force && Date.now() - lastCheck < 5000) return;
  checkQueued = true;
  void serial(() => {
    checkQueued = false;
    lastCheck = Date.now();
    return sync('check');
  }).catch(() => undefined);
}

// ---------- Aviso en tiempo real entre dispositivos ----------
// Canal Broadcast con nombre derivado de tu id y tu email (nadie más lo conoce). Solo transporta
// «guardé la versión X»; quien lo oye comprueba la nube. No necesita SQL ni toca la base de datos.

let channel: RealtimeChannel | null = null;
let joinedOnce = false;
let wanted = false;

async function topicFor(userId: string, email: string): Promise<string> {
  const bytes = new TextEncoder().encode(`excelsior:${userId}:${email.toLowerCase()}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'save-' + Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function connect() {
  wanted = true;
  if (channel || !cloud.userId || !cloud.email || !crypto?.subtle) return;
  const topic = await topicFor(cloud.userId, cloud.email);
  if (!wanted || channel) return;
  joinedOnce = false;
  channel = sb()
    .channel(topic, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'saved' }, ({ payload }) => {
      const rec = cloud.userId ? readRec(cloud.userId) : null;
      if (!rec || !('ver' in rec) || payload?.v !== rec.ver) requestCheck(true);
    })
    .subscribe((status) => {
      // Al reconectar pudimos perdernos avisos: una comprobación lo arregla.
      if (status === 'SUBSCRIBED') {
        if (joinedOnce) requestCheck(true);
        joinedOnce = true;
      }
    });
}

function disconnect() {
  wanted = false;
  if (channel) void sb().removeChannel(channel);
  channel = null;
}

function announce(ver: string) {
  if (channel && joinedOnce) void channel.send({ type: 'broadcast', event: 'saved', payload: { v: ver } }).catch(() => undefined);
}

// ---------- Ciclo de vida ----------

/** Empieza a sincronizar la partida del usuario con sesión. Devuelve la función para parar. */
export function startSync(h: SyncHooks): { ready: Promise<void>; stop: () => void } {
  hooks = h;
  paused = false;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (timer !== undefined) flush(); // al cambiar de app o de dispositivo, lo pendiente sale ya
      disconnect(); // sin pestaña a la vista no hace falta tener el canal abierto
    } else {
      void connect();
      requestCheck();
    }
  };
  const onOnline = () => requestCheck(true);
  const onFocus = () => requestCheck();
  const onPageHide = () => timer !== undefined && flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', onPageHide);
  if (document.visibilityState !== 'hidden') void connect();
  lastCheck = Date.now();
  const ready = serial(() => sync('check'));
  return {
    ready,
    stop() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(retry);
      if (timer !== undefined) flush();
      disconnect();
      if (hooks === h) hooks = null;
    },
  };
}

/** Respuesta del jugador a «Tienes dos partidas». */
export function resolveConflict(remote: RemoteSave, useRemote: boolean) {
  paused = false;
  if (!hooks) return;
  if (useRemote) adoptRemote(remote);
  else {
    writeRec(remote.version, ''); // la nube está en esa versión y aquí hay cambios: se sube encima
    flush();
  }
}
