import { test } from 'node:test';
import { ok } from './outils';
import { ouvrir, appliquerFlux, modifierProtections, reinitialiser } from '../src/trading';
import { COUTS } from '../src/couts';

// Logique pure, sur des prix exacts : sans spread ni swap (testés à part dans couts.test.ts).
COUTS.spread = false;
COUTS.swap = false;

test('Prises de profit partielles', () => {
  const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } } as any);
  let p: any = ouvrir(reinitialiser(10_000_000), 'BINANCE:BTCUSDT', 'achat', 10, 60000, t(60000), { levier: 10, tauxCrypto: 0, prot: { stopLoss: 59000 } });
  const id = p.positions[0].id;
  ok(typeof modifierProtections(p, id, { stopLoss: 59000, paliers: [{ prix: 59900, part: 0.5 }] }, 60000) === 'string', 'palier sous le prix actuel refusé');
  ok(typeof modifierProtections(p, id, { stopLoss: 59000, paliers: [{ prix: 60500, part: 0.7 }, { prix: 61000, part: 0.5 }] }, 60000) === 'string', 'plus de 100 % refusé');
  p = modifierProtections(p, id, { stopLoss: 59000, paliers: [{ prix: 61000, part: 0.3 }, { prix: 60500, part: 0.5 }, { prix: 61500, part: 0.2 }], beApresPalier: true }, 60000);
  ok(p.positions[0].paliers.map((x: any) => x.prix).join(',') === '60500,61000,61500' && p.positions[0].quantiteInitiale === 10, 'paliers triés, volume de référence 10');
  let f = appliquerFlux(p, t(60400), 0); p = f.portefeuille;
  ok(p.positions[0].quantite === 10, '60 400 : rien de fermé');
  f = appliquerFlux(p, t(60500), 0); p = f.portefeuille;
  ok(Math.abs(p.positions[0].quantite - 5) < 1e-9 && p.positions[0].lots === 5 && p.positions[0].stopLoss === 60000 && f.messages.some((m) => m.startsWith('Palier 1')), '60 500 : 50 % fermés, stop au prix d’entrée');
  f = appliquerFlux(p, t(60700), 0); p = f.portefeuille;
  ok(Math.abs(p.positions[0].quantite - 5) < 1e-9, '60 700 : palier 1 ne se redéclenche pas');
  f = appliquerFlux(p, t(61600), 0); p = f.portefeuille;
  ok(p.positions.length === 0 && f.messages.filter((m) => m.startsWith('Palier')).length === 2, '61 600 : paliers 2 et 3 d’un coup, position soldée');
  const gains = p.operations.filter((o: any) => o.type === 'cloture').map((o: any) => Math.round(o.resultat)).reverse();
  // Un palier est une prise de profit à cours limité : exécuté à son prix (61 000, 61 500), même si le cours l'a dépassé.
  ok(gains.join(',') === '2500,3000,3000', `résultats 5 lots ×500 / 3 lots ×1000 / 2 lots ×1500 : ${gains.join(',')}`);
  // Short
  let q: any = ouvrir(reinitialiser(10_000_000), 'BINANCE:BTCUSDT', 'vente', 4, 60000, t(60000), { levier: 10, tauxCrypto: 0 });
  q = modifierProtections(q, q.positions[0].id, { paliers: [{ prix: 59000, part: 0.25 }] }, 60000);
  q = appliquerFlux(q, t(58900), 0).portefeuille;
  ok(Math.abs(q.positions[0].quantite - 3) < 1e-9, 'short : 25 % fermés à 58 900');
  // Réenregistrer après un palier pris : la référence reste 10
  let r: any = ouvrir(reinitialiser(10_000_000), 'BINANCE:BTCUSDT', 'achat', 10, 60000, t(60000), { levier: 10, tauxCrypto: 0 });
  const rid = r.positions[0].id;
  r = modifierProtections(r, rid, { paliers: [{ prix: 60500, part: 0.5 }, { prix: 61000, part: 0.5 }] }, 60000);
  r = appliquerFlux(r, t(60500), 0).portefeuille;
  const pris = r.positions[0].paliers.filter((x: any) => x.fait);
  r = modifierProtections(r, rid, { paliers: [...pris, { prix: 61200, part: 0.5 }] }, 60600);
  ok(r.positions[0].quantiteInitiale === 10, 'réenregistré après un palier : référence toujours 10 lots');
  r = appliquerFlux(r, t(61200), 0).portefeuille;
  ok(r.positions.length === 0, '61 200 : les 50 % restants (5 lots) fermés, position soldée');
});
