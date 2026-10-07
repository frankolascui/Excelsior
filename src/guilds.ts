// Gremios (V2): retos de gremio con la regla del 30 %, recompensas y conexión con Supabase (docs/supabase-gremios.sql).
import { useSyncExternalStore } from 'react';
import type { GameState, XPTransaction } from './types';
import { uid } from './game';
import { cloudClient, getUserId } from './cloud';
import type { PublicProfile } from './social';

// ---------- Retos ----------

export const GUILD_MAX = 8;
export const CAP_SHARE = 0.3;
const DAY = 86_400_000;

export type Metric = 'deep' | 'habits' | 'xp';
export const METRIC_LABEL: Record<Metric, string> = { deep: 'Deep Work', habits: 'Hábitos', xp: 'XP' };

export interface ChallengeTemplate {
  id: string;
  kind: 'mision' | 'jefe';
  name: string;
  icon: string;
  lore: string;
  days: number;
  /** Meta por miembro del gremio (minutos de Deep Work, hábitos, XP); la total se multiplica por los miembros. */
  per: Partial<Record<Metric, number>>;
  /** Meta mínima total, para que con pocos miembros no sea un paseo. */
  min?: Partial<Record<Metric, number>>;
  /** Fracción de miembros que deben aportar algo (jefes que obligan a cooperar). */
  participation?: number;
  /** Recompensa para cada miembro que aportó: XP personal (a Conexión y Voluntad) y XP del gremio. */
  reward: number;
  guildXp: number;
  /** Jefes: sprite de la Arena que lo representa. */
  art?: string;
}

export const CHALLENGES: ChallengeTemplate[] = [
  {
    id: 'cien-minutos', kind: 'mision', name: 'Los 100 minutos', icon: '⏳', days: 7,
    lore: 'El calentamiento de todo gremio: minutos de foco entre todos esta semana.',
    per: { deep: 30 }, min: { deep: 100 }, reward: 40, guildXp: 50,
  },
  {
    id: 'pacto-habitos', kind: 'mision', name: 'Pacto de los Hábitos', icon: '🔗', days: 7,
    lore: 'Un eslabón por cada hábito cumplido. La cadena la forjáis todos.',
    per: { habits: 8 }, min: { habits: 20 }, reward: 40, guildXp: 50,
  },
  {
    id: 'forja-comun', kind: 'mision', name: 'La Forja Común', icon: '🔥', days: 7,
    lore: 'Todo el XP que ganéis alimenta la misma fragua.',
    per: { xp: 250 }, min: { xp: 600 }, reward: 50, guildXp: 60,
  },
  {
    id: 'dragon', kind: 'jefe', name: 'El Dragón de la Procrastinación', icon: '🐉', days: 7,
    lore: 'Duerme sobre todo lo que dejáis para mañana. Solo cae con horas de foco real.',
    per: { deep: 480 }, min: { deep: 960 }, participation: 0.5, reward: 120, guildXp: 150, art: 'tifon',
  },
  {
    id: 'hidra-rota', kind: 'jefe', name: 'La Hidra del Hábito Roto', icon: '🐍', days: 7,
    lore: 'Cada hábito que se rompe le hace crecer otra cabeza. Foco y constancia a la vez.',
    per: { deep: 240, habits: 6 }, min: { deep: 600, habits: 15 }, participation: 0.75, reward: 150, guildXp: 200, art: 'hidra',
  },
  {
    id: 'titan-olvido', kind: 'jefe', name: 'El Titán del Olvido', icon: '🗿', days: 14,
    lore: 'Dos semanas de asedio. Nadie lo vence solo; nadie se queda mirando.',
    per: { deep: 720, habits: 10, xp: 600 }, min: { deep: 1800, habits: 30, xp: 1500 }, participation: 1, reward: 300, guildXp: 400, art: 'cronos',
  },
];

export const challengeTemplate = (id: string) => CHALLENGES.find((c) => c.id === id);

