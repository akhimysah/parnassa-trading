import { test } from 'node:test';
import { ok } from './outils';
import { expositionParActif, jambes, risqueOuvert } from '../src/exposition';
import type { Position } from '../src/types';

const pos = (id: string, symbole: string, sens: 'achat' | 'vente', quantite: number, prixEntree: number, extra: Partial<Position> = {}): Position => ({ id, symbole, sens, quantite, prixEntree, cout: 0, ouvertLe: 0, ...extra });
const tick = (prix: number) => ({ prix, variation: 0, variationPct: 0, haut: prix, bas: prix, volume: 0 }) as any;

test('Risque ouvert et exposition', () => {
  ok(jambes('FX:EURUSD').join() === 'EUR,USD' && jambes('OANDA:XAUUSD').join() === 'XAU,USD', 'forex et métaux : deux jambes');
  ok(jambes('BINANCE:BTCUSDT').join() === 'BTC' && jambes('SP:SPX').join() === 'SPX500', 'crypto et indices : l’actif lui-même');

  const ticks = { EURUSD: tick(1.1), BTCUSDT: tick(60000), USDJPY: tick(150) };
  const positions = [
    pos('a', 'FX:EURUSD', 'achat', 100000, 1.1, { stopLoss: 1.09, takeProfit: 1.12 }),
    pos('b', 'BINANCE:BTCUSDT', 'vente', 1, 60000, { stopLoss: 59000 }),
    pos('c', 'FX:USDJPY', 'achat', 100000, 150),
  ];
  const r = risqueOuvert(positions, ticks);
  ok(Math.abs(r.perteAuxStops - -1000) < 1e-6, 'stop EURUSD à 100 pips : −1 000 $');
  ok(Math.abs(r.verrouille - 1000) < 1e-6, 'stop du short BTC sous l’entrée : +1 000 $ verrouillés');
  ok(Math.abs(r.gainAuxCibles - 2000) < 1e-6 && r.avecCible === 1, 'cible EURUSD : +2 000 $');
  ok(r.sansStop.length === 1 && r.sansStop[0]!.id === 'c', 'USDJPY sans stop');

  const e = expositionParActif(positions, ticks);
  const de = (a: string) => e.find((l) => l.actif === a)?.net ?? 0;
  ok(Math.abs(de('EUR') - 110000) < 1e-6, 'long EUR 110 000 $');
  ok(Math.abs(de('BTC') - -60000) < 1e-6, 'short BTC 60 000 $');
  // Long EURUSD : −110 000 $ de USD ; long USDJPY : +100 000 $ de USD → net −10 000 $.
  ok(Math.abs(de('USD') - -10000) < 1e-6 && Math.abs(e.find((l) => l.actif === 'USD')!.brut - 210000) < 1e-6, 'USD : jambes opposées compensées');
  ok(Math.abs(de('JPY') - -100000) < 1e-6, 'short JPY 100 000 $ (converti en USD)');
  ok(e[0]!.actif === 'EUR' && e[e.length - 1]!.actif === 'USD', 'trié par exposition nette décroissante');
  ok(expositionParActif([], ticks).length === 0 && risqueOuvert([], ticks).sansStop.length === 0, 'aucune position : rien');
});
