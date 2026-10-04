// Estado del juego + guardado en localStorage (persistencia local del MVP 1).
// Cuando haya backend, este es el único módulo que debe cambiar.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from './types';
import { emptyState, levelInfo, migrate, totalXp } from './game';
import { avatarInfo } from './attributes';
import { sfx } from './sfx';
import { confetti } from './confetti';
import { bossStatus } from './bosses';
import { kingdomBonus } from './economy';

const KEY = 'excelsior:v1';

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version >= 1 && parsed?.version <= emptyState().version) return migrate(parsed);
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

export interface Toast {
  id: number;
  text: string;
  tone: 'xp' | 'info' | 'level';
}

export function useGame() {
  const [state, setState] = useState<GameState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const prevLevel = useRef(levelInfo(totalXp(state)).level);
  const prevAvatar = useRef(avatarInfo(state, Date.now()).index);
  const prevDefeated = useRef(defeatedIds(state));
  const prevKingdoms = useRef(completedKingdoms(state));

  const toast = useCallback((text: string, tone: Toast['tone'] = 'xp') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => save(state), [state]);

  useEffect(() => {
    const lvl = levelInfo(totalXp(state)).level;
    if (lvl > prevLevel.current) {
      setLevelUp(lvl);
      sfx.levelUp();
      confetti({ big: true });
    }
    prevLevel.current = lvl;
  }, [state]);

  useEffect(() => {
    const avatar = avatarInfo(state, Date.now());
    if (avatar.index > prevAvatar.current) {
      toast(`${avatar.current.icon} Nuevo avatar: ${avatar.current.name}`, 'level');
      sfx.levelUp();
      confetti({ big: true, count: 220 });
    }
    prevAvatar.current = avatar.index;

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

  return { state, act, toast, toasts, levelUp, dismissLevelUp: () => setLevelUp(null), reset };
}
