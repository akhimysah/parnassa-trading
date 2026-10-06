import { useState } from 'react';
import type { Theme } from '../types';
import { WidgetTradingView } from '../composants/WidgetTradingView';

interface Props {
  theme: Theme;
}

type Onglet = 'apercu' | 'heatmap-actions' | 'heatmap-crypto' | 'heatmap-forex' | 'taux-croises';

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'apercu', libelle: "Vue d'ensemble" },
  { id: 'heatmap-actions', libelle: 'Heatmap actions' },
  { id: 'heatmap-crypto', libelle: 'Heatmap crypto' },
  { id: 'heatmap-forex', libelle: 'Heatmap forex' },
  { id: 'taux-croises', libelle: 'Taux croisés' },
];

const INDICES_HEATMAP = [
  { valeur: 'SPX500', libelle: 'S&P 500' },
  { valeur: 'NASDAQ100', libelle: 'Nasdaq 100' },
  { valeur: 'DJDJI', libelle: 'Dow Jones' },
  { valeur: 'CAC40', libelle: 'CAC 40' },
  { valeur: 'DAX', libelle: 'DAX' },
  { valeur: 'UK100', libelle: 'FTSE 100' },
];

export function Marches({ theme }: Props) {
  const [onglet, setOnglet] = useState<Onglet>('apercu');
  const [indice, setIndice] = useState('SPX500');

  return (
    <div className="page">
      <div className="onglets">
        {ONGLETS.map((o) => (
          <button key={o.id} className={onglet === o.id ? 'actif' : ''} onClick={() => setOnglet(o.id)}>
            {o.libelle}
          </button>
        ))}
        {onglet === 'heatmap-actions' && (
          <select className="selecteur" value={indice} onChange={(e) => setIndice(e.target.value)}>
            {INDICES_HEATMAP.map((i) => (
              <option key={i.valeur} value={i.valeur}>
                {i.libelle}
              </option>
            ))}
          </select>
        )}
      </div>

      {onglet === 'apercu' && (
        <div className="grille-apercu">
          <div className="carte">
            <WidgetTradingView
              widget="market-overview"
              config={{
                colorTheme: theme,
                dateRange: '12M',
                showChart: true,
                locale: 'fr',
                width: '100%',
                height: '100%',
                largeChartUrl: '',
                isTransparent: true,
                showSymbolLogo: true,
                showFloatingTooltip: true,
                tabs: [
                  {
                    title: 'Indices',
                    symbols: [
                      { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
                      { s: 'FOREXCOM:NSXUSD', d: 'Nasdaq 100' },
                      { s: 'FOREXCOM:DJI', d: 'Dow Jones' },
                      { s: 'INDEX:CAC40', d: 'CAC 40' },
                      { s: 'INDEX:DEU40', d: 'DAX' },
                      { s: 'INDEX:NKY', d: 'Nikkei 225' },
                    ],
                    originalTitle: 'Indices',
                  },
                  {
                    title: 'Crypto',
                    symbols: [
                      { s: 'BINANCE:BTCUSDT', d: 'Bitcoin' },
                      { s: 'BINANCE:ETHUSDT', d: 'Ethereum' },
                      { s: 'BINANCE:SOLUSDT', d: 'Solana' },
                      { s: 'BINANCE:BNBUSDT', d: 'BNB' },
                      { s: 'BINANCE:XRPUSDT', d: 'XRP' },
                      { s: 'CRYPTOCAP:TOTAL', d: 'Capitalisation totale' },
                    ],
                    originalTitle: 'Crypto',
                  },
                  {
                    title: 'Forex',
                    symbols: [
                      { s: 'FX:EURUSD', d: 'EUR / USD' },
                      { s: 'FX:GBPUSD', d: 'GBP / USD' },
                      { s: 'FX:USDJPY', d: 'USD / JPY' },
                      { s: 'FX:EURGBP', d: 'EUR / GBP' },
                      { s: 'FX:USDCHF', d: 'USD / CHF' },
                      { s: 'TVC:DXY', d: 'Indice dollar' },
                    ],
                    originalTitle: 'Forex',
                  },
                  {
                    title: 'Matières',
                    symbols: [
                      { s: 'TVC:GOLD', d: 'Or' },
                      { s: 'TVC:SILVER', d: 'Argent' },
                      { s: 'TVC:USOIL', d: 'Pétrole WTI' },
                      { s: 'TVC:UKOIL', d: 'Pétrole Brent' },
                      { s: 'NYMEX:NG1!', d: 'Gaz naturel' },
                      { s: 'COMEX:HG1!', d: 'Cuivre' },
                    ],
                    originalTitle: 'Matières',
                  },
                ],
              }}
            />
          </div>
          <div className="carte">
            <WidgetTradingView
              widget="hotlists"
              config={{
                colorTheme: theme,
                dateRange: '12M',
                exchange: 'US',
                showChart: true,
                locale: 'fr',
                width: '100%',
                height: '100%',
                largeChartUrl: '',
                isTransparent: true,
                showSymbolLogo: true,
                showFloatingTooltip: true,
              }}
            />
          </div>
        </div>
      )}

      {onglet === 'heatmap-actions' && (
        <div className="plein">
          <WidgetTradingView
            widget="stock-heatmap"
            config={{
              exchanges: [],
              dataSource: indice,
              grouping: 'sector',
              blockSize: 'market_cap_basic',
              blockColor: 'change',
              locale: 'fr',
              symbolUrl: '',
              colorTheme: theme,
              hasTopBar: true,
              isDataSetEnabled: true,
              isZoomEnabled: true,
              hasSymbolTooltip: true,
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      )}

      {onglet === 'heatmap-crypto' && (
        <div className="plein">
          <WidgetTradingView
            widget="crypto-coins-heatmap"
            config={{
              dataSource: 'Crypto',
              blockSize: 'market_cap_calc',
              blockColor: '24h_close_change|5',
              locale: 'fr',
              symbolUrl: '',
              colorTheme: theme,
              hasTopBar: true,
              isDataSetEnabled: true,
              isZoomEnabled: true,
              hasSymbolTooltip: true,
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      )}

      {onglet === 'heatmap-forex' && (
        <div className="plein">
          <WidgetTradingView
            widget="forex-heat-map"
            config={{
              width: '100%',
              height: '100%',
              currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY'],
              isTransparent: true,
              colorTheme: theme,
              locale: 'fr',
            }}
          />
        </div>
      )}

      {onglet === 'taux-croises' && (
        <div className="plein">
          <WidgetTradingView
            widget="forex-cross-rates"
            config={{
              width: '100%',
              height: '100%',
              currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY'],
              isTransparent: true,
              colorTheme: theme,
              locale: 'fr',
            }}
          />
        </div>
      )}
    </div>
  );
}
