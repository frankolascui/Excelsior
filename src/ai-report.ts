// Informe semanal para la IA: todo lo que apuntaste en una semana (lunes a domingo), en texto Markdown
// compacto para copiarlo y pegarlo en un chat con una IA. Solo lee la partida y las noches: no guarda nada.
import type { AttributeId, DeepWorkSession, GameState, Habit, Quest } from './types';
import type { Night } from './health';
import { nightStats } from './health';
import { ATTRIBUTES } from './attributes';
import { ACHIEVEMENTS } from './achievements';
import { bossStatus } from './bosses';
import { dayKey, habitDayCount, habitPausedOn, impactOf, isHabitDone, levelInfo, shiftDay, totalXp } from './game';
import { priorityIds, priorityQuests } from './priorities';
import { eventsOn, eventLabel } from './life';
import { ancestors } from './tree';
import { sessionProductivity } from './productivity';

const WD = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const addDays = (day: string, n: number) => dayKey(shiftDay(noon(day), n));

/** Lunes (YYYY-MM-DD) de la semana de `ts`. */
export function reportMonday(ts: number): string {
  const d = new Date(ts);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12).getTime());
}

/** El lunes más antiguo con algo apuntado (para no navegar a semanas vacías). */
export function firstReportMonday(s: GameState, nights: Night[] = [], now = Date.now()): string {
  const times = [...s.xp.map((t) => t.at), ...s.sessions.map((x) => x.endedAt), ...s.habitCompletions.map((c) => noon(c.day)), ...nights.map((n) => noon(n.fecha))];
  return reportMonday(times.reduce((m, t) => Math.min(m, t), now));
}

