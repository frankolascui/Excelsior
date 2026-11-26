// Historial en Ajustes: el informe semanal para la IA (cualquier semana) y lo último que has ganado.
import { useState } from 'react';
import type { GameState } from './types';
import { RewardTags } from './ui';
import { Fold } from './fold';
import { Icon } from './icons';
import { useHealth } from './health-store';
import { firstReportMonday, reportMonday, weeklyAiReport } from './ai-report';
import { dayKey, shiftDay } from './game';
import { saveFile } from './download';

const SOURCE = { quest: 'Misión', habit: 'Hábito', deepwork: 'Deep Work', admin: 'Admin', guild: 'Gremio' } as const;
const shiftWeek = (monday: string, n: number) => dayKey(shiftDay(new Date(`${monday}T12:00:00`).getTime(), 7 * n));
const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** Copia el texto; si el navegador no deja, lo descarga. Devuelve lo que pasó para enseñarlo en el botón. */
export async function copyText(text: string, filename: string): Promise<'copiado' | 'descargado' | 'error'> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copiado';
  } catch {
    return (await saveFile(filename, text, 'text/markdown')) === 'ok' ? 'descargado' : 'error';
  }
}

/** Botón «Copiar para la IA» de una semana (lo usa también la crónica del lunes). */
export function CopyReportButton({ state, monday, className = 'link' }: { state: GameState; monday: string; className?: string }) {
  const { nights } = useHealth();
  const [done, setDone] = useState<string | null>(null);
  async function copy() {
    const r = await copyText(weeklyAiReport(state, monday, Date.now(), nights), `excelsior-semana-${monday}.md`);
    setDone(r === 'copiado' ? 'Copiado' : r === 'descargado' ? 'Descargado' : 'No se pudo copiar');
    setTimeout(() => setDone(null), 2500);
  }
  return (
    <button type="button" className={className} onClick={copy} title="Copia todos los datos de la semana en texto, listo para pegarlo en una IA">
      <Icon name={done === 'Copiado' || done === 'Descargado' ? 'check' : 'copy'} /> {done ?? 'Copiar para la IA'}
    </button>
  );
}

function WeeklyReportRow({ state }: { state: GameState }) {
  const { nights } = useHealth();
  const current = reportMonday(Date.now());
  const first = firstReportMonday(state, nights);
  const [monday, setMonday] = useState(current);
  const sunday = dayKey(shiftDay(new Date(`${monday}T12:00:00`).getTime(), 6));
  return (
    <div className="ai-report">
      <div className="ai-week" role="group" aria-label="Semana del informe">
        <button type="button" className="icon-btn" aria-label="Semana anterior" disabled={monday <= first} onClick={() => setMonday(shiftWeek(monday, -1))}><Icon name="chevron-left" /></button>
        <span title={`${short(monday)} – ${short(sunday)}`}>{monday === current ? 'Esta semana' : monday === shiftWeek(current, -1) ? 'La semana pasada' : `${short(monday)} – ${short(sunday)}`}</span>
        <button type="button" className="icon-btn" aria-label="Semana siguiente" disabled={monday >= current} onClick={() => setMonday(shiftWeek(monday, 1))}><Icon name="chevron-right" /></button>
      </div>
      <CopyReportButton state={state} monday={monday} className="secondary" />
      <button type="button" className="link" onClick={() => saveFile(`excelsior-semana-${monday}.md`, weeklyAiReport(state, monday, Date.now(), nights), 'text/markdown')}>
        <Icon name="download" /> Descargar
      </button>
    </div>
  );
}

export function XpHistory({ state }: { state: GameState }) {
  const history = [...state.xp].reverse().slice(0, 15);
  return (
    <section className="panel" aria-labelledby="xp-history-h">
      <header className="panel-head"><h3 id="xp-history-h">Historial</h3></header>
      <p className="hint">Todo lo de una semana (misiones, hábitos, Deep Work, Academy, noches y cierre del día) en texto, para pegarlo en una IA.</p>
      <WeeklyReportRow state={state} />
      {history.length > 0 && (
        <Fold label="Ver lo último que has ganado" icon="clock" count={history.length}>
        <ul className="list plain">
          {history.map((t) => (
            <li key={t.id} className="row-between">
              <span><span className="muted">{SOURCE[t.source]} · </span>{t.label}</span>
              <span className="mono"><RewardTags rewards={t.attributes ?? {}} /> +{t.amount} <span className="muted">{new Date(t.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></span>
            </li>
          ))}
        </ul>
        </Fold>
      )}
    </section>
  );
}
