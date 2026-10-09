import type { Portefeuille, ReglesDiscipline } from './types';
import { dateDuJour } from './challenge';

export const DISCIPLINE_DEFAUT: ReglesDiscipline = { actif: false, perteJourPct: 3, objectifJourPct: undefined, tradesMax: undefined, fermerAuto: true };

/** Positions ouvertes aujourd'hui (opérations d'ouverture depuis minuit, heure locale). */
export function tradesDuJour(p: Portefeuille, maintenant = Date.now()): number {
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  return p.operations.filter((o) => o.type === 'ouverture' && o.date >= minuit.getTime()).length;
}

/** Raison du blocage de la journée en cours, ou null si l'on peut trader. */
export function blocageDiscipline(p: Portefeuille, regles: ReglesDiscipline | undefined, maintenant = Date.now()): string | null {
  if (!regles?.actif) return null;
  const j = p.journee;
  return j && j.date === dateDuJour(maintenant) && j.bloque ? j.bloque.raison : null;
}

export interface MesuresJournee {
  capitalDebut: number;
  variation: number;
  pct: number;
  trades: number;
}

export function mesurerJournee(p: Portefeuille, capital: number, maintenant = Date.now()): MesuresJournee {
  const debut = p.journee && p.journee.date === dateDuJour(maintenant) ? p.journee.capitalDebut : capital;
  const variation = capital - debut;
  return { capitalDebut: debut, variation, pct: debut > 0 ? (variation / debut) * 100 : 0, trades: tradesDuJour(p, maintenant) };
}

/**
 * Applique les garde-fous du jour : nouvelle journée = nouvelle référence ; perte max ou objectif atteint = blocage
 * jusqu'au lendemain (et fermeture si demandée) ; nombre de trades atteint = blocage des nouvelles positions.
 */
export function evaluerDiscipline(
  p: Portefeuille,
  capital: number,
  regles: ReglesDiscipline | undefined,
  maintenant = Date.now(),
): { portefeuille: Portefeuille; message?: string; fermerTout?: boolean } {
  if (!regles?.actif) return { portefeuille: p };
  const aujourdhui = dateDuJour(maintenant);
  let courant = p;
  if (!courant.journee || courant.journee.date !== aujourdhui) courant = { ...courant, journee: { date: aujourdhui, capitalDebut: capital } };
  const j = courant.journee!;
  if (j.bloque) return { portefeuille: courant };
  const m = mesurerJournee(courant, capital, maintenant);
  const bloquer = (raison: string, fermer: boolean) => ({
    portefeuille: { ...courant, journee: { ...j, bloque: { raison, depuis: maintenant } } },
    message: `🧘 ${raison}${fermer ? ' Positions fermées.' : ''} Trading bloqué jusqu'à demain.`,
    fermerTout: fermer,
  });
  const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  if (regles.perteJourPct && -m.pct >= regles.perteJourPct) return bloquer(`Perte du jour de ${pct(-m.pct)} : limite de ${pct(regles.perteJourPct)} atteinte.`, regles.fermerAuto);
  if (regles.objectifJourPct && m.pct >= regles.objectifJourPct) return bloquer(`Objectif du jour atteint (+${pct(m.pct)}) : profits verrouillés.`, regles.fermerAuto);
  if (regles.tradesMax && m.trades >= regles.tradesMax) return bloquer(`${m.trades} trades ouverts aujourd'hui : limite de ${regles.tradesMax} atteinte.`, false);
  return { portefeuille: courant };
}
