import { describe, expect, it } from 'vitest';
import { createProfile, emptyState } from './game';
import {
  addEvent, addReminder, deleteReminder, dueAlerts, eventColor, eventSpan, eventsOn, laterReminders, layoutLanes, moveEvent, occursOn, remindersOn,
  skipEventDay, todayReminders, toggleReminder, upcomingEvents, updateEvent,
} from './life';

const NOW = new Date(2026, 9, 6, 10, 0).getTime(); // martes 6 de octubre, 10:00
const base = () => createProfile(emptyState(), 'Nico', [], NOW);

describe('eventos que se repiten', () => {
  const ev = (repeat: 'daily' | 'weekdays' | 'weekly') => ({ id: 'e', title: 'Estudiar', day: '2026-10-06', kind: 'bloque' as const, repeat, createdAt: NOW });

  it('cada día, de lunes a viernes o cada semana, nunca antes del primer día', () => {
    expect(occursOn(ev('daily'), '2026-10-11')).toBe(true);
    expect(occursOn(ev('daily'), '2026-10-05')).toBe(false);
    expect(occursOn(ev('weekdays'), '2026-10-09')).toBe(true); // viernes
    expect(occursOn(ev('weekdays'), '2026-10-10')).toBe(false); // sábado
    expect(occursOn(ev('weekly'), '2026-10-13')).toBe(true); // martes siguiente
    expect(occursOn(ev('weekly'), '2026-10-14')).toBe(false);
  });

  it('se puede quitar un solo día de la serie', () => {
    let s = addEvent(base(), { title: 'Gimnasio', day: '2026-10-06', time: '18:00', end: '19:30', kind: 'bloque', repeat: 'daily' }, NOW);
    const id = s.events![0].id;
    expect(eventsOn(s, '2026-10-08')[0]).toMatchObject({ id, day: '2026-10-08', time: '18:00', end: '19:30' });
    s = skipEventDay(s, id, '2026-10-08');
    expect(eventsOn(s, '2026-10-08')).toHaveLength(0);
    expect(eventsOn(s, '2026-10-09')).toHaveLength(1);
  });

  it('en «Próximos eventos» no salen los bloques y una serie solo sale una vez', () => {
    let s = addEvent(base(), { title: 'Clase de inglés', day: '2026-10-05', time: '17:00', kind: 'otro', repeat: 'weekly' }, NOW);
    s = addEvent(s, { title: 'Estudiar', day: '2026-10-06', time: '09:00', kind: 'bloque', repeat: 'daily' }, NOW);
    s = addEvent(s, { title: 'Examen', day: '2026-10-09', kind: 'examen' }, NOW);
    expect(upcomingEvents(s, NOW, 14).map((e) => [e.title, e.day])).toEqual([['Examen', '2026-10-09'], ['Clase de inglés', '2026-10-12']]);
  });

  it('el fin solo se guarda si es después del inicio', () => {
    const s = addEvent(base(), { title: 'Raro', day: '2026-10-06', time: '18:00', end: '17:00', kind: 'bloque' }, NOW);
    expect(s.events![0].end).toBeUndefined();
  });
});

