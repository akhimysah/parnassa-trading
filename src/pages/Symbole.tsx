import type { Etat } from '../types';
import { bourse } from '../symboles';
import { WidgetTradingView } from '../composants/WidgetTradingView';

interface Props {
  etat: Etat;
  ouvrirRecherche: () => void;
}

/** Fiche complète du symbole courant : infos, mini-graphique, analyse technique, actualités, fondamentaux, profil. */
export function Symbole({ etat, ouvrirRecherche }: Props) {
  const { symbole, theme } = etat;
  const b = bourse(symbole);
  const action = !['BINANCE', 'FX', 'TVC', 'CRYPTOCAP', 'SP', 'DJ', 'NYMEX', 'COMEX', 'XETR', 'FOREXCOM', 'INDEX', 'OANDA', 'CAPITALCOM'].includes(b);

  return (
    <div className="page defilable">
      <div className="carte info-symbole">
        <WidgetTradingView
          widget="symbol-info"
          config={{ symbol: symbole, width: '100%', locale: 'fr', colorTheme: theme, isTransparent: true }}
        />
        <button className="bouton-secondaire" onClick={ouvrirRecherche}>
          Changer de symbole
        </button>
      </div>

      <div className="grille-symbole">
        <div className="carte haute">
          <h3>Graphique</h3>
          <WidgetTradingView
            widget="symbol-overview"
            config={{
              symbols: [[symbole]],
              chartOnly: false,
              width: '100%',
              height: '100%',
              locale: 'fr',
              colorTheme: theme,
              autosize: true,
              showVolume: true,
              showMA: false,
              hideDateRanges: false,
              hideMarketStatus: false,
              hideSymbolLogo: false,
              scalePosition: 'right',
              scaleMode: 'Normal',
              fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
              fontSize: '10',
              noTimeScale: false,
              valuesTracking: '1',
              changeMode: 'price-and-percent',
              chartType: 'area',
              lineWidth: 2,
              lineType: 0,
              dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
              isTransparent: true,
            }}
          />
        </div>
        <div className="carte haute">
          <h3>Analyse technique</h3>
          <WidgetTradingView
            widget="technical-analysis"
            config={{
              interval: '1h',
              width: '100%',
              isTransparent: true,
              height: '100%',
              symbol: symbole,
              showIntervalTabs: true,
              displayMode: 'single',
              locale: 'fr',
              colorTheme: theme,
            }}
          />
        </div>
        <div className="carte haute">
          <h3>Actualités du symbole</h3>
          <WidgetTradingView
            widget="timeline"
            config={{
              feedMode: 'symbol',
              symbol: symbole,
              isTransparent: true,
              displayMode: 'regular',
              width: '100%',
              height: '100%',
              colorTheme: theme,
              locale: 'fr',
            }}
          />
        </div>
        {action && (
          <>
            <div className="carte haute">
              <h3>Données financières</h3>
              <WidgetTradingView
                widget="financials"
                config={{
                  isTransparent: true,
                  largeChartUrl: '',
                  displayMode: 'regular',
                  width: '100%',
                  height: '100%',
                  colorTheme: theme,
                  symbol: symbole,
                  locale: 'fr',
                }}
              />
            </div>
            <div className="carte haute">
              <h3>Profil de la société</h3>
              <WidgetTradingView
                widget="symbol-profile"
                config={{ width: '100%', height: '100%', isTransparent: true, colorTheme: theme, symbol: symbole, locale: 'fr' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
