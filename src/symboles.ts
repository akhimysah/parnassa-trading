import type { Symbole } from './types';
import { instrument } from './instruments';

export const CATALOGUE: Symbole[] = [
  // Crypto
  { id: 'BINANCE:BTCUSDT', nom: 'Bitcoin', categorie: 'crypto' },
  { id: 'BINANCE:ETHUSDT', nom: 'Ethereum', categorie: 'crypto' },
  { id: 'BINANCE:SOLUSDT', nom: 'Solana', categorie: 'crypto' },
  { id: 'BINANCE:BNBUSDT', nom: 'BNB', categorie: 'crypto' },
  { id: 'BINANCE:XRPUSDT', nom: 'XRP', categorie: 'crypto' },
  { id: 'BINANCE:DOGEUSDT', nom: 'Dogecoin', categorie: 'crypto' },
  { id: 'BINANCE:ADAUSDT', nom: 'Cardano', categorie: 'crypto' },
  { id: 'BINANCE:AVAXUSDT', nom: 'Avalanche', categorie: 'crypto' },
  { id: 'BINANCE:LINKUSDT', nom: 'Chainlink', categorie: 'crypto' },
  { id: 'CRYPTOCAP:TOTAL', nom: 'Capitalisation crypto totale', categorie: 'crypto' },
  // Actions US
  { id: 'NASDAQ:AAPL', nom: 'Apple', categorie: 'actions-us' },
  { id: 'NASDAQ:MSFT', nom: 'Microsoft', categorie: 'actions-us' },
  { id: 'NASDAQ:NVDA', nom: 'NVIDIA', categorie: 'actions-us' },
  { id: 'NASDAQ:TSLA', nom: 'Tesla', categorie: 'actions-us' },
  { id: 'NASDAQ:AMZN', nom: 'Amazon', categorie: 'actions-us' },
  { id: 'NASDAQ:GOOGL', nom: 'Alphabet', categorie: 'actions-us' },
  { id: 'NASDAQ:META', nom: 'Meta Platforms', categorie: 'actions-us' },
  { id: 'NYSE:BRK.B', nom: 'Berkshire Hathaway', categorie: 'actions-us' },
  // Actions France
  { id: 'EURONEXT:MC', nom: 'LVMH', categorie: 'actions-fr' },
  { id: 'EURONEXT:TTE', nom: 'TotalEnergies', categorie: 'actions-fr' },
  { id: 'EURONEXT:AIR', nom: 'Airbus', categorie: 'actions-fr' },
  { id: 'EURONEXT:OR', nom: "L'Oréal", categorie: 'actions-fr' },
  { id: 'EURONEXT:SAN', nom: 'Sanofi', categorie: 'actions-fr' },
  { id: 'EURONEXT:BNP', nom: 'BNP Paribas', categorie: 'actions-fr' },
  { id: 'EURONEXT:SU', nom: 'Schneider Electric', categorie: 'actions-fr' },
  { id: 'EURONEXT:RMS', nom: 'Hermès', categorie: 'actions-fr' },
  // Indices
  { id: 'FOREXCOM:SPXUSD', nom: 'S&P 500', categorie: 'indices' },
  { id: 'FOREXCOM:NSXUSD', nom: 'Nasdaq 100', categorie: 'indices' },
  { id: 'FOREXCOM:DJI', nom: 'Dow Jones', categorie: 'indices' },
  { id: 'INDEX:CAC40', nom: 'CAC 40', categorie: 'indices' },
  { id: 'INDEX:DEU40', nom: 'DAX', categorie: 'indices' },
  { id: 'FOREXCOM:UKXGBP', nom: 'FTSE 100', categorie: 'indices' },
  { id: 'INDEX:NKY', nom: 'Nikkei 225', categorie: 'indices' },
  { id: 'CAPITALCOM:VIX', nom: 'VIX', categorie: 'indices' },
  // Forex
  { id: 'FX:EURUSD', nom: 'EUR / USD', categorie: 'forex' },
  { id: 'FX:GBPUSD', nom: 'GBP / USD', categorie: 'forex' },
  { id: 'FX:USDJPY', nom: 'USD / JPY', categorie: 'forex' },
  { id: 'FX:EURGBP', nom: 'EUR / GBP', categorie: 'forex' },
  { id: 'FX:USDCHF', nom: 'USD / CHF', categorie: 'forex' },
  { id: 'TVC:DXY', nom: 'Indice dollar', categorie: 'forex' },
  // Matières premières
  { id: 'TVC:GOLD', nom: 'Or', categorie: 'matieres' },
  { id: 'TVC:SILVER', nom: 'Argent', categorie: 'matieres' },
  { id: 'TVC:USOIL', nom: 'Pétrole WTI', categorie: 'matieres' },
  { id: 'TVC:UKOIL', nom: 'Pétrole Brent', categorie: 'matieres' },
  { id: 'NYMEX:NG1!', nom: 'Gaz naturel', categorie: 'matieres' },
];

