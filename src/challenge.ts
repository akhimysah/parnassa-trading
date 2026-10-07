import type { Challenge, Operation, ReglesChallenge } from './types';

type ReglesFormule = Omit<ReglesChallenge, 'capital' | 'formule'>;

export const FORMULES: { id: string; nom: string; description: string; regles: ReglesFormule; suivante?: string }[] = [
  {
    id: 'evaluation',
    nom: 'Évaluation (phase 1)',
    description: 'Objectif +10 %, perte jour 5 %, perte max 10 %, 4 jours min. Réussie : passage en phase 2.',
    regles: { objectifPct: 10, perteJourPct: 5, perteMaxPct: 10, joursMin: 4 },
    suivante: 'verification',
  },
  {
    id: 'verification',
    nom: 'Vérification (phase 2)',
    description: 'Objectif +5 %, perte jour 5 %, perte max 10 %, 4 jours min. Réussie : trader financé.',
    regles: { objectifPct: 5, perteJourPct: 5, perteMaxPct: 10, joursMin: 4 },
  },
  {
    id: 'express',
    nom: 'Express',
    description: 'Objectif +8 %, perte jour 4 %, perte max 8 % suiveuse, sans minimum de jours.',
    regles: { objectifPct: 8, perteJourPct: 4, perteMaxPct: 8, joursMin: 0, suiveuse: true },
  },
  {
    id: 'instantane',
    nom: 'Instantané (1 phase)',
    description: 'Objectif +10 %, perte jour 3 %, perte max 6 % suiveuse, meilleur jour ≤ 40 % du profit, pas de trade 2 min autour des news, 3 jours min.',
    regles: { objectifPct: 10, perteJourPct: 3, perteMaxPct: 6, joursMin: 3, suiveuse: true, regularitePct: 40, newsMinutes: 2 },
  },
];

export const CAPITAUX = [10000, 25000, 50000, 100000, 200000];

/** Formule d'un challenge d'après son nom (les comptes à accès ne gardent côté serveur que les règles de base). */
export function formuleDe(nom: string) {
  return FORMULES.find((f) => f.nom === nom);
}

/** Règles complètes : celles de la formule (règles avancées comprises), puis celles enregistrées. */
export function reglesCompletes(r: ReglesChallenge): ReglesChallenge {
  const f = formuleDe(r.formule);
  return { ...(f?.regles ?? {}), ...r };
}

/** Phase suivante d'un challenge réussi (phase 1 → phase 2), s'il y en a une. */
export function formuleSuivante(nom: string) {
  const id = formuleDe(nom)?.suivante;
  return id ? FORMULES.find((f) => f.id === id) : undefined;
}

export function dateDuJour(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nouveauChallenge(regles: ReglesChallenge): Challenge {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    regles: reglesCompletes(regles),
    debutLe: Date.now(),
    statut: 'en-cours',
    jour: { date: dateDuJour(), capitalDebut: regles.capital },
    plusBas: regles.capital,
    plusHaut: regles.capital,
  };
}

/** Jours distincts où au moins une opération a été passée depuis le début du challenge. */
export function joursTrades(ch: Challenge, operations: Operation[]): number {
  return new Set(operations.filter((o) => o.date >= ch.debutLe).map((o) => dateDuJour(o.date))).size;
}

/** Résultat réalisé (frais déduits) de chaque jour depuis le début du challenge. */
export function resultatsParJour(ch: Challenge, operations: Operation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of operations) {
    if (o.date < ch.debutLe) continue;
    const j = dateDuJour(o.date);
    m.set(j, (m.get(j) ?? 0) + (o.resultat ?? 0) - o.frais);
  }
  return m;
}

export interface Mesures {
  /** Gain réalisé (positions fermées) depuis le départ. */
  gainRealise: number;
  objectif: number;
  perteJour: number;
  limiteJour: number;
  /** Part de la perte maximale consommée (depuis le départ, ou depuis le plus haut si la limite est suiveuse). */
  perteTotale: number;
  limiteTotale: number;
  /** Fonds propres sous lesquels le challenge échoue. */
  plancher: number;
  jours: number;
  /** Meilleur jour, en % du profit total réalisé (règle de régularité), ou null sans profit. */
  meilleurJourPct: number | null;
  meilleurJour: number;
}

