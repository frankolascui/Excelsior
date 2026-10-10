import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, loadTheme } from './theme';
import { installCheckPulse, installShine } from './shine';
import './styles.css';

applyTheme(loadTheme());
installShine();
installCheckPulse();
createRoot(document.getElementById('root')!).render(<App />);
