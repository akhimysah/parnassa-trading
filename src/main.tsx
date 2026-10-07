import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Pas de StrictMode : il monterait chaque widget TradingView deux fois (double chargement d'iframes).
createRoot(document.getElementById('racine')!).render(<App />);

// Service worker uniquement en production : en développement il gênerait le rechargement à chaud.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  });
}
