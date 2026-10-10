import { useEffect, useMemo, useRef, useState } from 'react';
import { abonner, lireTick, type SourceInstrument } from './flux';
import type { Tick } from './binance';

export type CategorieInstrument = 'crypto' | 'metaux' | 'energie' | 'indices' | 'forex' | 'actions-us' | 'actions-fr';

export interface Instrument {
  /** Notation TradingView, ex. « OANDA:XAUUSD ». */
  id: string;
  /** Nom court affiché, ex. « XAUUSD ». */
  code: string;
  nom: string;
  categorie: CategorieInstrument;
  /** binance : flux WebSocket temps réel ; scanner : cotation TradingView interrogée toutes les 3 s. */
  source: 'binance' | 'scanner';
  decimales: number;
  /** Retard des cotations gratuites, en minutes (0 = temps réel). */
  differe: number;
  /** Taille du contrat : unités de l'actif pour 1 lot (100 000 en forex, 100 onces pour l'or…). */
  taille: number;
  /** Devise de cotation (le P&L est converti en USD). */
  devise: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CAD';
  /** Symbole du flux Yahoo en continu (forex, indices, actions). */
  yahoo?: string;
  /** Paire Binance qui anime le prix seconde par seconde (or ← PAXGUSDT). */
  pilote?: string;
}

export const CATEGORIES_INSTRUMENTS: { id: CategorieInstrument; libelle: string }[] = [
  { id: 'metaux', libelle: 'Métaux' },
  { id: 'crypto', libelle: 'Crypto' },
  { id: 'forex', libelle: 'Forex' },
  { id: 'indices', libelle: 'Indices' },
  { id: 'energie', libelle: 'Énergie' },
  { id: 'actions-us', libelle: 'Actions US' },
  { id: 'actions-fr', libelle: 'Actions FR' },
];

const c = (id: string, nom: string, decimales = 2, taille = 1): Instrument => ({
  id: `BINANCE:${id}`,
  code: id.replace(/USDT$/, '/USDT'),
  nom,
  categorie: 'crypto',
  source: 'binance',
  decimales,
  differe: 0,
  taille,
  devise: 'USD',
});
const TAILLES: Record<CategorieInstrument, number> = { forex: 100000, metaux: 100, indices: 1, energie: 1000, 'actions-us': 100, 'actions-fr': 100, crypto: 1 };
const s = (
  id: string,
  code: string,
  nom: string,
  categorie: CategorieInstrument,
  decimales: number,
  differe = 0,
  options: { taille?: number; devise?: Instrument['devise']; yahoo?: string; pilote?: string } = {},
): Instrument => {
  // Devise de cotation déduite du code pour le forex (EURGBP → GBP), sinon USD par défaut.
  const devise = options.devise ?? (categorie === 'forex' && code.length === 6 ? (code.slice(3) as Instrument['devise']) : 'USD');
  // Un instrument diffusé en continu par Yahoo n'est plus différé.
  const differeReel = options.yahoo ? 0 : differe;
  return { id, code, nom, categorie, source: 'scanner', decimales, differe: differeReel, taille: options.taille ?? TAILLES[categorie], devise, yahoo: options.yahoo, pilote: options.pilote };
};

