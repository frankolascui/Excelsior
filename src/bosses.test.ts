import { describe, expect, it } from 'vitest';
import type { GameState, XPTransaction } from './types';
import { createProfile, emptyState, migrate, xpForLevel } from './game';
import {
  splitBossName,
  activeBosses, BOSS_TEMPLATES, bossLock, bossPhase, bossStatus, MAX_ACTIVE_BOSSES, nextInSaga, SAGAS, summonBoss, summonCheck, summonTemplate,
  templateOf, timesDefeated,
} from './bosses';
import { coinBalance } from './economy';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();
const DAY = 86_400_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

let n = 0;
/** Añade XP «de admin» en un instante (y XP de atributo si se pide). */
function gain(s: GameState, amount: number, at: number, attributes?: XPTransaction['attributes']): GameState {
  const t: XPTransaction = { id: `t${n++}`, at, amount, source: 'admin', sourceId: '', label: 'test', ...(attributes ? { attributes } : {}) };
  return { ...s, xp: [...s.xp, t] };
}
/** Partida en un nivel global dado (el XP es de antes de NOW, así no hiere a ningún boss). */
const atLevel = (level: number) => gain(base(), xpForLevel(level), NOW - 30 * DAY);

/** Invoca (sin candados) y derrota al momento un boss de XP o de un atributo. */
function beat(s: GameState, id: string, at: number): GameState {
  s = summonTemplate(s, id, at);
  const b = s.bosses.at(-1)!;
  if (b.source === 'xp') return gain(s, b.hp, at + 1000);
  if (b.source === 'deepwork') return { ...s, sessions: [...s.sessions, { id: `x${n++}`, questId: null, label: 'x', area: 'general', startedAt: at, endedAt: at + 1000, minutes: b.hp }] };
  if (b.source === 'habits') return Array.from({ length: b.hp }).reduce<GameState>((st, _, i) => ({ ...st, xp: [...st.xp, { id: `h${n++}`, at: at + 1000 + i, amount: 0, source: 'habit', sourceId: '', label: '' }] }), s);
  return gain(s, 0, at + 1000, { [b.source]: b.hp });
}