export function mesurer(ch: Challenge, capital: number, solde: number, marges: number, operations: Operation[]): Mesures {
  const r = reglesCompletes(ch.regles);
  const balance = solde + marges; // capital sans le P&L latent
  const limiteTotale = (r.capital * r.perteMaxPct) / 100;
  // Limite suiveuse : le plancher monte avec le plus haut des fonds propres, sans dépasser le capital de départ.
  const plancher = r.suiveuse ? Math.min(r.capital, Math.max(ch.plusHaut, capital) - limiteTotale) : r.capital - limiteTotale;
  const gainRealise = balance - r.capital;
  const jours = resultatsParJour(ch, operations);
  const meilleurJour = Math.max(0, ...jours.values());
  return {
    gainRealise,
    objectif: (r.capital * r.objectifPct) / 100,
    perteJour: Math.max(0, ch.jour.capitalDebut - capital),
    limiteJour: (r.capital * r.perteJourPct) / 100,
    perteTotale: Math.max(0, limiteTotale - (capital - plancher)),
    limiteTotale,
    plancher,
    jours: joursTrades(ch, operations),
    meilleurJour,
    meilleurJourPct: gainRealise > 0 ? (meilleurJour / gainRealise) * 100 : null,
  };
}

/**
 * Applique les règles au capital courant (fonds propres, P&L latent compris) :
 * échec dès qu'une limite de perte est atteinte, réussite quand l'objectif est atteint en positions fermées
 * avec le nombre de jours requis et, s'il y a lieu, la régularité. Retourne le challenge mis à jour et un message.
 */
export function evaluerChallenge(
  ch: Challenge,
  capital: number,
  solde: number,
  marges: number,
  positionsOuvertes: number,
  operations: Operation[],
): { challenge: Challenge; message?: string; fermerTout?: boolean } {
  if (ch.statut !== 'en-cours') return { challenge: ch };
  const aujourdhui = dateDuJour();
  let suivant: Challenge = ch;
  // Nouvelle journée : la référence de la perte journalière repart des fonds propres actuels.
  if (ch.jour.date !== aujourdhui) suivant = { ...suivant, jour: { date: aujourdhui, capitalDebut: capital } };

  // Mesure avant de monter le plus haut : la limite suiveuse se juge sur le plus haut déjà atteint.
  const m = mesurer(suivant, capital, solde, marges, operations);
  const r = reglesCompletes(suivant.regles);
  if (capital < suivant.plusBas || capital > suivant.plusHaut) suivant = { ...suivant, plusBas: Math.min(suivant.plusBas, capital), plusHaut: Math.max(suivant.plusHaut, capital) };
  const fin = (statut: 'reussi' | 'echoue', raison: string) => ({ ...suivant, statut, raison, finLe: Date.now(), capitalFin: capital });

  if (m.perteJour >= m.limiteJour) {
    return {
      challenge: fin('echoue', `Perte journalière maximale atteinte (${m.perteJour.toFixed(2)} $ pour une limite de ${m.limiteJour.toFixed(2)} $).`),
      message: `❌ Challenge échoué : perte journalière maximale de ${r.perteJourPct} % atteinte. Positions fermées.`,
      fermerTout: true,
    };
  }
  if (capital <= m.plancher) {
    const suiv = r.suiveuse ? ' suiveuse' : '';
    return {
      challenge: fin('echoue', `Perte maximale${suiv} atteinte : fonds propres de ${capital.toFixed(2)} $ pour un plancher de ${m.plancher.toFixed(2)} $.`),
      message: `❌ Challenge échoué : perte maximale${suiv} de ${r.perteMaxPct} % atteinte. Positions fermées.`,
      fermerTout: true,
    };
  }
  const regulier = !r.regularitePct || (m.meilleurJourPct !== null && m.meilleurJourPct <= r.regularitePct);
  if (m.gainRealise >= m.objectif && m.jours >= r.joursMin && positionsOuvertes === 0 && regulier) {
    return {
      challenge: fin('reussi', `Objectif de +${r.objectifPct} % atteint en ${m.jours} jour(s) de trading.`),
      message: `🏆 Challenge réussi : objectif de +${r.objectifPct} % atteint !`,
    };
  }
  return { challenge: suivant };
}

/** Devises d'un instrument, pour la règle des news (EURUSD → EUR, USD ; XAUUSD → USD ; indices → leur devise). */
export function devisesInstrument(code: string, devise: string | undefined): string[] {
  const d = new Set<string>();
  if (devise) d.add(devise === 'USDT' ? 'USD' : devise);
  for (const m of ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY']) if (code.toUpperCase().includes(m)) d.add(m);
  return [...d];
}

/** Annonce à fort impact qui bloque l'ouverture d'une position maintenant, s'il y en a une. */
export function annonceBloquante<T extends { date: number; importance: number; devise: string }>(
  evenements: T[],
  devises: string[],
  minutes: number,
  maintenant = Date.now(),
): T | undefined {
  const fenetre = minutes * 60000;
  return evenements.find((e) => e.importance >= 1 && devises.includes(e.devise) && Math.abs(e.date - maintenant) <= fenetre);
}
