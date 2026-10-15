// Cuenta: entrar con email + código del correo (Supabase envía 6–10 dígitos según su configuración), estado del guardado y conflicto de partidas.
import { useState, type FormEvent, type ReactNode } from 'react';
import { cloudEnabled, sendCode, signOut, useCloud, verifyCode, type RemoteSave } from './cloud';
import { levelInfo, totalXp } from './game';
import type { GameState } from './types';
import { Icon, rich } from './icons';
import { sfx } from './sfx';

const STATUS = { off: '', saving: 'Guardando…', saved: '{i:cloud} Guardado en la nube', error: '{i:cloud-off} Sin conexión: se guardará al volver' };

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
    if (err) {
      sfx.error();
      return setError(err);
    }
    sfx.confirm();
    if (step === 'email') setStep('code');
    else onDone?.();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {step === 'email' ? (
        <>
          <label htmlFor="login-email">Tu email</label>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
          <button className="primary" disabled={busy || !email.includes('@')}><Icon name="mail" /> {busy ? 'Enviando…' : 'Enviarme un código'}</button>
        </>
      ) : (
        <>
          <label htmlFor="login-code">Escribe el código que te hemos enviado a <strong>{email}</strong></label>
          <input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="12345678" className="code-input mono" autoFocus />
          <span className="settings-row">
            <button className="primary" disabled={busy || code.length < 6}><Icon name="log-in" /> {busy ? 'Comprobando…' : 'Entrar'}</button>
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
          <p className="muted small-text" aria-live="polite">{rich(STATUS[cloud.status])}</p>
          <button className="ghost" onClick={() => void signOut()}><Icon name="log-out" /> Cerrar sesión</button>
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

/** La partida de aquí y la de la nube cambiaron por separado (primer login o dos dispositivos a la vez): el jugador elige. */
export function ConflictDialog({ local, remote, onChoose }: { local: GameState; remote: RemoteSave; onChoose: (useRemote: boolean) => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-h">
      <div className="overlay-card">
        <h2 id="conflict-h">Tienes dos partidas</h2>
        <p>Esta partida y la de la nube cambiaron por separado. ¿Con cuál te quedas? La otra se sustituirá.</p>
        <div className="conflict-options">
          <button className="secondary" onClick={() => onChoose(true)}>
            <strong><Icon name="cloud" /> La de la nube</strong>
            <span className="muted small-text">{describe(remote.state)} · guardada {new Date(remote.updatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </button>
          <button className="secondary" onClick={() => onChoose(false)}>
            <strong><Icon name="laptop" /> La de este dispositivo</strong>
            <span className="muted small-text">{describe(local)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Entrada e invitado ----------

const GUEST_KEY = 'excelsior:guest';
export function loadGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveGuest(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignorado */
  }
}

/** Primera pantalla: entrar con email es lo principal; invitado, la alternativa. */
export function Welcome({ onGuest }: { onGuest: () => void }) {
  return (
    <main className="onboarding">
      <div className="onboarding-card">
        <p className="eyebrow">Life RPG</p>
        <h1 className="brand">Excelsior</h1>
        <p className="lede">Un RPG construido alrededor de tu vida real. Entra con tu email: te mandamos un código, sin contraseñas.</p>
        <LoginForm />
        <div className="or-divider" aria-hidden="true"><span>o</span></div>
        <button className="ghost" onClick={onGuest}>Entrar como invitado</button>
        <p className="fineprint">Como invitado tu partida se queda solo en este navegador y no tendrás funciones online (gremios, amigos…). Puedes crear tu cuenta más tarde sin perder nada.</p>
      </div>
    </main>
  );
}

/** Envuelve una función online: los invitados ven por qué necesitan cuenta y pueden crearla ahí mismo. */
export function RequireAccount({ feature, children }: { feature: string; children: ReactNode }) {
  const cloud = useCloud();
  if (!cloudEnabled || cloud.email) return <>{children}</>;
  return (
    <section className="panel require-account">
      <h3><Icon name="lock" /> Necesitas registrarte para {feature}</h3>
      <p className="hint">Es gratis y sin contraseña: escribe tu email y te mandamos un código. Tu partida actual se sube a tu cuenta.</p>
      <LoginForm />
    </section>
  );
}
