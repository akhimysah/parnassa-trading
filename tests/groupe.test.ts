import { test } from 'node:test';
import { ok } from './outils';
import { grouperPositions } from '../src/composants/PositionsGroupees.tsx';

test('Positions groupées par instrument', () => {
  const t = { BTCUSDT: { prix: 61000 }, ETHUSDT: { prix: 2500 } } as any;
  const pos = (symbole: string, sens: string, lots: number, prixEntree: number) => ({ id: Math.random() + '', symbole, sens, quantite: lots, lots, prixEntree, cout: lots * prixEntree / 10, ouvertLe: 0 } as any);
  const g = grouperPositions([pos('BINANCE:BTCUSDT', 'achat', 1, 60000), pos('BINANCE:BTCUSDT', 'achat', 3, 60400), pos('BINANCE:BTCUSDT', 'vente', 1, 60500), pos('BINANCE:ETHUSDT', 'vente', 2, 2600)], t);
  const btc = g.find((x) => x.symbole === 'BINANCE:BTCUSDT')!;
  ok(btc.nb === 3 && btc.lotsLong === 4 && btc.lotsShort === 1, 'BTC : 3 positions, 4 lots long, 1 lot short');
  ok(btc.moyenLong === 60300 && btc.moyenShort === 60500, 'prix moyens pondérés : long 60 300, short 60 500');
  ok(btc.pnl === 1000 + 1800 - 500, 'P&L du groupe : +1 000 +1 800 −500');
  ok(g[0]!.symbole === 'BINANCE:BTCUSDT' && g[1]!.pnl === 200, 'groupes triés par marge ; ETH short +200');
});