export interface Goal {
  deep?: number;
  habits?: number;
  xp?: number;
  minParticipants: number;
  /** Parte máxima de la meta que cuenta de un solo miembro. */
  cap: number;
}

/**
 * Meta de un reto para un gremio de `members` miembros.
 * El tope es el 30 % de la meta; con menos de 4 miembros sería imposible ganar, así que sube a partes iguales (1/n).
 */
export function buildGoal(t: ChallengeTemplate, members: number): Goal {
  const n = Math.max(1, members);
  const goal: Goal = { minParticipants: Math.max(1, Math.ceil(n * (t.participation ?? 0))), cap: Math.max(CAP_SHARE, 1 / n) };
  for (const m of Object.keys(t.per) as Metric[]) goal[m] = Math.max(t.per[m]! * n, t.min?.[m] ?? 0);
  return goal;
}

export interface Contribution {
  user_id: string;
  deep: number;
  habits: number;
  xp: number;
}

/** Lo que has hecho entre dos fechas: minutos de foco, hábitos cumplidos y XP (sin contar recompensas de gremio). */
export function contributionFor(s: GameState, from: number, to: number): Omit<Contribution, 'user_id'> {
  const inside = (t: number) => t >= from && t < to;
  return {
    deep: Math.floor(s.sessions.filter((x) => inside(x.endedAt)).reduce((n, x) => n + x.minutes, 0)),
    habits: s.habitCompletions.filter((c) => inside(c.at)).length,
    xp: Math.floor(s.xp.filter((t) => inside(t.at) && t.source !== 'guild' && t.source !== 'admin').reduce((n, t) => n + t.amount, 0)),
  };
}

export interface MetricProgress {
  metric: Metric;
  goal: number;
  cap: number; // máximo que cuenta por persona
  real: number;
  counted: number;
  done: boolean;
}

/** Progreso del reto: cada miembro cuenta como mucho el tope; se gana con todas las metas y los participantes mínimos. */
export function challengeProgress(goal: Goal, contributions: Contribution[]) {
  const metrics = (['deep', 'habits', 'xp'] as Metric[]).filter((m) => goal[m]);
  const per: MetricProgress[] = metrics.map((m) => {
    const total = goal[m]!;
    const cap = Math.ceil(total * goal.cap);
    const real = contributions.reduce((n, c) => n + (c[m] ?? 0), 0);
    const counted = Math.min(total, contributions.reduce((n, c) => n + Math.min(c[m] ?? 0, cap), 0));
    return { metric: m, goal: total, cap, real, counted, done: counted >= total };
  });
  const participants = contributions.filter((c) => metrics.some((m) => (c[m] ?? 0) > 0)).length;
  const fraction = per.length ? per.reduce((n, p) => n + Math.min(1, p.counted / p.goal), 0) / per.length : 0;
  return { per, participants, fraction, won: per.every((p) => p.done) && participants >= goal.minParticipants };
}

/** Parte de cada miembro (lo que le cuenta) sobre la meta, y si ya llegó al tope. */
export function memberShare(goal: Goal, c: Contribution) {
  return (['deep', 'habits', 'xp'] as Metric[]).filter((m) => goal[m]).map((m) => {
    const cap = Math.ceil(goal[m]! * goal.cap);
    return { metric: m, real: c[m] ?? 0, counted: Math.min(c[m] ?? 0, cap), cap, capped: (c[m] ?? 0) >= cap };
  });
}

/** Nivel del gremio: 100·L·(L−1)/2 XP de gremio para el nivel L. */
export function guildLevel(xp: number) {
  const req = (l: number) => 50 * l * (l - 1);
  let level = 1;
  while (req(level + 1) <= xp) level++;
  return { level, progress: (xp - req(level)) / (req(level + 1) - req(level)), next: req(level + 1) };
}

