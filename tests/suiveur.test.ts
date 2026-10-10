import { test } from 'node:test';
import { ok } from './outils';
import { ouvrir, appliquerFlux, modifierProtections, breakEven, reinitialiser } from '../src/trading';

test('Stop suiveur et break-even', () => {
  const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } } as any);
  let p = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'achat', 1, 60000, t(60000), { levier: 10, tauxCrypto: 0 }) as any;
  const id = p.positions[0].id;
  // Stop suiveur de 500 $ sans stop-loss : démarre à 59 500
  p = modifierProtections(p, id, { suiveur: 500 }, 60000);
  ok(typeof p !== 'string' && p.positions[0].stopLoss === 59500 && p.positions[0].suiveur === 500, 'suiveur 500 : stop placé à 59 500');
  let f = appliquerFlux(p, t(61000), 0); p = f.portefeuille;
  ok(p.positions[0].stopLoss === 60500, 'prix 61 000 : le stop monte à 60 500 (au-dessus de l’entrée)');
  f = appliquerFlux(p, t(60800), 0); p = f.portefeuille;
  ok(p.positions[0].stopLoss === 60500 && p.positions.length === 1, 'prix recule à 60 800 : le stop ne recule pas');
  f = appliquerFlux(p, t(60400), 0); p = f.portefeuille;
  ok(p.positions.length === 0 && f.messages.some((m) => m.startsWith('Stop suiveur')) && p.operations[0].origine === 'stop-loss' && p.operations[0].resultat > 0, 'prix 60 400 : fermée par le stop suiveur, en gain');
  // Short
  let q = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'vente', 1, 60000, t(60000), { levier: 10, tauxCrypto: 0 }) as any;
  q = modifierProtections(q, q.positions[0].id, { suiveur: 300 }, 60000);
  q = appliquerFlux(q, t(59000), 0).portefeuille;
  ok(q.positions[0].stopLoss === 59300, 'short : le stop descend à 59 300 quand le prix va à 59 000');
  // Break-even
  let b = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'achat', 1, 60000, t(60000), { levier: 10, tauxCrypto: 0 }) as any;
  ok(typeof breakEven(b, b.positions[0].id, 59900) === 'string', 'break-even refusé si la position est en perte');
  const be = breakEven(b, b.positions[0].id, 60300) as any;
  ok(be.positions[0].stopLoss === 60000, 'break-even : stop au prix d’entrée');
  // Stop au-dessus de l'entrée accepté s'il reste sous le prix actuel
  ok(typeof modifierProtections(b, b.positions[0].id, { stopLoss: 60200 }, 60500) !== 'string', 'stop 60 200 accepté (prix actuel 60 500)');
  ok(typeof modifierProtections(b, b.positions[0].id, { stopLoss: 60600 }, 60500) === 'string', 'stop au-dessus du prix actuel refusé');
  ok(typeof modifierProtections(b, b.positions[0].id, { suiveur: -5 }, 60500) === 'string', 'distance négative refusée');
  // Comme MT5 : un stop fixe à 300 et un suiveur de 200 → le stop reste à 300 tant que le gain < 200
  let m = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'achat', 1, 60000, t(60000), { levier: 10, tauxCrypto: 0, prot: { stopLoss: 59700, suiveur: 200 } }) as any;
  ok(m.positions[0].stopLoss === 59700 && m.positions[0].suiveur === 200, 'ouverture avec SL 59 700 et suiveur 200');
  m = appliquerFlux(m, t(60150), 0).portefeuille;
  ok(m.positions[0].stopLoss === 59700, 'gain de 150 (< 200) : le stop fixe reste à 59 700');
  m = appliquerFlux(m, t(60250), 0).portefeuille;
  ok(m.positions[0].stopLoss === 60050, 'gain de 250 : le suiveur prend le relais à 60 050');
  let n = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'vente', 1, 60000, t(60000), { levier: 10, tauxCrypto: 0, prot: { suiveur: 100 } }) as any;
  ok(n.positions[0].stopLoss === 60100, 'short ouvert avec un suiveur seul : stop à 60 100');
});