/** Les instruments les plus suivis, tous négociables dans le portefeuille papier. */
export const INSTRUMENTS: Instrument[] = [
  // Métaux précieux (temps réel)
  s('OANDA:XAUUSD', 'XAUUSD', 'Or', 'metaux', 2, 0, { pilote: 'PAXGUSDT' }),
  s('TVC:SILVER', 'XAGUSD', 'Argent', 'metaux', 3, 0, { taille: 5000 }),
  s('TVC:PLATINUM', 'XPTUSD', 'Platine', 'metaux', 2),
  s('COMEX:HG1!', 'COPPER', 'Cuivre', 'metaux', 4, 10, { taille: 25000 }),
  // Crypto (temps réel, Binance)
  c('BTCUSDT', 'Bitcoin'),
  c('ETHUSDT', 'Ethereum'),
  c('SOLUSDT', 'Solana'),
  c('BNBUSDT', 'BNB'),
  c('XRPUSDT', 'XRP', 4, 1000),
  c('DOGEUSDT', 'Dogecoin', 5, 10000),
  c('ADAUSDT', 'Cardano', 4, 1000),
  c('TRXUSDT', 'TRON', 4, 10000),
  c('AVAXUSDT', 'Avalanche', 3, 10),
  c('LINKUSDT', 'Chainlink', 3, 10),
  c('TONUSDT', 'Toncoin', 4, 100),
  c('SUIUSDT', 'Sui', 4, 100),
  c('LTCUSDT', 'Litecoin', 2),
  c('DOTUSDT', 'Polkadot', 4, 100),
  c('PEPEUSDT', 'Pepe', 8, 10000000),
  // Forex (temps réel)
  s('FX:EURUSD', 'EURUSD', 'Euro / Dollar', 'forex', 5, 0, { yahoo: 'EURUSD=X' }),
  s('FX:GBPUSD', 'GBPUSD', 'Livre / Dollar', 'forex', 5, 0, { yahoo: 'GBPUSD=X' }),
  s('FX:USDJPY', 'USDJPY', 'Dollar / Yen', 'forex', 3, 0, { yahoo: 'JPY=X' }),
  s('FX:USDCHF', 'USDCHF', 'Dollar / Franc suisse', 'forex', 5, 0, { yahoo: 'CHF=X' }),
  s('FX:AUDUSD', 'AUDUSD', 'Dollar australien / Dollar', 'forex', 5, 0, { yahoo: 'AUDUSD=X' }),
  s('FX:USDCAD', 'USDCAD', 'Dollar / Dollar canadien', 'forex', 5, 0, { yahoo: 'CAD=X' }),
  s('FX:NZDUSD', 'NZDUSD', 'Dollar néo-zélandais / Dollar', 'forex', 5, 0, { yahoo: 'NZDUSD=X' }),
  s('FX:EURGBP', 'EURGBP', 'Euro / Livre', 'forex', 5, 0, { yahoo: 'EURGBP=X' }),
  s('FX:EURJPY', 'EURJPY', 'Euro / Yen', 'forex', 3, 0, { yahoo: 'EURJPY=X' }),
  s('FX:GBPJPY', 'GBPJPY', 'Livre / Yen', 'forex', 3, 0, { yahoo: 'GBPJPY=X' }),
  s('FX:EURCHF', 'EURCHF', 'Euro / Franc suisse', 'forex', 5, 0, { yahoo: 'EURCHF=X' }),
  s('TVC:DXY', 'DXY', 'Indice dollar', 'forex', 3, 0, { taille: 1000, devise: 'USD', yahoo: 'DX-Y.NYB' }),
  // Indices
  s('SP:SPX', 'SPX500', 'S&P 500', 'indices', 2, 10, { yahoo: '^GSPC' }),
  s('NASDAQ:NDX', 'NAS100', 'Nasdaq 100', 'indices', 2, 15, { yahoo: '^NDX' }),
  s('DJ:DJI', 'US30', 'Dow Jones', 'indices', 2, 10, { yahoo: '^DJI' }),
  s('XETR:DAX', 'GER40', 'DAX', 'indices', 2, 15, { devise: 'EUR', yahoo: '^GDAXI' }),
  s('EURONEXT:PX1', 'FRA40', 'CAC 40', 'indices', 2, 15, { devise: 'EUR', yahoo: '^FCHI' }),
  s('TVC:UKX', 'UK100', 'FTSE 100', 'indices', 2, 0, { devise: 'GBP', yahoo: '^FTSE' }),
  s('TVC:NI225', 'JPN225', 'Nikkei 225', 'indices', 2, 0, { taille: 100, devise: 'JPY', yahoo: '^N225' }),
  s('CBOE:VIX', 'VIX', 'Volatilité S&P 500', 'indices', 2, 15, { taille: 100 }),
  // Énergie (contrats à terme, différés)
  s('NYMEX:CL1!', 'USOIL', 'Pétrole WTI', 'energie', 2, 10),
  s('ICEEUR:BRN1!', 'UKOIL', 'Pétrole Brent', 'energie', 2, 10),
  s('NYMEX:NG1!', 'NATGAS', 'Gaz naturel', 'energie', 3, 10, { taille: 10000 }),
  // Actions
  s('NASDAQ:AAPL', 'AAPL', 'Apple', 'actions-us', 2, 15, { yahoo: 'AAPL' }),
  s('NASDAQ:MSFT', 'MSFT', 'Microsoft', 'actions-us', 2, 15, { yahoo: 'MSFT' }),
  s('NASDAQ:NVDA', 'NVDA', 'NVIDIA', 'actions-us', 2, 15, { yahoo: 'NVDA' }),
  s('NASDAQ:AMZN', 'AMZN', 'Amazon', 'actions-us', 2, 15, { yahoo: 'AMZN' }),
  s('NASDAQ:GOOGL', 'GOOGL', 'Alphabet', 'actions-us', 2, 15, { yahoo: 'GOOGL' }),
  s('NASDAQ:META', 'META', 'Meta Platforms', 'actions-us', 2, 15, { yahoo: 'META' }),
  s('NASDAQ:TSLA', 'TSLA', 'Tesla', 'actions-us', 2, 15, { yahoo: 'TSLA' }),
  s('EURONEXT:MC', 'MC', 'LVMH', 'actions-fr', 2, 15, { devise: 'EUR', yahoo: 'MC.PA' }),
  s('EURONEXT:TTE', 'TTE', 'TotalEnergies', 'actions-fr', 2, 15, { devise: 'EUR', yahoo: 'TTE.PA' }),
  s('EURONEXT:AIR', 'AIR', 'Airbus', 'actions-fr', 2, 15, { devise: 'EUR', yahoo: 'AIR.PA' }),
  s('EURONEXT:OR', 'OR', "L'Oréal", 'actions-fr', 2, 15, { devise: 'EUR', yahoo: 'OR.PA' }),
];

