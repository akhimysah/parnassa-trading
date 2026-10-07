export type Theme = 'dark' | 'light';

export type Page = 'accueil' | 'graphique' | 'marches' | 'screener' | 'symbole' | 'actualites' | 'calendrier' | 'alertes' | 'trading';

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
  /** Challenge façon prop firm en cours (ou terminé, en attente d'un nouveau départ). */
  challenge: Challenge | null;
  /** Portefeuille mis de côté pendant le challenge, restauré à la sortie du mode challenge. */
  portefeuilleHorsChallenge: Portefeuille | null;
  challengesPasses: Challenge[];
  /** Événements du calendrier pour lesquels l'utilisateur a demandé un rappel. */
  rappels: Rappel[];
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
  /** Langue d'affichage des dépêches : tout en français, tout en anglais, ou les deux. */
  langueActualites: 'fr' | 'en' | 'fr+en';
  /** Lecture vocale des nouvelles dépêches, façon « squawk » de salle de marché. */
  squawk: { actif: boolean; filtre: 'annonces' | 'importantes' | 'tout'; vitesse: number };
  /** Rappels : délai avant l'événement, et rappel automatique des annonces à fort impact. */
  rappels: { delaiMinutes: number; fortImpactAuto: boolean };
  /** Notifications push (application fermée) : actives sur cet appareil, et annonces à recevoir. */
  push: { actif: boolean; annonces: 'aucune' | 'importantes' | 'toutes' };
  /** Effet de levier du compte papier (1 = sans levier, 100 = 1:100). */
  levier: number;
}

export interface ReglesChallenge {
  formule: string;
  capital: number;
  /** Objectif de profit, en % du capital. */
  objectifPct: number;
  /** Perte maximale sur une journée, en % du capital. */
  perteJourPct: number;
  /** Perte maximale totale, en % du capital. */
  perteMaxPct: number;
  joursMin: number;
}

export interface Challenge {
  id: string;
  regles: ReglesChallenge;
  debutLe: number;
  statut: 'en-cours' | 'reussi' | 'echoue';
  raison?: string;
  finLe?: number;
  /** Fonds propres au début de la journée (référence de la perte journalière). */
  jour: { date: string; capitalDebut: number };
  plusBas: number;
  plusHaut: number;
  capitalFin?: number;
}

export interface Rappel {
  id: string;
  titre: string;
  titreFr?: string;
  pays: string;
  date: number;
}

export type Sens = 'achat' | 'vente';

export interface Position {
  id: string;
  symbole: string;
  sens: Sens;
  /** Unités de l'actif (lots × taille du contrat). */
  quantite: number;
  prixEntree: number;
  /** Marge immobilisée en USD (notionnel ÷ levier ; notionnel complet pour les anciennes positions sans levier). */
  cout: number;
  /** Volume en lots (absent sur les positions ouvertes avant le passage aux lots). */
  lots?: number;
  levier?: number;
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
  /** Ancien format (montant en USDT) ; les nouveaux ordres utilisent `lots` et `levier`. */
  montant?: number;
  lots?: number;
  levier?: number;
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
  origine?: 'marche' | 'limite' | 'stop' | 'stop-loss' | 'take-profit' | 'stop-out' | 'crame';
  quantite: number;
  lots?: number;
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
  /** Compte « cramé » : 99 % du capital de départ perdu. Positions fermées, plus aucun ordre jusqu'à la remise à zéro. */
  crameLe?: number;
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
  /** Prix au moment de la création : sert au relais push pour détecter le franchissement. */
  prixReference?: number;
  declencheeLe?: number;
  prixDeclenchement?: number;
}
