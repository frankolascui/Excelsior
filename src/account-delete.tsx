// Borrar la cuenta (V2): partida en la nube, perfil, amistades, gremio (con traspaso de liderazgo) y acceso.
// Lo hace el servidor con delete_my_account() (docs/supabase-cuenta.sql). Antes ofrece descargar una copia.
import { useState } from 'react';
import type { Game } from './screens';
import { cloudClient, signOut, useCloud } from './cloud';
import { exportBackup } from './backup';
import { saveFile } from './download';
import { clearSocial } from './social';
import { clearGuild } from './guilds';
import { clearInvite } from './invite';
import { sfx } from './sfx';
import { Icon } from './icons';

export const DELETE_WORD = 'BORRAR';

export function DeleteAccount({ game }: { game: Game }) {
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cloud.email) return null;

  async function backup() {
    const name = `excelsior-${new Date().toISOString().slice(0, 10)}.json`;
    const r = await saveFile(name, exportBackup(game.state, Date.now()), 'application/json');
    if (r === 'ok') game.toast('Copia descargada', 'info');
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: e } = await cloudClient().rpc('delete_my_account');
    if (e) {
      setBusy(false);
      sfx.error();
      setError(/delete_my_account|function|schema cache/i.test(e.message)
        ? 'Falta preparar el borrado en la base de datos (docs/supabase-cuenta.sql).'
        : `No se pudo borrar la cuenta. (${e.message})`);
      return;
    }
    await signOut().catch(() => undefined);
    clearSocial();
    clearGuild();
    clearInvite();
    game.reset(); // y la partida de este dispositivo
    game.toast('Tu cuenta se ha borrado. Gracias por jugar.', 'info');
  }

  return (
    <div className="delete-account">
      {!open ? (
        <button className="ghost danger" onClick={() => setOpen(true)}><Icon name="trash" /> Borrar mi cuenta</button>
      ) : (
        <div className="delete-box" role="group" aria-labelledby="del-h">
          <h4 id="del-h"><Icon name="alert" /> Borrar tu cuenta para siempre</h4>
          <p className="small-text">Se borra todo y no se puede deshacer:</p>
          <ul className="small-text">
            <li>Tu partida en la nube y en este dispositivo.</li>
            <li>Tu perfil, tu tag y tus amistades.</li>
            <li>Tu sitio en el gremio. Si eres el líder, lo hereda el colíder más antiguo; si eres el último, el gremio desaparece.</li>
            <li>Tu acceso con {cloud.email}.</li>
          </ul>
          <p className="small-text">Los encargos que ganasteis siguen en la crónica de tu gremio, sin tu nombre.</p>
          <button className="ghost small" onClick={() => void backup()}><Icon name="download" /> Descargar una copia antes</button>
          <label className="small-text" htmlFor="del-word">Escribe <strong className="mono">{DELETE_WORD}</strong> para confirmar</label>
          <input id="del-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="row">
            <button className="danger-solid" disabled={busy || word.trim().toUpperCase() !== DELETE_WORD} onClick={() => void remove()}>
              <Icon name="trash" /> {busy ? 'Borrando…' : 'Borrar mi cuenta'}
            </button>
            <button className="link" disabled={busy} onClick={() => { setOpen(false); setWord(''); setError(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