const PAR_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));

export function instrument(id: string): Instrument | undefined {
  return PAR_ID.get(id);
}

/** Négociable dans le portefeuille papier : toute paire Binance, ou un instrument du catalogue. */
export function estNegociable(id: string): boolean {
  return id.toUpperCase().startsWith('BINANCE:') || PAR_ID.has(id);
}

/** Clé de la cotation dans la table des prix (partie après « : », comme pour Binance). */
export function cleCotation(id: string): string {
  return id.split(':').pop()!.toUpperCase();
}

export function formaterCotation(id: string, prix: number): string {
  const i = PAR_ID.get(id);
  const d = i ? i.decimales : prix >= 1000 ? 2 : prix >= 1 ? 4 : 6;
  return prix.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Nom court de l'unité négociée (« once » pour l'or, « BTC », « EUR »…), pour la quantité estimée. */
export function uniteQuantite(id: string): string {
  const i = PAR_ID.get(id);
  if (i?.categorie === 'metaux') return i.code === 'COPPER' ? 'livres' : 'onces';
  if (i?.categorie === 'forex' && i.code.length === 6) return i.code.slice(0, 3);
  if (i?.categorie === 'indices' || i?.categorie === 'energie') return 'unités';
  if (i?.categorie === 'actions-us' || i?.categorie === 'actions-fr') return 'actions';
  return cleCotation(id).replace(/(USDT|USDC|FDUSD|BUSD)$/, '');
}

// ---------- Lots, levier, conversion en USD ----------

export const LOT_MIN = 0.01;
export const LOT_MAX = 500;
export const PAS_LOT = 0.01;
export const LEVIERS = [1, 2, 5, 10, 20, 30, 50, 100, 200, 500];
/** Volumes maximaux par ordre proposés (500 lots par défaut, plus pour les très gros comptes). */
export const VOLUMES_MAX = [500, 1000, 5000, 10000, 100000];

/** Taille du contrat ; une paire Binance saisie librement vaut 1 unité par lot. */
export function tailleContrat(id: string): number {
  return PAR_ID.get(id)?.taille ?? 1;
}

export function deviseCotation(id: string): Instrument['devise'] {
  return PAR_ID.get(id)?.devise ?? 'USD';
}

