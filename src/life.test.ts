import { describe, expect, it } from 'vitest';
import { addHabit, createProfile, emptyState, habitSatisfied, habitStreak, habitStreakDays, habitWeekCount, pomodoroStatus, pomodoroStep, setPhase, startTimer, stopTimer, toggleHabit, weekStart } from './game';
import { addGoal, attributeDef, attributeXp, inferDeepWorkArea, rebalance } from './attributes';
import { addEvent, addMetric, dailyReport, deleteEvent, deleteMetric, eventsOn, latestMetric, logMetric, metricHistory, saveDayLog, upcomingEvents } from './life';

const NOW = new Date(2026, 9, 6, 10, 0).getTime(); // martes
const DAY = 86_400_000;
const MIN = 60_000;
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('equilibrio de Maestría', () => {
  it('Deep Work según el tipo: estudio → Sabiduría, práctica → Maestría, general → mitad y mitad', () => {
    const run = (area: 'estudio' | 'programacion' | 'general') => attributeXp(stopTimer(startTimer(base(), null, 0, NOW, { area }), NOW + 60 * MIN).state);
    expect(run('estudio')).toMatchObject({ sabiduria: 30, maestria: 0, voluntad: 15 });
    expect(run('programacion')).toMatchObject({ maestria: 30, sabiduria: 0, voluntad: 15 });
    expect(run('general')).toMatchObject({ maestria: 15, sabiduria: 15, voluntad: 15 });
  });

  it('recalcula una sola vez las sesiones de partidas antiguas', () => {
    const s = stopTimer(startTimer(base(), null, 0, NOW, { area: 'programacion' }), NOW + 40 * MIN).state;
    const old = { ...s, balance: undefined, xp: s.xp.map((t) => ({ ...t, attributes: { maestria: 40, voluntad: 20 } })) };
    const r = rebalance(old);
    expect(attributeXp(r)).toMatchObject({ maestria: 20, voluntad: 10 });
    expect(r.balance).toBe(2);
    expect(rebalance(r)).toBe(r);
  });

  it('Impacto es el atributo avanzado: despierta en el nivel 10', () => {
    expect(attributeDef('creacion').name).toBe('Impacto');
    expect(attributeDef('creacion').unlockLevel).toBe(10);
  });
});

describe('Deep Work: qué vas a hacer y Pomodoro', () => {
  it('deduce teoría o práctica de lo que vas a hacer', () => {
    expect(inferDeepWorkArea('Ejercicios de derivadas')).toBe('practica');
    expect(inferDeepWorkArea('Programar Excelsior')).toBe('practica');
    expect(inferDeepWorkArea('Estudiar el tema 4 de Historia')).toBe('estudio');
    expect(inferDeepWorkArea('Leer')).toBe('estudio');
    expect(inferDeepWorkArea('')).toBe('general');
    expect(inferDeepWorkArea(undefined)).toBe('general');
  });

  it('la intención da nombre a la sesión y decide el atributo', () => {
    const r = stopTimer(startTimer(base(), null, 0, NOW, { intent: '  Ejercicios de física ' }), NOW + 20 * MIN);
    expect(r.session?.label).toBe('Ejercicios de física');
    expect(attributeXp(r.state)).toMatchObject({ maestria: 10, sabiduria: 0, voluntad: 5 });
  });

  it('Pomodoro 50/10: al acabar el foco empieza el descanso y cuenta el bloque', () => {
    let s = startTimer(base(), null, 0, NOW, { pomodoro: { focus: 50, rest: 10 } });
    expect(pomodoroStatus(s.activeTimer!, NOW + 20 * MIN)?.focusLeft).toBe(30 * MIN);
    expect(pomodoroStep(s, NOW + 20 * MIN)).toBe(s);
    let t = NOW + 50 * MIN;
    s = pomodoroStep(s, t);
    expect(s.activeTimer?.phase).toBe('break');
    expect(pomodoroStatus(s.activeTimer!, t + 4 * MIN)).toMatchObject({ done: 1, restLeft: 6 * MIN });
    expect(pomodoroStatus(s.activeTimer!, t + 12 * MIN)?.restLeft).toBe(0);
    t += 12 * MIN;
    s = setPhase(s, 'focus', t);
    t += 50 * MIN;
    s = pomodoroStep(s, t);
    expect(s.activeTimer).toMatchObject({ pomoDone: 2, restMs: 10 * MIN });
    const r = stopTimer(s, t + MIN);
    expect(r.session).toMatchObject({ minutes: 100, pomodoros: 2, breakMinutes: 13 });
  });
});

