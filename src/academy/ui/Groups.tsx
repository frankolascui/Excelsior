// Grupos de estudio: compartir asignaturas con amigos como en Google Docs (lectores y editores, por amigo o por enlace).
import { useEffect, useState } from 'react';
import { listSubjects } from '../study/api';
import {
  addFriend, canInvite, canManage, copySubject, createGroup, createLink, deleteGroup, deleteLink, forgetLink, getGroup,
  joinLink, joinWithLink, leaveGroup, listFriends, listGroups, listGroupSubjects, listLinks, listMembers, peekLink,
  removeMember, renameGroup, resetLink, ROLE_HINT, ROLE_LABEL, setMemberRole, shareSubject, unshareSubject,
  type Friend, type Group, type GroupLink, type GroupRole, type LinkPeek, type LinkRole, type Member, type SharedSubject,
} from '../study/groups';
import { routeToHash } from '../study/logic';
import type { Subject } from '../study/types';
import { getUserId } from '../../cloud';
import { sfx } from '../sfx';
import { askConfirm, askText } from './Dialog';
import { Icon } from './Icon';
import { Menu, Modal } from './Kit';
import '../groups.css';

type GroupRow = Group & { role: GroupRole; members: number };
let groupsMem: GroupRow[] | null = null;

/** En la estantería, debajo de tus asignaturas: tus grupos y el botón para crear uno. */
export function GroupsShelf() {
  const [groups, setGroups] = useState<GroupRow[] | null>(groupsMem);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { listGroups().then((g) => { groupsMem = g; setGroups(g); }).catch((e) => setError(e.message)); }, []);

  async function create() {
    const name = await askText({ title: 'Nuevo grupo de estudio', label: 'Nombre del grupo (p. ej. Bio 2.º B)', confirmLabel: 'Crear grupo' });
    if (!name?.trim()) return;
    try {
      const g = await createGroup(name.trim().slice(0, 60));
      sfx.place();
      location.hash = routeToHash({ view: 'grupo', groupId: g.id });
    } catch (e) { setError((e as Error).message); sfx.error(); }
  }

  return (
    <section className="stack groups-shelf" data-testid="groups-shelf">
      <div>
        <p className="eyebrow">Estudiar con amigos</p>
        <h2 className="section-title small-title">Grupos de estudio</h2>
      </div>
      {error ? <p className="muted small">{error}</p> : !groups ? <p className="muted small">Cargando grupos…</p> : (
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <a className="group-tile" href={routeToHash({ view: 'grupo', groupId: g.id })} onClick={() => sfx.open()}>
                <span className="group-icon"><Icon name="users" /></span>
                <span className="group-name">{g.name}</span>
                <span className="muted small">{g.members} {g.members === 1 ? 'persona' : 'personas'} · {ROLE_LABEL[g.role]}</span>
              </a>
            </li>
          ))}
          <li>
            <button className="group-tile group-new" onClick={create} data-testid="new-group">
              <span className="group-icon"><Icon name="plus" /></span>
              <span className="group-name">Nuevo grupo</span>
              <span className="muted small">Comparte apuntes y tarjetas</span>
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}

