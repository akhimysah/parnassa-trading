import { useEffect, useRef, type CSSProperties } from 'react';
import { URL_SITE } from '../site';

interface Props {
  /** Nom du widget libre-service TradingView, ex. "advanced-chart", "ticker-tape", "screener". */
  widget: string;
  config: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
}

/**
 * Intègre un widget officiel TradingView.
 * Le script est réinjecté à chaque changement de configuration : c'est le seul moyen
 * de changer de symbole, de thème ou d'intervalle sur un widget déjà monté.
 */
export function WidgetTradingView({ widget, config, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Tout clic sur un symbole dans un widget ouvre ce symbole ici plutôt que sur tradingview.com.
  const configComplete = { largeChartUrl: URL_SITE, symbolUrl: URL_SITE, ...config };
  const cle = widget + JSON.stringify(configComplete);

  useEffect(() => {
    const conteneur = ref.current;
    if (!conteneur) return;

    // Chaque montage a son propre enveloppeur : le script TradingView cherche
    // « .tradingview-widget-container__widget » dans son parent direct.
    const enveloppe = document.createElement('div');
    enveloppe.className = 'tradingview-widget-container';
    enveloppe.style.height = '100%';
    enveloppe.style.width = '100%';

    const interne = document.createElement('div');
    interne.className = 'tradingview-widget-container__widget';
    interne.style.height = '100%';
    interne.style.width = '100%';
    enveloppe.appendChild(interne);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
    script.innerHTML = JSON.stringify(configComplete);
    let charge = false;
    const marquer = () => {
      charge = true;
    };
    script.addEventListener('load', marquer);
    script.addEventListener('error', marquer);
    enveloppe.appendChild(script);
    conteneur.appendChild(enveloppe);

    return () => {
      // Si le script n'a pas encore tourné, on cache l'enveloppe et on la retire
      // seulement après son exécution : sinon il plante (parent introuvable).
      if (charge) enveloppe.remove();
      else {
        enveloppe.style.display = 'none';
        const retirer = () => enveloppe.remove();
        script.addEventListener('load', retirer);
        script.addEventListener('error', retirer);
      }
    };
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      className={`tradingview-widget-container ${className ?? ''}`}
      style={{ height: '100%', width: '100%', ...style }}
    />
  );
}
