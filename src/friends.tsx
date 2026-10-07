// Pantalla de Amigos (V2): tu perfil con foto, biografía y tag; añadir por tag; solicitudes; amigos y recomendados.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Game } from './screens';
import { RequireAccount } from './account';
import { useCloud } from './cloud';
import { ATTRIBUTES } from './attributes';
import { AvatarPortrait, initialOf } from './portrait';
import {
  acceptRequest, BIO_MAX, findByTag, refreshSocial, relationWith, removeRelation, sendRequest, setBio, setPhoto, shrinkPhoto, useSocial,
  type PublicProfile, type Relation,
} from './social';

export function Face({ p, size = 56 }: { p: Pick<PublicProfile, 'name' | 'photo' | 'avatar_index' | 'avatar_name'>; size?: number }) {
  return <AvatarPortrait tier={p.avatar_index} label={initialOf(p.name)} photo={p.photo ?? undefined} size={size} title={p.avatar_name} />;
}

/** Botón según la relación: añadir, pendiente, aceptar o ya amigos. */
function RelationButton({ game, p, rel }: { game: Game; p: PublicProfile; rel: Relation }) {
  const [busy, setBusy] = useState(false);
  async function go(fn: () => Promise<string | null>) {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) game.toast(err, 'info');
  }
  if (rel === 'self') return <span className="muted small-text">Eres tú</span>;
  if (rel === 'friend') return <span className="friend-badge">✓ Amigos</span>;
  if (rel === 'outgoing') return <button className="ghost small" disabled={busy} onClick={() => go(() => removeRelation(p.user_id, game.state))}>Cancelar solicitud</button>;
  if (rel === 'incoming') return <button className="primary small" disabled={busy} onClick={() => go(() => acceptRequest(p.user_id, game.state))}>Aceptar</button>;
  return <button className="primary small" disabled={busy} onClick={() => go(async () => { const e = await sendRequest(p, game.state); if (!e) game.toast(`Solicitud enviada a ${p.name}`, 'info'); return e; })}>+ Añadir</button>;
}

function ProfileDialog({ game, p, onClose }: { game: Game; p: PublicProfile; onClose: () => void }) {
  const { rows } = useSocial();
  const me = useCloud().userId!;
  const rel = relationWith(me, p.user_id, rows);
  const [confirm, setConfirm] = useState(false);
  const attrs = p.stats?.attrs ?? {};
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pf-h" onClick={onClose}>
      <div className="overlay-card profile-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close-x" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="profile-head">
          <Face p={p} size={120} />
          <div>
            <h2 id="pf-h">{p.name}</h2>
            <p className="mono tag-line">{p.tag}</p>
            <p className="muted small-text">Nivel {p.level} · {p.avatar_name}{p.mutual ? ` · ${p.mutual} ${p.mutual === 1 ? 'amigo' : 'amigos'} en común` : ''}</p>
          </div>
        </div>
        {p.bio ? <p className="profile-bio">{p.bio}</p> : <p className="muted small-text">Sin biografía todavía.</p>}
        <ul className="profile-attrs">
          {ATTRIBUTES.filter((a) => attrs[a.id]).map((a) => (
            <li key={a.id}><span aria-hidden="true">{a.icon}</span> {a.name} <strong className="mono">Nv {attrs[a.id]}</strong></li>
          ))}
        </ul>
        <div className="profile-stats mono">
          <span>🏆 {p.stats?.achievements ?? 0} logros</span>
          <span>◷ {p.stats?.deepHours ?? 0} h de Deep Work</span>
          <span>⚔ {p.stats?.bosses ?? 0} bosses</span>
        </div>
        <div className="row">
          <RelationButton game={game} p={p} rel={rel} />
          {rel === 'incoming' && <button className="ghost small" onClick={() => void removeRelation(p.user_id, game.state)}>Rechazar</button>}
          {rel === 'friend' && (confirm
            ? <button className="ghost small danger-text" onClick={() => { void removeRelation(p.user_id, game.state); onClose(); }}>Sí, eliminar a {p.name}</button>
            : <button className="link" onClick={() => setConfirm(true)}>Eliminar amigo</button>)}
        </div>
      </div>
    </div>
  );
}

