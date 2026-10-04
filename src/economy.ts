// Monedas y tienda de recompensas. El saldo se deriva: lo ganado (XP, bosses, reinos) menos lo gastado.
import type { GameState, Reward } from './types';
import { totalXp, uid } from './game';
import { defeatedBosses } from './bosses';
import { kingdomProgress } from './kingdoms';

export const COIN_RULES = {
  xpPerCoin: 5, // 1 moneda por cada 5 XP
  kingdomBonusPerBuilding: 10, // al completar un reino (mín. 3 construcciones)
  kingdomMinBuildings: 3,
};

const DEFAULTS: [string, string, number][] = [
  ['Ver un episodio de una serie', '📺', 25],
  ['1 hora de videojuegos', '🎮', 40],
  ['Comida trampa', '🍔', 80],
  ['Salir con amigos', '🍻', 100],
  ['Día libre sin culpa', '🏖️', 350],
];

export function defaultRewards(now: number): Reward[] {
  return DEFAULTS.map(([name, icon, cost], i) => ({ id: `r${i}-${now.toString(36)}`, name, icon, cost, createdAt: now }));
}

/** Monedas ganadas por reino completado (0 si no cuenta). */
export function kingdomBonus(s: GameState, kingdomId: string): number {
  const p = kingdomProgress(s, kingdomId);
  return p.complete && p.total >= COIN_RULES.kingdomMinBuildings ? p.total * COIN_RULES.kingdomBonusPerBuilding : 0;
}

export function coinsEarned(s: GameState, now: number) {
  const fromXp = Math.floor(totalXp(s) / COIN_RULES.xpPerCoin);
  const fromBosses = defeatedBosses(s, now).reduce((n, b) => n + b.reward, 0);
  const fromKingdoms = s.kingdoms.reduce((n, k) => n + kingdomBonus(s, k.id), 0);
  return { fromXp, fromBosses, fromKingdoms, total: fromXp + fromBosses + fromKingdoms };
}

export function coinsSpent(s: GameState): number {
  return s.purchases.reduce((n, p) => n + p.cost, 0);
}

/** Saldo (puede ser negativo si deshaces XP después de gastar). */
export function coinBalance(s: GameState, now: number): number {
  return coinsEarned(s, now).total - coinsSpent(s);
}

export function addReward(s: GameState, r: { name: string; icon: string; cost: number }, now: number): GameState {
  const reward: Reward = { id: uid(), name: r.name.trim(), icon: r.icon || '🎁', cost: Math.max(1, Math.round(r.cost)), createdAt: now };
  return { ...s, rewards: [...s.rewards, reward] };
}

export function deleteReward(s: GameState, id: string): GameState {
  return { ...s, rewards: s.rewards.filter((r) => r.id !== id) };
}

/** Canjea una recompensa si hay saldo. */
export function buyReward(s: GameState, rewardId: string, now: number): { state: GameState; ok: boolean } {
  const r = s.rewards.find((x) => x.id === rewardId);
  if (!r || coinBalance(s, now) < r.cost) return { state: s, ok: false };
  const purchase = { id: uid(), rewardId, name: r.name, icon: r.icon, cost: r.cost, at: now };
  return { state: { ...s, purchases: [...s.purchases, purchase] }, ok: true };
}

/** Devuelve las monedas de un canje (por si fue sin querer). */
export function refundPurchase(s: GameState, purchaseId: string): GameState {
  return { ...s, purchases: s.purchases.filter((p) => p.id !== purchaseId) };
}
