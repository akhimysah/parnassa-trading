import { test } from 'node:test';
import { ok } from './outils';
import { ouvrir, cloturer, placerOrdre, appliquerFlux, reinitialiser, realiseTotal, OPERATIONS_MAX, ajouterOperation } from '../src/trading';

test('Volume par ordre et compactage des opérations', () => {
  const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } } as any);
  const p0 = reinitialiser(2_000_000_000);
  ok(typeof ouvrir(p0, 'BINANCE:BTCUSDT', 'achat', 600, 60000, t(60000), { levier: 100, tauxCrypto: 0 }) === 'string', 'défaut : 600 lots refusés (max 500)');
  const gros = ouvrir(p0, 'BINANCE:BTCUSDT', 'achat', 10000, 60000, t(60000), { levier: 100, tauxCrypto: 0.001, volumeMax: 10000 });
  ok(typeof gros !== 'string' && gros.positions[0].lots === 10000, 'réglage 10 000 : un seul ordre de 10 000 lots');
  ok(typeof ouvrir(p0, 'BINANCE:BTCUSDT', 'achat', 10001, 60000, t(60000), { levier: 100, tauxCrypto: 0, volumeMax: 10000 }) === 'string', 'au-delà du réglage : refusé');
  // Ordre en attente de 2 000 lots : il se déclenche bien
  const att = placerOrdre(p0, { symbole: 'BINANCE:BTCUSDT', sens: 'achat', type: 'limite', prix: 59000, lots: 2000, levier: 100 } as any, 60000, t(60000), 0, 5000);
  ok(typeof att !== 'string' && att.ordres[0].lots === 2000, 'ordre limite de 2 000 lots enregistré');
  const f = appliquerFlux(att as any, t(58900), 0);
  ok(f.portefeuille.positions.length === 1 && f.portefeuille.positions[0].lots === 2000, 'il se déclenche en une position de 2 000 lots');
  // Compactage
  const g = gros as any;
  const op = g.operations[0];
  ok(Math.round(op.frais * 100) === op.frais * 100 && String(op.prix).length <= 12, 'opération compacte : frais au centime, prix court');
  // Archive au-delà de OPERATIONS_MAX
  let p = reinitialiser(1000);
  for (let i = 0; i < OPERATIONS_MAX + 30; i++) p = ajouterOperation(p, { id: 'x' + i, symbole: 'S', sens: 'achat', type: 'cloture', quantite: 1, prix: 1, frais: 1, resultat: 3, date: i } as any);
  ok(p.operations.length === OPERATIONS_MAX && p.archive?.operations === 30 && p.archive.clotures === 30, `archive : ${OPERATIONS_MAX} gardées, 30 résumées`);
  ok(realiseTotal(p) === (OPERATIONS_MAX + 30) * 2, 'P&L réalisé inchangé avec l’archive');
  const taille = JSON.stringify(p).length;
  ok(taille < 1_500_000, `état à ${OPERATIONS_MAX} opérations : ${Math.round(taille / 1000)} Ko`);
});