function PersonRow({ p, onOpen, children }: { p: PublicProfile; onOpen: () => void; children?: ReactNode }) {
  return (
    <li className="item person">
      <button className="person-main" onClick={onOpen} aria-label={`Ver perfil de ${p.name}`}>
        <Face p={p} size={52} />
        <span className="item-body">
          <span className="item-title">{p.name} <span className="muted mono small-text">{p.tag.slice(p.tag.indexOf('#'))}</span></span>
          <span className="muted small-text">Nv {p.level} · {p.avatar_name}{p.mutual ? ` · ${p.mutual} en común` : ''}</span>
        </span>
      </button>
      <span className="item-actions">{children}</span>
    </li>
  );
}

function MyProfile({ game }: { game: Game }) {
  const { state, act, toast } = game;
  const { me } = useSocial();
  const [bio, setBioText] = useState(state.profile?.bio ?? '');
  const file = useRef<HTMLInputElement>(null);
  const dirty = bio.trim() !== (state.profile?.bio ?? '');
  async function pick(f: File | undefined) {
    if (!f) return;
    try {
      const url = await shrinkPhoto(f);
      act((s) => setPhoto(s, url));
      toast('Foto de perfil actualizada', 'info');
    } catch {
      toast('No se pudo usar esa imagen. Prueba con otra (JPG o PNG).', 'info');
    }
  }
  async function copyTag() {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.tag);
      toast('Tag copiado: pásaselo a tus amigos', 'info');
    } catch {
      toast(`Tu tag es ${me.tag}`, 'info');
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    act((s) => setBio(s, bio));
    toast('Biografía guardada', 'info');
  }
  return (
    <section className="panel my-profile" aria-labelledby="myp-h">
      <header className="panel-head"><h3 id="myp-h">Tu perfil</h3></header>
      <div className="profile-head">
        <button className="photo-btn" onClick={() => file.current?.click()} aria-label="Cambiar foto de perfil" title="Cambiar foto">
          <AvatarPortrait tier={me?.avatar_index ?? 0} label={initialOf(state.profile?.name)} photo={state.profile?.photo} size={110} />
          <span className="photo-edit">📷</span>
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="photo-input" />
        <div>
          <h2>{state.profile?.name}</h2>
          {me ? (
            <button className="tag-chip mono" onClick={copyTag} title="Copiar tag">{me.tag} <span aria-hidden="true">⧉</span></button>
          ) : <p className="muted small-text">Creando tu tag…</p>}
          <p className="hint">Tus amigos te añaden con este tag.</p>
          {state.profile?.photo && <button className="link" onClick={() => act((s) => setPhoto(s, null))}>Quitar foto</button>}
        </div>
      </div>
      <form className="bio-form" onSubmit={save}>
        <label htmlFor="bio" className="scale-label">Biografía</label>
        <textarea id="bio" rows={3} maxLength={BIO_MAX} value={bio} onChange={(e) => setBioText(e.target.value)} placeholder="Quién eres, qué estás construyendo, qué te mueve…" />
        <div className="row">
          <button className="primary small" disabled={!dirty}>Guardar biografía</button>
          <span className="muted small-text mono">{bio.length}/{BIO_MAX}</span>
        </div>
      </form>
    </section>
  );
}

function AddByTag({ game, open }: { game: Game; open: (p: PublicProfile) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<PublicProfile | null | 'invalid' | 'none' | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { rows } = useSocial();
  const me = useCloud().userId!;
  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await findByTag(q);
      setRes(r === null ? 'none' : r);
    } catch (err) {
      game.toast((err as Error).message, 'info');
    }
    setBusy(false);
  }
  return (
    <section className="panel" aria-labelledby="add-h">
      <header className="panel-head"><h3 id="add-h">Añadir amigo</h3></header>
      <form className="row add-friend" onSubmit={search}>
        <input id="friend-tag" value={q} onChange={(e) => { setQ(e.target.value); setRes(undefined); }} placeholder="Nombre#1234" aria-label="Tag de tu amigo" autoComplete="off" />
        <button className="secondary" disabled={busy || !q.trim()}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {res === 'invalid' && <p className="error-text">Un tag es así: <span className="mono">Nombre#1234</span>.</p>}
      {res === 'none' && <p className="muted">No hay nadie con ese tag. Revisa el número.</p>}
      {res && typeof res === 'object' && (
        <ul className="list"><PersonRow p={res} onOpen={() => open(res)}><RelationButton game={game} p={res} rel={relationWith(me, res.user_id, rows)} /></PersonRow></ul>
      )}
    </section>
  );
}

