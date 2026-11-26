import { describe, expect, it } from 'vitest';
import { addHabit, addQuest, completeQuest, createProfile, emptyState, toggleHabit } from './game';
import { firstReportMonday, reportMonday, weeklyAiReport } from './ai-report';
import { normalizeNight } from './health';

// miércoles 25 nov 2026, 18:00
const NOW = new Date(2026, 10, 25, 18, 0).getTime();
const H = 3_600_000;

describe('informe semanal para la IA', () => {
  it('lunes de la semana', () => {
    expect(reportMonday(NOW)).toBe('2026-11-23');
    expect(reportMonday(new Date(2026, 10, 29, 23).getTime())).toBe('2026-11-23');
  });

  it('recoge misiones, hábitos, noches y cierre del día de la semana, y no los de otra', () => {
    let s = createProfile(emptyState(), 'Nico', [], NOW - 10 * 24 * H);
    s = addHabit(s, 'Leer 10 páginas', NOW - 10 * 24 * H);
    const hid = s.habits[0].id;
    s = toggleHabit(s, hid, NOW - 24 * H).state; // martes
    s = toggleHabit(s, hid, NOW).state; // miércoles
    s = addQuest(s, 'Entregar práctica', 'main', NOW - 30 * H);
    s = completeQuest(s, s.quests[0].id, NOW - 26 * H).state;
    s = addQuest(s, 'Misión vieja', 'side', NOW - 9 * 24 * H);
    s = completeQuest(s, s.quests.find((q) => q.title === 'Misión vieja')!.id, NOW - 8 * 24 * H).state;
    s = { ...s, dayLogs: [{ day: '2026-11-24', at: NOW - 20 * H, energy: 4, mood: 3, advanced: 'Terminé el informe' }] };
    const night = normalizeNight({ fecha: '2026-11-24', percibido: { cama: '23:30', levantado: '07:30' }, reloj: { total_dormido_min: 420 }, cuerpo: { peso_kg: 72.4 } });

    const r = weeklyAiReport(s, '2026-11-23', NOW, [night]);
    expect(r).toContain('# Excelsior · semana del 23 nov al 29 nov de 2026');
    expect(r).toContain('Entregar práctica (impacto alto)');
    expect(r).not.toContain('Misión vieja');
    expect(r).toMatch(/`· ✓ ✓\s+` Leer 10 páginas — 2 veces/);
    expect(r).toContain('dormido 7h00');
    expect(r).toContain('peso 72.4 kg');
    expect(r).toContain('avancé: «Terminé el informe»');
    expect(r).toContain('Semana en curso');
    // solo hasta hoy en la tabla
    expect(r).toContain('| mié 25 |');
    expect(r).not.toContain('| jue 26 |');
    expect(firstReportMonday(s, [night], NOW)).toBe('2026-11-16');
  });
});
