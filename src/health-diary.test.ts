import { describe, expect, it } from 'vitest';
import { normalizeNight, DEFAULT_SETTINGS } from './health';
import { clockAdvice, derive, diffClock, exportCsv, exportJson, planCheck, planRun, trainingWeek, weekCompare, weightAvisos } from './health-diary';

const night = (fecha: string, extra: Record<string, unknown> = {}) => normalizeNight({
  fecha,
  percibido: { cama: '23:30', levantado: '07:00', dormido: '23:50', despertar: '06:50' },
  reloj: { dormido: '23:45', despertar: '06:55', total_dormido_min: 420, fases_min: { despierto: 10, rem: 100, ligero: 220, profundo: 100 } },
  preguntas: { descanso: 4, entrenos_ayer: 1 },
  cuerpo: { peso_kg: 72.4, mismas_condiciones: true },
  ...extra,
});

describe('diario de sueño', () => {
  it('calcula sueño, eficiencia y latencias como la web de Health', () => {
    const c = derive(night('2026-11-10'));
    expect(c.sueno_real_min).toBe(420);
    expect(c.tiempo_en_cama_min).toBe(450);
    expect(c.eficiencia_pct).toBe(93);
    expect(c.latencia_real_min).toBe(15);
    expect(c.error_hora_dormido_min).toBe(5);
    expect(c.avisos).toEqual([]);
  });
  it('avisa si las horas no cuadran', () => {
    const c = derive(night('2026-11-10', { reloj: { dormido: '23:45', despertar: '06:55', total_dormido_min: 300, fases_min: { rem: 100, ligero: 220, profundo: 100 } } }));
    expect(c.avisos.some((a) => a.includes('no coincide'))).toBe(true);
  });
  it('avisa de un salto de peso de más de 2 kg', () => {
    const prev = night('2026-11-09');
    const r = night('2026-11-10', { cuerpo: { peso_kg: 76, mismas_condiciones: true } });
    expect(weightAvisos(r, [prev], '76')[0]).toMatch(/más de 2 kg/);
    expect(weightAvisos(r, [prev], 'abc').length).toBe(1);
  });
  it('diferencia de horas cruzando medianoche', () => {
    expect(diffClock('23:50', '00:10')).toBe(20);
    expect(diffClock('00:10', '23:50')).toBe(-20);
  });
  it('plan: comprueba metas y cuenta noches seguidas', () => {
    const s = { ...DEFAULT_SETTINGS, levantar: '07:00', horas: 7.5 };
    expect(planCheck(night('2026-11-10'), s).todo).toBe(false); // 7 h < 8 h
    const s3 = { ...s, horas: 8.5, levantar: '08:00' };
    const fine = (f: string) => night(f, { percibido: { cama: '23:30', levantado: '08:00' }, reloj: { dormido: '23:45', despertar: '07:55', total_dormido_min: 480, fases_min: {} }, preguntas: { descanso: 4 } });
    expect(planCheck(fine('2026-11-10'), s3).todo).toBe(true);
    expect(planRun([fine('2026-11-10'), fine('2026-11-09'), fine('2026-11-07')], s3)).toBe(2);
  });
  it('entrenos de la semana van por el día anterior', () => {
    const ns = [night('2026-11-11', { preguntas: { entrenos_ayer: 2 } }), night('2026-11-12', { preguntas: { entrenos_ayer: 1 } })];
    expect(trainingWeek(ns, '2026-11-13', 0).total).toBe(3); // la noche del 11 trae los del 10 y la del 12 los del 11
  });
  it('compara la semana con la anterior', () => {
    const w = weekCompare([night('2026-11-10'), night('2026-11-03', { reloj: { total_dormido_min: 360, fases_min: {} } })], DEFAULT_SETTINGS, '2026-11-12');
    expect(w.rows[0]).toMatchObject({ name: 'Sueño real', tone: 'ok' });
    expect(w.now).toBe(1);
  });
  it('exporta JSON y CSV', () => {
    const j = JSON.parse(exportJson([night('2026-11-10')], DEFAULT_SETTINGS));
    expect(j.noches[0].calculado.sueno_real_min).toBe(420);
    const csv = exportCsv([night('2026-11-10')]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('2026-11-10,23:30');
  });
  it('consejo del reloj', () => {
    const a = clockAdvice({ ...DEFAULT_SETTINGS, levantar: '07:00', horas: 8 }, new Date('2026-11-12T22:30:00'));
    expect(a.awake).toBe(true);
    expect(a.left).toBe(30);
  });
});
