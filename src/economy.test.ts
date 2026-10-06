import { describe, expect, it } from 'vitest';
import {
  addHabit, addQuest, completeQuest, createProfile, emptyState, startTimer, stopTimer, toggleHabit, totalXp, undoQuest, updateHabit, updateQuest,
} from './game';
import {
  addReward, buyReward, coinBalance, defaultRewards, nextReward, purchaseCounts, refundPurchase, rewardCategory, updateReward,
} from './economy';
import { addBoss, bossReward, bossStatus, summonTemplate } from './bosses';
import { attributeXp } from './attributes';
import { addKingdom } from './kingdoms';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();
const DAY = 86_400_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('XP y atributos a medida', () => {
  it('una misión puede dar XP propio y varios atributos', () => {
    let s = addQuest(base(), 'Llamar a mamá', 'side', NOW, { xp: 35, rewards: { conexion: 6, voluntad: 2, sabiduria: 0 } });
    expect(s.quests[0].rewards).toEqual({ conexion: 6, voluntad: 2 });
    s = completeQuest(s, s.quests[0].id, NOW).state;
    expect(totalXp(s)).toBe(35);
    expect(attributeXp(s)).toMatchObject({ conexion: 6, voluntad: 2 });
  });

  it('respeta los límites y editar vuelve a automático si se quita lo personalizado', () => {
    let s = addQuest(base(), 'X', 'main', NOW, { xp: 999, rewards: { maestria: 80 } });
    expect(s.quests[0]).toMatchObject({ xp: 100, rewards: { maestria: 20 } });
    s = updateQuest(s, s.quests[0].id, { title: 'Y' });
    expect(s.quests[0].xp).toBeUndefined();
    expect(s.quests[0].rewards).toBeUndefined();
    expect(s.quests[0].title).toBe('Y');
  });

  it('un hábito editado da su nuevo XP y atributos a partir de ahora', () => {
    let s = addHabit(base(), 'Leer', NOW);
    s = toggleHabit(s, s.habits[0].id, NOW - DAY).state;
    s = updateHabit(s, s.habits[0].id, { name: 'Leer 20 páginas', xp: 15, rewards: { sabiduria: 3, creacion: 1 } });
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    expect(totalXp(s)).toBe(25);
    expect(attributeXp(s)).toMatchObject({ sabiduria: 6, creacion: 1 });
  });
});

describe('monedas y recompensas', () => {
  it('1 moneda por cada 5 XP; canjear resta y no deja saldo negativo al comprar', () => {
    let s = addQuest(base(), 'A', 'main', NOW);
    s = completeQuest(s, s.quests[0].id, NOW).state; // 50 XP → 10 monedas
    expect(coinBalance(s, NOW)).toBe(10);
    s = addReward(s, { name: 'Episodio', icon: '📺', cost: 8 }, NOW);
    const r = s.rewards.at(-1)!;
    const bought = buyReward(s, r.id, NOW);
    expect(bought.ok).toBe(true);
    expect(coinBalance(bought.state, NOW)).toBe(2);
    expect(buyReward(bought.state, r.id, NOW).ok).toBe(false);
    expect(coinBalance(refundPurchase(bought.state, bought.state.purchases[0].id), NOW)).toBe(10);
    // Deshacer la misión tras gastar deja el saldo en negativo (deuda), no lo oculta.
    expect(coinBalance(undoQuest(bought.state, s.quests[0].id), NOW)).toBe(-8);
  });

  it('el personaje nuevo trae recompensas de ejemplo', () => {
    expect(base().rewards.map((r) => r.name)).toContain('Ver un episodio de una serie');
  });

  it('completar un reino de 3+ construcciones da un bonus', () => {
    let s = addKingdom(base(), 'R', NOW);
    const k = s.kingdoms[0].id;
    for (const t of ['a', 'b', 'c']) s = addQuest(s, t, 'side', NOW, { kingdomId: k });
    for (const q of s.quests) s = completeQuest(s, q.id, NOW).state;
    expect(coinBalance(s, NOW)).toBe(9 + 30); // 45 XP → 9 + bonus 3×10
  });
});

