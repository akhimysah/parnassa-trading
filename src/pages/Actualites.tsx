import { useState } from 'react';
import type { Etat } from '../types';
import { nomSymbole } from '../symboles';
import { WidgetTradingView } from '../composants/WidgetTradingView';

interface Props {
  etat: Etat;
}

type Flux = 'symbole' | 'all_symbols' | 'crypto' | 'stock' | 'forex' | 'index' | 'futures';

const FLUX: { id: Flux; libelle: string }[] = [
  { id: 'symbole', libelle: 'Symbole courant' },
  { id: 'all_symbols', libelle: 'Tous les marchés' },
  { id: 'stock', libelle: 'Actions' },
  { id: 'crypto', libelle: 'Crypto' },
  { id: 'forex', libelle: 'Forex' },
  { id: 'index', libelle: 'Indices' },
  { id: 'futures', libelle: 'Futures' },
];

export function Actualites({ etat }: Props) {
  const [flux, setFlux] = useState<Flux>('all_symbols');

  const config: Record<string, unknown> = {
    isTransparent: true,
    displayMode: 'regular',
    width: '100%',
    height: '100%',
    colorTheme: etat.theme,
    locale: 'fr',
  };
  if (flux === 'symbole') {
    config.feedMode = 'symbol';
    config.symbol = etat.symbole;
  } else if (flux === 'all_symbols') {
    config.feedMode = 'all_symbols';
  } else {
    config.feedMode = 'market';
    config.market = flux;
  }

  return (
    <div className="page">
      <div className="onglets">
        {FLUX.map((f) => (
          <button key={f.id} className={flux === f.id ? 'actif' : ''} onClick={() => setFlux(f.id)}>
            {f.id === 'symbole' ? `${nomSymbole(etat.symbole)}` : f.libelle}
          </button>
        ))}
      </div>
      <div className="plein">
        <WidgetTradingView widget="timeline" config={config} />
      </div>
    </div>
  );
}
