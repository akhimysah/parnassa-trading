import { useState } from 'react';
import type { Theme } from '../types';
import { WidgetTradingView } from '../composants/WidgetTradingView';

interface Props {
  theme: Theme;
}

const PAYS: { code: string; libelle: string }[] = [
  { code: 'fr', libelle: 'France' },
  { code: 'eu', libelle: 'Zone euro' },
  { code: 'de', libelle: 'Allemagne' },
  { code: 'gb', libelle: 'Royaume-Uni' },
  { code: 'us', libelle: 'États-Unis' },
  { code: 'ch', libelle: 'Suisse' },
  { code: 'jp', libelle: 'Japon' },
  { code: 'cn', libelle: 'Chine' },
  { code: 'ca', libelle: 'Canada' },
  { code: 'au', libelle: 'Australie' },
];

const IMPORTANCES: { valeur: string; libelle: string }[] = [
  { valeur: '-1,0,1', libelle: 'Toutes les annonces' },
  { valeur: '0,1', libelle: 'Importance moyenne et haute' },
  { valeur: '1', libelle: 'Haute importance seulement' },
];

export function Calendrier({ theme }: Props) {
  const [pays, setPays] = useState<string[]>(['fr', 'eu', 'de', 'gb', 'us']);
  const [importance, setImportance] = useState('0,1');

  const basculer = (code: string) =>
    setPays((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  return (
    <div className="page">
      <div className="onglets">
        {PAYS.map((p) => (
          <button key={p.code} className={pays.includes(p.code) ? 'actif' : ''} onClick={() => basculer(p.code)}>
            {p.libelle}
          </button>
        ))}
        <select className="selecteur" value={importance} onChange={(e) => setImportance(e.target.value)}>
          {IMPORTANCES.map((i) => (
            <option key={i.valeur} value={i.valeur}>
              {i.libelle}
            </option>
          ))}
        </select>
      </div>
      <div className="plein">
        <WidgetTradingView
          widget="events"
          caches={[{ coin: 'bas-droite', couleur: 'var(--fond)' }]}
          config={{
            colorTheme: theme,
            isTransparent: true,
            width: '100%',
            height: '100%',
            locale: 'fr',
            importanceFilter: importance,
            countryFilter: (pays.length ? pays : PAYS.map((p) => p.code)).join(','),
          }}
        />
      </div>
    </div>
  );
}