describe('recordatorios', () => {
  function some() {
    let s = addReminder(base(), { title: 'Comprar la cena', day: '2026-10-06', time: '19:00' }, NOW);
    s = addReminder(s, { title: 'Llevarme el cuaderno a casa' }, NOW + 1);
    s = addReminder(s, { title: 'Devolver el libro', day: '2026-10-05' }, NOW + 2);
    s = addReminder(s, { title: 'Pagar el gimnasio', day: '2026-10-09' }, NOW + 3);
    return s;
  }

  it('hoy salen los atrasados, los de hoy y los que no tienen fecha; los de otro día, aparte', () => {
    const s = some();
    expect(todayReminders(s, NOW).map((r) => r.title)).toEqual(['Devolver el libro', 'Comprar la cena', 'Llevarme el cuaderno a casa']);
    expect(laterReminders(s, NOW).map((r) => r.title)).toEqual(['Pagar el gimnasio']);
    expect(remindersOn(s, '2026-10-09').map((r) => r.title)).toEqual(['Pagar el gimnasio']);
  });

  it('tachar, destachar y borrar; lo tachado hoy sigue a la vista (al final) y mañana desaparece', () => {
    let s = some();
    const id = s.reminders![0].id;
    s = toggleReminder(s, id, NOW);
    expect(todayReminders(s, NOW).at(-1)).toMatchObject({ title: 'Comprar la cena', doneAt: NOW });
    expect(todayReminders(s, NOW + 86_400_000).map((r) => r.title)).not.toContain('Comprar la cena');
    s = toggleReminder(s, id, NOW);
    expect(s.reminders![0].doneAt).toBeUndefined();
    s = deleteReminder(s, id);
    expect(s.reminders).toHaveLength(3);
  });

  it('la hora sin día no se guarda', () => {
    expect(addReminder(base(), { title: 'x', time: '10:00' }, NOW).reminders![0].time).toBeUndefined();
  });

  it('avisa cuando llega la hora de un recordatorio o de un evento de hoy (y no media hora después)', () => {
    let s = some();
    s = addEvent(s, { title: 'Estudiar', day: '2026-10-01', time: '19:10', kind: 'bloque', repeat: 'daily' }, NOW);
    const at = (h: number, m: number) => new Date(2026, 9, 6, h, m).getTime();
    expect(dueAlerts(s, at(18, 59))).toEqual([]);
    expect(dueAlerts(s, at(19, 0)).map((a) => a.text)).toEqual(['🔔 Comprar la cena']);
    expect(dueAlerts(s, at(19, 15)).map((a) => a.text)).toEqual(['🔔 Comprar la cena', '🕒 19:10 · Estudiar']);
    expect(dueAlerts(s, at(19, 31)).map((a) => a.text)).toEqual(['🕒 19:10 · Estudiar']);
    expect(dueAlerts(toggleReminder(s, s.reminders![0].id, NOW), at(19, 5))).toEqual([]);
  });
});

describe('vista por horas', () => {
  it('duración: una hora por defecto, mínimo 15 min y nunca después de medianoche', () => {
    expect(eventSpan({ time: '09:30' })).toEqual([570, 630]);
    expect(eventSpan({ time: '23:30' })).toEqual([1410, 1440]);
    expect(eventSpan({ time: '10:00', end: '10:05' })).toEqual([600, 615]);
    expect(eventSpan({})).toBeNull();
  });

  it('lo que se pisa se reparte en carriles', () => {
    // 9-10 y 9:30-11 se pisan; 10-11 cabe en el carril del primero; 12-13 va solo
    expect(layoutLanes([[540, 600], [570, 660], [600, 660], [720, 780]])).toEqual([
      { lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 2 }, { lane: 0, lanes: 1 },
    ]);
  });
});

describe('mover, alargar y colores', () => {
  it('mover un evento suelto cambia su día y sus horas', () => {
    let s = addEvent(base(), { title: 'Gimnasio', day: '2026-10-06', time: '18:00', end: '19:00', kind: 'bloque' }, NOW);
    s = moveEvent(s, s.events![0], { day: '2026-10-07', time: '19:30', end: '21:00' }, NOW);
    expect(s.events).toHaveLength(1);
    expect(s.events![0]).toMatchObject({ day: '2026-10-07', time: '19:30', end: '21:00' });
  });

  it('mover un día de una serie solo cambia ese día', () => {
    let s = addEvent(base(), { title: 'Estudiar', day: '2026-10-05', time: '09:00', end: '10:00', kind: 'bloque', repeat: 'daily', color: 'uva' }, NOW);
    const occ = eventsOn(s, '2026-10-07')[0];
    s = moveEvent(s, occ, { day: '2026-10-07', time: '11:00', end: '12:30' }, NOW);
    expect(eventsOn(s, '2026-10-07').map((e) => [e.time, e.end, e.repeat, e.color])).toEqual([['11:00', '12:30', undefined, 'uva']]);
    expect(eventsOn(s, '2026-10-08')[0]).toMatchObject({ time: '09:00', repeat: 'daily' });
  });

  it('editar cambia la serie entera y quitar un campo lo borra', () => {
    let s = addEvent(base(), { title: 'Estudiar', day: '2026-10-05', time: '09:00', end: '10:00', kind: 'bloque', repeat: 'daily' }, NOW);
    const id = s.events![0].id;
    s = updateEvent(s, id, { color: 'albahaca', title: 'Estudiar física' });
    expect(eventsOn(s, '2026-10-09')[0]).toMatchObject({ title: 'Estudiar física', color: 'albahaca' });
    expect(eventColor(s.events![0])).toBe('#30a46c');
    s = updateEvent(s, id, { time: undefined, end: undefined, repeat: undefined });
    expect(s.events![0].time).toBeUndefined();
    expect(eventsOn(s, '2026-10-09')).toHaveLength(0);
  });
});
