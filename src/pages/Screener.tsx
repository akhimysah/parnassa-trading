import { useState } from 'react';
import type { Theme } from '../types';
import { WidgetTradingView } from '../composants/WidgetTradingView';

interface Props {
  theme: Theme;
}

type Marche = 'america' | 'france' | 'germany' | 'uk' | 'crypto' | 'forex';

const MARCHES: { id: Marche; libelle: string }[] = [
  { id: 'america', libelle: 'Actions US' },
  { id: 'france', libelle: 'Actions France' },
  { id: 'germany', libelle: 'Actions Allemagne' },
  { id: 'uk', libelle: 'Actions Royaume-Uni' },
  { id: 'crypto', libelle: 'Crypto' },
  { id: 'forex', libelle: 'Forex' },
];

const ECRANS: { id: string; libelle: string }[] = [
  { id: 'general', libelle: 'Général' },
  { id: 'top_gainers', libelle: 'Plus fortes hausses' },
  { id: 'top_losers', libelle: 'Plus fortes baisses' },
  { id: 'most_active', libelle: 'Plus actifs' },
  { id: 'ath', libelle: 'Plus haut historique' },
  { id: 'atl', libelle: 'Plus bas historique' },
  { id: 'above_52wk_high', libelle: 'Au-dessus du plus haut 52 sem.' },
  { id: 'below_52wk_low', libelle: 'Sous le plus bas 52 sem.' },
  { id: 'high_dividend', libelle: 'Dividendes élevés' },
];

const COLONNES: { id: string; libelle: string }[] = [
  { id: 'overview', libelle: "Vue d'ensemble" },
  { id: 'performance', libelle: 'Performance' },
  { id: 'oscillators', libelle: 'Oscillateurs' },
  { id: 'moving_averages', libelle: 'Moyennes mobiles' },
  { id: 'valuation', libelle: 'Valorisation' },
  { id: 'dividends', libelle: 'Dividendes' },
];

export function Screener({ theme }: Props) {
  const [marche, setMarche] = useState<Marche>('america');
  const [ecran, setEcran] = useState('general');
  const [colonne, setColonne] = useState('overview');
  const actions = marche !== 'crypto' && marche !== 'forex';

  return (
    <div className="page">
      <div className="onglets">
        {MARCHES.map((m) => (
          <button key={m.id} className={marche === m.id ? 'actif' : ''} onClick={() => setMarche(m.id)}>
            {m.libelle}
          </button>
        ))}
        {actions && (
          <div className="outils-onglets">
            <select className="selecteur" value={ecran} onChange={(e) => setEcran(e.target.value)} title="Filtre prédéfini">
              {ECRANS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                </option>
              ))}
            </select>
            <select className="selecteur" value={colonne} onChange={(e) => setColonne(e.target.value)} title="Jeu de colonnes">
              {COLONNES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="plein">
        {actions && (
          <WidgetTradingView
            widget="screener"
            config={{
              width: '100%',
              height: '100%',
              defaultColumn: colonne,
              defaultScreen: ecran,
              market: marche,
              showToolbar: true,
              colorTheme: theme,
              locale: 'fr',
              isTransparent: true,
            }}
          />
        )}
        {marche === 'crypto' && (
          <WidgetTradingView
            widget="screener"
            config={{
              width: '100%',
              height: '100%',
              defaultColumn: 'overview',
              screener_type: 'crypto_mkt',
              displayCurrency: 'USD',
              colorTheme: theme,
              locale: 'fr',
              isTransparent: true,
            }}
          />
        )}
        {marche === 'forex' && (
          <WidgetTradingView
            widget="screener"
            config={{
              width: '100%',
              height: '100%',
              defaultColumn: 'overview',
              defaultScreen: 'general',
              market: 'forex',
              showToolbar: true,
              colorTheme: theme,
              locale: 'fr',
              isTransparent: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
