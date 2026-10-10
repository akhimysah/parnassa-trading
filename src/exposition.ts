import type { Tick } from './binance';
import { paireBinance } from './binance';
import { conversionUsd, instrument } from './instruments';
import { pnlLatent } from './trading';
import type { Position } from './types';

type Ticks = Record<string, Tick>;

export interface RisqueOuvert {
  /** Perte si tous les stop-loss sont touchés (≤ 0), hors frais. */
  perteAuxStops: number;
  /** Gain déjà verrouillé par des stops passés au-delà de l'entrée (≥ 0). */
  verrouille: number;
  /** Gain si tous les take-profit sont touchés (≥ 0), positions avec TP seulement. */
  gainAuxCibles: number;
  /** Positions sans stop-loss : risque non borné. */
  sansStop: Position[];
  avecCible: number;
}

/** Ce que coûtent les stops et rapportent les cibles des positions ouvertes, si tous étaient touchés. */
export function risqueOuvert(positions: Position[], ticks: Ticks): RisqueOuvert {
  let perteAuxStops = 0;
  let verrouille = 0;
  let gainAuxCibles = 0;
  let avecCible = 0;
  const sansStop: Position[] = [];
  for (const pos of positions) {
    if (pos.stopLoss === undefined) sansStop.push(pos);
    else {
      const r = pnlLatent(pos, pos.stopLoss, ticks);
      if (r < 0) perteAuxStops += r;
      else verrouille += r;
    }
    if (pos.takeProfit !== undefined) {
      avecCible++;
      gainAuxCibles += Math.max(0, pnlLatent(pos, pos.takeProfit, ticks));
    }
  }
  return { perteAuxStops, verrouille, gainAuxCibles, sansStop, avecCible };
}

export interface LigneExposition {
  /** Devise (USD, EUR…) ou actif (BTC, US500…). */
  actif: string;
  /** Exposition nette en USD : positive = acheteur, négative = vendeur. */
  net: number;
  /** Somme des expositions brutes (achats + ventes), pour situer le net. */
  brut: number;
}

/**
 * Jambes d'un instrument : une paire de change ou un métal (XAUUSD) achète la première devise et vend la seconde ;
 * le reste (indices, actions, énergie, crypto) expose à l'actif lui-même.
 */
export function jambes(symbole: string): [string, string] | [string] {
  const i = instrument(symbole);
  const code = (i?.code ?? symbole.split(':').pop() ?? symbole).toUpperCase();
  if ((i?.categorie === 'forex' || i?.categorie === 'metaux') && /^[A-Z]{6}$/.test(code)) return [code.slice(0, 3), code.slice(3, 6)];
  if (!i || i.categorie === 'crypto') return [code.replace(/\//g, '').replace(/(USDT|USDC|FDUSD|USD)$/, '') || code];
  return [code];
}

/** Exposition nette par devise et par actif (notionnel en USD au prix actuel), de la plus forte à la plus faible. */
export function expositionParActif(positions: Position[], ticks: Ticks): LigneExposition[] {
  const lignes = new Map<string, LigneExposition>();
  const ajouter = (actif: string, montant: number) => {
    const l = lignes.get(actif) ?? { actif, net: 0, brut: 0 };
    l.net += montant;
    l.brut += Math.abs(montant);
    lignes.set(actif, l);
  };
  for (const pos of positions) {
    const prix = ticks[paireBinance(pos.symbole)]?.prix ?? pos.prixEntree;
    const notionnel = prix * pos.quantite * conversionUsd(pos.symbole, ticks);
    const signe = pos.sens === 'achat' ? 1 : -1;
    const j = jambes(pos.symbole);
    ajouter(j[0], signe * notionnel);
    if (j.length === 2) ajouter(j[1], -signe * notionnel);
  }
  return [...lignes.values()].filter((l) => Math.abs(l.net) >= 0.01).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}
