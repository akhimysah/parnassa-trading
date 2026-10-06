import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Pas de StrictMode : il monterait chaque widget TradingView deux fois (double chargement d'iframes).
createRoot(document.getElementById('racine')!).render(<App />);