export const CATEGORIES: Record<Symbole['categorie'], string> = {
  crypto: 'Crypto',
  'actions-us': 'Actions US',
  'actions-fr': 'Actions France',
  indices: 'Indices',
  forex: 'Forex',
  matieres: 'Matières premières',
};

export const LISTE_SUIVI_DEFAUT = [
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'BINANCE:SOLUSDT',
  'NASDAQ:AAPL',
  'NASDAQ:NVDA',
  'NASDAQ:TSLA',
  'EURONEXT:MC',
  'EURONEXT:TTE',
  'FOREXCOM:SPXUSD',
  'INDEX:CAC40',
  'FX:EURUSD',
  'TVC:GOLD',
];

/** Anciens identifiants non servis par les widgets gratuits → équivalents disponibles. */
export const REMPLACEMENTS: Record<string, string> = {
  'SP:SPX': 'FOREXCOM:SPXUSD',
  'TVC:SPX': 'FOREXCOM:SPXUSD',
  'NASDAQ:NDX': 'FOREXCOM:NSXUSD',
  'DJ:DJI': 'FOREXCOM:DJI',
  'TVC:DJI': 'FOREXCOM:DJI',
  'TVC:UKX': 'FOREXCOM:UKXGBP',
  'TVC:NI225': 'INDEX:NKY',
  'TVC:VIX': 'CAPITALCOM:VIX',
  'EURONEXT:PX1': 'INDEX:CAC40',
  'XETR:DAX': 'INDEX:DEU40',
};

export function corriger(id: string): string {
  return REMPLACEMENTS[id] ?? id;
}

export function nomSymbole(id: string): string {
  return CATALOGUE.find((s) => s.id === id)?.nom ?? instrument(id)?.nom ?? id.split(':').pop() ?? id;
}

export function ticker(id: string): string {
  return id.split(':').pop() ?? id;
}

export function bourse(id: string): string {
  return id.includes(':') ? id.split(':')[0] : '';
}

/** Normalise une saisie libre ("btcusdt", "aapl", "nasdaq:aapl") vers la notation TradingView. */
export function normaliser(saisie: string): string {
  const brut = saisie.trim().toUpperCase().replace(/\s+/g, '');
  if (!brut) return '';
  const trouve = CATALOGUE.find(
    (s) => s.id === brut || ticker(s.id) === brut || s.nom.toUpperCase() === brut,
  );
  if (trouve) return trouve.id;
  if (brut.includes(':')) return brut;
  if (/USDT$|USDC$|BUSD$/.test(brut)) return `BINANCE:${brut}`;
  if (/^[A-Z]{6}$/.test(brut)) return `FX:${brut}`;
  return brut; // TradingView résout le marché le plus pertinent.
}

export function rechercher(requete: string): Symbole[] {
  const q = requete.trim().toLowerCase();
  if (!q) return CATALOGUE;
  return CATALOGUE.filter(
    (s) => s.id.toLowerCase().includes(q) || s.nom.toLowerCase().includes(q),
  );
}
