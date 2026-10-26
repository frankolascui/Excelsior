import { createRoot } from 'react-dom/client';
import App from './App';
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
createRoot(document.getElementById('root')!).render(<><IconDefs /><App /></>);
