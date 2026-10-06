import type { Etat } from './types';
import { LISTE_SUIVI_DEFAUT, corriger } from './symboles';

const CLE = 'parnassa-trading:etat:v1';

export const ETAT_DEFAUT: Etat = {
  page: 'graphique',
  theme: 'dark',
  symbole: 'BINANCE:BTCUSDT',
  intervalle: '60',
  style: '1',
  disposition: 1,
  emplacements: ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL', 'FOREXCOM:SPXUSD'],
  listeSuivi: LISTE_SUIVI_DEFAUT,
  etudes: ['STD;RSI'],
  panneauDroit: true,
  comparaisons: [],
  lier: false,
  dispositionsSauvees: [],
  alertes: [],
  portefeuille: { capitalInitial: 100000, solde: 100000, positions: [], operations: [] },
};

export function chargerEtat(): Etat {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return ETAT_DEFAUT;
    const lu = JSON.parse(brut) as Partial<Etat>;
    const etat = { ...ETAT_DEFAUT, ...lu };
    return {
      ...etat,
      symbole: corriger(etat.symbole),
      emplacements: etat.emplacements.map(corriger),
      listeSuivi: Array.from(new Set(etat.listeSuivi.map(corriger))),
      comparaisons: (etat.comparaisons ?? []).map(corriger),
      portefeuille: { ...ETAT_DEFAUT.portefeuille, ...(etat.portefeuille ?? {}) },
    };
  } catch {
    return ETAT_DEFAUT;
  }
}

export function sauverEtat(etat: Etat): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat));
  } catch {
    // Stockage indisponible (navigation privée…) : on continue sans persistance.
  }
}
