import { describe, expect, it } from 'vitest';
import {
  addHabit, addQuest, completeQuest, createProfile, emptyState, migrate, startTimer, stopTimer,
  toggleHabit, totalXp, undoQuest,
} from './game';
import {
  addGoal, AVATARS, attributeHistory, attributeLevel, attributeXp, avatarInfo, avatarRequirements, completeRitual, deleteGoal, ensureAscended, formatAttrXp, goalProgress, habitRewards,
  questRewards, requirementStatus, updateGoal,
} from './attributes';

import type { AttributeRewards, GameState } from './types';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();
const MIN = 60_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('recompensas de atributo', () => {
  it('misiones: Principal +5 Voluntad +5 Maestría, Secundaria +3 Voluntad', () => {
    let s = addQuest(addQuest(base(), 'A', 'main', NOW), 'B', 'side', NOW);
    for (const q of s.quests) s = completeQuest(s, q.id, NOW).state;
    expect(attributeXp(s)).toMatchObject({ voluntad: 8, maestria: 5, sabiduria: 0 });
  });

  it('deshacer una misión retira también su XP de atributo', () => {
    const s = addQuest(base(), 'A', 'main', NOW);
    const done = completeQuest(s, s.quests[0].id, NOW).state;
    expect(attributeXp(undoQuest(done, s.quests[0].id)).maestria).toBe(0);
  });

  it('hábitos según su nombre', () => {
    expect(habitRewards('Meditación')).toEqual({ voluntad: 3, sabiduria: 2 });
    expect(habitRewards('Entrenar')).toEqual({ voluntad: 5 });
    expect(habitRewards('Journaling')).toEqual({ sabiduria: 4 });
    expect(habitRewards('Caminar')).toEqual({ voluntad: 2 });
    expect(habitRewards('Llamar a alguien')).toEqual({ conexion: 4 });
    expect(habitRewards('Escribir')).toEqual({ creacion: 4 });
    const s = addHabit(base(), 'Meditar', NOW);
    const r = toggleHabit(s, s.habits[0].id, NOW).state;
    expect(attributeXp(r)).toMatchObject({ voluntad: 3, sabiduria: 2 });
    expect(attributeHistory(r, 'sabiduria')).toEqual([{ at: NOW, label: 'Meditar', amount: 2 }]);
  });

  it('Deep Work: +1 Maestría y +0,5 Voluntad por minuto, y guarda el área', () => {
    const s = startTimer(base(), null, 0, NOW, 'programacion');
    const r = stopTimer(s, NOW + 45 * MIN);
    expect(r.session?.area).toBe('programacion');
    expect(attributeXp(r.state)).toMatchObject({ maestria: 45, voluntad: 22.5 });
    expect(formatAttrXp(22.5)).toBe('22,5');
    expect(totalXp(r.state)).toBe(45); // el XP global no cambia
  });
});

describe('Conexión y Creación', () => {
  it('las misiones suman un bonus según el título', () => {
    expect(questRewards('side', 'Llamar a mi abuela')).toEqual({ voluntad: 3, conexion: 3 });
    expect(questRewards('main', 'Publicar el vídeo')).toEqual({ voluntad: 5, maestria: 5, creacion: 3 });
    expect(questRewards('daily', 'Responder emails')).toEqual({ voluntad: 3 });
  });
});