function FriendsBody({ game }: { game: Game }) {
  const { state } = game;
  const me = useCloud().userId!;
  const social = useSocial();
  const [open, setOpen] = useState<PublicProfile | null>(null);
  useEffect(() => { void refreshSocial(game.state); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  const other = (r: { requester: string; addressee: string }) => (r.requester === me ? r.addressee : r.requester);
  const person = (id: string) => social.people[id];
  const friends = social.rows.filter((r) => r.status === 'accepted').map(other).map(person).filter(Boolean)
    .sort((a, b) => b.xp - a.xp);
  const incoming = social.rows.filter((r) => r.status === 'pending' && r.addressee === me).map((r) => person(r.requester)).filter(Boolean);
  const outgoing = social.rows.filter((r) => r.status === 'pending' && r.requester === me).map((r) => person(r.addressee)).filter(Boolean);
  const current = open && (social.people[open.user_id] ?? social.recommended.find((p) => p.user_id === open.user_id) ?? open);

  return (
    <>
      {social.error && (
        <section className="panel">
          <p className="error-text" role="alert">{social.error}</p>
          <button className="ghost small" onClick={() => void refreshSocial(state)}>Reintentar</button>
        </section>
      )}
      <MyProfile game={game} />
      <AddByTag game={game} open={setOpen} />

      {incoming.length > 0 && (
        <section className="panel glow-panel" aria-labelledby="inc-h">
          <header className="panel-head"><h3 id="inc-h">Solicitudes recibidas</h3><span className="count mono">{incoming.length}</span></header>
          <ul className="list">
            {incoming.map((p) => (
              <PersonRow key={p.user_id} p={p} onOpen={() => setOpen(p)}>
                <RelationButton game={game} p={p} rel="incoming" />
                <button className="ghost small" onClick={() => void removeRelation(p.user_id, state)}>Rechazar</button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-labelledby="fr-h">
        <header className="panel-head"><h3 id="fr-h">Tus amigos</h3><span className="count mono">{friends.length}</span></header>
        {friends.length === 0
          ? <p className="hint">{social.loading ? 'Cargando…' : 'Aún no tienes amigos aquí. Pásales tu tag o mira los recomendados.'}</p>
          : <ul className="list">{friends.map((p) => <PersonRow key={p.user_id} p={p} onOpen={() => setOpen(p)} />)}</ul>}
        {outgoing.length > 0 && (
          <>
            <p className="eyebrow">Esperando respuesta</p>
            <ul className="list">
              {outgoing.map((p) => <PersonRow key={p.user_id} p={p} onOpen={() => setOpen(p)}><RelationButton game={game} p={p} rel="outgoing" /></PersonRow>)}
            </ul>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="rec-h">
        <header className="panel-head"><h3 id="rec-h">Recomendados</h3></header>
        <p className="hint">Amigos de tus amigos primero, y después héroes de tu nivel.</p>
        {social.recommended.length === 0
          ? <p className="muted small-text">{social.loading ? 'Cargando…' : 'Nadie que recomendarte todavía.'}</p>
          : (
            <ul className="rec-grid">
              {social.recommended.map((p) => (
                <li key={p.user_id} className="rec-card">
                  <button className="rec-open" onClick={() => setOpen(p)} aria-label={`Ver perfil de ${p.name}`}>
                    <Face p={p} size={84} />
                    <strong>{p.name}</strong>
                    <span className="muted small-text">Nv {p.level} · {p.avatar_name}</span>
                    <span className="muted small-text">{p.mutual ? `${p.mutual} ${p.mutual === 1 ? 'amigo' : 'amigos'} en común` : 'Nivel parecido al tuyo'}</span>
                  </button>
                  <RelationButton game={game} p={p} rel={relationWith(me, p.user_id, social.rows)} />
                </li>
              ))}
            </ul>
          )}
      </section>

      {current && <ProfileDialog game={game} p={current} onClose={() => setOpen(null)} />}
    </>
  );
}

export function Friends({ game }: { game: Game }) {
  const userId = useCloud().userId;
  return (
    <div className="screen">
      <h1 className="screen-title">Amigos</h1>
      <RequireAccount feature="tener amigos">
        {userId && <FriendsBody game={game} />}
      </RequireAccount>
    </div>
  );
}
