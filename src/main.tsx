import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { capturerJetonDepuisAdresse } from './synchro';
import { installerSuiviErreurs } from './erreurs';
import { BarriereErreur } from './composants/BarriereErreur';

installerSuiviErreurs();

// Retour de la page de consentement Parnassa : le jeton est pris dans l'adresse avant le premier affichage.
capturerJetonDepuisAdresse();

// Pas de StrictMode : il monterait chaque widget TradingView deux fois (double chargement d'iframes).
createRoot(document.getElementById('racine')!).render(
  <BarriereErreur>
    <App />
  </BarriereErreur>,
);

// Service worker uniquement en production : en développement il gênerait le rechargement à chaud.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Chargement réussi : une éventuelle recharge « nouvelle version » est terminée.
    try {
      sessionStorage.removeItem('parnassa-trading:recharge-version');
    } catch {
      // stockage indisponible
    }
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  });
}
