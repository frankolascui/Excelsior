import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './error-boundary';
import { IconDefs } from './icons';
import { applyTheme, loadTheme } from './theme';
import { installCheckPulse, installShine } from './shine';
import { installDoneFeedback } from './motion';
import './styles.css';
import './motion.css';

applyTheme(loadTheme());
installShine();
installCheckPulse();
installDoneFeedback();
createRoot(document.getElementById('root')!).render(<><IconDefs /><ErrorBoundary label="la app"><App /></ErrorBoundary></>);

// Si la app arrancó bien, se permite otra recarga automática la próxima vez que falte un trozo.
setTimeout(() => { try { sessionStorage.removeItem('excelsior:chunk-reload'); } catch { /* nada */ } }, 10_000);