describe('escalera de bosses', () => {
  it('está bien formada: ids únicos, cadenas dentro de su saga, nivel y botín crecientes', () => {
    expect(BOSS_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BOSS_TEMPLATES.map((t) => t.id)).size).toBe(BOSS_TEMPLATES.length);
    for (const t of BOSS_TEMPLATES) {
      expect(SAGAS.some((s) => s.id === t.saga)).toBe(true);
      expect(t.level).toBeGreaterThanOrEqual(5);
      expect(t.level).toBeLessThanOrEqual(30);
      if (t.requires) {
        const prev = BOSS_TEMPLATES.find((x) => x.id === t.requires)!;
        expect(prev.saga).toBe(t.saga);
        expect(t.level).toBeGreaterThan(prev.level);
        expect(t.tier).toBeGreaterThanOrEqual(prev.tier);
        expect(t.reward).toBeGreaterThan(prev.reward);
      }
    }
    // El botín escala con el rango: el peor de un rango paga más que el mejor del anterior.
    for (const tier of [2, 3, 4]) {
      const minHere = Math.min(...BOSS_TEMPLATES.filter((t) => t.tier === tier).map((t) => t.reward));
      const maxBelow = Math.max(...BOSS_TEMPLATES.filter((t) => t.tier === tier - 1).map((t) => t.reward));
      expect(minHere).toBeGreaterThan(maxBelow);
    }
    // Los bosses que propone la crónica semanal siguen existiendo.
    for (const id of ['cerbero', 'esfinge', 'medusa', 'polifemo', 'caos']) expect(BOSS_TEMPLATES.some((t) => t.id === id)).toBe(true);
    expect(BOSS_TEMPLATES.find((t) => t.id === 'tifon')).toMatchObject({ level: 30, requires: 'cronos' });
  });

  it('se desbloquean por nivel global: unos pocos en el 5 y el resto más tarde', () => {
    expect(bossLock(base(), 'hidra', NOW)).toMatchObject({ kind: 'level', label: 'Nivel 5' });
    const s5 = atLevel(5);
    const open = BOSS_TEMPLATES.filter((t) => !bossLock(s5, t.id, NOW)).map((t) => t.id);
    expect(open).toEqual(['hidra', 'cerbero', 'esfinge', 'polifemo']);
    expect(bossLock(s5, 'caos', NOW)).toMatchObject({ kind: 'level', label: 'Nivel 15' });
    expect(bossLock(atLevel(15), 'caos', NOW)).toBeNull();
  });

  it('los encadenados exigen derrotar al anterior de su saga', () => {
    let s = atLevel(12);
    expect(bossLock(s, 'medusa', NOW)).toMatchObject({ kind: 'requires', label: 'Derrota a la Hidra' });
    expect(summonBoss(s, 'medusa', NOW)).toMatchObject({ ok: false, reason: 'Derrota a la Hidra' });
    s = beat(s, 'hidra', NOW);
    expect(timesDefeated(s, 'hidra', NOW + DAY)).toBe(1);
    expect(bossLock(s, 'medusa', NOW + DAY)).toBeNull();
    expect(bossLock(s, 'minotauro', NOW + DAY)).toMatchObject({ label: 'Derrota a Medusa' });
    // Escapar no cuenta como derrota.
    const fled = summonTemplate(atLevel(12), 'hidra', NOW);
    expect(bossLock(fled, 'medusa', NOW + 8 * DAY)).toMatchObject({ kind: 'requires' });
    // Si te falta nivel, manda el nivel aunque ya hayas vencido al anterior.
    expect(bossLock(beat(atLevel(5), 'hidra', NOW), 'medusa', NOW + DAY)).toMatchObject({ kind: 'level', label: 'Nivel 8' });
    expect(nextInSaga('caos').map((t) => t.id)).toEqual(['cronos']);
  });

  it('el final, Tifón, solo llega tras Caos y Cronos y en el nivel 30', () => {
    let s = atLevel(30);
    expect(bossLock(s, 'tifon', NOW)).toMatchObject({ label: 'Derrota a Cronos' });
    s = beat(s, 'caos', NOW);
    expect(bossLock(s, 'tifon', NOW + DAY)).toMatchObject({ label: 'Derrota a Cronos' });
    s = beat(s, 'cronos', NOW + DAY);
    expect(bossLock(s, 'tifon', NOW + 2 * DAY)).toBeNull();
  });

  it('invocar en la Arena guarda la plantilla y su botín, y no repite ni pasa del máximo', () => {
    let s = atLevel(5);
    const r = summonBoss(s, 'hidra', NOW);
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.bosses[0]).toMatchObject({ templateId: 'hidra', hp: 700, reward: 90, deadline: NOW + 7 * DAY });
    expect(summonCheck(s, 'hidra', NOW)).toEqual({ ok: false, reason: 'Ya está en combate' });
    s = summonBoss(s, 'cerbero', NOW).state;
    s = summonBoss(s, 'esfinge', NOW).state;
    expect(activeBosses(s, NOW)).toHaveLength(MAX_ACTIVE_BOSSES);
    expect(summonBoss(s, 'polifemo', NOW)).toMatchObject({ ok: false, reason: 'Máximo 3 a la vez' });
  });

  it('el reto de la crónica (summonTemplate) puede abrir un boss aún bloqueado', () => {
    const s = summonTemplate(atLevel(5), 'medusa', NOW);
    expect(s.bosses[0]).toMatchObject({ name: 'Medusa de la Distracción', templateId: 'medusa', source: 'deepwork' });
  });

  it('las fases cambian con la vida que le queda', () => {
    expect(bossPhase(700, 700)).toBe('calma');
    expect(bossPhase(351, 700)).toBe('calma');
    expect(bossPhase(350, 700)).toBe('herido');
    expect(bossPhase(175, 700)).toBe('furioso');
    expect(bossPhase(0, 700)).toBe('furioso');
  });
});

