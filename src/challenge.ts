import type { Challenge, Operation, ReglesChallenge } from './types';

export const FORMULES: { id: string; nom: string; description: string; regles: Omit<ReglesChallenge, 'capital' | 'formule'> }[] = [
  { id: 'evaluation', nom: 'Évaluation (phase 1)', description: 'Objectif +10 %, perte jour 5 %, perte max 10 %, 4 jours min.', regles: { objectifPct: 10, perteJourPct: 5, perteMaxPct: 10, joursMin: 4 } },
  { id: 'verification', nom: 'Vérification (phase 2)', description: 'Objectif +5 %, perte jour 5 %, perte max 10 %, 4 jours min.', regles: { objectifPct: 5, perteJourPct: 5, perteMaxPct: 10, joursMin: 4 } },
  { id: 'express', nom: 'Express', description: 'Objectif +8 %, perte jour 4 %, perte max 8 %, sans minimum de jours.', regles: { objectifPct: 8, perteJourPct: 4, perteMaxPct: 8, joursMin: 0 } },
];

export const CAPITAUX = [10000, 25000, 50000, 100000, 200000];

export function dateDuJour(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nouveauChallenge(regles: ReglesChallenge): Challenge {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    regles,
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

export interface Mesures {
  /** Gain réalisé (positions fermées) depuis le départ. */
  gainRealise: number;
  objectif: number;
  perteJour: number;
  limiteJour: number;
  perteTotale: number;
  limiteTotale: number;
  jours: number;
}

export function mesurer(ch: Challenge, capital: number, solde: number, marges: number, operations: Operation[]): Mesures {
  const r = ch.regles;
  const balance = solde + marges; // capital sans le P&L latent
  return {
    gainRealise: balance - r.capital,
    objectif: (r.capital * r.objectifPct) / 100,
    perteJour: Math.max(0, ch.jour.capitalDebut - capital),
    limiteJour: (r.capital * r.perteJourPct) / 100,
    perteTotale: Math.max(0, r.capital - capital),
    limiteTotale: (r.capital * r.perteMaxPct) / 100,
    jours: joursTrades(ch, operations),
  };
}

/**
 * Applique les règles au capital courant (fonds propres, P&L latent compris) :
 * échec dès qu'une limite de perte est atteinte, réussite quand l'objectif est atteint en positions fermées
 * avec le nombre de jours requis. Retourne le challenge mis à jour et un message éventuel.
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
  if (capital < suivant.plusBas || capital > suivant.plusHaut) suivant = { ...suivant, plusBas: Math.min(suivant.plusBas, capital), plusHaut: Math.max(suivant.plusHaut, capital) };

  const m = mesurer(suivant, capital, solde, marges, operations);
  const fin = (statut: 'reussi' | 'echoue', raison: string) => ({ ...suivant, statut, raison, finLe: Date.now(), capitalFin: capital });

  if (m.perteJour >= m.limiteJour) {
    return {
      challenge: fin('echoue', `Perte journalière maximale atteinte (${m.perteJour.toFixed(2)} $ pour une limite de ${m.limiteJour.toFixed(2)} $).`),
      message: `❌ Challenge échoué : perte journalière maximale de ${suivant.regles.perteJourPct} % atteinte. Positions fermées.`,
      fermerTout: true,
    };
  }
  if (m.perteTotale >= m.limiteTotale) {
    return {
      challenge: fin('echoue', `Perte maximale atteinte (${m.perteTotale.toFixed(2)} $ pour une limite de ${m.limiteTotale.toFixed(2)} $).`),
      message: `❌ Challenge échoué : perte maximale de ${suivant.regles.perteMaxPct} % atteinte. Positions fermées.`,
      fermerTout: true,
    };
  }
  if (m.gainRealise >= m.objectif && m.jours >= suivant.regles.joursMin && positionsOuvertes === 0) {
    return {
      challenge: fin('reussi', `Objectif de +${suivant.regles.objectifPct} % atteint en ${m.jours} jour(s) de trading.`),
      message: `🏆 Challenge réussi : objectif de +${suivant.regles.objectifPct} % atteint !`,
    };
  }
  return { challenge: suivant };
}
