import type { Etat } from './types';
import { LISTE_SUIVI_DEFAUT, corriger } from './symboles';

const CLE = 'parnassa-trading:etat:v1';

export const ETAT_DEFAUT: Etat = {
  page: 'accueil',
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
  portefeuille: { capitalInitial: 100000, solde: 100000, positions: [], operations: [], ordres: [], historiqueCapital: [] },
  parametres: { fuseau: 'Europe/Paris', frais: 0.001, son: true, motsCles: [], langueActualites: 'fr+en', squawk: { actif: false, filtre: 'annonces', vitesse: 1.1 }, rappels: { delaiMinutes: 5, fortImpactAuto: false } },
  rappels: [],
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
      parametres: { ...ETAT_DEFAUT.parametres, ...(etat.parametres ?? {}) },
    };
  } catch {
    return ETAT_DEFAUT;
  }
}

/** Exporte tout l'état (sauvegarde JSON) ; `importerEtat` fait l'inverse avec validation minimale. */
export function exporterEtat(etat: Etat): string {
  return JSON.stringify({ application: 'parnassa-trading', version: 1, exporteLe: new Date().toISOString(), etat }, null, 2);
}

export function importerEtat(texte: string): Etat {
  const lu = JSON.parse(texte) as { application?: string; etat?: Partial<Etat> };
  if (lu.application !== 'parnassa-trading' || !lu.etat || typeof lu.etat !== 'object') {
    throw new Error('Ce fichier n\'est pas une sauvegarde Parnassa Trading.');
  }
  const etat = { ...ETAT_DEFAUT, ...lu.etat };
  return {
    ...etat,
    portefeuille: { ...ETAT_DEFAUT.portefeuille, ...(etat.portefeuille ?? {}) },
    parametres: { ...ETAT_DEFAUT.parametres, ...(etat.parametres ?? {}) },
  };
}

export function sauverEtat(etat: Etat): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat));
  } catch {
    // Stockage indisponible (navigation privée…) : on continue sans persistance.
  }
}
