// Página aparte para ajustar FSRS (Academy). El optimizador necesita una página «aislada» (COOP/COEP), y eso
// rompería en la app los vídeos de YouTube del sonido de fondo; por eso vive en /optimizar/ con su propio
// service worker, que solo controla esta carpeta. Usa la misma cuenta (misma web, misma sesión).
import { createRoot } from 'react-dom/client';
import { useCloud } from './cloud';
import { Tune } from './academy/ui/Tune';
import { DialogHost } from './academy/ui/Dialog';
import { Icon, IconDefs } from './icons';
import './styles.css';
import './academy/academy.css';
import './academy.css';

function Page() {
  const cloud = useCloud();
  return (
    <main className="acad optimizer-page">
      <a className="back-btn" href="../#academy/estadisticas"><Icon name="arrow-left" /> Volver a Excelsior</a>
      {!cloud.ready ? <p className="muted">Comprobando tu cuenta…</p>
        : cloud.userId ? <Tune />
          : <p>Entra con tu cuenta en Excelsior y vuelve a abrir esta página.</p>}
      <DialogHost />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<><IconDefs /><Page /></>);