export interface ChallengeRow {
  id: string;
  guild_id: string;
  template: string;
  goal: Goal;
  starts_at: string;
  ends_at: string;
  completed_at: string | null;
  created_by: string;
}

export type ChallengeState = 'active' | 'won' | 'lost';
export function challengeState(c: ChallengeRow, now: number): ChallengeState {
  if (c.completed_at) return 'won';
  return Date.parse(c.ends_at) > now ? 'active' : 'lost';
}

/** XP de gremio acumulado: el de cada reto ganado. */
export function guildXpFrom(challenges: ChallengeRow[]): number {
  return challenges.filter((c) => c.completed_at).reduce((n, c) => n + (challengeTemplate(c.template)?.guildXp ?? 0), 0);
}

/** Cobra la recompensa de un reto ganado (una sola vez por reto). */
export function claimReward(s: GameState, c: ChallengeRow, now: number): GameState {
  const t = challengeTemplate(c.template);
  if (!t || !c.completed_at || (s.guildClaims ?? []).includes(c.id)) return s;
  const tx: XPTransaction = {
    id: uid(), at: now, amount: t.reward, source: 'guild', sourceId: c.id, label: `Gremio: ${t.name}`,
    attributes: { conexion: Math.round(t.reward * 0.6 * 10) / 10, voluntad: Math.round(t.reward * 0.4 * 10) / 10 },
  };
  return { ...s, xp: [...s.xp, tx], guildClaims: [...(s.guildClaims ?? []), c.id] };
}

export const EMBLEMS = ['🛡️', '⚔️', '🐉', '🦁', '🦅', '🐺', '🔥', '⚡', '🌙', '👑', '🏹', '🗡️'];

// ---------- Estado compartido ----------

export interface Guild {
  id: string;
  name: string;
  emblem: string;
  motto: string;
  owner: string;
  created_at: string;
}
export type Role = 'officer' | 'member';
export interface Member { user_id: string; guild_id: string; joined_at: string; role?: Role }
export type Rank = 'leader' | 'officer' | 'member';
export const OFFICER_MAX = 2;
export const RANK_LABEL: Record<Rank, { name: string; icon: string }> = {
  leader: { name: 'Líder', icon: '👑' },
  officer: { name: 'Colíder', icon: '⚔️' },
  member: { name: 'Miembro', icon: '🛡️' },
};

/** Rango de un miembro: el líder es el dueño del gremio; los demás, colíder o miembro. */
export function rankOf(owner: string | undefined, m: Pick<Member, 'user_id' | 'role'>): Rank {
  return m.user_id === owner ? 'leader' : m.role === 'officer' ? 'officer' : 'member';
}

/** Líder y colíderes aceptan encargos e invitan. */
export const canCommand = (rank: Rank | null) => rank === 'leader' || rank === 'officer';

/** ¿Puede `actor` expulsar a `target`? El líder a cualquiera; un colíder, solo a miembros. */
export function canKick(actor: Rank | null, target: Rank): boolean {
  return actor === 'leader' ? target !== 'leader' : actor === 'officer' && target === 'member';
}

/** Quién hereda el gremio si se va el líder: el colíder más antiguo y, si no hay, el miembro más antiguo. */
export function successor(owner: string, members: Member[]): Member | undefined {
  const rest = members.filter((m) => m.user_id !== owner).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  return rest.find((m) => m.role === 'officer') ?? rest[0];
}

const RANK_ORDER: Record<Rank, number> = { leader: 0, officer: 1, member: 2 };
/** Miembros por rango y, dentro de cada rango, por antigüedad. */
export function byRank(owner: string | undefined, members: Member[]): Member[] {
  return [...members].sort((a, b) => RANK_ORDER[rankOf(owner, a)] - RANK_ORDER[rankOf(owner, b)] || a.joined_at.localeCompare(b.joined_at));
}
export interface Invite { guild_id: string; user_id: string; invited_by: string; created_at: string }