describe('partidas antiguas', () => {
  // Bosses guardados antes de la escalera: sin templateId, con los nombres y vidas de entonces.
  const oldSave = () => {
    const s = atLevel(6);
    return migrate({
      ...s,
      version: 5,
      rewards: [{ id: 'r0', name: 'Ver un episodio de una serie', icon: '📺', cost: 25, createdAt: NOW - 40 * DAY }],
      purchases: [{ id: 'p0', rewardId: 'r0', name: 'Ver un episodio de una serie', icon: '📺', cost: 25, at: NOW - 20 * DAY }],
      bosses: [
        { id: 'old-h', name: 'Hidra de la Procrastinación', icon: '🐉', source: 'xp', hp: 50, createdAt: NOW - 10 * DAY, deadline: NOW - 3 * DAY, reward: 88 },
        { id: 'old-m', name: 'Medusa de la Distracción', icon: '🐍', source: 'deepwork', hp: 30, createdAt: NOW - 10 * DAY, deadline: NOW - 3 * DAY, reward: 38 },
        { id: 'old-t', name: 'Tifón, padre de monstruos', icon: '🌪️', source: 'xp', hp: 4000, createdAt: NOW - DAY, deadline: NOW + 29 * DAY, reward: 500 },
      ],
      xp: [...s.xp, { id: 'k', at: NOW - 9 * DAY, amount: 60, source: 'admin', sourceId: '', label: '' }],
      sessions: [{ id: 'w', questId: null, label: 'x', area: 'general', startedAt: NOW - 9 * DAY, endedAt: NOW - 9 * DAY, minutes: 30 }],
    } as unknown as { version: number } & Record<string, unknown>);
  };

  it('reconoce por nombre los bosses sin plantilla y conserva vida, plazo y botín', () => {
    const s = oldSave();
    const [h, m, t] = s.bosses;
    expect(templateOf(h)?.id).toBe('hidra');
    expect(templateOf(t)?.id).toBe('tifon');
    expect(bossStatus(s, h, NOW)).toMatchObject({ defeated: true });
    expect(bossStatus(s, m, NOW)).toMatchObject({ defeated: true });
    expect(bossStatus(s, t, NOW)).toMatchObject({ active: true, hpLeft: 4000 });
    expect(t).toMatchObject({ hp: 4000, reward: 500 });
    expect(activeBosses(s, NOW).map((b) => b.id)).toEqual(['old-t']);
    expect(templateOf({ name: 'Mi examen' })).toBeUndefined();
  });

  it('lo ya vencido cuenta para las sagas y no se vuelve a bloquear', () => {
    const s = oldSave(); // nivel 6
    expect(timesDefeated(s, 'hidra', NOW)).toBe(1);
    expect(bossLock(s, 'medusa', NOW)).toBeNull(); // vencida antes de existir los niveles
    expect(bossLock(s, 'minotauro', NOW)).toMatchObject({ kind: 'level', label: 'Nivel 12' });
    expect(summonBoss(s, 'tifon', NOW).ok).toBe(false);
  });

  it('el saldo sigue contando el botín guardado y los canjes antiguos', () => {
    const s = oldSave();
    const fromXp = Math.floor((xpForLevel(6) + 60) / 5);
    expect(coinBalance(s, NOW)).toBe(fromXp + 88 + 38 - 25);
  });
});

describe('nombre épico', () => {
  it('parte el nombre en título y resto', () => {
    expect(splitBossName('Hidra de la Procrastinación')).toEqual({ title: 'Hidra', rest: 'de la Procrastinación' });
    expect(splitBossName('Hades, señor de las Sombras')).toEqual({ title: 'Hades', rest: 'señor de las Sombras' });
    expect(splitBossName('Las Sirenas del Scroll')).toEqual({ title: 'Las Sirenas', rest: 'del Scroll' });
    expect(splitBossName('Caronte el Barquero')).toEqual({ title: 'Caronte', rest: 'el Barquero' });
    expect(splitBossName('Caos primordial')).toEqual({ title: 'Caos', rest: 'primordial' });
    expect(splitBossName('Escila y Caribdis')).toEqual({ title: 'Escila y Caribdis', rest: '' });
  });
  it('todos los bosses de la escalera tienen sobrenombre', () => {
    expect(BOSS_TEMPLATES.every((t) => t.epithet)).toBe(true);
  });
});