describe('hábitos semanales', () => {
  it('3 veces por semana: cuenta la semana y la racha va en semanas', () => {
    let s = addHabit(base(), 'Gimnasio', NOW, { perWeek: 3 });
    const h = s.habits[0];
    expect(h.frequency).toBe('weekly');
    expect(h.perWeek).toBe(3);
    expect(weekStart(NOW)).toBe('2026-10-05');
    // Semana anterior: 3 veces (lun, mié, vie).
    for (const d of [-8, -6, -4]) s = toggleHabit(s, h.id, NOW + d * DAY).state;
    expect(habitWeekCount(s, h.id, NOW - 7 * DAY)).toBe(3);
    expect(habitSatisfied(s, s.habits[0], NOW)).toBe(false);
    expect(habitStreak(s, h.id, NOW)).toBe(1); // la semana en curso aún no está cumplida
    for (const d of [-1, 0, 1]) s = toggleHabit(s, h.id, NOW + d * DAY).state;
    expect(habitSatisfied(s, s.habits[0], NOW + DAY)).toBe(true);
    expect(habitStreak(s, h.id, NOW + DAY)).toBe(2);
    expect(habitStreakDays(s, h.id, NOW + DAY)).toBe(14);
  });

  it('7 o más por semana es diario', () => {
    expect(addHabit(base(), 'Leer', NOW, { perWeek: 7 }).habits[0].frequency).toBe('daily');
  });
});

describe('medidas', () => {
  it('apunta un valor por día y mueve las metas que la siguen', () => {
    let s = addMetric(base(), 'Dinero', '€', NOW);
    const id = s.metrics![0].id;
    s = addGoal(s, { name: 'Ahorro', unit: '€', start: 100, target: 1000, avatarId: 'artifice', metricId: id }, NOW);
    s = logMetric(s, id, 200, NOW - DAY);
    s = logMetric(s, id, 250, NOW);
    s = logMetric(s, id, 300, NOW + 60 * MIN); // mismo día: sustituye
    expect(metricHistory(s, id).map((e) => e.value)).toEqual([200, 300]);
    expect(latestMetric(s, id)).toBe(300);
    expect(s.goals[0].current).toBe(300);
    s = deleteMetric(s, id);
    expect(s.metrics).toEqual([]);
    expect(s.goals[0].metricId).toBeUndefined();
  });
});

describe('eventos y cierre del día', () => {
  it('eventos ordenados por día y hora; se pueden borrar', () => {
    let s = addEvent(base(), { title: 'Examen de cálculo', day: '2026-10-08', time: '10:00', kind: 'examen' }, NOW);
    s = addEvent(s, { title: 'Llamada con mamá', day: '2026-10-08', time: '09:00', kind: 'llamada' }, NOW);
    s = addEvent(s, { title: 'Lanzar Excelsior', day: '2026-11-30', kind: 'lanzamiento' }, NOW);
    expect(eventsOn(s, '2026-10-08').map((e) => e.title)).toEqual(['Llamada con mamá', 'Examen de cálculo']);
    expect(upcomingEvents(s, NOW, 7)).toHaveLength(2);
    s = deleteEvent(s, s.events![0].id);
    expect(eventsOn(s, '2026-10-08')).toHaveLength(1);
  });

  it('el informe del día resume estado, medidas, nota y lo que viene', () => {
    let s = addMetric(base(), 'Peso', 'kg', NOW);
    s = logMetric(s, s.metrics![0].id, 72.5, NOW);
    s = saveDayLog(s, { energy: 4, mood: 3, sleep: 7.5, note: 'Buen día' }, NOW);
    s = saveDayLog(s, { energy: 5 }, NOW + MIN); // mezcla con lo guardado
    s = addEvent(s, { title: 'Examen', day: '2026-10-08', kind: 'examen' }, NOW);
    const md = dailyReport(s, NOW + 2 * MIN);
    expect(md).toContain('# 2026-10-06 · Excelsior');
    expect(md).toContain('Energía: 5/5 · Ánimo: 3/5 · Sueño: 7,5 h');
    expect(md).toContain('- Peso: 72,5 kg');
    expect(md).toContain('Buen día');
    expect(md).toContain('2026-10-08 · 📝 Examen');
  });
});
