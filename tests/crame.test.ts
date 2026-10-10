import { test } from 'node:test';
import { ok } from './outils';
import { ouvrir, appliquerFlux, placerOrdre, reinitialiser, valeurPortefeuille, MESSAGE_CRAME } from '../src/trading';

test('Compte cramé à 99 %', () => {
  const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } } as any);
  // 10 000 $, 1 BTC lot sans levier ~ marge totale ; achat 0,1 lot à 60 000 avec levier 100
  let p = reinitialiser(10000);
  const r = ouvrir(p, 'BINANCE:BTCUSDT', 'achat', 1.5, 60000, t(60000), { levier: 100, tauxCrypto: 0 });
  ok(typeof r !== 'string', 'ouverture : ' + (typeof r === 'string' ? r : 'ok'));
  p = r as any;
  // Chute à 98 % de perte : pas encore cramé (fonds propres 2 %)
  let f: any;
  const capPour = (perte: number) => 60000 - (10000 * perte) / 1.5; // perte en fraction du capital
  f = appliquerFlux(p, t(capPour(0.98)), 0);
  ok(!f.portefeuille.crameLe, 'à 98 % de perte : compte vivant (' + valeurPortefeuille(f.portefeuille, t(capPour(0.98))).capital.toFixed(2) + ' $)');
  f = appliquerFlux(p, t(capPour(0.991)), 0);
  ok(Boolean(f.portefeuille.crameLe), 'à 99,1 % de perte : compte cramé');
  ok(f.portefeuille.positions.length === 0 && f.portefeuille.ordres.length === 0, 'positions fermées, ordres annulés');
  ok(f.portefeuille.operations.some((o) => o.origine === 'crame'), 'clôture marquée « compte cramé »');
  ok(f.messages.some((m) => m.includes('cramé')), 'message : ' + f.messages.join(' | '));
  ok(ouvrir(f.portefeuille, 'BINANCE:BTCUSDT', 'achat', 0.01, 600, t(600), { levier: 1, tauxCrypto: 0 }) === MESSAGE_CRAME, 'nouvel ordre au marché refusé');
  ok(placerOrdre(f.portefeuille, { symbole: 'BINANCE:BTCUSDT', sens: 'achat', type: 'limite', prix: 500, lots: 0.01, levier: 1 } as any, 600, t(600), 0) === MESSAGE_CRAME, 'ordre limite refusé');
  const f2 = appliquerFlux(f.portefeuille, t(500), 0);
  ok(f2.messages.length === 0, 'pas de message répété au tick suivant');
  ok(!reinitialiser(10000).crameLe, 'remise à zéro : compte débloqué');
  // Pertes réalisées accumulées sans position ouverte : le compte crame aussi.
  const sec = { ...reinitialiser(10000), solde: 80 };
  const f3 = appliquerFlux(sec, {} as any, 0);
  ok(Boolean(f3.portefeuille.crameLe), 'pertes réalisées à 99,2 % sans position : compte cramé');
  const sain = { ...reinitialiser(10000), solde: 150 };
  ok(!appliquerFlux(sain, {} as any, 0).portefeuille.crameLe, 'à 98,5 % sans position : compte vivant');
});
