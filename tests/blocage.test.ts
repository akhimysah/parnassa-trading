import { test } from 'node:test';
import { ok } from './outils';
import { appliquerFlux, expirerOrdres, placerOrdre, reinitialiser } from '../src/trading';

const t = (prix: number) => ({ BTCUSDT: { prix, variation: 0, haut: prix, bas: prix, volume: 0, t: Date.now() } }) as any;

test('Ordres en attente et règles de blocage', () => {
  const p0 = placerOrdre(reinitialiser(1_000_000), { symbole: 'BINANCE:BTCUSDT', sens: 'achat', type: 'limite', prix: 59000, lots: 1, levier: 10 } as any, 60000, t(60000), 0) as any;
  const annule = appliquerFlux(p0, t(58900), 0, () => ({ raison: 'discipline du jour', annuler: true }));
  ok(annule.portefeuille.positions.length === 0 && annule.portefeuille.ordres.length === 0 && annule.messages.some((m) => m.includes('annulé : discipline')), 'discipline : ordre annulé au lieu de s’exécuter');
  const reporte = appliquerFlux(p0, t(58900), 0, () => ({ raison: 'news', annuler: false }));
  ok(reporte.portefeuille.positions.length === 0 && reporte.portefeuille.ordres.length === 1, 'news : ordre reporté, toujours en attente');
  const libre = appliquerFlux(reporte.portefeuille, t(58900), 0, () => null);
  ok(libre.portefeuille.positions.length === 1, 'fenêtre passée : l’ordre s’exécute');
  const avecEcheance = { ...p0, ordres: p0.ordres.map((o: any) => ({ ...o, expireLe: Date.now() - 1 })) };
  const e = expirerOrdres(avecEcheance);
  ok(e.portefeuille.ordres.length === 0 && e.messages.length === 1, 'expiration sans tick : ordre retiré');
  ok(expirerOrdres(p0).portefeuille === p0, 'rien à expirer : portefeuille inchangé');
});
