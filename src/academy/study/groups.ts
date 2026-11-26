// Grupos de estudio (docs/supabase-grupos-estudio.sql): compartir asignaturas como en Google Docs.
// Lector = ve y copia; editor = además cambia hojas, temas y tarjetas, comparte las suyas e invita a amigos.
import { sb } from '../cloud';
import { getUserId } from '../../cloud';
import type { Subject } from './types';

export type GroupRole = 'owner' | 'editor' | 'reader';
export type LinkRole = 'editor' | 'reader';
/** Qué puedes hacer con una asignatura: tuya, compartida para editar, compartida para leer, o nada. */
export type Access = 'owner' | 'editor' | 'reader' | null;

export interface Group { id: string; name: string; owner_id: string; created_at: string }
export interface Member { group_id: string; user_id: string; role: GroupRole; joined_at: string; name: string; tag: string; photo: string | null }
export interface SharedSubject extends Subject { user_id: string; group_id: string; shared_by: string }
export interface GroupLink { role: LinkRole; token: string }
export interface Friend { user_id: string; name: string; tag: string; photo: string | null }

export const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Propietario', editor: 'Editor', reader: 'Lector' };
export const ROLE_HINT: Record<GroupRole, string> = {
  owner: 'Lo gestiona todo',
  editor: 'Cambia hojas y tarjetas, comparte e invita',
  reader: 'Ve los apuntes y los copia',
};
export const GROUP_MAX = 30;

const RANK: Record<GroupRole, number> = { reader: 1, editor: 2, owner: 3 };
/** El papel más alto entre varios grupos (una asignatura puede estar en dos grupos tuyos). */
export function bestRole(roles: (GroupRole | null | undefined)[]): GroupRole | null {
  return roles.reduce<GroupRole | null>((best, r) => (r && (!best || RANK[r] > RANK[best]) ? r : best), null);
}

/** Lo que te deja hacer una asignatura según su dueño y tus papeles en los grupos donde está. */
export function accessFor(subjectOwner: string | null | undefined, me: string | null, groupRoles: GroupRole[]): Access {
  if (!subjectOwner || !me) return null;
  if (subjectOwner === me) return 'owner';
  const r = bestRole(groupRoles);
  return r === 'owner' || r === 'editor' ? 'editor' : r === 'reader' ? 'reader' : null;
}

export const canEdit = (a: Access) => a === 'owner' || a === 'editor';
export const canManage = (r: GroupRole | null) => r === 'owner';
export const canInvite = (r: GroupRole | null) => r === 'owner' || r === 'editor';

