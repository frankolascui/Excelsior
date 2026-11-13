import { describe, expect, it } from 'vitest';
import { createProfile, dayKey, emptyState, toggleHabit, totalXp } from './game';
import { coinsEarned } from './economy';
import {
  addDays, bedtimeGoal, clockDistance, DEFAULT_SETTINGS, emptyNight, foundHealth, HEALTH_HABIT_ID, healthBuildings, mergeRemote, nightStats,
  normalizeNight, span, syncHealth, vigor, weekProgress, weekStart, WORK_COINS, type Night,
} from './health';

const NOW = new Date('2026-11-12T09:00:00').getTime(); // jueves
const TODAY = dayKey(NOW);
const MON = '2026-11-09';
const S = { ...DEFAULT_SETTINGS, levantar: '07:00', horas: 8, entrenosMin: 3, entrenosPlan: 4 };

function night(fecha: string, extra: Partial<{ cama: string; levantado: string; total: number; peso: number; entrenos: number }> = {}): Night {
  const n = emptyNight(fecha);
  n.percibido.cama = extra.cama ?? null;
  n.percibido.levantado = extra.levantado ?? null;
  n.reloj.total_dormido_min = extra.total ?? null;
  n.cuerpo.peso_kg = extra.peso ?? null;
  n.preguntas.entrenos_ayer = extra.entrenos ?? null;
  return n;
}
const base = () => createProfile(emptyState(), 'Nico', [], NOW - 86_400_000 * 30);

describe('cálculos de la noche', () => {
  it('cruza la medianoche y mide distancias de reloj', () => {
    expect(span('23:30', '07:00')).toBe(450);
    expect(clockDistance('23:50', '00:10')).toBe(20);
    expect(bedtimeGoal(S)).toBe('23:00');
    expect(weekStart('2026-11-15')).toBe(MON); // domingo
    expect(weekStart(MON)).toBe(MON);
  });
  it('sueño real: total del reloj, o fases, y eficiencia sobre el tiempo en cama', () => {
    const n = night(TODAY, { cama: '23:00', levantado: '07:00', total: 432 });
    expect(nightStats(n)).toEqual({ sleepMin: 432, inBedMin: 480, efficiency: 90 });
    const f = emptyNight(TODAY);
    f.reloj.fases_min = { despierto: 20, rem: 100, ligero: 200, profundo: 60 };
    expect(nightStats(f).sleepMin).toBe(360);
  });
  it('limpia valores sin sentido que vengan de fuera', () => {
    const n = normalizeNight({ fecha: TODAY, percibido: { cama: '25:99' }, cuerpo: { peso_kg: 900 }, preguntas: { descanso: 9, notas: '<img onerror=x>' } });
    expect(n.percibido.cama).toBeNull();
    expect(n.cuerpo.peso_kg).toBeNull();
    expect(n.preguntas.descanso).toBeNull();
    expect(n.preguntas.notas).toBe('<img onerror=x>'); // texto tal cual: React lo escapa al pintarlo
  });
});

describe('obras de la semana', () => {
  it('cuenta noches, regularidad, entrenos y pesajes de lunes a domingo', () => {
    const nights = [
      night(MON, { cama: '23:10', levantado: '07:05', peso: 70, entrenos: 2 }), // los entrenos del lunes-noche son del domingo anterior
      night(addDays(MON, 1), { cama: '23:40', levantado: '07:00', peso: 70.2, entrenos: 1 }), // cama fuera de margen
      night(addDays(MON, 2), { cama: '22:45', levantado: '06:40', entrenos: 1 }),
      night(addDays(MON, 3), { cama: '23:00', levantado: '07:20', peso: 70.1, entrenos: 1 }),
    ];
    const p = Object.fromEntries(weekProgress(nights, S, MON).map((x) => [x.kind, x]));
    expect(p.templo).toMatchObject({ have: 4, need: 5, done: false });
    expect(p.reloj.have).toBe(3);
    expect(p.palestra).toMatchObject({ have: 3, need: 3, done: true }); // martes + miércoles + jueves
    expect(p.balanza.done).toBe(true);
  });
  it('vigor: noches apuntadas de los últimos 7 días', () => {
    expect(vigor([night(TODAY), night(addDays(TODAY, -6)), night(addDays(TODAY, -7))], TODAY).days).toBe(2);
  });
});

