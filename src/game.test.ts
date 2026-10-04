import { describe, expect, it } from 'vitest';
import {
  focusPercent, setPhase, timerTotals,
  addHabit, addQuest, completeQuest, createProfile, dayKey, emptyState, habitStreak,
  levelInfo, shiftDay, startTimer, stopTimer, suggest, toggleHabit, totalXp, undoQuest,
  XP_RULES,
} from './game';

const NOW = new Date(2026, 9, 4, 10, 0).getTime();
const MIN = 60_000;

function withQuest(type: 'daily' | 'main' | 'side' = 'daily') {
  const s = addQuest(createProfile(emptyState(), 'Nico', [], NOW), 'Estudiar', type, NOW);
  return { s, id: s.quests[0].id };
}

describe('niveles', () => {
  it('sigue la curva 50·L·(L−1)', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, title: 'Novato', current: 0, needed: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(1000)).toMatchObject({ level: 5, title: 'Aprendiz' });
    expect(levelInfo(4500)).toMatchObject({ level: 10, title: 'Competente' });
  });
});

describe('misiones', () => {
  it('completar da XP según tipo y deshacer lo retira', () => {
    const { s, id } = withQuest('main');
    const r = completeQuest(s, id, NOW);
    expect(r.xp).toBe(XP_RULES.quest.main);
    expect(totalXp(r.state)).toBe(50);
    expect(completeQuest(r.state, id, NOW).xp).toBe(0); // no se puede completar dos veces
    const undone = undoQuest(r.state, id);
    expect(totalXp(undone)).toBe(0);
    expect(undone.quests[0].completedAt).toBeNull();
  });

  it('aplica el tope diario de XP por misiones', () => {
    let s = createProfile(emptyState(), 'Nico', [], NOW);
    for (let i = 0; i < 6; i++) s = addQuest(s, `M${i}`, 'main', NOW);
    let last = 0;
    for (const q of [...s.quests]) {
      const r = completeQuest(s, q.id, NOW);
      s = r.state;
      last = r.xp;
    }
    expect(totalXp(s)).toBe(XP_RULES.dailyCap.quest);
    expect(last).toBe(0);
  });
});

describe('hábitos', () => {
  it('marcar y desmarcar el mismo día no acumula XP', () => {
    const s = createProfile(emptyState(), 'Nico', ['Leer'], NOW);
    const id = s.habits[0].id;
    const on = toggleHabit(s, id, NOW);
    expect(totalXp(on.state)).toBe(XP_RULES.habit);
    const off = toggleHabit(on.state, id, NOW);
    expect(totalXp(off.state)).toBe(0);
  });

  it('calcula la racha de días consecutivos', () => {
    let s = addHabit(createProfile(emptyState(), 'Nico', [], NOW), 'Meditar', NOW);
    const id = s.habits[0].id;
    for (const d of [-3, -2, -1]) s = toggleHabit(s, id, shiftDay(NOW, d)).state;
    expect(habitStreak(s, id, NOW)).toBe(3); // hoy aún no hecho: cuenta hasta ayer
    s = toggleHabit(s, id, NOW).state;
    expect(habitStreak(s, id, NOW)).toBe(4);
    expect(dayKey(NOW)).toBe('2026-10-04');
  });
});

describe('deep work', () => {
  it('registra la duración del reloj y da 1 XP por minuto', () => {
    const { s, id } = withQuest();
    const started = startTimer(s, id, 0, NOW); // sesión libre
    const r = stopTimer(started, NOW + 45 * MIN + 30_000);
    expect(r.session?.minutes).toBe(45);
    expect(r.session?.label).toBe('Estudiar');
    expect(r.xp).toBe(45);
    expect(r.state.activeTimer).toBeNull();
  });

  it('descarta sesiones de menos de un minuto y limita las muy largas', () => {
    const s = startTimer(emptyState(), null, 0, NOW);
    expect(stopTimer(s, NOW + 30_000).session).toBeNull();
    const long = stopTimer(s, NOW + 600 * MIN);
    expect(long.xp).toBe(XP_RULES.maxSessionMinutes);
    expect(long.capped).toBe(true);
  });
});

describe('¿qué hago ahora?', () => {
  it('prioriza timer, luego crear la primera misión, misión principal y hábitos', () => {
    let s = createProfile(emptyState(), 'Nico', ['Leer'], NOW);
    expect(suggest(s, NOW).kind).toBe('create');
    s = addQuest(s, 'Secundaria', 'side', NOW);
    s = addQuest(s, 'Principal', 'main', NOW + 1);
    const sg = suggest(s, NOW);
    expect(sg.kind === 'quest' && sg.quest.title).toBe('Principal');
    expect(suggest(startTimer(s, null, 25, NOW), NOW).kind).toBe('timer');
    for (const q of s.quests) s = completeQuest(s, q.id, NOW).state;
    expect(suggest(s, NOW).kind).toBe('habit');
    s = toggleHabit(s, s.habits[0].id, NOW).state;
    expect(suggest(s, NOW).kind).toBe('done');
  });
});

describe('deep work: descanso, distracción y % de foco', () => {
  it('solo el foco da XP y calcula el % de foco real', () => {
    let s = startTimer(emptyState(), null, 0, NOW);
    s = setPhase(s, 'break', NOW + 30 * MIN); // 30 min foco
    s = setPhase(s, 'focus', NOW + 40 * MIN); // 10 min descanso
    s = setPhase(s, 'distraction', NOW + 60 * MIN); // 20 min foco
    s = setPhase(s, 'focus', NOW + 70 * MIN); // 10 min distracción
    const live = timerTotals(s.activeTimer!, NOW + 80 * MIN); // 10 min foco más
    expect(live).toMatchObject({ phase: 'focus', focusMs: 60 * MIN, breakMs: 10 * MIN, distractionMs: 10 * MIN, distractions: 1 });
    const r = stopTimer(s, NOW + 80 * MIN);
    expect(r.session).toMatchObject({ minutes: 60, breakMinutes: 10, distractionMinutes: 10, distractions: 1, focusPct: 86 });
    expect(r.xp).toBe(60);
    expect(focusPercent(0, 0)).toBe(100);
  });

  it('en cuenta atrás cuenta como mucho los minutos objetivo', () => {
    const s = startTimer(emptyState(), null, 25, NOW);
    expect(stopTimer(s, NOW + 40 * MIN).session?.minutes).toBe(25);
  });

  it('acepta un temporizador guardado por la versión anterior (sin fases)', () => {
    const s = { ...emptyState(), activeTimer: { startedAt: NOW, questId: null, targetMinutes: 0 } };
    expect(stopTimer(s, NOW + 20 * MIN).session?.minutes).toBe(20);
  });
});