// ---------- Enlaces ----------
const JOIN = '#academy/unirse/';
const KEY = 'excelsior:study-group-link';
export function joinLink(token: string, here: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${here.origin}${here.pathname}${JOIN}${token}`;
}
/** Un enlace pegado (entero o solo el código) → el código. */
export function tokenFrom(input: string): string | null {
  const m = input.trim().match(/(?:unirse\/)?([0-9a-f]{32})\b/i);
  return m ? m[1].toLowerCase() : null;
}
/** El enlace espera en este navegador mientras la persona entra con su cuenta. */
export function rememberLink(token: string) { try { localStorage.setItem(KEY, token); } catch { /* sin almacenamiento */ } }
export function pendingLink(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function forgetLink() { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

// ---------- Llamadas ----------
function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(friendlyGroupError(res.error.message));
  return res.data as T;
}
export function friendlyGroupError(msg: string): string {
  if (/study_group|study_copy_subject|study_shared/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)) {
    return 'Falta preparar los grupos de estudio: ejecuta docs/supabase-grupos-estudio.sql en el SQL Editor de Supabase.';
  }
  if (/duplicate key/.test(msg) && /study_group_subjects/.test(msg)) return 'Esa asignatura ya está en el grupo.';
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer eso en este grupo.';
  return msg;
}
const uid = () => getUserId() ?? '';

export async function listGroups(): Promise<(Group & { role: GroupRole; members: number })[]> {
  const groups = check(await sb().from('study_groups').select('id, name, owner_id, created_at').order('created_at')) as Group[];
  if (!groups.length) return [];
  const rows = check(await sb().from('study_group_members').select('group_id, user_id, role').in('group_id', groups.map((g) => g.id))) as { group_id: string; user_id: string; role: GroupRole }[];
  return groups.map((g) => ({
    ...g,
    role: rows.find((r) => r.group_id === g.id && r.user_id === uid())?.role ?? 'reader',
    members: rows.filter((r) => r.group_id === g.id).length,
  }));
}

export async function createGroup(name: string): Promise<Group> {
  return check(await sb().from('study_groups').insert({ name }).select('id, name, owner_id, created_at').single()) as Group;
}
export async function renameGroup(id: string, name: string) { check(await sb().from('study_groups').update({ name }).eq('id', id)); }
export async function deleteGroup(id: string) { check(await sb().from('study_groups').delete().eq('id', id)); }

export async function getGroup(id: string): Promise<Group | null> {
  return check(await sb().from('study_groups').select('id, name, owner_id, created_at').eq('id', id).maybeSingle()) as Group | null;
}

/** Miembros con su nombre público (quien no tenga perfil sale como «Estudiante»). */
export async function listMembers(groupId: string): Promise<Member[]> {
  const rows = check(await sb().from('study_group_members').select('group_id, user_id, role, joined_at').eq('group_id', groupId).order('joined_at')) as Omit<Member, 'name' | 'tag' | 'photo'>[];
  const profiles = await profilesOf(rows.map((r) => r.user_id));
  const order = (r: GroupRole) => -RANK[r];
  return rows
    .map((r) => ({ ...r, name: profiles[r.user_id]?.name ?? 'Estudiante', tag: profiles[r.user_id]?.tag ?? '', photo: profiles[r.user_id]?.photo ?? null }))
    .sort((a, b) => order(a.role) - order(b.role) || a.joined_at.localeCompare(b.joined_at));
}

async function profilesOf(ids: string[]): Promise<Record<string, Friend>> {
  if (!ids.length) return {};
  const res = await sb().from('profiles').select('user_id, name, tag, photo').in('user_id', ids);
  if (res.error) return {};
  return Object.fromEntries((res.data as Friend[]).map((p) => [p.user_id, p]));
}

export async function setMemberRole(groupId: string, userId: string, role: LinkRole) {
  check(await sb().from('study_group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId));
}
export async function removeMember(groupId: string, userId: string) {
  check(await sb().from('study_group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}
export const leaveGroup = (groupId: string) => removeMember(groupId, uid());

/** Tus amigos aceptados (para invitarlos). */
export async function listFriends(): Promise<Friend[]> {
  const rows = check(await sb().from('friendships').select('requester, addressee').eq('status', 'accepted')) as { requester: string; addressee: string }[];
  const ids = rows.map((r) => (r.requester === uid() ? r.addressee : r.requester));
  const p = await profilesOf(ids);
  return ids.map((id) => p[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export async function addFriend(groupId: string, friendId: string, role: LinkRole) {
  check(await sb().rpc('study_group_add_friend', { g: groupId, friend: friendId, new_role: role }));
}

// Enlaces de invitación: uno para lectores y otro para editores.
export async function listLinks(groupId: string): Promise<GroupLink[]> {
  return check(await sb().from('study_group_links').select('role, token').eq('group_id', groupId)) as GroupLink[];
}
export async function createLink(groupId: string, role: LinkRole): Promise<GroupLink> {
  return check(await sb().from('study_group_links').insert({ group_id: groupId, role }).select('role, token').single()) as GroupLink;
}
/** Enlace nuevo: el anterior deja de servir (quien ya entró, sigue dentro). */
export async function resetLink(groupId: string, role: LinkRole): Promise<GroupLink> {
  const token = crypto.randomUUID().replace(/-/g, '');
  return check(await sb().from('study_group_links').update({ token }).eq('group_id', groupId).eq('role', role).select('role, token').single()) as GroupLink;
}
export async function deleteLink(groupId: string, role: LinkRole) {
  check(await sb().from('study_group_links').delete().eq('group_id', groupId).eq('role', role));
}

export interface LinkPeek { group_id: string; name: string; role: LinkRole; members: number; owner_name: string; already: GroupRole | null }
export async function peekLink(token: string): Promise<LinkPeek | null> {
  const rows = check(await sb().rpc('study_group_peek', { link: token })) as LinkPeek[];
  return rows[0] ?? null;
}
export async function joinWithLink(token: string): Promise<string> {
  return check(await sb().rpc('study_group_join', { link: token })) as string;
}

// ---------- Asignaturas del grupo ----------
export async function listGroupSubjects(groupId: string): Promise<SharedSubject[]> {
  const rows = check(await sb().from('study_group_subjects').select('group_id, subject_id, shared_by').eq('group_id', groupId).order('shared_at')) as { group_id: string; subject_id: string; shared_by: string }[];
  if (!rows.length) return [];
  const subs = check(await sb().from('study_subjects').select('id, name, color, position, level, user_id').in('id', rows.map((r) => r.subject_id))) as (Subject & { user_id: string })[];
  return rows.flatMap((r) => {
    const s = subs.find((x) => x.id === r.subject_id);
    return s ? [{ ...s, group_id: r.group_id, shared_by: r.shared_by }] : [];
  });
}
export async function shareSubject(groupId: string, subjectId: string) {
  check(await sb().from('study_group_subjects').insert({ group_id: groupId, subject_id: subjectId }));
}
export async function unshareSubject(groupId: string, subjectId: string) {
  check(await sb().from('study_group_subjects').delete().eq('group_id', groupId).eq('subject_id', subjectId));
}
/** Copia la asignatura (temas, hojas y tarjetas sin empezar) a tu estantería. Devuelve la nueva. */
export async function copySubject(subjectId: string): Promise<string> {
  return check(await sb().rpc('study_copy_subject', { src: subjectId })) as string;
}

/** Tu papel con una asignatura: dueño, o el mejor papel en los grupos donde está compartida. */
export async function subjectAccess(subjectId: string, owner: string | null | undefined): Promise<Access> {
  if (owner && owner === uid()) return 'owner';
  const shares = await sb().from('study_group_subjects').select('group_id').eq('subject_id', subjectId);
  if (shares.error || !shares.data?.length) return null;
  const mine = await sb().from('study_group_members').select('role').eq('user_id', uid()).in('group_id', shares.data.map((x) => x.group_id));
  if (mine.error) return null;
  return accessFor(owner, uid(), (mine.data ?? []).map((m) => m.role as GroupRole));
}

/** De qué grupos tuyos forma parte cada asignatura tuya (para el aviso «Compartida» de la estantería). */
export async function sharedOwnSubjects(): Promise<Set<string>> {
  const res = await sb().from('study_group_subjects').select('subject_id').eq('shared_by', uid());
  return new Set(res.error ? [] : (res.data ?? []).map((r) => r.subject_id as string));
}
