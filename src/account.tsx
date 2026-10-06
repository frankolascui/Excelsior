// Cuenta: entrar con email + código de 6 dígitos, estado del guardado y conflicto de partidas.
import { useState, type FormEvent } from 'react';
import { cloudEnabled, sendCode, signOut, useCloud, verifyCode, type RemoteSave } from './cloud';
import { levelInfo, totalXp } from './game';
import type { GameState } from './types';

const STATUS = { off: '', saving: 'Guardando…', saved: '☁ Guardado en la nube', error: '⚠ Sin conexión: se guardará al volver' };

/** Formulario de entrada en dos pasos. */
export function LoginForm({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = step === 'email' ? await sendCode(email) : await verifyCode(email, code);
    setBusy(false);
    if (err) return setError(err);
    if (step === 'email') setStep('code');
    else onDone?.();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {step === 'email' ? (
        <>
          <label htmlFor="login-email">Tu email</label>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
          <button className="primary" disabled={busy || !email.includes('@')}>{busy ? 'Enviando…' : 'Enviarme un código'}</button>
        </>
      ) : (
        <>
          <label htmlFor="login-code">Código de 6 dígitos enviado a <strong>{email}</strong></label>
          <input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="code-input mono" autoFocus />
          <span className="settings-row">
            <button className="primary" disabled={busy || code.length < 6}>{busy ? 'Comprobando…' : 'Entrar'}</button>
            <button type="button" className="link" onClick={() => { setStep('email'); setCode(''); setError(null); }}>Cambiar email</button>
          </span>
          <p className="hint">Si no te llega, mira en spam. Puedes pedir otro en un minuto.</p>
        </>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </form>
  );
}

/** Sección «Cuenta» de Ajustes. */
export function AccountPanel() {
  const cloud = useCloud();
  if (!cloudEnabled) return null;
  return (
    <section className="panel" aria-labelledby="account-h">
      <h3 id="account-h">Cuenta</h3>
      {cloud.email ? (
        <>
          <p>Has entrado como <strong>{cloud.email}</strong>. Tu partida se guarda en la nube y la verás igual en cualquier dispositivo.</p>
          <p className="muted small-text" aria-live="polite">{STATUS[cloud.status]}</p>
          <button className="ghost" onClick={() => void signOut()}>Cerrar sesión</button>
        </>
      ) : (
        <>
          <p className="hint">Entra con tu email para guardar la partida en la nube y jugar en el PC y en el móvil. Sin contraseñas: te mandamos un código.</p>
          <LoginForm />
        </>
      )}
    </section>
  );
}

function describe(s: GameState) {
  return `${s.profile?.name ?? 'Sin personaje'} · nivel ${levelInfo(totalXp(s)).level} · ${s.quests.length} misiones`;
}

/** Primer login en un dispositivo que ya tenía partida: el jugador elige cuál se queda. */
export function ConflictDialog({ local, remote, onChoose }: { local: GameState; remote: RemoteSave; onChoose: (useRemote: boolean) => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-h">
      <div className="overlay-card">
        <h2 id="conflict-h">Tienes dos partidas</h2>
        <p>¿Con cuál te quedas? La otra se sustituirá.</p>
        <div className="conflict-options">
          <button className="secondary" onClick={() => onChoose(true)}>
            <strong>☁ La de la nube</strong>
            <span className="muted small-text">{describe(remote.state)}</span>
          </button>
          <button className="secondary" onClick={() => onChoose(false)}>
            <strong>💻 La de este dispositivo</strong>
            <span className="muted small-text">{describe(local)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