describe('en la partida', () => {
  it('fundar crea el hábito del sistema, que no se puede marcar a mano', () => {
    const s = foundHealth(base(), NOW);
    expect(s.habits.find((h) => h.id === HEALTH_HABIT_ID)?.system).toBe('health');
    expect(foundHealth(s, NOW)).toBe(s);
    expect(toggleHabit(s, HEALTH_HABIT_ID, NOW).state).toBe(s);
  });
  it('apuntar la noche marca el hábito y da XP una sola vez; borrarla lo devuelve', () => {
    const r = syncHealth(base(), [night(TODAY)], S, NOW, TODAY);
    expect(r.xp).toBeGreaterThan(0);
    expect(r.state.habitCompletions).toHaveLength(1);
    const again = syncHealth(r.state, [night(TODAY)], S, NOW, TODAY);
    expect(again.state).toBe(r.state);
    const gone = syncHealth(r.state, [], S, NOW, TODAY);
    expect(gone.state.habitCompletions).toHaveLength(0);
    expect(totalXp(gone.state)).toBe(totalXp(base()));
  });
  it('noches que llegan de la nube marcan los últimos días, pero su ausencia nunca desmarca', () => {
    const r = syncHealth(base(), [night(TODAY), night(addDays(TODAY, -2)), night(addDays(TODAY, -20))], S, NOW);
    expect(r.state.habitCompletions.map((c) => c.day).sort()).toEqual([addDays(TODAY, -2), TODAY]);
    expect(syncHealth(r.state, [], S, NOW).state).toBe(r.state);
  });
  it('levanta cada obra una vez por semana y da monedas', () => {
    const nights = [0, 1, 2, 3].map((i) => night(addDays(MON, i), { peso: 70 }));
    let r = syncHealth(base(), nights, S, NOW);
    expect(r.built).toEqual(['balanza']);
    const before = coinsEarned(r.state, NOW).total;
    r = syncHealth(r.state, nights, S, NOW);
    expect(r.built).toEqual([]);
    expect(r.state.health?.works).toHaveLength(1);
    expect(healthBuildings(r.state)).toHaveLength(1);
    const five = syncHealth(r.state, [...nights, night(addDays(MON, 4))], S, NOW + 86_400_000);
    expect(five.built).toEqual(['templo']);
    expect(coinsEarned(five.state, NOW + 86_400_000).total).toBeGreaterThanOrEqual(before + WORK_COINS);
  });
});

describe('fusión con la nube', () => {
  const row = (fecha: string, actualizado: string, deleted = false) => ({ fecha, deleted, updated_at: actualizado, data: deleted ? { fecha, borrado: actualizado } : { fecha, actualizado, cuerpo: { peso_kg: 71 } } });
  it('entra lo de la nube, salvo donde hay un cambio local más reciente', () => {
    const local = [{ ...night(MON, { peso: 70 }), actualizado: '2026-11-10T10:00:00.000Z' }];
    const m = mergeRemote(local, { [MON]: '2026-11-10T10:00:00.000Z' }, [row(MON, '2026-11-09T08:00:00.000Z'), row(TODAY, '2026-11-12T08:00:00.000Z')], null);
    expect(m.nights.find((n) => n.fecha === MON)?.cuerpo.peso_kg).toBe(70);
    expect(m.nights.find((n) => n.fecha === TODAY)?.cuerpo.peso_kg).toBe(71);
    expect(m.pend).toEqual({ [MON]: '2026-11-10T10:00:00.000Z' });
    expect(m.cursor).toBe('2026-11-12T08:00:00.000Z');
  });
  it('un borrado en la nube quita la noche local', () => {
    const m = mergeRemote([night(MON)], {}, [row(MON, '2026-11-12T08:00:00.000Z', true)], null);
    expect(m.nights).toHaveLength(0);
  });
});
