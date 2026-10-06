// Estado del juego + guardado en localStorage (persistencia local del MVP 1).
// Cuando haya backend, este es el único módulo que debe cambiar.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from './types';
import { emptyState, levelInfo, migrate, totalXp } from './game';
import { avatarInfo, ensureAscended, rebalance } from './attributes';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { bossStatus } from './bosses';
import { kingdomBonus } from './economy';
import { markLocalChange, markSynced, reconcile, scheduleSave, useCloud, type RemoteSave } from './cloud';

import { ADMIN } from './admin';

// En modo admin se juega sobre una partida de pruebas aparte.
const KEY = ADMIN ? 'excelsior:admin-sandbox' : 'excelsior:v1';

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version >= 1 && parsed?.version <= emptyState().version) return rebalance(ensureAscended(migrate(parsed), Date.now())); // primero se congela el avatar, luego se reequilibra
    }
  } catch {
    /* almacenamiento no disponible: se juega sin guardar */
  }
  return emptyState();
}

/** Guarda ya (sin esperar a React). Se usa al importar una copia antes de recargar. */
export function save(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorado */
  }
}

function defeatedIds(s: GameState): Set<string> {
  const now = Date.now();
  return new Set(s.bosses.filter((b) => bossStatus(s, b, now).defeated).map((b) => b.id));
}

function completedKingdoms(s: GameState): Set<string> {
  return new Set(s.kingdoms.filter((k) => kingdomBonus(s, k.id) > 0).map((k) => k.id));
}

/** Nombre del avatar cuyo ritual ya puedes hacer, o null. */
function readyFor(s: GameState): string | null {
  if (!s.profile) return null;
  const a = avatarInfo(s, Date.now());
  return a.ready ? a.next!.name : null;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'xp' | 'info' | 'level';
}

export function useGame() {
  const [state, setState] = useState<GameState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [levelUpFrom, setLevelUpFrom] = useState(1);
  const prevLevel = useRef(levelInfo(totalXp(state)).level);
  const prevReady = useRef(readyFor(state));
  const prevDefeated = useRef(defeatedIds(state));
  const prevKingdoms = useRef(completedKingdoms(state));

  const toast = useCallback((text: string, tone: Toast['tone'] = 'xp') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => save(state), [state]);

  // Nube: al entrar (o al abrir con sesión) se decide qué partida manda; después, cada cambio se sube.
  const cloudUser = useCloud().userId;
  const userId = ADMIN ? null : cloudUser; // la partida de pruebas nunca se sube
  const [conflict, setConflict] = useState<RemoteSave | null>(null);
  const [cloudChecked, setCloudChecked] = useState(ADMIN);
  const reconciled = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || reconciled.current === userId) return;
    reconciled.current = userId;
    reconcile(state)
      .then((r) => {
        if (r.kind === 'adopt') adopt(r.remote.state);
        if (r.kind === 'conflict') setConflict(r.remote);
      })
      .catch(() => toast('No se pudo leer tu partida de la nube', 'info'))
      .finally(() => setCloudChecked(true));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (userId && reconciled.current === userId && !conflict) scheduleSave(state);
  }, [state, userId, conflict]);

  function adopt(remote: GameState) {
    const next = rebalance(ensureAscended(migrate(remote as unknown as Parameters<typeof migrate>[0]), Date.now()));
    prevLevel.current = levelInfo(totalXp(next)).level;
    prevReady.current = readyFor(next);
    prevDefeated.current = defeatedIds(next);
    prevKingdoms.current = completedKingdoms(next);
    latest.current = next; // si no, la siguiente acción partiría de la partida anterior
    setState(next);
    markSynced();
  }

  /** Resuelve el primer login en un dispositivo que ya tenía partida. */
  function resolveConflict(useRemote: boolean) {
    if (!conflict) return;
    if (useRemote) adopt(conflict.state);
    else markSynced();
    setConflict(null);
  }

  useEffect(() => {
    const lvl = levelInfo(totalXp(state)).level;
    if (lvl > prevLevel.current) {
      setLevelUpFrom(prevLevel.current);
      setLevelUp(lvl);
      sfx.levelUp();
      confetti({ big: true });
    }
    prevLevel.current = lvl;
  }, [state]);

  useEffect(() => {
    // Al cumplir los requisitos del siguiente avatar, Hiperión avisa del ritual (la ascensión la celebra el ritual).
    const ready = readyFor(state);
    if (ready && ready !== prevReady.current) {
      toast(`🕯️ Ritual disponible: ${ready}. Hiperión te espera`, 'level');
      sfx.levelUp();
    }
    prevReady.current = ready;

    const defeated = defeatedIds(state);
    for (const b of state.bosses) {
      if (defeated.has(b.id) && !prevDefeated.current.has(b.id)) {
        toast(`${b.icon} ¡Has derrotado a ${b.name}! +${b.reward} 🪙`, 'level');
        setTimeout(() => sfx.victory(), 300);
        confetti({ big: true, count: 200 });
      }
    }
    prevDefeated.current = defeated;

    const kingdoms = completedKingdoms(state);
    for (const k of state.kingdoms) {
      if (kingdoms.has(k.id) && !prevKingdoms.current.has(k.id)) {
        const bonus = kingdomBonus(state, k.id);
        toast(`👑 ${k.name} es un reino glorioso${bonus ? ` · +${bonus} 🪙` : ''}`, 'level');
        setTimeout(() => sfx.victory(), 300);
        confetti({ big: true, count: 200 });
      }
    }
    prevKingdoms.current = kingdoms;
  }, [state]);


  // Referencia al último estado para encadenar acciones rápidas (doble click) sin leer estado viejo.
  const latest = useRef(state);

  /** Aplica una acción pura y, si devuelve XP, lo anuncia (con sonido propio y, a veces, confeti). */
  const act = useCallback(
    (
      fn: (s: GameState) => GameState | { state: GameState; xp: number; capped?: boolean },
      capNote?: string,
      opts: { sound?: 'reward' | 'habit' | 'build'; party?: boolean } = {},
    ) => {
      const prev = latest.current;
      const r = fn(prev);
      const next = 'state' in r ? r.state : r;
      latest.current = next;
      setState(next);
      markLocalChange();
      if ('state' in r) {
        if (r.xp > 0) {
          toast(`+${r.xp} XP`);
          sfx[opts.sound ?? 'reward']();
          if (opts.party) confetti({ big: true });
          else if (Math.random() < 0.12) confetti({ count: 70 });
          // Golpes a los bosses activos que no mueren con esta acción (la muerte la anuncia el efecto).
          const now = Date.now();
          for (const b of next.bosses) {
            const before = bossStatus(prev, b, now);
            const after = bossStatus(next, b, now);
            if (before.active && after.active && after.damage > before.damage) {
              const dmg = Math.round((after.damage - before.damage) * 10) / 10;
              setTimeout(() => {
                toast(`${b.icon} −${dmg} HP a ${b.name}`, 'info');
                sfx.hit();
              }, 350);
              break;
            }
          }
        }
        if (r.xp < 0) {
          toast(`${r.xp} XP`, 'info');
          sfx.undo();
        }
        if (r.capped && capNote) toast(capNote, 'info');
      }
    },
    [toast],
  );

  const reset = useCallback(() => {
    latest.current = emptyState();
    setState(latest.current);
  }, []);

  return { state, act, toast, toasts, levelUp, levelUpFrom, dismissLevelUp: () => setLevelUp(null), reset, conflict, resolveConflict, cloudChecked };
}
