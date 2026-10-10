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
  /** Trophées débloqués : identifiant → date du déblocage. */
  trophees?: Record<string, number>;
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
  /** Volume maximal d'un ordre, en lots (500 par défaut). */
  volumeMax?: number;
  /** Garde-fous personnels de la journée, pour tout compte. */
  discipline?: ReglesDiscipline;
  /** Trading en un clic sur la page Graphique : affiché ou replié, et volume de chaque clic. */
  unClic?: {
    actif: boolean;
    lots: number;
    /** Protections posées sur chaque ordre en un clic, en distance de prix depuis l'entrée. */
    protections?: { actif: boolean; sl?: number; tp?: number; suiveur?: number };
    /** Volume calculé pour risquer ce % des fonds propres au stop-loss (au lieu d'un nombre de lots). */
    risquePct?: number;
    modeRisque?: boolean;
  };
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
  /** Perte maximale suiveuse : la limite suit le plus haut des fonds propres, puis se bloque au capital de départ. */
  suiveuse?: boolean;
  /** Règle de régularité : le meilleur jour ne doit pas dépasser ce % du profit total pour valider. */
  regularitePct?: number;
  /** Règle des news : pas d'ouverture de position N minutes avant et après une annonce à fort impact. */
  newsMinutes?: number;
  /** Compte financé : plus d'objectif, les profits se retirent par versements. */
  finance?: boolean;
  /** Part des profits versée au trader (en %), sur un compte financé. */
  partage?: number;
  /** Positions hors crypto fermées le vendredi soir, ouvertures bloquées jusqu'au dimanche soir. */
  fermetureWeekend?: boolean;
}

export interface Versement {
  date: number;
  /** Profit retiré du compte. */
  profit: number;
  /** Part versée au trader. */
  montant: number;
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
  /** Versements demandés sur un compte financé. */
  versements?: Versement[];
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
  /** Stop suiveur : distance (en prix) que le stop-loss garde derrière le meilleur prix atteint. */
  suiveur?: number;
  /** Prises de profit partielles : à chaque prix, une part du volume de départ est fermée. */
  paliers?: Palier[];
  /** Volume (unités) de référence des paliers, fixé quand ils sont posés. */
  quantiteInitiale?: number;
  /** Stop-loss au prix d'entrée dès le premier palier atteint. */
  beApresPalier?: boolean;
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
  /** Ordres liés (OCO) : le premier déclenché annule les autres du même groupe. */
  groupeOco?: string;
  /** Date d'expiration : l'ordre est annulé s'il n'est pas déclenché avant. */
  expireLe?: number;
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
  origine?: 'marche' | 'limite' | 'stop' | 'stop-loss' | 'take-profit' | 'stop-out' | 'crame' | 'weekend';
  quantite: number;
  lots?: number;
  prix: number;
  frais: number;
  /** Résultat réalisé (clôtures uniquement). */
  resultat?: number;
  /** Prix d'entrée de la position fermée (clôtures). */
  prixEntree?: number;
  note?: string;
  /** Étiquettes de journal : setup (cassure, rebond…) et état d'esprit (plan respecté, FOMO…). */
  etiquettes?: string[];
  date: number;
}

export interface Portefeuille {
  capitalInitial: number;
  solde: number;
  positions: Position[];
  operations: Operation[];
  ordres: OrdreEnAttente[];
  historiqueCapital: PointCapital[];
  /** Discipline du jour : fonds propres au début de la journée et blocage éventuel jusqu'au lendemain. */
  journee?: { date: string; capitalDebut: number; bloque?: { raison: string; depuis: number; /** Limite du mois : bloqué jusqu'au mois suivant. */ mois?: boolean } };
  /** Opérations anciennes résumées pour garder l'état léger : nombre, résultat et frais cumulés. */
  archive?: { operations: number; clotures: number; resultat: number; frais: number; jusquAu: number };
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

export interface ReglesDiscipline {
  actif: boolean;
  /** Perte du jour (en % des fonds propres du matin) qui arrête le trading jusqu'au lendemain. */
  perteJourPct?: number;
  /** Gain du jour (en %) qui verrouille la journée. */
  objectifJourPct?: number;
  /** Nombre maximal de positions ouvertes dans la journée. */
  tradesMax?: number;
  /** Perte du mois (en % des fonds propres du début du mois) qui arrête le trading jusqu'au mois suivant. */
  perteMoisPct?: number;
  /** Gain visé sur le mois (en %), suivi sans blocage. */
  objectifMoisPct?: number;
  /** Tout ordre doit porter un stop-loss (et on ne peut plus le retirer). */
  stopObligatoire?: boolean;
  /** Perte maximale au stop-loss d'une position ou d'un ordre, en % des fonds propres. */
  risqueTradePct?: number;
  /** Minutes sans nouvelle ouverture après un trade perdant (anti-revanche). */
  pauseApresPerteMin?: number;
  /** Pertes d'affilée dans la journée qui arrêtent le trading jusqu'au lendemain. */
  pertesConsecutivesMax?: number;
  /** Fermer les positions quand la perte ou l'objectif du jour est atteint. */
  fermerAuto: boolean;
  /** Fermer les positions hors crypto avant le week-end et bloquer les ouvertures jusqu'au dimanche soir. */
  fermetureWeekend?: boolean;
}

export interface Palier {
  prix: number;
  /** Part du volume de départ à fermer (0,5 = 50 %). */
  part: number;
  fait?: boolean;
}
