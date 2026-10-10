import type { Tick } from './binance';
import { paireBinance } from './binance';
import { conversionUsd, instrument, type CategorieInstrument } from './instruments';
import type { Portefeuille, Position, Sens } from './types';

type Ticks = Record<string, Tick>;

/**
 * Spread simulé (écart achat/vente complet), en points de base du prix : valeurs typiques d'un courtier CFD.
 * EURUSD ≈ 0,8 pip, or ≈ 0,25 $, S&P 500 ≈ 0,6 point, BTC ≈ 16 $.
 */
export const SPREAD_PB: Record<CategorieInstrument, number> = {
  forex: 0.7,
  metaux: 0.6,
  energie: 3,
  indices: 0.8,
  'actions-us': 2,
  'actions-fr': 4,
  crypto: 2,
};

/** Swap annuel (coût de financement, en % du notionnel) pour un achat et pour une vente. */
export const SWAP_ANNUEL_PCT: Record<CategorieInstrument, { achat: number; vente: number }> = {
  forex: { achat: 1.5, vente: 1.5 },
  metaux: { achat: 4, vente: 1.5 },
  energie: { achat: 4, vente: 2 },
  indices: { achat: 5, vente: 2 },
  'actions-us': { achat: 5, vente: 3 },
  'actions-fr': { achat: 5, vente: 3 },
  crypto: { achat: 15, vente: 15 },
};

/** Coûts simulés actifs (les tests de logique pure les coupent pour raisonner sur des prix exacts). */
export const COUTS = { spread: true, swap: true };

/** Heure du passage de nuit (rollover), en UTC : 17 h à New York. */
export const HEURE_ROLLOVER_UTC = 21;

export function categorieDe(symbole: string): CategorieInstrument {
  return instrument(symbole)?.categorie ?? 'crypto';
}

/** Moitié du spread, en prix, autour du cours milieu. */
export function demiSpread(symbole: string, milieu: number): number {
  if (!COUTS.spread) return 0;
  return (milieu * SPREAD_PB[categorieDe(symbole)]) / 1e4 / 2;
}

/** Prix vendeur (bid) et acheteur (ask) autour du cours milieu. */
export function fourchette(symbole: string, milieu: number): { bid: number; ask: number; spread: number } {
  const d = demiSpread(symbole, milieu);
  return { bid: milieu - d, ask: milieu + d, spread: 2 * d };
}

/** Prix d'entrée au marché : on achète au prix acheteur (ask), on vend au prix vendeur (bid). */
export function coteEntree(symbole: string, sens: Sens, milieu: number): number {
  const d = demiSpread(symbole, milieu);
  return sens === 'achat' ? milieu + d : milieu - d;
}

/** Prix de sortie d'une position : un long se revend au bid, un short se rachète à l'ask. */
export function coteSortie(symbole: string, sensPosition: Sens, milieu: number): number {
  const d = demiSpread(symbole, milieu);
  return sensPosition === 'achat' ? milieu - d : milieu + d;
}

/** Combien de jours de swap compte le passage de nuit de cette date (0 : pas de swap ce jour-là). */
export function multiplicateurSwap(categorie: CategorieInstrument, rollover: number): number {
  if (categorie === 'crypto') return 1;
  const jour = new Date(rollover).getUTCDay();
  if (jour === 0 || jour === 6) return 0;
  // Le week-end est facturé d'avance : le mercredi pour le change et les matières premières, le vendredi pour le reste.
  const triple = categorie === 'forex' || categorie === 'metaux' || categorie === 'energie' ? 3 : 5;
  return jour === triple ? 3 : 1;
}

/** Passages de nuit strictement après `depuis` et jusqu'à `jusqua` inclus. */
export function rollovers(depuis: number, jusqua: number): number[] {
  const d = new Date(depuis);
  let r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), HEURE_ROLLOVER_UTC);
  if (r <= depuis) r += 24 * 3600 * 1000;
  const liste: number[] = [];
  for (; r <= jusqua && liste.length < 3700; r += 24 * 3600 * 1000) liste.push(r);
  return liste;
}

/** Swap d'une nuit pour une position (négatif = coût), au cours milieu actuel. */
export function swapNuit(pos: Position, milieu: number, ticks: Ticks, rollover: number): number {
  const categorie = categorieDe(pos.symbole);
  const mult = multiplicateurSwap(categorie, rollover);
  if (!mult) return 0;
  const notionnel = milieu * pos.quantite * conversionUsd(pos.symbole, ticks);
  return (-notionnel * SWAP_ANNUEL_PCT[categorie][pos.sens]) / 100 / 365 * mult;
}

/**
 * Facture le swap des nuits passées depuis le dernier passage compté. Une position d'avant les swaps commence
 * à compter maintenant (rien de rétroactif). Le swap s'ajoute à la position et se réalise à la clôture.
 */
export function appliquerSwaps(p: Portefeuille, ticks: Ticks, maintenant = Date.now()): Portefeuille {
  if (!COUTS.swap) return p;
  let change = false;
  const positions = p.positions.map((pos) => {
    if (pos.swapCompteAu === undefined) {
      change = true;
      return { ...pos, swapCompteAu: maintenant };
    }
    const nuits = rollovers(pos.swapCompteAu, maintenant);
    if (!nuits.length) return pos;
    const t = ticks[paireBinance(pos.symbole)];
    if (!t) return pos;
    change = true;
    const total = nuits.reduce((s, r) => s + swapNuit(pos, t.prix, ticks, r), 0);
    return { ...pos, swap: Math.round(((pos.swap ?? 0) + total) * 100) / 100, swapCompteAu: nuits[nuits.length - 1]! };
  });
  return change ? { ...p, positions } : p;
}