interface GuildState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  guild: Guild | null;
  members: Member[];
  people: Record<string, PublicProfile>;
  invites: (Invite & { guild?: Guild; from?: PublicProfile })[]; // las que te han hecho
  sent: Invite[]; // las que ha hecho tu gremio
  challenges: ChallengeRow[];
  contributions: (Contribution & { challenge_id: string })[];
}
const empty: GuildState = { loaded: false, loading: false, error: null, guild: null, members: [], people: {}, invites: [], sent: [], challenges: [], contributions: [] };
let gs: GuildState = empty;
const listeners = new Set<() => void>();
function set(patch: Partial<GuildState>) {
  gs = { ...gs, ...patch };
  listeners.forEach((l) => l());
}
export function useGuild(): GuildState {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => gs);
}
export const activeChallenge = (now: number) => gs.challenges.find((c) => challengeState(c, now) === 'active') ?? null;

const PROFILE = 'user_id, tag, name, bio, photo, level, xp, avatar_index, avatar_name, stats';

function describe(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network|load failed/i.test(m)) return 'No se pudo conectar con el servidor.';
  if (/lleno/i.test(m)) return 'El gremio está lleno (8 miembros).';
  if (/guild|does not exist|schema cache/i.test(m)) return 'Falta preparar la base de datos de gremios (docs/supabase-gremios.sql).';
  return `Algo falló con el gremio. (${m})`;
}

async function profiles(ids: string[]): Promise<Record<string, PublicProfile>> {
  if (!ids.length) return {};
  const { data, error } = await cloudClient().from('profiles').select(PROFILE).in('user_id', ids);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((p) => [p.user_id, p as PublicProfile]));
}

/** Carga tu gremio (o tus invitaciones si no tienes) y sube tu aportación al reto activo. */
export async function refreshGuild(s: GameState, now = Date.now()): Promise<void> {
  const me = getUserId();
  if (!me) return;
  set({ loading: true, error: null });
  try {
    const db = cloudClient();
    const { data: mine, error } = await db.from('guild_members').select('user_id, guild_id, joined_at, role').eq('user_id', me).maybeSingle();
    if (error) throw error;
    if (!mine) {
      const { data: inv, error: e2 } = await db.from('guild_invites').select('guild_id, user_id, invited_by, created_at').eq('user_id', me);
      if (e2) throw e2;
      const gids = [...new Set((inv ?? []).map((i) => i.guild_id))];
      const { data: gl, error: e3 } = gids.length ? await db.from('guilds').select('*').in('id', gids) : { data: [], error: null };
      if (e3) throw e3;
      const from = await profiles([...new Set((inv ?? []).map((i) => i.invited_by))]);
      const invites = (inv ?? []).map((i) => ({ ...i, guild: (gl ?? []).find((g) => g.id === i.guild_id) as Guild | undefined, from: from[i.invited_by] }));
      set({ ...empty, loaded: true, invites });
      return;
    }
    const gid = mine.guild_id;
    const [{ data: guild, error: e4 }, { data: members, error: e5 }, { data: sent, error: e6 }, { data: ch, error: e7 }] = await Promise.all([
      db.from('guilds').select('*').eq('id', gid).single(),
      db.from('guild_members').select('user_id, guild_id, joined_at, role').eq('guild_id', gid),
      db.from('guild_invites').select('guild_id, user_id, invited_by, created_at').eq('guild_id', gid),
      db.from('guild_challenges').select('*').eq('guild_id', gid).order('starts_at', { ascending: false }).limit(20),
    ]);
    const err = e4 ?? e5 ?? e6 ?? e7;
    if (err) throw err;
    const challenges = (ch ?? []) as ChallengeRow[];
    const active = challenges.find((c) => challengeState(c, now) === 'active');
    if (active) await reportContribution(s, active);
    const { data: contribs, error: e8 } = challenges.length
      ? await db.from('guild_contributions').select('challenge_id, user_id, deep, habits, xp').in('challenge_id', challenges.map((c) => c.id))
      : { data: [], error: null };
    if (e8) throw e8;
    const ids = [...new Set([...(members ?? []).map((m) => m.user_id), ...(sent ?? []).map((i) => i.user_id)])];
    const people = await profiles(ids);
    set({
      loaded: true, loading: false, guild: guild as Guild, members: (members ?? []) as Member[], people, invites: [],
      sent: (sent ?? []) as Invite[], challenges, contributions: (contribs ?? []) as GuildState['contributions'],
    });
    // Si con lo subido ya se ha ganado, se marca para todo el gremio.
    if (active) {
      const p = challengeProgress(active.goal, gs.contributions.filter((c) => c.challenge_id === active.id));
      if (p.won) await finishChallenge(active.id);
    }
  } catch (e) {
    set({ loaded: true, loading: false, error: describe(e) });
  }
}

