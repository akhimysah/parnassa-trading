import type { Challenge, Etat, Operation } from './types';
import { reglesCompletes } from './challenge';

export interface Trophee {
  id: string;
  icone: string;
  nom: string;
  description: string;
  /** Rang d'affichage dans la vitrine (du plus simple au plus rare). */
  rang: number;
}

interface Contexte {
  clotures: Operation[];
  nets: number[];
  challenges: Challenge[];
  etat: Etat;
}

const serieMax = (nets: number[]) => {
  let max = 0;
  let suite = 0;
  for (const n of nets) {
    suite = n > 0 ? suite + 1 : 0;
    max = Math.max(max, suite);
  }
  return max;
};

/** Résultat réalisé de chaque jour, en % du capital de départ. */
const meilleurJourPct = (c: Contexte) => {
  const parJour = new Map<string, number>();
  c.clotures.forEach((o, i) => {
    const j = new Date(o.date).toDateString();
    parJour.set(j, (parJour.get(j) ?? 0) + c.nets[i]!);
  });
  const capital = c.etat.portefeuille.capitalInitial || 1;
  return Math.max(0, ...[...parJour.values()].map((v) => (v / capital) * 100));
};

const profitFactor = (nets: number[]) => {
  const g = nets.filter((n) => n > 0).reduce((s, n) => s + n, 0);
  const p = Math.abs(nets.filter((n) => n < 0).reduce((s, n) => s + n, 0));
  return p > 0 ? g / p : null;
};

const REGLES: (Trophee & { condition: (c: Contexte) => boolean })[] = [
  { id: 'premier-trade', icone: '🎯', nom: 'Premier trade', description: 'Clôturer un premier trade.', rang: 1, condition: (c) => c.clotures.length >= 1 },
  { id: 'premier-gain', icone: '💚', nom: 'Première victoire', description: 'Clôturer un trade gagnant.', rang: 2, condition: (c) => c.nets.some((n) => n > 0) },
  { id: 'serie-5', icone: '🔥', nom: 'En feu', description: '5 trades gagnants d’affilée.', rang: 3, condition: (c) => serieMax(c.nets) >= 5 },
  { id: 'cent-trades', icone: '💯', nom: 'Centurion', description: '100 trades clôturés.', rang: 4, condition: (c) => c.clotures.length >= 100 },
  { id: 'journee-1', icone: '☀️', nom: 'Belle journée', description: 'Finir une journée à +1 % du capital.', rang: 5, condition: (c) => meilleurJourPct(c) >= 1 },
  { id: 'journaliste', icone: '📝', nom: 'Journal tenu', description: 'Étiqueter 10 trades dans le journal.', rang: 6, condition: (c) => c.clotures.filter((o) => o.etiquettes?.length).length >= 10 },
  { id: 'gros-calibre', icone: '🐘', nom: 'Gros calibre', description: 'Ouvrir une position de 100 lots ou plus.', rang: 7, condition: (c) => c.etat.portefeuille.operations.some((o) => o.type === 'ouverture' && (o.lots ?? 0) >= 100) },
  { id: 'serie-10', icone: '⚡', nom: 'Intouchable', description: '10 trades gagnants d’affilée.', rang: 8, condition: (c) => serieMax(c.nets) >= 10 },
  { id: 'journee-5', icone: '🚀', nom: 'Journée de rêve', description: 'Finir une journée à +5 % du capital.', rang: 9, condition: (c) => meilleurJourPct(c) >= 5 },
  { id: 'profit-factor', icone: '⚖️', nom: 'Rentable', description: 'Profit factor au-dessus de 2 sur au moins 20 trades.', rang: 10, condition: (c) => c.nets.length >= 20 && (profitFactor(c.nets) ?? 0) > 2 },
  { id: 'challenge-reussi', icone: '🏆', nom: 'Challenger', description: 'Réussir un challenge prop firm.', rang: 11, condition: (c) => c.challenges.some((x) => x.statut === 'reussi') },
  { id: 'finance', icone: '💼', nom: 'Trader financé', description: 'Ouvrir un compte financé.', rang: 12, condition: (c) => c.challenges.some((x) => reglesCompletes(x.regles).finance) },
  { id: 'versement', icone: '💸', nom: 'Payé', description: 'Recevoir un premier versement de compte financé.', rang: 13, condition: (c) => c.challenges.some((x) => (x.versements?.length ?? 0) > 0) },
  { id: 'mille-trades', icone: '🏛️', nom: 'Vétéran', description: '1 000 trades clôturés.', rang: 14, condition: (c) => c.clotures.length >= 1000 },
  { id: 'baleine', icone: '🐋', nom: 'Baleine', description: 'Gagner 1 million de dollars sur un seul trade.', rang: 15, condition: (c) => c.nets.some((n) => n >= 1_000_000) },
  { id: 'crame', icone: '💀', nom: 'Cramé', description: 'Perdre 99 % du compte. Ça arrive aux meilleurs.', rang: 16, condition: (c) => Boolean(c.etat.portefeuille.crameLe) },
];

export const TROPHEES: Trophee[] = REGLES.map(({ condition: _c, ...t }) => t);

/** Trophées remplis par l'état actuel et pas encore débloqués. */
export function nouveauxTrophees(etat: Etat): Trophee[] {
  const deja = etat.trophees ?? {};
  const clotures = etat.portefeuille.operations.filter((o) => o.type === 'cloture' && o.resultat !== undefined).sort((a, b) => a.date - b.date);
  const contexte: Contexte = {
    clotures,
    nets: clotures.map((o) => (o.resultat ?? 0) - o.frais),
    challenges: [...(etat.challenge ? [etat.challenge] : []), ...(etat.challengesPasses ?? [])],
    etat,
  };
  return REGLES.filter((r) => !deja[r.id] && r.condition(contexte)).map(({ condition: _c, ...t }) => t);
}
