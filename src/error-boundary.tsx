// Si una pantalla falla al dibujarse, React lo desmonta todo y queda la pantalla en negro.
// Esto lo recoge: enseña qué pasó y deja reintentar, sin perder la partida (vive en localStorage).
import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Un trozo de la app que no se pudo descargar (p. ej. tras publicar una versión nueva, o sin conexión). */
const chunkFailed = (e: Error) => /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i.test(e.message);
const RELOAD_KEY = 'excelsior:chunk-reload';

export class ErrorBoundary extends Component<{ children: ReactNode; label: string; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[${this.props.label}]`, error, info.componentStack);
    // Falta un trozo de la app: se recarga una vez sola para traer la versión buena.
    if (chunkFailed(error)) {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) !== '1') { sessionStorage.setItem(RELOAD_KEY, '1'); location.reload(); }
      } catch { /* sin almacenamiento: se queda el aviso */ }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="panel crash" role="alert" data-testid="crash">
        <h3>Algo ha fallado en {this.props.label}</h3>
        <p className="muted">Tu partida está a salvo. Prueba otra vez; si se repite, mándame este texto:</p>
        <pre className="crash-msg">{error.message || String(error)}</pre>
        <div className="row">
          <button type="button" className="primary" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Reintentar</button>
          <button type="button" className="ghost" onClick={() => location.reload()}>Recargar la página</button>
        </div>
      </section>
    );
  }
}
