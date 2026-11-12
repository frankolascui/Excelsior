// Noches del Reino de la Salud: guardadas en este navegador y, con cuenta, en la tabla health.nights
// (la misma que usa la web de Excelsior Health, así que lo apuntado en una aparece en la otra).
// Local primero: funciona sin cuenta y sin conexión; lo pendiente se sube cuando se puede.
import { useSyncExternalStore } from 'react';
import { ADMIN } from './admin';
import { cloudClient, getUserId } from './cloud';
import {
  DEFAULT_SETTINGS, mergeRemote, normalizeNight, normalizeSettings, sortNights, validNight,
  type CloudRow, type HealthSettings, type Night,
} from './health';

const KEY = ADMIN ? 'excelsior:health-admin' : 'excelsior:health';
const PAGE = 1000;

interface Meta {
  uid: string | null; // cuenta con la que se sincronizó este navegador
  cursor: string | null; // mayor updated_at visto en la nube
  pend: Record<string, string>; // fecha → cuándo se cambió aquí (sin subir)
  pendSettings: string | null;
}
export type HealthSync = 'local' | 'syncing' | 'synced' | 'error';
interface Store {
  nights: Night[];
  settings: HealthSettings;
  meta: Meta;
  sync: HealthSync;
  /** Mensaje del último fallo de la nube (la app sigue funcionando en local). */
  error: string | null;
}

const blankMeta = (): Meta => ({ uid: null, cursor: null, pend: {}, pendSettings: null });

function load(): Store {
  const base: Store = { nights: [], settings: DEFAULT_SETTINGS, meta: blankMeta(), sync: 'local', error: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return base;
    const nights = Array.isArray(raw.nights) ? sortNights(raw.nights.filter(validNight).map(normalizeNight)) : [];
    return { ...base, nights, settings: normalizeSettings(raw.settings), meta: { ...blankMeta(), ...(raw.meta ?? {}) } };
  } catch {
    return base;
  }
}

let store = load();
const listeners = new Set<() => void>();
function set(patch: Partial<Store>, persist = true) {
  store = { ...store, ...patch };
  if (persist) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nights: store.nights, settings: store.settings, meta: store.meta }));
    } catch {
      /* sin almacenamiento: se sigue en memoria */
    }
  }
  listeners.forEach((l) => l());
}
export function useHealth(): Store {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => store);
}
export const healthNights = () => store.nights;
export const healthSettings = () => store.settings;
/** Avisa cuando cambian las noches (al guardar aquí o al llegar de la nube). */
export function onHealthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Cambios locales ----------

const stamp = () => new Date().toISOString();

export function saveNight(night: Night) {
  const now = stamp();
  const n = { ...normalizeNight(night as unknown as { fecha: string }), actualizado: now };
  set({
    nights: sortNights([...store.nights.filter((x) => x.fecha !== n.fecha), n]),
    meta: { ...store.meta, pend: { ...store.meta.pend, [n.fecha]: now } },
  });
  schedule(1500);
}

export function deleteNight(fecha: string) {
  set({
    nights: store.nights.filter((x) => x.fecha !== fecha),
    meta: { ...store.meta, pend: { ...store.meta.pend, [fecha]: stamp() } },
  });
  schedule(1500);
}

export function saveHealthSettings(patch: Partial<HealthSettings>) {
  const now = stamp();
  set({ settings: { ...normalizeSettings({ ...store.settings, ...patch }), actualizado: now }, meta: { ...store.meta, pendSettings: now } });
  schedule(1500);
}

/** Importa noches de una copia JSON de Excelsior Health. Devuelve cuántas entraron. */
export function importNights(data: unknown): number {
  const list = Array.isArray(data) ? data : (data as { noches?: unknown })?.noches;
  if (!Array.isArray(list)) return -1;
  const valid = list.filter(validNight).map(normalizeNight);
  if (!valid.length) return 0;
  const now = stamp();
  const byDate = new Map(store.nights.map((n) => [n.fecha, n]));
  const pend = { ...store.meta.pend };
  for (const n of valid) {
    byDate.set(n.fecha, n);
    pend[n.fecha] = n.actualizado ?? now;
  }
  set({ nights: sortNights([...byDate.values()]), meta: { ...store.meta, pend } });
  schedule(1500);
  return valid.length;
}

// ---------- Nube ----------

let timer: number | undefined;
let running: Promise<void> | null = null;
let again = false;
function schedule(ms: number) {
  if (ADMIN || !getUserId()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncHealthCloud(), ms);
}

