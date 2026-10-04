// Estado del juego + guardado en localStorage (persistencia local del MVP 1).
// Cuando haya backend, este es el único módulo que debe cambiar.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from './types';
import { emptyState, levelInfo, migrate, totalXp } from './game';
import { avatarInfo } from './attributes';
import { sfx } from './sfx';

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

function save(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorado */
  }
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
    }
    prevLevel.current = lvl;
  }, [state]);

  useEffect(() => {
    const avatar = avatarInfo(state, Date.now());
    if (avatar.index > prevAvatar.current) {
      toast(`Nuevo avatar: ${avatar.current.name}`, 'level');
      sfx.levelUp();
    }
    prevAvatar.current = avatar.index;
  }, [state]);


  // Referencia al último estado para encadenar acciones rápidas (doble click) sin leer estado viejo.
  const latest = useRef(state);

  /** Aplica una acción pura y, si devuelve XP, lo anuncia. */
  const act = useCallback(
    (fn: (s: GameState) => GameState | { state: GameState; xp: number; capped?: boolean }, capNote?: string) => {
      const r = fn(latest.current);
      const next = 'state' in r ? r.state : r;
      latest.current = next;
      setState(next);
      if ('state' in r) {
        if (r.xp > 0) {
          toast(`+${r.xp} XP`);
          sfx.reward();
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
