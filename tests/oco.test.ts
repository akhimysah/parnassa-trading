import { test } from 'node:test';
import { ok } from './outils';
import { placerCassure, appliquerFlux, placerOrdre, reinitialiser, echeance } from '../src/trading';

test('Ordres de cassure OCO et expiration', () => {
  const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } } as any);
  const p0 = reinitialiser(10_000_000);
  ok(typeof placerCassure(p0, { symbole: 'BINANCE:BTCUSDT', haut: 59000, bas: 58000, lots: 1, levier: 10 }, 60000, t(60000), 0) === 'string', 'prix hors du range : refusé');
  let p: any = placerCassure(p0, { symbole: 'BINANCE:BTCUSDT', haut: 60500, bas: 59500, lots: 2, levier: 10, rr: 2 }, 60000, t(60000), 0);
  const achat = p.ordres.find((o: any) => o.sens === 'achat');
  const vente = p.ordres.find((o: any) => o.sens === 'vente');
  ok(p.ordres.length === 2 && achat.groupeOco && achat.groupeOco === vente.groupeOco, 'deux ordres stop liés (même groupe OCO)');
  ok(achat.stopLoss === 59500 && achat.takeProfit === 62500 && vente.stopLoss === 60500 && vente.takeProfit === 57500, 'stops à l’autre borne, take-profit à 2R');
  const f = appliquerFlux(p, t(60600), 0);
  ok(f.portefeuille.positions.length === 1 && f.portefeuille.positions[0].sens === 'achat' && f.portefeuille.ordres.length === 0, 'cassure par le haut : long ouvert, vente stop annulée');
  ok(f.messages.some((m) => m.startsWith('OCO')), 'message OCO');
  // Expiration
  let q: any = placerOrdre(p0, { symbole: 'BINANCE:BTCUSDT', sens: 'achat', type: 'limite', prix: 59000, lots: 1, levier: 10 } as any, 60000, t(60000), 0);
  q = { ...q, ordres: q.ordres.map((o: any) => ({ ...o, expireLe: Date.now() - 1 })) };
  const g = appliquerFlux(q, t(58000), 0);
  ok(g.portefeuille.ordres.length === 0 && g.portefeuille.positions.length === 0 && g.messages.some((m) => m.includes('expiré')), 'ordre expiré : annulé avant de se déclencher');
  const fin = new Date(echeance('jour')!);
  ok(fin.getHours() === 23 && fin.getMinutes() === 59 && echeance('jamais') === undefined, 'échéance fin de journée à 23:59, « jamais » sans date');
});