/** Paires de change nécessaires pour convertir une devise de cotation en USD. */
const VIA: Record<Exclude<Instrument['devise'], 'USD'>, { id: string; inverse: boolean; secours: number }> = {
  EUR: { id: 'FX:EURUSD', inverse: false, secours: 1.1 },
  GBP: { id: 'FX:GBPUSD', inverse: false, secours: 1.3 },
  JPY: { id: 'FX:USDJPY', inverse: true, secours: 150 },
  CHF: { id: 'FX:USDCHF', inverse: true, secours: 0.85 },
  CAD: { id: 'FX:USDCAD', inverse: true, secours: 1.37 },
};

/** Valeur en USD d'une unité de la devise de cotation (taux en direct, ou valeur de secours le temps du chargement). */
export function conversionUsd(id: string, ticks: Record<string, Tick>): number {
  const devise = deviseCotation(id);
  if (devise === 'USD') return 1;
  const via = VIA[devise];
  const taux = ticks[cleCotation(via.id)]?.prix ?? via.secours;
  return via.inverse ? 1 / taux : taux;
}

/** Symboles de change à suivre pour convertir les instruments donnés. */
export function symbolesConversion(ids: string[]): string[] {
  return [...new Set(ids.map(deviseCotation).filter((d): d is Exclude<Instrument['devise'], 'USD'> => d !== 'USD').map((d) => VIA[d].id))];
}

/** Arrondi au centième de lot, borné entre 0,01 et le volume maximal par ordre (500 par défaut). */
export function normaliserLots(lots: number, max = LOT_MAX): number {
  if (!Number.isFinite(lots)) return LOT_MIN;
  return Math.min(max, Math.max(LOT_MIN, Math.round(lots * 100) / 100));
}

/** Pas affiché pour la « valeur du pip / point » : pip en forex, 1 point (ou 1 cent si le prix est petit) ailleurs. */
export function pasDePrix(id: string, prix: number): { pas: number; libelle: string } {
  const i = PAR_ID.get(id);
  if (i?.categorie === 'forex' && i.code.length === 6) {
    const pas = i.code.endsWith('JPY') ? 0.01 : 0.0001;
    return { pas, libelle: 'pip' };
  }
  if (prix >= 50) return { pas: 1, libelle: 'point' };
  if (prix >= 1) return { pas: 0.01, libelle: 'centième' };
  return { pas: Math.pow(10, -(i?.decimales ?? 6)), libelle: 'tick' };
}

export function libelleUnite(id: string, unites: number): string {
  const pluriel = uniteQuantite(id);
  // « onces », « actions », « unités », « livres » : singulier jusqu'à 1.
  const u = unites <= 1 && /^(onces|actions|unités|livres)$/.test(pluriel) ? pluriel.slice(0, -1) : pluriel;
  return `${unites.toLocaleString('fr-FR', { maximumFractionDigits: unites >= 100 ? 0 : 4 })} ${u}`;
}

/**
 * Cotations en temps réel des instruments hors Binance (or, forex, indices, énergie, actions), via le hub
 * partagé (flux Yahoo en continu, or animé par PAXG, scanner chaque seconde). Le second argument est conservé
 * pour compatibilité : le rythme est désormais d'une seconde partout.
 */
export function useCotationsScanner(ids: string[], _intervalleMs = 1000): Record<string, Tick> {
  const cle = [...new Set(ids.filter((id) => PAR_ID.get(id)?.source === 'scanner'))].sort().join(',');
  const [version, setVersion] = useState(0);
  const refSources = useRef<SourceInstrument[]>([]);

  useEffect(() => {
    if (!cle) {
      refSources.current = [];
      return;
    }
    const sources: SourceInstrument[] = cle.split(',').map((id) => {
      const i = PAR_ID.get(id)!;
      return { id, cle: cleCotation(id), yahoo: i.yahoo, pilote: i.pilote };
    });
    refSources.current = sources;
    const desabonner = abonner(sources, () => setVersion((v) => v + 1));
    // Recalcul immédiat : les prix déjà connus du hub (autre page, cache) doivent apparaître sans attendre le
    // prochain mouvement du marché (sinon une position ouverte le week-end ou onglet caché resterait sans prix).
    setVersion((v) => v + 1);
    return desabonner;
  }, [cle]);

  return useMemo(() => {
    const sortie: Record<string, Tick> = {};
    for (const s of refSources.current) {
      const t = lireTick(s);
      if (t) sortie[s.cle] = t;
    }
    return sortie;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, cle]);
}