describe('tienda por categorías', () => {
  it('las recompensas por defecto traen categoría y las antiguas (sin ella) se deducen', () => {
    const defs = defaultRewards(NOW);
    expect(defs.map((r) => r.category)).toEqual(['ocio', 'descanso', 'ocio', 'caprichos', 'ocio', 'grandes', 'grandes']);
    const old = (name: string, cost: number) => rewardCategory({ name, cost });
    expect(old('Ver un episodio de una serie', 25)).toBe('ocio');
    expect(old('Comida trampa', 80)).toBe('caprichos');
    expect(old('Día libre sin culpa', 350)).toBe('grandes');
    expect(old('Siesta de 1 hora', 30)).toBe('descanso');
    expect(rewardCategory({ name: 'Comida trampa', cost: 80, category: 'raro' })).toBe('caprichos');
  });

  it('crear con icono y categoría propios, y editar sin tocar los canjes ya hechos', () => {
    let s = addQuest(base(), 'A', 'main', NOW);
    s = completeQuest(s, s.quests[0].id, NOW).state; // 10 monedas
    s = addReward(s, { name: '  Ir al cine ', icon: '🍿', cost: 9.6, category: 'ocio' }, NOW);
    const r = s.rewards.at(-1)!;
    expect(r).toMatchObject({ name: 'Ir al cine', icon: '🍿', cost: 10, category: 'ocio' });
    s = buyReward(s, r.id, NOW).state;
    s = updateReward(s, r.id, { cost: 40, icon: '🎬', category: 'grandes', name: '' });
    expect(s.rewards.at(-1)).toMatchObject({ name: 'Ir al cine', icon: '🎬', cost: 40, category: 'grandes' });
    expect(s.purchases[0]).toMatchObject({ icon: '🍿', cost: 10 });
    expect(purchaseCounts(s)).toEqual({ [r.id]: 1 });
    expect(coinBalance(s, NOW)).toBe(0);
  });

  it('propone el siguiente premio que aún no puedes pagar', () => {
    let s = addQuest(base(), 'A', 'main', NOW);
    s = completeQuest(s, s.quests[0].id, NOW).state; // 10 monedas
    expect(nextReward(s, NOW)).toMatchObject({ reward: { name: 'Ver un episodio de una serie' }, missing: 15, xp: 75 });
    s = { ...s, rewards: s.rewards.filter((r) => r.cost <= 10) };
    expect(nextReward(s, NOW)).toBeNull();
  });
});

describe('bosses', () => {
  it('el daño es lo que haces dentro de su plazo y al morir da su botín', () => {
    let s = addBoss(base(), { name: 'Medusa', icon: '🐍', source: 'deepwork', hp: 60, days: 7 }, NOW);
    const boss = s.bosses[0];
    expect(boss.reward).toBe(bossReward('deepwork', 60));
    s = stopTimer(startTimer(s, null, 0, NOW + 1000), NOW + 1000 + 40 * 60_000).state;
    expect(bossStatus(s, boss, NOW + DAY)).toMatchObject({ damage: 40, hpLeft: 20, defeated: false, active: true });
    s = stopTimer(startTimer(s, null, 0, NOW + DAY), NOW + DAY + 30 * 60_000).state;
    const st = bossStatus(s, boss, NOW + 2 * DAY);
    expect(st).toMatchObject({ damage: 60, defeated: true, active: false });
    expect(coinBalance(s, NOW + 2 * DAY)).toBe(Math.floor(70 / 5) + boss.reward);
  });

  it('caduca si no lo derrotas a tiempo, y la XP de antes no cuenta', () => {
    let s = addHabit(base(), 'Meditar', NOW);
    s = toggleHabit(s, s.habits[0].id, NOW).state; // antes del boss
    s = summonTemplate(s, 'esfinge', NOW + 1000);
    const boss = s.bosses[0];
    expect(bossStatus(s, boss, NOW + 1000).damage).toBe(0);
    expect(bossStatus(s, boss, NOW + 8 * DAY)).toMatchObject({ expired: true, active: false, defeated: false });
  });
});

import { weekStart, weekSummary } from './summary';
import { exportBackup, parseBackup } from './backup';

describe('crónica semanal', () => {
  it('resume la semana pasada (lunes-domingo) frente a la anterior', () => {
    // NOW = domingo 4 oct 2026 → la semana pasada es 21-27 sept.
    const mon = weekStart(NOW);
    expect(new Date(mon).getDay()).toBe(1);
    let s = addQuest(addQuest(base(), 'A', 'main', NOW), 'B', 'side', NOW);
    s = completeQuest(s, s.quests[0].id, mon - 3 * DAY).state; // semana pasada
    s = completeQuest(s, s.quests[1].id, mon - 10 * DAY).state; // la anterior
    const w = weekSummary(s, NOW);
    expect(w).toMatchObject({ xp: 50, prevXp: 15, quests: 1, activeDays: 1, challenge: 'esfinge' });
    expect(w.deltaPct).toBe(233);
  });
});

describe('copia de seguridad', () => {
  it('exporta e importa la partida', () => {
    const s = addQuest(base(), 'A', 'main', NOW);
    const r = parseBackup(exportBackup(s, NOW));
    expect(r.ok && r.state.quests[0].title).toBe('A');
    expect(parseBackup('{"app":"otra"}')).toMatchObject({ ok: false });
    expect(parseBackup('no json')).toMatchObject({ ok: false });
  });
});