async function reportContribution(s: GameState, c: ChallengeRow) {
  const me = getUserId();
  if (!me) return;
  const mine = contributionFor(s, Date.parse(c.starts_at), Date.parse(c.ends_at));
  await cloudClient().from('guild_contributions').upsert({ challenge_id: c.id, user_id: me, ...mine, updated_at: new Date().toISOString() });
}

async function finishChallenge(id: string) {
  const at = new Date().toISOString();
  const { error } = await cloudClient().from('guild_challenges').update({ completed_at: at }).eq('id', id).is('completed_at', null);
  if (!error) set({ challenges: gs.challenges.map((c) => (c.id === id && !c.completed_at ? { ...c, completed_at: at } : c)) });
}

let reportTimer: number | undefined;
let lastReport = '';
/** Tras cada cambio de la partida: si hay reto activo, sube tu aportación (agrupando cambios seguidos). */
export function scheduleGuildReport(s: GameState) {
  const c = activeChallenge(Date.now());
  if (!getUserId() || !c) return;
  const key = `${c.id}:${JSON.stringify(contributionFor(s, Date.parse(c.starts_at), Date.parse(c.ends_at)))}`;
  if (key === lastReport) return;
  clearTimeout(reportTimer);
  reportTimer = window.setTimeout(() => { lastReport = key; void refreshGuild(s); }, 4000);
}

async function run(op: PromiseLike<{ error: unknown }>, s: GameState): Promise<string | null> {
  const { error } = await op;
  if (error) return describe(error);
  await refreshGuild(s);
  return null;
}

export async function createGuild(input: { name: string; emblem: string; motto: string }, s: GameState): Promise<string | null> {
  const me = getUserId()!;
  const db = cloudClient();
  const id = crypto.randomUUID();
  const { error } = await db.from('guilds').insert({ id, name: input.name.trim(), emblem: input.emblem, motto: input.motto.trim(), owner: me });
  if (error) return describe(error);
  return run(db.from('guild_members').insert({ user_id: me, guild_id: id }), s);
}

export async function acceptInvite(guildId: string, s: GameState): Promise<string | null> {
  const me = getUserId()!;
  const db = cloudClient();
  const { error } = await db.from('guild_members').insert({ user_id: me, guild_id: guildId });
  if (error) return describe(error);
  await db.from('guild_invites').delete().eq('user_id', me);
  await refreshGuild(s);
  return null;
}

export const declineInvite = (guildId: string, s: GameState) =>
  run(cloudClient().from('guild_invites').delete().eq('guild_id', guildId).eq('user_id', getUserId()!), s);

export const invite = (userId: string, s: GameState) => !canCommand(myRank()) ? Promise.resolve(NOT_ALLOWED) :
  run(cloudClient().from('guild_invites').insert({ guild_id: gs.guild!.id, user_id: userId, invited_by: getUserId() }), s);

export const cancelInvite = (userId: string, s: GameState) =>
  run(cloudClient().from('guild_invites').delete().eq('guild_id', gs.guild!.id).eq('user_id', userId), s);