const fmtDate = (day: string) => new Date(noon(day)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const hm = (min: number | null | undefined) => (min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`);
const one = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
const cell = (t: string | number | null | undefined) => (t === null || t === undefined || t === '' ? '—' : String(t).replace(/\|/g, '/'));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');

function questPath(s: GameState, q: Quest): string {
  const up = ancestors(s, q).reverse().map((p) => p.title);
  const realm = q.kingdomId ? s.kingdoms.find((k) => k.id === q.kingdomId)?.name : undefined;
  return [realm && `Reino ${realm}`, ...up].filter(Boolean).join(' › ');
}

function questLine(s: GameState, q: Quest): string {
  const path = questPath(s, q);
  return `${one(q.title)} (impacto ${impactOf(q)}${path ? ` · en ${path}` : ''})`;
}

function sessionLine(x: DeepWorkSession): string {
  const parts = [`${fmtTime(x.endedAt - (x.minutes + (x.breakMinutes ?? 0) + (x.distractionMinutes ?? 0)) * 60_000)}–${fmtTime(x.endedAt)}`, `${x.minutes} min de foco`, `«${one(x.label)}»`];
  if (x.focusPct !== undefined) parts.push(`foco ${x.focusPct} %`);
  if (x.distractions) parts.push(`${x.distractions} distracciones`);
  if (x.pomodoros) parts.push(`${x.pomodoros} pomodoros`);
  if (x.study) parts.push(`repaso Academy: ${x.study.cards} tarjetas${x.study.cleared ? ', cola del día vacía' : ''}`);
  if (x.rating) {
    parts.push(`rendimiento ${x.rating.performance}/5, mentalidad ${x.rating.mindset}/5${x.rating.sense ? `, sentido ${x.rating.sense}/5` : ''}`);
    const p = sessionProductivity(x);
    if (p !== null) parts.push(`${p.toFixed(1).replace('.', ',')} h productivas`);
  }
  return parts.join(' · ');
}

/** Cuadro de 7 días de un hábito: ✓ hecho (×2 si más veces), · sin hacer, p pausa, (espacio) aún no existía o día futuro. */
function habitWeek(s: GameState, h: Habit, days: string[], today: string): { marks: string; done: number; count: number; open: number } {
  const born = dayKey(h.createdAt);
  let done = 0, count = 0, open = 0;
  const marks = days.map((d) => {
    if (d < born || d > today) return ' ';
    const n = habitDayCount(s, h.id, d);
    if (n > 0) { done++; count += n; open++; return n > 1 ? String(n) : '✓'; }
    if (habitPausedOn(s, h.id, d)) return 'p';
    open++;
    return '·';
  }).join('');
  return { marks, done, count, open };
}

/** Informe de la semana que empieza en `monday` (YYYY-MM-DD). `now` corta los días futuros de la semana en curso. */
export function weeklyAiReport(s: GameState, monday: string, now: number, nights: Night[] = []): string {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6];
  const today = dayKey(now);
  const from = noon(monday) - 12 * 3_600_000; // lunes 00:00
  const to = noon(addDays(monday, 7)) - 12 * 3_600_000;
  const inWeek = (ts: number | null | undefined) => typeof ts === 'number' && ts >= from && ts < to;
  const inDays = (d: string) => d >= monday && d <= sunday;
  const L: string[] = [];

  const txs = s.xp.filter((t) => inWeek(t.at));
  const xp = txs.reduce((n, t) => n + t.amount, 0);
  const prevXp = s.xp.filter((t) => t.at >= from - 7 * 86_400_000 && t.at < from).reduce((n, t) => n + t.amount, 0);
  const sessions = s.sessions.filter((x) => inWeek(x.endedAt)).sort((a, b) => a.endedAt - b.endedAt);
  const dwMin = sessions.reduce((n, x) => n + x.minutes, 0);
  const focus = dwMin ? Math.round(sessions.reduce((n, x) => n + (x.focusPct ?? 100) * x.minutes, 0) / dwMin) : null;
  const productive = sessions.reduce((n, x) => n + (sessionProductivity(x) ?? 0), 0);
  const study = sessions.filter((x) => x.study);
  const closed = s.quests.filter((q) => inWeek(q.completedAt)).sort((a, b) => a.completedAt! - b.completedAt!);
  const weekNights = nights.filter((n) => inDays(n.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const logs = (s.dayLogs ?? []).filter((d) => inDays(d.day)).sort((a, b) => a.day.localeCompare(b.day));
  const activeDays = new Set(txs.map((t) => dayKey(t.at))).size;
  const gains = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, 0])) as Record<AttributeId, number>;
  for (const t of txs) for (const [id, n] of Object.entries(t.attributes ?? {})) gains[id as AttributeId] += n ?? 0;
  const habits = [...s.habits, ...(s.retiredHabits ?? []).filter((h) => s.habitCompletions.some((c) => c.habitId === h.id && inDays(c.day)))]
    .filter((h) => dayKey(h.createdAt) <= sunday);

  L.push(`# Excelsior · semana del ${fmtDate(monday)} al ${fmtDate(sunday)} de ${sunday.slice(0, 4)}`);
  L.push('');
  L.push(`Informe automático de mi app de productividad (Excelsior RPG) para que una IA analice mi semana. Semana de lunes a domingo, horas locales.${today <= sunday ? ` Semana en curso: datos hasta hoy (${WD[days.indexOf(today)] ?? ''} ${fmtDate(today)}).` : ''}`);
  if (s.profile?.name) L.push(`Jugador: ${one(s.profile.name)} · nivel ${levelInfo(totalXp(s)).level}.`);

  // ---------- Resumen ----------
  L.push('', '## Resumen');
  L.push(`- XP: ${xp}${prevXp ? ` (semana anterior ${prevXp}, ${xp >= prevXp ? '+' : ''}${Math.round(((xp - prevXp) / prevXp) * 100)} %)` : ''} · días activos ${activeDays}/7`);
  if (sessions.length) L.push(`- Deep Work: ${hm(dwMin)} de foco en ${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}${focus !== null ? ` · foco medio ${focus} %` : ''}${productive ? ` · ${productive.toFixed(1).replace('.', ',')} h productivas (sesiones valoradas)` : ''}`);
  if (study.length) L.push(`- Academy: ${study.length} repasos, ${study.reduce((n, x) => n + (x.study?.cards ?? 0), 0)} tarjetas`);
  L.push(`- Misiones cerradas: ${closed.length} · hábitos marcados: ${s.habitCompletions.filter((c) => inDays(c.day)).length}`);
  L.push(`- Atributos ganados: ${ATTRIBUTES.filter((a) => gains[a.id] > 0).map((a) => `${a.name} +${Math.round(gains[a.id] * 10) / 10}`).join(', ') || 'ninguno'}`);
  if (weekNights.length) {
    const sleeps = weekNights.map((n) => nightStats(n).sleepMin).filter((m): m is number => m != null);
    const kgs = weekNights.map((n) => n.cuerpo.peso_kg).filter((k): k is number => k != null);
    L.push(`- Sueño: ${weekNights.length} noches apuntadas${sleeps.length ? ` · media ${hm(sleeps.reduce((a, b) => a + b, 0) / sleeps.length)} dormido` : ''}${kgs.length ? ` · peso ${kgs[0]} → ${kgs[kgs.length - 1]} kg` : ''}`);
  }

  // ---------- Día a día ----------
  L.push('', '## Día a día');
  L.push('| Día | XP | Deep Work | Misiones | Hábitos hechos | Las 3 | Energía | Ánimo | Sueño | Peso |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const [i, d] of days.entries()) {
    if (d > today) break;
    const dxp = txs.filter((t) => dayKey(t.at) === d).reduce((n, t) => n + t.amount, 0);
    const ddw = sessions.filter((x) => dayKey(x.endedAt) === d).reduce((n, x) => n + x.minutes, 0);
    const dq = closed.filter((q) => dayKey(q.completedAt!) === d).length;
    const live = s.habits.filter((h) => dayKey(h.createdAt) <= d && (isHabitDone(s, h.id, d) || !habitPausedOn(s, h.id, d)));
    const dh = live.filter((h) => isHabitDone(s, h.id, d)).length;
    const p3 = priorityIds(s, d).length ? `${priorityQuests(s, d).filter((q) => q.completedAt && dayKey(q.completedAt) <= d).length}/${priorityIds(s, d).length}` : '';
    const log = logs.find((x) => x.day === d);
    const night = weekNights.find((n) => n.fecha === d);
    L.push(`| ${WD[i]} ${Number(d.slice(8))} | ${dxp} | ${ddw ? hm(ddw) : ''} | ${dq || ''} | ${live.length ? `${dh}/${live.length}` : ''} | ${cell(p3)} | ${cell(log?.energy)} | ${cell(log?.mood)} | ${night ? hm(nightStats(night).sleepMin) : '—'} | ${cell(night?.cuerpo.peso_kg)} |`);
  }

  // ---------- Hábitos ----------
  if (habits.length) {
    L.push('', '## Hábitos (L M X J V S D)', 'Leyenda: ✓ hecho, 2/3 veces ese día, · sin hacer, p en pausa, espacio = aún no existía o día futuro.');
    for (const h of habits) {
      const w = habitWeek(s, h, days, today);
      const goal = h.frequency === 'weekly' ? `meta ${h.perWeek ?? 1}/semana` : 'diario';
      const extra = [h.retiredAt && 'retirado', h.system && 'se marca solo', h.minimum && `mínimo: ${one(h.minimum)}`].filter(Boolean).join(' · ');
      L.push(`- \`${w.marks.split('').join(' ')}\` ${one(h.name)} — ${w.count} ${w.count === 1 ? 'vez' : 'veces'} (${goal}${h.frequency === 'daily' ? `, ${pct(w.done, w.open)}` : ''})${extra ? ` · ${extra}` : ''}`);
    }
  }
  if (s.ladder && !s.ladder.finishedOn) {
    const step = s.ladder.steps[s.ladder.current];
    if (step) L.push(`- Escalera de hábitos: escalón ${s.ladder.current + 1} de ${s.ladder.steps.length}${step.name ? ` (${one(step.name)})` : ''}.`);
  }

  // ---------- Misiones ----------
  if (closed.length) {
    L.push('', '## Misiones cerradas');
    for (const q of closed) L.push(`- ${WD[days.indexOf(dayKey(q.completedAt!))]} ${fmtTime(q.completedAt!)} · ${questLine(s, q)}${q.deadline ? ` · fecha límite ${q.deadline}` : ''}`);
  }
  const late = s.quests.filter((q) => !q.completedAt && q.deadline && q.deadline <= sunday && !s.quests.some((c) => c.parentId === q.id && !c.completedAt))
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  if (late.length) {
    L.push('', '## Misiones con fecha hasta el domingo y aún sin cerrar');
    for (const q of late) L.push(`- ${q.deadline} · ${questLine(s, q)}`);
  }
  const prio = days.filter((d) => d <= today && priorityIds(s, d).length);
  if (prio.length) {
    L.push('', '## Las 3 de cada día');
    for (const d of prio) {
      const qs = priorityQuests(s, d);
      L.push(`- ${WD[days.indexOf(d)]}: ${qs.map((q) => `${q.completedAt && dayKey(q.completedAt) <= d ? '✓' : '✗'} ${one(q.title)}`).join(' · ')}`);
    }
  }

  // ---------- Deep Work ----------
  if (sessions.length) {
    L.push('', '## Sesiones de Deep Work');
    for (const x of sessions) L.push(`- ${WD[days.indexOf(dayKey(x.endedAt))]} ${sessionLine(x)}`);
  }

  // ---------- Salud ----------
  if (weekNights.length) {
    L.push('', '## Noches (Reino de la Salud)', 'El día es la mañana en que te levantas.');
    for (const n of weekNights) {
      const st = nightStats(n);
      const q = n.preguntas;
      const parts = [
        n.percibido.cama && `cama ${n.percibido.cama}`, n.percibido.levantado && `levantado ${n.percibido.levantado}`,
        st.sleepMin != null && `dormido ${hm(st.sleepMin)}`, st.efficiency != null && `eficiencia ${st.efficiency} %`,
        q.calidad != null && `calidad ${q.calidad}/5`, q.descanso != null && `descanso ${q.descanso}/5`, q.estres != null && `estrés ${q.estres}/5`,
        q.despertares != null && `${q.despertares} despertares`, q.siesta_min && `siesta ${q.siesta_min} min`,
        q.entrenos_ayer != null && `entrenos ayer ${q.entrenos_ayer}`, q.ejercicio && `ejercicio ${q.ejercicio}`,
        q.ultima_cafeina && `última cafeína ${q.ultima_cafeina}`, q.ultima_comida && `última comida ${q.ultima_comida}`,
        q.pantalla_ultima_hora && `pantalla antes de dormir ${q.pantalla_ultima_hora}`, q.luz_natural && `luz natural ${q.luz_natural}`,
        q.suenos && q.suenos !== 'no' && `sueños: ${q.suenos}`, n.cuerpo.peso_kg != null && `peso ${n.cuerpo.peso_kg} kg`,
        q.notas && `nota: «${one(String(q.notas))}»`,
      ].filter(Boolean);
      L.push(`- ${WD[days.indexOf(n.fecha)]} ${Number(n.fecha.slice(8))}: ${parts.join(' · ')}`);
    }
  }

  // ---------- Cierre del día ----------
  const withText = logs.filter((l) => l.note || l.advanced || l.improve || l.energy || l.mood);
  if (withText.length) {
    L.push('', '## Cierre del día');
    for (const l of withText) {
      const parts = [l.energy && `energía ${l.energy}/5`, l.mood && `ánimo ${l.mood}/5`, l.advanced && `avancé: «${one(l.advanced)}»`, l.improve && `mejoraría: «${one(l.improve)}»`, l.note && `nota: «${one(l.note)}»`].filter(Boolean);
      L.push(`- ${WD[days.indexOf(l.day)]} ${Number(l.day.slice(8))}: ${parts.join(' · ')}`);
    }
  }

  // ---------- Calendario ----------
  const events = days.flatMap((d) => eventsOn(s, d).map((e) => ({ d, e })));
  if (events.length) {
    L.push('', '## Calendario');
    for (const { d, e } of events) L.push(`- ${WD[days.indexOf(d)]} ${Number(d.slice(8))}${e.time ? ` ${e.time}${e.end ? `–${e.end}` : ''}` : ''} · ${e.kind} · ${one(eventLabel(e))}`);
  }

  // ---------- Juego ----------
  const bosses = s.bosses.filter((b) => inWeek(bossStatus(s, b, now).defeatedAt));
  const bought = s.purchases.filter((p) => inWeek(p.at));
  const achv = (s.achievements ?? []).filter((a) => inWeek(a.at)).map((a) => ACHIEVEMENTS.find((d) => d.id === a.id)?.name).filter(Boolean);
  if (bosses.length || bought.length || achv.length) {
    L.push('', '## Juego');
    if (bosses.length) L.push(`- Bosses derrotados: ${bosses.map((b) => b.name).join(', ')}`);
    if (bought.length) L.push(`- Recompensas canjeadas: ${bought.map((p) => `${one(p.name)} (${p.cost} monedas)`).join(', ')}`);
    if (achv.length) L.push(`- Logros: ${achv.join(', ')}`);
  }

  // ---------- Revisión semanal ----------
  const rev = s.weeklyReviews?.find((r) => r.week === monday);
  if (rev) {
    L.push('', '## Mi revisión de esta semana');
    if (rev.worked) L.push(`- Funcionó: ${one(rev.worked)}`);
    if (rev.failed) L.push(`- No funcionó: ${one(rev.failed)}`);
    if (rev.change) L.push(`- Cambio que pruebo la semana siguiente: ${one(rev.change)}`);
    if (rev.focus) L.push(`- Lo más importante de la semana siguiente: ${one(rev.focus)}`);
  }
  const prev = s.weeklyReviews?.find((r) => r.week === addDays(monday, -7));
  if (prev?.change || prev?.focus) {
    L.push('', '## Lo que me propuse para esta semana');
    if (prev.focus) L.push(`- Lo más importante: ${one(prev.focus)}`);
    if (prev.change) L.push(`- Cambio a probar: ${one(prev.change)}${rev?.prevVerdict ? ` (¿sirvió?: ${rev.prevVerdict})` : ''}`);
  }

  L.push('', '---', 'Pregunta sugerida: ¿qué patrones ves, cuál es mi cuello de botella principal y qué UN cambio concreto me recomiendas para la semana que viene?');
  return L.join('\n');
}
