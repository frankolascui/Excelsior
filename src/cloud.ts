// Cuenta por email con código (Supabase) y copia de la partida en la nube.
// localStorage sigue siendo la fuente inmediata; la nube es la copia que viaja entre dispositivos.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import type { GameState } from './types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './cloud-config';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

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

const ERRORS: [RegExp, string][] = [
  [/rate|too many|seconds/i, 'Has pedido demasiados códigos. Espera un minuto y vuelve a intentarlo.'],
  [/expired|invalid|token/i, 'Código incorrecto o caducado. Pide uno nuevo.'],
  [/email/i, 'Ese email no parece válido.'],
];
function friendly(msg: string): string {
  return ERRORS.find(([re]) => re.test(msg))?.[1] ?? 'No se pudo conectar. Revisa tu conexión e inténtalo otra vez.';
}

export async function sendCode(email: string): Promise<string | null> {
  const { error } = await sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? friendly(error.message) : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  return error ? friendly(error.message) : null;
}

export async function signOut() {
  await sb().auth.signOut();
}

// ---------- Partida en la nube ----------

export interface RemoteSave {
  state: GameState;
  updatedAt: number;
}

export async function pullSave(): Promise<RemoteSave | null> {
  if (!cloud.userId) return null;
  const { data, error } = await sb().from('saves').select('state, updated_at').eq('user_id', cloud.userId).maybeSingle();
  if (error) throw error;
  return data ? { state: data.state as GameState, updatedAt: Date.parse(data.updated_at) } : null;
}

export async function pushSave(state: GameState): Promise<boolean> {
  if (!cloud.userId) return false;
  set({ status: 'saving' });
  const { error } = await sb().from('saves').upsert({ user_id: cloud.userId, state, updated_at: new Date().toISOString() });
  set({ status: error ? 'error' : 'saved' });
  return !error;
}

let timer: number | undefined;
/** Sube la partida agrupando cambios seguidos. */
export function scheduleSave(state: GameState) {
  if (!cloud.userId) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void pushSave(state).then((ok) => ok && markSynced()), 1500);
}

// Marca de la última vez que este dispositivo y la nube coincidieron.
const SYNC_KEY = 'excelsior:cloud-sync';
function lastSync(userId: string): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null');
    return raw?.userId === userId ? raw.at : null;
  } catch {
    return null;
  }
}
export function markSynced() {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ userId: cloud.userId, at: Date.now() }));
  } catch {
    /* ignorado */
  }
}

export type Reconcile =
  | { kind: 'pushed' }
  | { kind: 'adopt'; remote: RemoteSave }
  | { kind: 'conflict'; remote: RemoteSave };

/** Decide qué partida manda al entrar: la de la nube, la de este dispositivo, o pregunta. */
export async function reconcile(local: GameState): Promise<Reconcile> {
  const remote = await pullSave();
  const seen = cloud.userId ? lastSync(cloud.userId) : null;
  if (!remote) {
    if (local.profile) await pushSave(local);
    markSynced();
    return { kind: 'pushed' };
  }
  if (!local.profile) return { kind: 'adopt', remote };
  if (seen === null) return { kind: 'conflict', remote }; // primer login aquí con partidas en ambos lados
  if (remote.updatedAt > seen) return { kind: 'adopt', remote };
  await pushSave(local);
  markSynced();
  return { kind: 'pushed' };
}
