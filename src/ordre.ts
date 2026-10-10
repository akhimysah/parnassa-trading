import type { Etat, Portefeuille, Position } from './types';
import type { Tick } from './binance';
import { paireBinance } from './binance';
import { LOT_MIN, estNegociable } from './instruments';
import { cloturer, pnlLatent } from './trading';
import { blocageDiscipline, finDuBlocage, pauseApresPerte } from './discipline';
import { planManquant } from './plan';
import { fermeAuWeekend, regleWeekendActive, reouverture } from './weekend';

type Ticks = Record<string, Tick>;

/** Contrôles avant d'ouvrir une position au marché, communs au formulaire d'ordre et au trading en un clic. */
export function controleOuverture(o: {
  etat: Etat;
  symbole: string;
  prix: number | undefined;
  lots: number;
  volumeMax: number;
  lecture: boolean;
  annonce?: { devise: string; date: number; titre: string; titreFr?: string };
  minutesNews?: number;
}): string | null {
  if (o.lecture) return 'Accès investisseur : lecture seule, aucun ordre possible.';
  if (!estNegociable(o.symbole)) return 'Cet instrument ne se trade pas ici : choisissez-en un de la liste des instruments.';
  if (!o.prix) return 'Prix en direct indisponible pour cet instrument, patientez une seconde.';
  if (regleWeekendActive(o.etat) && fermeAuWeekend(o.symbole)) return `Marché fermé le week-end : réouverture ${reouverture()} (la crypto reste ouverte).`;
  const discipline = blocageDiscipline(o.etat.portefeuille, o.etat.parametres.discipline);
  if (discipline) return `Discipline du jour : ${discipline} Nouveaux ordres bloqués ${finDuBlocage(o.etat.portefeuille)}.`;
  const pause = pauseApresPerte(o.etat.portefeuille, o.etat.parametres.discipline);
  if (pause) return pause;
  const plan = planManquant(o.etat.portefeuille, o.etat.parametres.discipline);
  if (plan) return plan;
  if (o.etat.challenge && o.etat.challenge.statut !== 'en-cours') return 'Challenge terminé : démarrez-en un nouveau ou quittez le mode challenge (page Trading).';
  if (o.annonce) {
    const heure = new Date(o.annonce.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Règle des news : annonce à fort impact ${o.annonce.devise} à ${heure} (« ${o.annonce.titreFr ?? o.annonce.titre} »). Ouverture bloquée ${o.minutesNews ?? 0} min avant et après.`;
  }
  if (!(o.lots >= LOT_MIN && o.lots <= o.volumeMax)) return `Volume invalide : de 0,01 à ${o.volumeMax.toLocaleString('fr-FR')} lots, par pas de 0,01.`;
  return null;
}

/**
 * Ferme d'un coup les positions retenues par le filtre (toutes, gagnantes, perdantes, un instrument…),
 * au dernier prix connu. Les positions sans prix restent ouvertes.
 */
export function cloturerPositions(
  p: Portefeuille,
  ticks: Ticks,
  tauxCrypto: number,
  filtre: (pos: Position, pnl: number) => boolean = () => true,
): { portefeuille: Portefeuille; fermees: number; resultat: number } {
  let courant = p;
  let fermees = 0;
  let resultat = 0;
  for (const pos of p.positions) {
    const prix = ticks[paireBinance(pos.symbole)]?.prix;
    if (!prix) continue;
    const pnl = pnlLatent(pos, prix, ticks);
    if (!filtre(pos, pnl)) continue;
    const r = cloturer(courant, pos.id, prix, ticks, { tauxCrypto });
    if (typeof r === 'string') continue;
    courant = r;
    fermees += 1;
    resultat += pnl;
  }
  return { portefeuille: courant, fermees, resultat };
}
