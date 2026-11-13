import { useEffect, useState } from 'react';
import { default_w } from 'ts-fsrs';
import { countReviews, getSettings, listAllReviews, saveFsrsParams, type Settings } from '../study/api';
import { isolationState, onOptimizerPage, OPTIMIZER_URL, prepareIsolation } from '../study/isolation';
import { MIN_REVIEWS, minuteOffset, toAnkiRevlog, validParams } from '../study/optimize';
import { routeToHash } from '../study/logic';
import { formatInterval, setUserParams } from '../study/srs';
import { sfx } from '../sfx';
import { Icon } from './Icon';

const DAY = 86_400_000;
const GRADE_NAMES = ['Otra vez', 'Difícil', 'Bien', 'Fácil'];

/**
 * Fase E: ajustar FSRS a tu memoria con el optimizador oficial (fsrs-rs, el de Anki) en tu navegador.
 * Los 4 primeros parámetros son la estabilidad inicial de una tarjeta nueva según el botón que pulses:
 * es la parte más fácil de entender, así que es la que enseñamos para comparar.
 */
export function Tune() {
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [count, setCount] = useState<number | null>(null);
  const [state, setState] = useState(isolationState());
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ params: number[]; reviews: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    countReviews().then(setCount).catch((e) => setError(e.message));
  }, []);

  const custom = validParams(settings?.fsrs_params) ? settings!.fsrs_params! : null;

  async function run() {
    setError(null); setResult(null);
    try {
      setBusy('Descargando tu historial…');
      const reviews = await listAllReviews();
      setBusy(`Calculando con ${reviews.length} respuestas…`);
      const params = await optimize(reviews);
      setResult({ params, reviews: reviews.length });
      sfx.reward();
    } catch (e) { setError((e as Error).message); sfx.error(); }
    finally { setBusy(null); }
  }

  async function apply(params: number[] | null, reviews: number | null) {
    try {
      await saveFsrsParams(params, reviews);
      setUserParams(params);
      setSettings({ fsrs_params: params, params_reviews: reviews, optimized_at: params ? new Date().toISOString() : null });
      setResult(null);
      sfx.saved();
    } catch (e) {
      const msg = (e as Error).message;
      setError(/study_settings/.test(msg) ? 'Falta crear la tabla de ajustes: ejecuta supabase/07-ajuste-fsrs.sql en el SQL Editor de Supabase.' : msg);
      sfx.error();
    }
  }

  return (
    <section className="stack tune">
      <nav className="crumbs">
        <a className="back-btn" href={(onOptimizerPage() ? '../' : '') + routeToHash({ view: 'estadisticas' })} onClick={() => sfx.page()}><Icon name="left" size={16} /> Estadísticas</a>
      </nav>
      <div>
        <p className="eyebrow">Fase E</p>
        <h1 className="section-title">Ajustar FSRS a tu memoria</h1>
      </div>
      <div className="panel tune-intro">
        <p>FSRS empieza con unos parámetros medios, calculados con los historiales de miles de usuarios de Anki. Con tu historial puede calcular los <strong>tuyos</strong>: cuánto te dura una tarjeta nueva, cuánto te cuesta recuperar lo que fallas… Así te pregunta cada tarjeta más cerca del momento justo.</p>
        <p className="muted small">Usa el optimizador oficial de FSRS (el mismo que Anki), dentro de tu navegador: tus datos no salen de aquí. Los parámetros nuevos se aplican a partir de tu próxima respuesta; no recalculan lo que ya has repasado.</p>
        <p className="tune-status">
          {settings === undefined ? 'Comprobando…' : custom
            ? <>Ahora usas <strong>tus parámetros</strong>{settings?.optimized_at && <>, ajustados el {new Date(settings.optimized_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} con {settings.params_reviews} respuestas</>}.</>
            : <>Ahora usas los <strong>parámetros por defecto</strong>.</>}
        </p>
      </div>

      {count !== null && count < MIN_REVIEWS && (
        <div className="panel tune-wait">
          <p><strong>Aún es pronto.</strong> Tienes {count} respuestas; con menos de {MIN_REVIEWS} el ajuste sale poco fiable (es un límite prudente). Sigue repasando y vuelve más adelante.</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={MIN_REVIEWS} aria-valuenow={count} aria-label="Respuestas acumuladas">
            <span style={{ width: `${Math.min(100, (count / MIN_REVIEWS) * 100)}%` }} />
          </div>
          <p className="muted small">{count} / {MIN_REVIEWS}</p>
        </div>
      )}

      {count !== null && count >= MIN_REVIEWS && !result && (
        state === 'listo' ? (
          <button className="primary big tune-go" disabled={!!busy} onClick={run}><Icon name="sparkles" /> {busy ?? 'Ajustar ahora'}</button>
        ) : state === 'otra-pagina' ? (
          <div className="panel tune-wait">
            <p>El cálculo se hace en una página aparte, para no interrumpir el sonido de fondo de Deep Work. Tu cuenta es la misma.</p>
            <a className="button primary" href={OPTIMIZER_URL} onClick={() => sfx.open()}>Abrir el optimizador</a>
          </div>
        ) : state === 'preparar' ? (
          <div className="panel tune-wait">
            <p>Para calcular, el navegador necesita un modo especial (varios hilos de cálculo). Pulsa el botón: la página se recargará una vez.</p>
            <button className="primary" onClick={() => { setBusy('Preparando…'); prepareIsolation().catch((e) => { setError(String(e)); setState('no-compatible'); }); }}>{busy ?? 'Preparar el navegador'}</button>
          </div>
        ) : (
          <p className="error">Este navegador no permite el cálculo (pasa en Safari y en el iPhone). Ábrelo en Chrome, Edge o Firefox en el ordenador.</p>
        )
      )}

      {result && (
        <div className="panel tune-result">
          <h2 className="block-title">Resultado</h2>
          <p className="muted small">Cuánto tarda en volver una tarjeta nueva según el primer botón que pulses (estabilidad inicial).</p>
          <table className="tune-table">
            <thead><tr><th>Primer botón</th><th>Por defecto</th><th>Tú</th></tr></thead>
            <tbody>
              {GRADE_NAMES.map((g, i) => (
                <tr key={g}><td>{g}</td><td>{formatInterval(default_w[i] * DAY)}</td><td><strong>{formatInterval(result.params[i] * DAY)}</strong></td></tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="primary" onClick={() => apply(result.params, result.reviews)}><Icon name="check" /> Usar mis parámetros</button>
            <button className="ghost" onClick={() => setResult(null)}>Descartar</button>
          </div>
        </div>
      )}

      {custom && !result && <button className="link" onClick={() => apply(null, null)}>Volver a los parámetros por defecto</button>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Lanza el optimizador en un Worker y espera los 21 parámetros. */
function optimize(reviews: Parameters<typeof toAnkiRevlog>[0]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../study/optimizer.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ ok: boolean; params?: number[]; error?: string }>) => {
      w.terminate();
      if (e.data.ok && validParams(e.data.params)) resolve(e.data.params);
      else reject(new Error(`El optimizador no ha podido calcular: ${e.data.error ?? 'resultado no válido'}`));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(`El optimizador ha fallado: ${e.message}`)); };
    w.postMessage({ ...toAnkiRevlog(reviews), offset: minuteOffset() });
  });
}
