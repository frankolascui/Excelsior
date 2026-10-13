import { createRoot } from 'react-dom/client';
import App from './App';
import { IconDefs } from './icons';
import { applyTheme, loadTheme } from './theme';
import { installCheckPulse, installShine } from './shine';
import { installPressSfx } from './sfx';
import './styles.css';

applyTheme(loadTheme());
installShine();
installCheckPulse();
installPressSfx();
createRoot(document.getElementById('root')!).render(<><IconDefs /><App /></>);
