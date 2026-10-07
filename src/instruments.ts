import { useEffect, useRef, useState } from 'react';
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
  options: { taille?: number; devise?: Instrument['devise'] } = {},
): Instrument => {
  // Devise de cotation déduite du code pour le forex (EURGBP → GBP), sinon USD par défaut.
  const devise = options.devise ?? (categorie === 'forex' && code.length === 6 ? (code.slice(3) as Instrument['devise']) : 'USD');
  return { id, code, nom, categorie, source: 'scanner', decimales, differe, taille: options.taille ?? TAILLES[categorie], devise };
};

/** Les instruments les plus suivis, tous négociables dans le portefeuille papier. */
export const INSTRUMENTS: Instrument[] = [
  // Métaux précieux (temps réel)
  s('OANDA:XAUUSD', 'XAUUSD', 'Or', 'metaux', 2),
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
  s('FX:EURUSD', 'EURUSD', 'Euro / Dollar', 'forex', 5),
  s('FX:GBPUSD', 'GBPUSD', 'Livre / Dollar', 'forex', 5),
  s('FX:USDJPY', 'USDJPY', 'Dollar / Yen', 'forex', 3),
  s('FX:USDCHF', 'USDCHF', 'Dollar / Franc suisse', 'forex', 5),
  s('FX:AUDUSD', 'AUDUSD', 'Dollar australien / Dollar', 'forex', 5),
  s('FX:USDCAD', 'USDCAD', 'Dollar / Dollar canadien', 'forex', 5),
  s('FX:NZDUSD', 'NZDUSD', 'Dollar néo-zélandais / Dollar', 'forex', 5),
  s('FX:EURGBP', 'EURGBP', 'Euro / Livre', 'forex', 5),
  s('FX:EURJPY', 'EURJPY', 'Euro / Yen', 'forex', 3),
  s('FX:GBPJPY', 'GBPJPY', 'Livre / Yen', 'forex', 3),
  s('FX:EURCHF', 'EURCHF', 'Euro / Franc suisse', 'forex', 5),
  s('TVC:DXY', 'DXY', 'Indice dollar', 'forex', 3, 0, { taille: 1000, devise: 'USD' }),
  // Indices
  s('SP:SPX', 'SPX500', 'S&P 500', 'indices', 2, 10),
  s('NASDAQ:NDX', 'NAS100', 'Nasdaq 100', 'indices', 2, 15),
  s('DJ:DJI', 'US30', 'Dow Jones', 'indices', 2, 10),
  s('XETR:DAX', 'GER40', 'DAX', 'indices', 2, 15, { devise: 'EUR' }),
  s('EURONEXT:PX1', 'FRA40', 'CAC 40', 'indices', 2, 15, { devise: 'EUR' }),
  s('TVC:UKX', 'UK100', 'FTSE 100', 'indices', 2, 0, { devise: 'GBP' }),
  s('TVC:NI225', 'JPN225', 'Nikkei 225', 'indices', 2, 0, { taille: 100, devise: 'JPY' }),
  s('CBOE:VIX', 'VIX', 'Volatilité S&P 500', 'indices', 2, 15, { taille: 100 }),
  // Énergie (contrats à terme, différés)
  s('NYMEX:CL1!', 'USOIL', 'Pétrole WTI', 'energie', 2, 10),
  s('ICEEUR:BRN1!', 'UKOIL', 'Pétrole Brent', 'energie', 2, 10),
  s('NYMEX:NG1!', 'NATGAS', 'Gaz naturel', 'energie', 3, 10, { taille: 10000 }),
  // Actions
  s('NASDAQ:AAPL', 'AAPL', 'Apple', 'actions-us', 2, 15),
  s('NASDAQ:MSFT', 'MSFT', 'Microsoft', 'actions-us', 2, 15),
  s('NASDAQ:NVDA', 'NVDA', 'NVIDIA', 'actions-us', 2, 15),
  s('NASDAQ:AMZN', 'AMZN', 'Amazon', 'actions-us', 2, 15),
  s('NASDAQ:GOOGL', 'GOOGL', 'Alphabet', 'actions-us', 2, 15),
  s('NASDAQ:META', 'META', 'Meta Platforms', 'actions-us', 2, 15),
  s('NASDAQ:TSLA', 'TSLA', 'Tesla', 'actions-us', 2, 15),
  s('EURONEXT:MC', 'MC', 'LVMH', 'actions-fr', 2, 15, { devise: 'EUR' }),
  s('EURONEXT:TTE', 'TTE', 'TotalEnergies', 'actions-fr', 2, 15, { devise: 'EUR' }),
  s('EURONEXT:AIR', 'AIR', 'Airbus', 'actions-fr', 2, 15, { devise: 'EUR' }),
  s('EURONEXT:OR', 'OR', "L'Oréal", 'actions-fr', 2, 15, { devise: 'EUR' }),
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

/** Arrondi au centième de lot, borné entre 0,01 et 500. */
export function normaliserLots(lots: number): number {
  if (!Number.isFinite(lots)) return LOT_MIN;
  return Math.min(LOT_MAX, Math.max(LOT_MIN, Math.round(lots * 100) / 100));
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

const URL_SCANNER = 'https://scanner.tradingview.com/global/scan';

/**
 * Cotations des instruments hors Binance (or, forex, indices, actions…) via le scanner public TradingView,
 * interrogé toutes les `intervalleMs` ms tant que la liste n'est pas vide.
 */
export function useCotationsScanner(ids: string[], intervalleMs = 3000): Record<string, Tick> {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const cle = [...new Set(ids.filter((id) => PAR_ID.get(id)?.source === 'scanner'))].sort().join(',');
  const refEnCours = useRef(false);

  useEffect(() => {
    if (!cle) return;
    const liste = cle.split(',');
    let vivant = true;
    let charge = false;
    const tour = async () => {
      // Onglet caché : on garde le premier chargement, puis on suspend les rafraîchissements.
      if (refEnCours.current || (charge && document.visibilityState === 'hidden')) return;
      refEnCours.current = true;
      try {
        // Corps en texte brut (pas d'en-tête JSON) : requête « simple », sans pré-vérification CORS,
        // car le scanner n'autorise pas l'en-tête Content-Type: application/json.
        const r = await fetch(URL_SCANNER, {
          method: 'POST',
          body: JSON.stringify({ symbols: { tickers: liste }, columns: ['close', 'change', 'high', 'low'] }),
        });
        if (!r.ok) return;
        const d = (await r.json()) as { data?: { s: string; d: (number | null)[] }[] };
        if (!vivant || !d.data) return;
        charge = true;
        const maintenant = Date.now();
        const nouveaux: Record<string, Tick> = {};
        for (const ligne of d.data) {
          const [close, change, haut, bas] = ligne.d;
          if (typeof close !== 'number') continue;
          const variation = typeof change === 'number' ? change : 0;
          nouveaux[cleCotation(ligne.s)] = {
            prix: close,
            ouverture24h: close / (1 + variation / 100),
            haut24h: typeof haut === 'number' ? haut : close,
            bas24h: typeof bas === 'number' ? bas : close,
            volume24h: 0,
            recuLe: maintenant,
          };
        }
        setTicks((anciens) => ({ ...anciens, ...nouveaux }));
      } catch {
        // réseau indisponible : nouvel essai au tour suivant
      } finally {
        refEnCours.current = false;
      }
    };
    void tour();
    const t = window.setInterval(() => void tour(), intervalleMs);
    return () => {
      vivant = false;
      window.clearInterval(t);
    };
  }, [cle, intervalleMs]);

  return ticks;
}