function describe(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/fetch|network|load failed/i.test(m)) return 'Sin conexión: tus noches están guardadas aquí y se subirán solas.';
  if (/schema|relation|permission|PGRST|not exist/i.test(m)) return 'La nube de salud aún no está preparada en Supabase (falta el SQL de Health o exponer el esquema «health»). Tus noches se guardan en este navegador.';
  return `No se pudo sincronizar la salud. (${m})`;
}

/** Trae lo nuevo de la nube y sube lo pendiente. Sin cuenta no hace nada. */
export function syncHealthCloud(): Promise<void> {
  const userId = getUserId();
  if (ADMIN || !userId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    set({ sync: 'syncing' }, false);
    try {
      await syncOnce(userId);
      set({ sync: 'synced', error: null }, false);
    } catch (e) {
      set({ sync: 'error', error: describe(e) }, false);
    } finally {
      running = null;
      if (again) {
        again = false;
        schedule(500);
      }
    }
  })();
  return running;
}

async function syncOnce(userId: string) {
  const h = cloudClient().schema('health');
  // Otra cuenta en este navegador: sus noches no se mezclan con las de la anterior.
  if (store.meta.uid && store.meta.uid !== userId) set({ nights: [], settings: DEFAULT_SETTINGS, meta: { ...blankMeta(), uid: userId } });
  const first = store.meta.uid !== userId;
  if (first) {
    // Primera sincronía: todo lo apuntado aquí sin cuenta es candidato a subir.
    const epoch = new Date(0).toISOString();
    const pend = { ...store.meta.pend };
    for (const n of store.nights) pend[n.fecha] ??= n.actualizado ?? epoch;
    set({ meta: { ...store.meta, uid: userId, cursor: null, pend, pendSettings: store.meta.pendSettings ?? store.settings.actualizado ?? null } });
  }

  // 1. Traer lo que cambió (margen de 5 s por si dos escrituras casi coinciden).
  const since = store.meta.cursor ? new Date(Date.parse(store.meta.cursor) - 5000).toISOString() : null;
  const rows: CloudRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = h.from('nights').select('fecha,data,deleted,updated_at');
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q.order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as CloudRow[]));
    if (!data || data.length < PAGE) break;
  }
  const merged = mergeRemote(store.nights, store.meta.pend, rows, store.meta.cursor);
  const { data: srow, error: serr } = await h.from('settings').select('data').maybeSingle();
  if (serr) throw serr;
  let settings = store.settings;
  let pendSettings = store.meta.pendSettings;
  const remoteS = (srow?.data ?? null) as { actualizado?: string } | null;
  if (remoteS && (!pendSettings || pendSettings <= (remoteS.actualizado ?? ''))) {
    settings = normalizeSettings(remoteS, store.settings);
    pendSettings = null;
  }
  set({ nights: merged.changed ? merged.nights : store.nights, settings, meta: { ...store.meta, pend: merged.pend, cursor: merged.cursor, pendSettings } });

  // 2. Subir lo pendiente.
  const pend = { ...store.meta.pend };
  const fechas = Object.keys(pend);
  if (fechas.length) {
    const byDate = new Map(store.nights.map((n) => [n.fecha, n]));
    const up = fechas.map((f) => {
      const n = byDate.get(f);
      return n
        ? { user_id: userId, fecha: f, data: { ...n, actualizado: n.actualizado ?? pend[f] }, deleted: false }
        : { user_id: userId, fecha: f, data: { fecha: f, borrado: pend[f] }, deleted: true };
    });
    for (let i = 0; i < up.length; i += 200) {
      const { error } = await h.from('nights').upsert(up.slice(i, i + 200), { onConflict: 'user_id,fecha' });
      if (error) throw error;
    }
    const left = { ...store.meta.pend };
    for (const f of fechas) if (left[f] === pend[f]) delete left[f]; // solo lo que no cambió mientras se subía
    set({ meta: { ...store.meta, pend: left } });
  }
  if (store.meta.pendSettings) {
    const sent = store.meta.pendSettings;
    const { error } = await h.from('settings').upsert({ user_id: userId, data: { ...store.settings, actualizado: store.settings.actualizado ?? sent } }, { onConflict: 'user_id' });
    if (error) throw error;
    if (store.meta.pendSettings === sent) set({ meta: { ...store.meta, pendSettings: null } });
  }
}

/** Al borrar la cuenta o empezar de cero: olvida las noches de este navegador. */
export function clearHealthLocal() {
  set({ nights: [], settings: DEFAULT_SETTINGS, meta: blankMeta(), sync: 'local', error: null });
}
