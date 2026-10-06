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

/** Categorías de la tienda, de lo pequeño a lo grande. */
export type RewardCategory = 'descanso' | 'ocio' | 'caprichos' | 'grandes';
export const REWARD_CATEGORIES: { id: RewardCategory; name: string; icon: string; hint: string }[] = [
  { id: 'descanso', name: 'Descanso', icon: '😴', hint: 'Recargar sin culpa' },
  { id: 'ocio', name: 'Ocio', icon: '🎮', hint: 'Series, juegos, planes' },
  { id: 'caprichos', name: 'Caprichos', icon: '🍔', hint: 'Antojos y compras pequeñas' },
  { id: 'grandes', name: 'Premios grandes', icon: '🏆', hint: 'Para los que se ganan a pulso' },
];

/** Iconos sugeridos al crear una recompensa (también se puede escribir cualquier emoji). */
export const REWARD_ICONS = ['🎁', '📺', '🎮', '🍔', '🍕', '🍦', '🍻', '☕', '😴', '🛁', '🧘', '🏖️', '🎬', '🎧', '📚', '🛍️', '👟', '⚽', '✈️', '🎟️', '💆', '🏆'];

const DEFAULTS: [string, string, number, RewardCategory][] = [
  ['Ver un episodio de una serie', '📺', 25, 'ocio'],
  ['Siesta larga sin alarma', '😴', 30, 'descanso'],
  ['1 hora de videojuegos', '🎮', 40, 'ocio'],
  ['Comida trampa', '🍔', 80, 'caprichos'],
  ['Salir con amigos', '🍻', 100, 'ocio'],
  ['Día libre sin culpa', '🏖️', 350, 'grandes'],
  ['Comprarme algo que llevo tiempo queriendo', '🛍️', 600, 'grandes'],
];

export function defaultRewards(now: number): Reward[] {
  return DEFAULTS.map(([name, icon, cost, category], i) => ({ id: `r${i}-${now.toString(36)}`, name, icon, cost, category, createdAt: now }));
}

const isCategory = (c: unknown): c is RewardCategory => REWARD_CATEGORIES.some((x) => x.id === c);

/** Categoría de una recompensa: la elegida o, en las antiguas, deducida del nombre y el precio. */
export function rewardCategory(r: Pick<Reward, 'name' | 'cost'> & { category?: string }): RewardCategory {
  if (isCategory(r.category)) return r.category;
  const n = r.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (r.cost >= 250) return 'grandes';
  if (/siesta|dormir|descans|relaj|libre|bano|masaje|spa|tumbar|meditar|paseo/.test(n)) return 'descanso';
  if (/comida|comer|pizza|hamburg|dulce|helado|chuche|postre|cafe|compra|capricho|ropa|pedir/.test(n)) return 'caprichos';
  return 'ocio';
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

export function addReward(s: GameState, r: { name: string; icon: string; cost: number; category?: RewardCategory }, now: number): GameState {
  const reward: Reward = { id: uid(), name: r.name.trim(), icon: r.icon.trim() || '🎁', cost: Math.max(1, Math.round(r.cost)), createdAt: now };
  if (r.category) reward.category = r.category;
  return { ...s, rewards: [...s.rewards, reward] };
}

/** Edita una recompensa (los canjes antiguos guardan su propio precio y no cambian). */
export function updateReward(s: GameState, id: string, patch: { name?: string; icon?: string; cost?: number; category?: RewardCategory }): GameState {
  return {
    ...s,
    rewards: s.rewards.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r };
      if (patch.name?.trim()) next.name = patch.name.trim();
      if (patch.icon?.trim()) next.icon = patch.icon.trim();
      if (patch.cost !== undefined && patch.cost > 0) next.cost = Math.max(1, Math.round(patch.cost));
      if (patch.category) next.category = patch.category;
      return next;
    }),
  };
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

/** Veces que has canjeado cada recompensa. */
export function purchaseCounts(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of s.purchases) out[p.rewardId] = (out[p.rewardId] ?? 0) + 1;
  return out;
}

/** El premio más barato que aún no puedes pagar: «te faltan N monedas» (≈ N × 5 XP). Null si puedes con todos. */
export function nextReward(s: GameState, now: number): { reward: Reward; missing: number; xp: number } | null {
  const balance = coinBalance(s, now);
  const next = s.rewards.filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  if (!next) return null;
  const missing = next.cost - balance;
  return { reward: next, missing, xp: missing * COIN_RULES.xpPerCoin };
}