describe('niveles de atributo y avatar', () => {
  it('nivel de atributo con 25·L·(L−1)', () => {
    expect(attributeLevel(0)).toMatchObject({ level: 1, needed: 50 });
    expect(attributeLevel(50).level).toBe(2);
    expect(attributeLevel(500).level).toBe(5);
  });

  /** Estado con XP global y de atributos inyectados, repartido en `days` días distintos. */
  const withXp = (global: number, attrs: AttributeRewards, days = 1): GameState => ({
    ...base(),
    xp: Array.from({ length: days }, (_, i) => ({
      id: `x${i}`, at: NOW - i * 86_400_000, amount: i ? 0 : global, source: 'quest' as const, sourceId: 'q', label: 'x', attributes: i ? {} : attrs,
    })),
  });

  it('el avatar exige nivel global y hazañas iguales para todos', () => {
    const start = avatarInfo(withXp(0, {}), NOW);
    expect(start).toMatchObject({ current: { name: 'Aprendiz' }, next: { name: 'Iniciado' } });
    // Iniciado: nivel 3 (300 XP) + 3 días con progreso.
    const oneDay = avatarInfo(withXp(300, {}), NOW);
    expect(oneDay.current.name).toBe('Aprendiz');
    expect(oneDay.progress).toBeCloseTo((1 + 1 / 3) / 2);
    // Con los requisitos cumplidos no se asciende solo: queda el ritual pendiente.
    const ready = withXp(300, {}, 3);
    expect(avatarInfo(ready, NOW)).toMatchObject({ current: { name: 'Aprendiz' }, next: { name: 'Iniciado' }, ready: true });
    const done = completeRitual(ready, 'iniciado', { answers: [{ q: '¿Por qué?', a: 'Porque sí' }], oath: 'Juro' }, NOW);
    expect(avatarInfo(done, NOW)).toMatchObject({ current: { name: 'Iniciado' }, next: { name: 'Disciplinado' }, ready: false });
    expect(done.rituals).toEqual([{ avatarId: 'iniciado', at: NOW, answers: [{ q: '¿Por qué?', a: 'Porque sí' }], oath: 'Juro' }]);
  });

  it('el Ritual del Iniciado guarda objetivos a 3 meses como requisito de Forjador', () => {
    const deadline = NOW + 90 * 86_400_000;
    const s = completeRitual(withXp(300, {}, 3), 'iniciado', {
      answers: [], oath: 'Juro', goals: [{ name: 'Ahorrar', unit: '€', start: 0, target: 1500, avatarId: 'forjador', deadline }],
    }, NOW);
    expect(s.goals).toMatchObject([{ name: 'Ahorrar', avatarId: 'forjador', deadline, current: 0 }]);
    const forjador = AVATARS.find((a) => a.id === 'forjador')!;
    expect(avatarRequirements(s, forjador).at(-1)).toEqual({ kind: 'goal', goalId: s.goals[0].id });
  });

  it('las partidas anteriores a los rituales conservan su avatar y ya no ascienden solas', () => {
    const legacy: GameState = { ...withXp(300, {}, 3), ascended: undefined };
    expect(avatarInfo(legacy, NOW).current.name).toBe('Iniciado'); // regla antigua mientras no se congela
    const frozen = ensureAscended(legacy, NOW);
    expect(frozen.ascended).toEqual(['iniciado']);
    expect(avatarInfo(frozen, NOW).current.name).toBe('Iniciado');
    expect(ensureAscended(base(), NOW).ascended).toEqual([]); // las nuevas ya traen el campo
  });

  it('las metas personales bloquean el avatar hasta cumplirse (subiendo o bajando)', () => {
    let s = withXp(300, {}, 3);
    s = addGoal(s, { name: 'Pesar', unit: 'kg', start: 80, target: 75, avatarId: 'iniciado' }, NOW);
    expect(avatarInfo(s, NOW)).toMatchObject({ current: { name: 'Aprendiz' }, ready: false });
    const goal = s.goals[0];
    s = updateGoal(s, goal.id, 77.5);
    expect(goalProgress(s.goals[0])).toBeCloseTo(0.5);
    expect(avatarInfo(s, NOW).requirements[2]).toMatchObject({ met: false, label: 'Pesar: 77,5 / 75 kg' });
    s = updateGoal(s, goal.id, 75);
    expect(avatarInfo(s, NOW).ready).toBe(true);
    expect(avatarInfo(deleteGoal(s, goal.id), NOW).ready).toBe(true);
  });

  it('la escalera tiene 10 avatares y acaba en Excelsior', () => {
    expect(AVATARS).toHaveLength(10);
    expect(AVATARS.at(-1)).toMatchObject({ id: 'prime', name: 'Excelsior' });
  });

  it('evalúa otros tipos de requisito', () => {
    let s = addHabit(base(), 'Meditar', NOW);
    for (const d of [0, 1, 2]) s = toggleHabit(s, s.habits[0].id, NOW - d * 86_400_000).state;
    expect(requirementStatus(s, { kind: 'habitStreak', days: 7 }, NOW)).toMatchObject({ met: false, label: 'Racha de 7 días en un hábito' });
    expect(requirementStatus(s, { kind: 'habitStreak', days: 3 }, NOW).met).toBe(true);
    expect(requirementStatus(s, { kind: 'attributeLevel', id: 'sabiduria', level: 2 }, NOW).met).toBe(false);
    expect(requirementStatus(s, { kind: 'questsCompleted', min: 1 }, NOW).met).toBe(false);
  });
});

describe('migración de datos guardados', () => {
  it('recalcula el XP de atributo de datos antiguos sin tocar el XP global', () => {
    let s = addHabit(addQuest(base(), 'A', 'main', NOW), 'Entrenar', NOW);
    s = completeQuest(s, s.quests[0].id, NOW).state;
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    s = stopTimer(startTimer(s, null, 25, NOW), NOW + 10 * MIN).state;
    // Simula datos guardados por la versión 1.
    const v1 = JSON.parse(JSON.stringify({
      ...s,
      version: 1,
      kingdoms: undefined,
      habits: s.habits.map(({ rewards: _r, ...h }) => h),
      sessions: s.sessions.map(({ area: _a, ...x }) => x),
      xp: s.xp.map(({ attributes: _t, ...t }) => t),
    }));
    const m = migrate(v1);
    expect(m.version).toBe(5);
    expect(m.kingdoms).toEqual([]);
    expect(m.rewards.length).toBeGreaterThan(0);
    expect(m.bosses).toEqual([]);
    expect(totalXp(m)).toBe(totalXp(s));
    expect(attributeXp(m)).toEqual(attributeXp(s));
    expect(m.sessions[0].area).toBe('general');
  });

  it('v2 → v3: recalcula Voluntad con decimales y añade Conexión/Creación', () => {
    let s = addHabit(base(), 'Llamar a alguien', NOW);
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    s = stopTimer(startTimer(s, null, 0, NOW), NOW + 45 * MIN).state;
    const v2 = JSON.parse(JSON.stringify({
      ...s,
      version: 2,
      habits: s.habits.map((h) => ({ ...h, rewards: { voluntad: 2 } })),
      xp: s.xp.map((t) => ({ ...t, attributes: t.source === 'habit' ? { voluntad: 2 } : { maestria: 45, voluntad: 22 } })),
    }));
    const m = migrate(v2);
    expect(m.habits[0].rewards).toEqual({ conexion: 4 });
    expect(attributeXp(m)).toMatchObject({ conexion: 4, voluntad: 22.5, maestria: 45 });
  });
});
