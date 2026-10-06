export type Theme = 'dark' | 'light';

export type Page = 'graphique' | 'marches' | 'screener' | 'symbole' | 'actualites' | 'calendrier';

/** Intervalle au format attendu par le widget TradingView. */
export type Intervalle = '1' | '5' | '15' | '60' | '240' | 'D' | 'W';

/** Style de graphique du widget TradingView (1 = bougies, 8 = Heikin Ashi, 2 = ligne, 3 = aire, 0 = barres, 9 = bougies creuses). */
export type StyleGraphique = '1' | '9' | '0' | '8' | '2' | '3';

export type Disposition = 1 | 2 | 4;

export interface Symbole {
  /** Notation TradingView, ex. "BINANCE:BTCUSDT", "NASDAQ:AAPL", "EURONEXT:MC". */
  id: string;
  nom: string;
  categorie: 'crypto' | 'actions-us' | 'actions-fr' | 'indices' | 'forex' | 'matieres';
}

export interface Etat {
  page: Page;
  theme: Theme;
  symbole: string;
  intervalle: Intervalle;
  style: StyleGraphique;
  disposition: Disposition;
  /** Symboles affichés dans la disposition multi-graphiques (4 emplacements). */
  emplacements: string[];
  listeSuivi: string[];
  etudes: string[];
  panneauDroit: boolean;
  /** Symboles superposés au graphique principal (comparaison). */
  comparaisons: string[];
}