export const kick = (userId: string, s: GameState) =>
  run(cloudClient().from('guild_members').delete().eq('user_id', userId).eq('guild_id', gs.guild!.id), s);

/** Sales del gremio. Si eras el líder, hereda el colíder más antiguo (o el miembro más antiguo); si eras el último, el gremio se disuelve. */
export async function leaveGuild(s: GameState): Promise<string | null> {
  const me = getUserId()!;
  const g = gs.guild!;
  const db = cloudClient();
  if (g.owner === me) {
    const next = successor(me, gs.members);
    if (!next) return run(db.from('guilds').delete().eq('id', g.id), s);
    if (next.role === 'officer') {
      const { error } = await db.from('guild_members').update({ role: 'member' }).eq('user_id', next.user_id).eq('guild_id', g.id);
      if (error) return describe(error);
    }
    const { error } = await db.from('guilds').update({ owner: next.user_id }).eq('id', g.id);
    if (error) return describe(error);
  }
  return run(db.from('guild_members').delete().eq('user_id', me), s);
}

export async function startChallenge(t: ChallengeTemplate, s: GameState, now = Date.now()): Promise<string | null> {
  if (!canCommand(myRank())) return 'Solo el líder y los colíderes aceptan encargos.';
  if (activeChallenge(now)) return 'Ya hay un encargo en marcha.';
  const goal = buildGoal(t, gs.members.length);
  return run(cloudClient().from('guild_challenges').insert({
    guild_id: gs.guild!.id, template: t.id, goal, created_by: getUserId(),
    starts_at: new Date(now).toISOString(), ends_at: new Date(now + t.days * DAY).toISOString(),
  }), s);
}

/** Tu rango en tu gremio (null si no tienes). */
export function myRank(): Rank | null {
  const me = getUserId();
  const m = gs.members.find((x) => x.user_id === me);
  return m ? rankOf(gs.guild?.owner, m) : null;
}

const NOT_ALLOWED = 'Solo el líder y los colíderes pueden hacer eso.';

/** El líder nombra colíder a un miembro (máximo 2). */
export function promote(userId: string, s: GameState): Promise<string | null> {
  if (myRank() !== 'leader') return Promise.resolve('Solo el líder nombra colíderes.');
  if (gs.members.filter((m) => m.role === 'officer').length >= OFFICER_MAX) return Promise.resolve(`Ya hay ${OFFICER_MAX} colíderes.`);
  return run(cloudClient().from('guild_members').update({ role: 'officer' }).eq('user_id', userId).eq('guild_id', gs.guild!.id), s);
}

export function demote(userId: string, s: GameState): Promise<string | null> {
  if (myRank() !== 'leader') return Promise.resolve('Solo el líder quita colíderes.');
  return run(cloudClient().from('guild_members').update({ role: 'member' }).eq('user_id', userId).eq('guild_id', gs.guild!.id), s);
}

/** Cede el liderazgo: el elegido pasa a líder y tú, a colíder si queda hueco. */
export async function makeLeader(userId: string, s: GameState): Promise<string | null> {
  if (myRank() !== 'leader') return 'Solo el líder puede ceder el liderazgo.';
  const me = getUserId()!;
  const g = gs.guild!;
  const db = cloudClient();
  const officers = gs.members.filter((m) => m.role === 'officer' && m.user_id !== userId).length;
  const steps = [
    db.from('guild_members').update({ role: 'member' }).eq('user_id', userId).eq('guild_id', g.id),
    ...(officers < OFFICER_MAX ? [db.from('guild_members').update({ role: 'officer' }).eq('user_id', me).eq('guild_id', g.id)] : []),
    db.from('guilds').update({ owner: userId }).eq('id', g.id),
  ];
  for (const op of steps) {
    const { error } = await op;
    if (error) return describe(error);
  }
  await refreshGuild(s);
  return null;
}

export function clearGuild() {
  set(empty);
}