/** La página de un grupo: sus asignaturas y sus personas. */
export function GroupView({ groupId }: { groupId: string }) {
  const me = getUserId();
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [subjects, setSubjects] = useState<SharedSubject[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => Promise.all([getGroup(groupId), listMembers(groupId), listGroupSubjects(groupId)])
    .then(([g, m, s]) => { setGroup(g); setMembers(m); setSubjects(s); })
    .catch((e) => { setError(e.message); setGroup((g) => g ?? null); });
  useEffect(() => { reload(); }, [groupId]);

  async function act(fn: () => Promise<unknown>, sound: () => void = sfx.drop) {
    try { setError(null); await fn(); sound(); groupsMem = null; await reload(); } catch (e) { setError((e as Error).message); sfx.error(); }
  }

  if (group === undefined) return <p className="muted">Abriendo grupo…</p>;
  if (!group) {
    return (
      <section className="stack">
        <nav className="crumbs"><a className="back-btn" href="#academy/" onClick={() => sfx.page()}><Icon name="left" size={16} /> Estantería</a></nav>
        <p className="empty-state">{error ?? 'Este grupo ya no existe o ya no estás en él.'}</p>
      </section>
    );
  }

  const myRole = members.find((m) => m.user_id === me)?.role ?? 'reader';
  const ownerName = (id: string) => (id === me ? 'ti' : members.find((m) => m.user_id === id)?.name ?? 'alguien');

  const groupMenu = canManage(myRole)
    ? [
        { icon: 'edit' as const, label: 'Renombrar grupo', onSelect: async () => {
          const n = await askText({ title: 'Renombrar grupo', label: 'Nombre del grupo', initial: group.name });
          if (n?.trim()) act(() => renameGroup(group.id, n.trim().slice(0, 60)), sfx.saved);
        } },
        { icon: 'trash' as const, label: 'Borrar grupo', danger: true, onSelect: async () => {
          if (await askConfirm({ title: `¿Borrar «${group.name}»?`, message: 'Todos salen del grupo. Las asignaturas no se borran: vuelven a ser solo de su dueño.', confirmLabel: 'Borrar grupo', danger: true })) {
            act(async () => { await deleteGroup(group.id); location.hash = '#academy/'; }, sfx.remove);
          }
        } },
      ]
    : [
        { icon: 'exit' as const, label: 'Salir del grupo', danger: true, onSelect: async () => {
          if (await askConfirm({ title: `¿Salir de «${group.name}»?`, message: 'Dejarás de ver sus asignaturas, y las tuyas dejarán de estar compartidas aquí. Tus copias se quedan.', confirmLabel: 'Salir', danger: true })) {
            act(async () => { await leaveGroup(group.id); location.hash = '#academy/'; }, sfx.remove);
          }
        } },
      ];

  return (
    <section className="stack group-page" data-testid="group-page">
      <nav className="crumbs">
        <a className="back-btn" href="#academy/" onClick={() => sfx.page()}><Icon name="left" size={16} /> Estantería</a>
        <span className="sep">›</span> <span>{group.name}</span>
      </nav>
      <div className="binder-head">
        <div>
          <p className="eyebrow">Grupo de estudio · eres {ROLE_LABEL[myRole].toLowerCase()}</p>
          <h1 className="section-title">{group.name}</h1>
        </div>
        <div className="row">
          {canInvite(myRole) && <button className="primary" onClick={() => { setSharing(true); sfx.open(); }} data-testid="share-group"><Icon name="share" /> Compartir</button>}
          <Menu label="Opciones del grupo" items={groupMenu} />
        </div>
      </div>

      <div className="group-cols">
        <div className="stack">
          <h3 className="group-h">Asignaturas</h3>
          {subjects && subjects.length === 0 && (
            <p className="empty-state">{canInvite(myRole) ? 'Aún no hay asignaturas. Añade una tuya para que el grupo vea sus hojas y tarjetas.' : 'Aún no hay asignaturas en este grupo.'}</p>
          )}
          <ul className="shelf">
            {(subjects ?? []).map((s) => (
              <li key={s.id} className="binder" style={{ '--spine': s.color } as React.CSSProperties}>
                <a href={routeToHash({ view: 'asignatura', subjectId: s.id })} className="binder-cover" onClick={() => sfx.open()}>
                  <span className="binder-label">De {ownerName(s.user_id)}</span>
                  <span className="binder-name">{s.name}</span>
                </a>
                <Menu label={`Opciones de ${s.name}`} items={[
                  ...(s.user_id !== me ? [{ icon: 'copy' as const, label: 'Copiar a mi estantería', onSelect: () => copyToShelf(s, setError) }] : []),
                  ...(s.shared_by === me || canManage(myRole) ? [{ icon: 'close' as const, label: 'Quitar del grupo', danger: true, onSelect: async () => {
                    if (await askConfirm({ title: `¿Quitar «${s.name}» del grupo?`, message: 'No se borra nada: la asignatura sigue en la estantería de su dueño.', confirmLabel: 'Quitar', danger: true })) act(() => unshareSubject(group.id, s.id), sfx.remove);
                  } }] : []),
                ]} />
              </li>
            ))}
            {canInvite(myRole) && (
              <li>
                <button className="binder-new" onClick={() => { setAdding(true); sfx.open(); }} data-testid="add-group-subject">
                  <span className="drop-icon"><Icon name="plus" size={22} /></span>
                  Añadir una asignatura
                </button>
              </li>
            )}
          </ul>
        </div>

        <aside className="stack">
          <h3 className="group-h">Personas <span className="muted small">{members.length}</span></h3>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id} className="member-row">
                <Avatar name={m.name} photo={m.photo} />
                <span className="member-name">{m.name}{m.user_id === me && <span className="muted small"> (tú)</span>}</span>
                <span className={`pill role-${m.role}`} title={ROLE_HINT[m.role]}>{ROLE_LABEL[m.role]}</span>
                {canManage(myRole) && m.role !== 'owner' && (
                  <Menu label={`Opciones de ${m.name}`} items={[
                    m.role === 'reader'
                      ? { icon: 'edit', label: 'Hacer editor', onSelect: () => act(() => setMemberRole(group.id, m.user_id, 'editor'), sfx.check) }
                      : { icon: 'eye', label: 'Hacer lector', onSelect: () => act(() => setMemberRole(group.id, m.user_id, 'reader'), sfx.check) },
                    { icon: 'close', label: 'Quitar del grupo', danger: true, onSelect: async () => {
                      if (await askConfirm({ title: `¿Quitar a ${m.name}?`, message: 'Dejará de ver el grupo y sus asignaturas saldrán de él.', confirmLabel: 'Quitar', danger: true })) act(() => removeMember(group.id, m.user_id), sfx.remove);
                    } },
                  ]} />
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {sharing && <ShareDialog group={group} myRole={myRole} members={members} onClose={() => setSharing(false)} onChanged={reload} />}
      {adding && <AddSubject groupId={group.id} already={(subjects ?? []).map((s) => s.id)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); act(async () => {}, sfx.place); }} />}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export async function copyToShelf(s: { id: string; name: string }, onError: (m: string) => void) {
  if (!(await askConfirm({ title: `¿Copiar «${s.name}» a tu estantería?`, message: 'Tendrás tu propia copia de temas, hojas y tarjetas (sin empezar), para repasar a tu ritmo. Los cambios del grupo no llegan a tu copia.', confirmLabel: 'Copiar' }))) return;
  try {
    const id = await copySubject(s.id);
    sfx.reward();
    location.hash = routeToHash({ view: 'asignatura', subjectId: id });
  } catch (e) { onError((e as Error).message); sfx.error(); }
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  return photo
    ? <img className="member-avatar" src={photo} alt="" />
    : <span className="member-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

/** Elegir una asignatura tuya para el grupo. */
function AddSubject({ groupId, already, onClose, onDone }: { groupId: string; already: string[]; onClose: () => void; onDone: () => void }) {
  const [mine, setMine] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { listSubjects().then(setMine).catch((e) => setError(e.message)); }, []);
  const free = (mine ?? []).filter((s) => !already.includes(s.id));
  async function add(id: string) {
    try { await shareSubject(groupId, id); onDone(); } catch (e) { setError((e as Error).message); sfx.error(); }
  }
  return (
    <Modal title="Añadir una asignatura" onClose={onClose}>
      <p className="muted small">El grupo verá sus temas, hojas y tarjetas. Los editores podrán cambiarlos; tu progreso de repaso sigue siendo solo tuyo.</p>
      {!mine ? <p className="muted">{error ?? 'Cargando…'}</p> : free.length === 0 ? <p className="empty-state">No te quedan asignaturas por añadir.</p> : (
        <ul className="pick-list">
          {free.map((s) => (
            <li key={s.id}>
              <button className="pick-row" onClick={() => add(s.id)} style={{ '--spine': s.color } as React.CSSProperties}>
                <span className="pick-dot" /> {s.name} <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && mine && <p className="error">{error}</p>}
    </Modal>
  );
}

/** «Compartir», como en Docs: añadir amigos con su papel y los dos enlaces (lector y editor). */
function ShareDialog({ group, myRole, members, onClose, onChanged }: { group: Group; myRole: GroupRole; members: Member[]; onClose: () => void; onChanged: () => void }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [links, setLinks] = useState<GroupLink[] | null>(null);
  const [role, setRole] = useState<LinkRole>('reader');
  const [copied, setCopied] = useState<LinkRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = canManage(myRole);

  useEffect(() => {
    listFriends().then(setFriends).catch((e) => { setFriends([]); setError(e.message); });
    listLinks(group.id).then(setLinks).catch((e) => { setLinks([]); setError(e.message); });
  }, [group.id]);

  const inGroup = new Set(members.map((m) => m.user_id));
  const outside = (friends ?? []).filter((f) => !inGroup.has(f.user_id));

  async function run(fn: () => Promise<unknown>, sound: () => void = sfx.check) {
    try { setError(null); await fn(); sound(); } catch (e) { setError((e as Error).message); sfx.error(); }
  }
  const linkOf = (r: LinkRole) => links?.find((l) => l.role === r);
  async function copy(r: LinkRole) {
    const l = linkOf(r);
    if (!l) return;
    const url = joinLink(l.token);
    try { await navigator.clipboard.writeText(url); } catch { await askText({ title: 'Copia el enlace', label: 'Enlace del grupo', initial: url, confirmLabel: 'Listo' }); return; }
    setCopied(r);
    sfx.confirm();
    setTimeout(() => setCopied((c) => (c === r ? null : c)), 2000);
  }
  const reloadLinks = () => listLinks(group.id).then(setLinks);

  return (
    <Modal title={`Compartir «${group.name}»`} onClose={onClose}>
      <div className="stack share-dialog" data-testid="share-dialog">
        <section className="stack tight">
          <div className="share-head">
            <h3 className="group-h">Añadir amigos</h3>
            <div className="segmented" role="radiogroup" aria-label="Entran como">
              {(['reader', 'editor'] as LinkRole[]).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} title={ROLE_HINT[r]} onClick={() => { setRole(r); sfx.tick(); }}>{ROLE_LABEL[r]}</button>
              ))}
            </div>
          </div>
          {!friends ? <p className="muted small">Cargando amigos…</p> : outside.length === 0 ? (
            <p className="muted small">{friends.length ? 'Todos tus amigos ya están en el grupo.' : 'Aún no tienes amigos en Excelsior. Añádelos en Amigos con su tag, o usa un enlace.'}</p>
          ) : (
            <ul className="member-list">
              {outside.map((f) => (
                <li key={f.user_id} className="member-row">
                  <Avatar name={f.name} photo={f.photo} />
                  <span className="member-name">{f.name} <span className="muted small">{f.tag}</span></span>
                  <button className="secondary small" onClick={() => run(async () => { await addFriend(group.id, f.user_id, role); onChanged(); }, sfx.place)}>
                    <Icon name="plus" size={16} /> Añadir como {ROLE_LABEL[role].toLowerCase()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stack tight">
          <h3 className="group-h">Enlaces</h3>
          <p className="muted small">Quien abra el enlace y entre con su cuenta se une al grupo con ese papel.</p>
          {(['reader', 'editor'] as LinkRole[]).map((r) => {
            const l = linkOf(r);
            return (
              <div key={r} className="link-row" data-testid={`link-${r}`}>
                <span className="link-icon"><Icon name="link" /></span>
                <span className="link-text"><strong>Enlace de {ROLE_LABEL[r].toLowerCase()}</strong><span className="muted small">{ROLE_HINT[r]}</span></span>
                {!links ? null : l ? (
                  <>
                    <button className="secondary small" onClick={() => copy(r)}><Icon name={copied === r ? 'check' : 'copy'} size={16} /> {copied === r ? 'Copiado' : 'Copiar'}</button>
                    {owner && <Menu label={`Opciones del enlace de ${ROLE_LABEL[r].toLowerCase()}`} items={[
                      { icon: 'shuffle', label: 'Cambiar enlace (el viejo deja de servir)', onSelect: () => run(async () => { await resetLink(group.id, r); await reloadLinks(); }) },
                      { icon: 'close', label: 'Desactivar enlace', danger: true, onSelect: () => run(async () => { await deleteLink(group.id, r); await reloadLinks(); }, sfx.remove) },
                    ]} />}
                  </>
                ) : owner ? (
                  <button className="ghost small" onClick={() => run(async () => { await createLink(group.id, r); await reloadLinks(); }, sfx.place)}><Icon name="plus" size={16} /> Crear enlace</button>
                ) : <span className="muted small">Sin enlace</span>}
              </div>
            );
          })}
        </section>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}

/** Abrir un enlace de invitación: se enseña a qué grupo y con qué papel, y la persona decide. */
export function JoinView({ token }: { token: string }) {
  const [peek, setPeek] = useState<LinkPeek | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peekLink(token).then((p) => {
      setPeek(p);
      if (!p) forgetLink();
      // Ya estás dentro con ese papel (o uno mejor): directo al grupo.
      else if (p.already && (p.already !== 'reader' || p.role === 'reader')) { forgetLink(); location.replace(routeToHash({ view: 'grupo', groupId: p.group_id })); }
    }).catch((e) => { setError(e.message); setPeek(null); });
  }, [token]);

  async function join() {
    setBusy(true);
    try {
      const id = await joinWithLink(token);
      forgetLink();
      groupsMem = null;
      sfx.reward();
      location.hash = routeToHash({ view: 'grupo', groupId: id });
    } catch (e) { setError((e as Error).message); sfx.error(); setBusy(false); }
  }

  if (peek === undefined) return <p className="muted">Abriendo invitación…</p>;
  return (
    <section className="stack join-card-wrap">
      <div className="panel join-card" data-testid="join-card">
        {!peek ? (
          <>
            <h2 className="section-title small-title"><Icon name="link" /> Enlace no válido</h2>
            <p className="muted">{error ?? 'Este enlace ya no sirve: puede que lo hayan cambiado o desactivado. Pide uno nuevo a quien te lo pasó.'}</p>
            <div className="row"><a className="secondary" href="#academy/">Ir a mi estantería</a></div>
          </>
        ) : (
          <>
            <p className="eyebrow">Invitación a un grupo de estudio</p>
            <h2 className="section-title">{peek.name}</h2>
            <p>{peek.owner_name ? `${peek.owner_name} te invita` : 'Te invitan'} como <strong>{ROLE_LABEL[peek.role].toLowerCase()}</strong>: {ROLE_HINT[peek.role].toLowerCase()}. Sois {peek.members} {peek.members === 1 ? 'persona' : 'personas'}.</p>
            <div className="row">
              <button className="primary" disabled={busy} onClick={join} data-testid="join-group"><Icon name="users" /> {peek.already ? 'Pasar a editor' : 'Unirme al grupo'}</button>
              <a className="ghost" href="#academy/" onClick={() => forgetLink()}>Ahora no</a>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
