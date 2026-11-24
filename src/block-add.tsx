// «Bloque»: reservar un hueco en el calendario para una misión o un hábito, sin salir de la lista.
// Crea un bloque de tiempo con esa misión o hábito dentro (se marca desde la ficha del bloque).
import { useState } from 'react';
import { dayKey } from './game';
import { fromMin, toMin } from './life';
import { DatePicker, DurationChips, TimePicker } from './pickers';
import { Icon } from './icons';

export interface BlockWhen { day: string; time: string; end: string }

/** Próxima media hora en punto (o las 9 si ya es muy tarde para hoy). */
function nextSlot(now: number): string {
  const d = new Date(now);
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 30) * 30;
  return m >= 23 * 60 ? '09:00' : fromMin(m);
}

export function BlockAdd({ name, onAdd, onClose, initialDay, minutes = 60 }: {
  name: string; onAdd: (w: BlockWhen) => void; onClose: () => void; initialDay?: string; minutes?: number;
}) {
  const now = Date.now();
  const first = nextSlot(now);
  const later = !!initialDay && initialDay > dayKey(now);
  const start = later ? '17:00' : first;
  const [day, setDay] = useState(initialDay ?? (first === '09:00' && new Date(now).getHours() >= 22 ? dayKey(now + 86_400_000) : dayKey(now)));
  const [time, setTime] = useState(start);
  const [end, setEnd] = useState(fromMin(Math.min(toMin(start) + minutes, 23 * 60 + 59)));
  const pickTime = (t: string | null) => {
    if (!t) return;
    setEnd(fromMin(Math.min(toMin(t) + toMin(end) - toMin(time), 23 * 60 + 59)));
    setTime(t);
  };
  return (
    <div className="block-add" role="group" aria-label={`Bloque de tiempo para ${name}`}>
      <span className="block-add-label"><Icon name="ev-bloque" /> Bloque en el calendario</span>
      <div className="block-add-when">
        <DatePicker value={day} onChange={(d) => d && setDay(d)} label="Día del bloque" />
        <TimePicker value={time} onChange={pickTime} label="Hora del bloque" />
        <DurationChips start={time} end={end} onChange={setEnd} />
      </div>
      <div className="row block-add-actions">
        <button type="button" className="primary small" onClick={() => onAdd({ day, time, end })}><Icon name="calendar-plus" /> Poner bloque</button>
        <button type="button" className="ghost small" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}
