import type { Portefeuille, ReglesDiscipline, Sens } from './types';
import type { Tick } from './binance';
import { conversionUsd, tailleContrat } from './instruments';
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

/** Fin du blocage en cours, pour les messages : « demain » ou « le mois prochain » (limite du mois). */
export function finDuBlocage(p: Portefeuille): string {
  return p.journee?.bloque?.mois ? "jusqu'au mois prochain" : "jusqu'à demain";
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

/** Premier instant du mois en cours (heure locale). */
export function debutDuMois(maintenant = Date.now()): number {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export interface MesuresMois {
  /** Résultat net (frais déduits) des opérations du mois. */
  realise: number;
  /** Fonds propres estimés au début du mois : balance actuelle moins le réalisé du mois. */
  capitalDebut: number;
  /** Variation des fonds propres depuis le début du mois (réalisé + P&L latent). */
  variation: number;
  pct: number;
  joursGagnants: number;
  joursPerdants: number;
}

/** Bilan du mois calendaire en cours, tiré des opérations : rien à mémoriser, juste après le 1er comme en fin de mois. */
export function mesurerMois(p: Portefeuille, capital: number, balance: number, maintenant = Date.now()): MesuresMois {
  const debut = debutDuMois(maintenant);
  const jours = new Map<string, number>();
  let realise = 0;
  for (const o of p.operations) {
    if (o.date < debut) continue;
    const net = (o.resultat ?? 0) - o.frais;
    realise += net;
    const j = dateDuJour(o.date);
    jours.set(j, (jours.get(j) ?? 0) + net);
  }
  const capitalDebut = balance - realise;
  const variation = capital - capitalDebut;
  const valeurs = [...jours.values()];
  return {
    realise,
    capitalDebut,
    variation,
    pct: capitalDebut > 0 ? (variation / capitalDebut) * 100 : 0,
    joursGagnants: valeurs.filter((v) => v > 0).length,
    joursPerdants: valeurs.filter((v) => v < 0).length,
  };
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
  balance = capital,
): { portefeuille: Portefeuille; message?: string; fermerTout?: boolean } {
  if (!regles?.actif) return { portefeuille: p };
  const aujourdhui = dateDuJour(maintenant);
  let courant = p;
  if (!courant.journee || courant.journee.date !== aujourdhui) courant = { ...courant, journee: { date: aujourdhui, capitalDebut: capital } };
  const j = courant.journee!;
  if (j.bloque) return { portefeuille: courant };
  const m = mesurerJournee(courant, capital, maintenant);
  const bloquer = (raison: string, fermer: boolean, jusqua = 'demain') => ({
    portefeuille: { ...courant, journee: { ...j, bloque: { raison, depuis: maintenant, ...(jusqua === 'demain' ? {} : { mois: true }) } } },
    message: `🧘 ${raison}${fermer ? ' Positions fermées.' : ''} Trading bloqué jusqu'${jusqua === 'demain' ? 'à demain' : 'au ' + jusqua}.`,
    fermerTout: fermer,
  });
  const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  // Limite du mois : le blocage se repose chaque jour tant que le mois n'est pas fini (la perte reste dans les opérations du mois).
  if (regles.perteMoisPct) {
    const mois = mesurerMois(courant, capital, balance, maintenant);
    if (-mois.pct >= regles.perteMoisPct) return bloquer(`Perte du mois de ${pct(-mois.pct)} : limite de ${pct(regles.perteMoisPct)} atteinte.`, regles.fermerAuto, 'mois prochain');
  }
  if (regles.perteJourPct && -m.pct >= regles.perteJourPct) return bloquer(`Perte du jour de ${pct(-m.pct)} : limite de ${pct(regles.perteJourPct)} atteinte.`, regles.fermerAuto);
  if (regles.objectifJourPct && m.pct >= regles.objectifJourPct) return bloquer(`Objectif du jour atteint (+${pct(m.pct)}) : profits verrouillés.`, regles.fermerAuto);
  if (regles.tradesMax && m.trades >= regles.tradesMax) return bloquer(`${m.trades} trades ouverts aujourd'hui : limite de ${regles.tradesMax} atteinte.`, false);
  return { portefeuille: courant };
}

interface Exposee {
  symbole: string;
  sens: Sens;
  /** Unités de l'actif (lots × taille du contrat). */
  unites: number;
  entree: number;
  stopLoss?: number;
  /** Libellé pour le message : « Position », « Ordre limite »… */
  quoi: string;
}

/** Perte (≥ 0, en USD, hors frais) si le stop-loss est touché ; 0 si le stop protège déjà un gain. */
export function perteAuStop(e: { symbole: string; sens: Sens; unites: number; entree: number; stopLoss: number }, ticks: Record<string, Tick>): number {
  const ecart = e.sens === 'achat' ? e.entree - e.stopLoss : e.stopLoss - e.entree;
  return Math.max(0, ecart * e.unites * conversionUsd(e.symbole, ticks));
}

/**
 * Règles de risque par trade sur ce qu'une action vient de créer ou de changer (positions ouvertes, ordres posés,
 * stops déplacés ou retirés) : stop-loss obligatoire, et perte au stop plafonnée à un % des fonds propres.
 */
export function controleRisqueTrade(
  avant: Portefeuille,
  apres: Portefeuille,
  regles: ReglesDiscipline | undefined,
  capital: number,
  ticks: Record<string, Tick>,
): string | null {
  if (!regles?.actif || (!regles.stopObligatoire && !regles.risqueTradePct)) return null;
  const anciennes = new Map(avant.positions.map((x) => [x.id, x]));
  const anciensOrdres = new Set(avant.ordres.map((o) => o.id));
  const aVerifier: Exposee[] = [];
  for (const pos of apres.positions) {
    const ancienne = anciennes.get(pos.id);
    if (ancienne && ancienne.stopLoss === pos.stopLoss) continue;
    aVerifier.push({ symbole: pos.symbole, sens: pos.sens, unites: pos.quantite, entree: pos.prixEntree, stopLoss: pos.stopLoss, quoi: ancienne ? 'Stop-loss modifié' : 'Position' });
  }
  for (const o of apres.ordres) {
    if (anciensOrdres.has(o.id) || !o.lots) continue;
    aVerifier.push({ symbole: o.symbole, sens: o.sens, unites: o.lots * tailleContrat(o.symbole), entree: o.prix, stopLoss: o.stopLoss, quoi: `Ordre ${o.type}` });
  }
  const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  for (const e of aVerifier) {
    if (e.stopLoss === undefined) {
      if (regles.stopObligatoire) return `Discipline : stop-loss obligatoire. ${e.quoi === 'Stop-loss modifié' ? 'Le stop-loss ne peut pas être retiré.' : 'Posez un stop-loss avant de passer l’ordre.'}`;
      if (regles.risqueTradePct) return `Discipline : risque max de ${pct(regles.risqueTradePct)} par trade. Posez un stop-loss pour borner la perte.`;
      continue;
    }
    if (!regles.risqueTradePct) continue;
    const limite = (capital * regles.risqueTradePct) / 100;
    const perte = perteAuStop({ ...e, stopLoss: e.stopLoss }, ticks);
    if (perte > limite * 1.0001) {
      const lotsMax = Math.floor((e.unites / tailleContrat(e.symbole)) * (limite / perte) * 100 + 1e-6) / 100;
      const conseil = e.quoi === 'Stop-loss modifié' ? 'Rapprochez le stop.' : lotsMax >= 0.01 ? `Volume max à ce stop : ${lotsMax.toLocaleString('fr-FR')} lot${lotsMax > 1 ? 's' : ''}.` : 'Rapprochez le stop.';
      return `Discipline : ${e.quoi.toLowerCase()} risquant ${Math.round(perte).toLocaleString('fr-FR')} $ (${pct((perte / capital) * 100)}) au stop, pour un max de ${pct(regles.risqueTradePct)} par trade. ${conseil}`;
    }
  }
  return null;
}
