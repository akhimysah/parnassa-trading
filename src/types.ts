export type Theme = 'dark' | 'light';

export type Page = 'graphique' | 'marches' | 'screener' | 'symbole' | 'actualites' | 'calendrier' | 'alertes' | 'trading';

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
  /** En disposition multiple : changer de symbole change tous les graphiques. */
  lier: boolean;
  dispositionsSauvees: DispositionSauvee[];
  alertes: Alerte[];
  portefeuille: Portefeuille;
  parametres: Parametres;
}

export interface Parametres {
  /** Fuseau horaire des graphiques (identifiant IANA). */
  fuseau: string;
  /** Taux de frais simulé par ordre (0,001 = 0,1 %). */
  frais: number;
  /** Son lors du déclenchement d'une alerte ou d'une protection. */
  son: boolean;
  /** Mots-clés surveillés dans le fil d'actualités (alerte à chaque nouvelle dépêche correspondante). */
  motsCles: string[];
}

export type Sens = 'achat' | 'vente';

export interface Position {
  id: string;
  symbole: string;
  sens: Sens;
  quantite: number;
  prixEntree: number;
  /** Notionnel immobilisé à l'ouverture (quantité × prix). */
  cout: number;
  ouvertLe: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Note de journal : plan, raison d'entrée… */
  note?: string;
}

export interface OrdreEnAttente {
  id: string;
  symbole: string;
  sens: Sens;
  /** Limite : s'exécute à un prix plus favorable ; stop : s'exécute au franchissement. */
  type: 'limite' | 'stop';
  prix: number;
  montant: number;
  stopLoss?: number;
  takeProfit?: number;
  note?: string;
  creeLe: number;
}

export interface PointCapital {
  t: number;
  v: number;
}

export interface Operation {
  id: string;
  symbole: string;
  sens: Sens;
  type: 'ouverture' | 'cloture';
  /** Origine : marché, limite, stop, stop-loss, take-profit. */
  origine?: 'marche' | 'limite' | 'stop' | 'stop-loss' | 'take-profit';
  quantite: number;
  prix: number;
  frais: number;
  /** Résultat réalisé (clôtures uniquement). */
  resultat?: number;
  /** Prix d'entrée de la position fermée (clôtures). */
  prixEntree?: number;
  note?: string;
  date: number;
}

export interface Portefeuille {
  capitalInitial: number;
  solde: number;
  positions: Position[];
  operations: Operation[];
  ordres: OrdreEnAttente[];
  historiqueCapital: PointCapital[];
}

export interface DispositionSauvee {
  id: string;
  nom: string;
  creeLe: number;
  disposition: Disposition;
  emplacements: string[];
  symbole: string;
  intervalle: Intervalle;
  style: StyleGraphique;
  etudes: string[];
  comparaisons: string[];
}

export interface Alerte {
  id: string;
  /** Symbole Binance en notation TradingView, ex. "BINANCE:BTCUSDT". */
  symbole: string;
  condition: 'au-dessus' | 'en-dessous';
  seuil: number;
  note?: string;
  creeLe: number;
  /** Dernier prix observé : le déclenchement exige un franchissement du seuil. */
  dernierPrix?: number;
  declencheeLe?: number;
  prixDeclenchement?: number;
}
