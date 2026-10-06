import type { Page } from '../types';
import {
  IconeActualites,
  IconeCalendrier,
  IconeCloche,
  IconeGraphique,
  IconeMarches,
  IconeScreener,
  IconeSymbole,
} from './Icones';

interface Props {
  page: Page;
  changer: (p: Page) => void;
}

const ENTREES: { page: Page; libelle: string; Icone: typeof IconeGraphique }[] = [
  { page: 'graphique', libelle: 'Graphique', Icone: IconeGraphique },
  { page: 'marches', libelle: 'Marchés', Icone: IconeMarches },
  { page: 'screener', libelle: 'Screener', Icone: IconeScreener },
  { page: 'symbole', libelle: 'Symbole', Icone: IconeSymbole },
  { page: 'actualites', libelle: 'Actualités', Icone: IconeActualites },
  { page: 'calendrier', libelle: 'Calendrier', Icone: IconeCalendrier },
  { page: 'alertes', libelle: 'Alertes', Icone: IconeCloche },
];

export function RailGauche({ page, changer }: Props) {
  return (
    <nav className="rail-gauche" aria-label="Sections">
      {ENTREES.map(({ page: p, libelle, Icone }) => (
        <button
          key={p}
          className={page === p ? 'actif' : ''}
          onClick={() => changer(p)}
          aria-current={page === p ? 'page' : undefined}
        >
          <Icone width={22} height={22} />
          <span>{libelle}</span>
        </button>
      ))}
    </nav>
  );
}
