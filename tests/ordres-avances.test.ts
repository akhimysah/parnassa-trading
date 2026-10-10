import { test } from 'node:test';
import { ok } from './outils';
import { COUTS } from '../src/couts';
import { appliquerFlux, ouvrir, placerOrdre, programmerCloture, reinitialiser } from '../src/trading';

// Prix exacts pour raisonner sur les déclenchements (le spread est testé dans couts.test.ts).
COUTS.spread = false;
COUTS.swap = false;
const t = (prix: number) => ({ BTCUSDT: { prix } }) as any;

test('Stop-limite : stop franchi, puis limite qui borne le prix', () => {
  const p0 = reinitialiser(1_000_000);
  const base = { symbole: 'BINANCE:BTCUSDT', sens: 'achat' as const, type: 'stop-limite' as const, prix: 81000, lots: 1, levier: 10 };
  ok(typeof placerOrdre(p0, { ...base }, 80000, t(80000)) === 'string', 'prix limite manquant : refusé');
  ok(typeof placerOrdre(p0, { ...base, prixLimite: 80900 }, 80000, t(80000)) === 'string', 'achat : limite sous le stop refusée');
  ok(typeof placerOrdre(p0, { ...base, prix: 79000, prixLimite: 79100 }, 80000, t(80000)) === 'string', 'stop d’achat sous le prix actuel refusé');
  const p = placerOrdre(p0, { ...base, prixLimite: 81100 }, 80000, t(80000));
  if (typeof p === 'string') return ok(false, p);

  ok(appliquerFlux(p, t(80900), 0).portefeuille.ordres[0]!.type === 'stop-limite', 'sous le stop : rien');
  // Le marché saute au-dessus de la limite : le stop se déclenche mais la limite n'est pas exécutable.
  const saut = appliquerFlux(p, t(81500), 0);
  const limite = saut.portefeuille.ordres[0]!;
  ok(saut.portefeuille.positions.length === 0 && limite.type === 'limite' && limite.prix === 81100, 'gap au-dessus de la limite : ordre limite posé à 81 100, pas d’achat à 81 500');
  ok(saut.messages.some((m) => m.includes('Stop-limite')), 'message de déclenchement');
  const retour = appliquerFlux(saut.portefeuille, t(81050), 0).portefeuille;
  ok(retour.positions.length === 1 && retour.positions[0]!.prixEntree === 81050 && retour.ordres.length === 0, 'retour sous la limite : exécuté au marché (81 050, mieux que la limite)');

  // Franchissement normal : stop et limite dans la foulée.
  const direct = appliquerFlux(p, t(81020), 0).portefeuille;
  ok(direct.positions.length === 1 && direct.positions[0]!.prixEntree === 81020, 'stop franchi, prix sous la limite : exécuté tout de suite');

  const vente = placerOrdre(p0, { ...base, sens: 'vente', prix: 79000, prixLimite: 78900 }, 80000, t(80000));
  if (typeof vente === 'string') return ok(false, vente);
  const v = appliquerFlux(vente, t(78950), 0).portefeuille;
  ok(v.positions.length === 1 && v.positions[0]!.sens === 'vente' && v.positions[0]!.prixEntree === 78950, 'stop-limite de vente : exécuté entre le stop et la limite');
  ok(appliquerFlux(vente, t(78800), 0).portefeuille.positions.length === 0, 'vente : gap sous la limite, pas de vente à 78 800');
});

test('Clôture programmée', () => {
  const p = ouvrir(reinitialiser(1_000_000), 'BINANCE:BTCUSDT', 'achat', 1, 80000, t(80000), { levier: 10, tauxCrypto: 0 });
  if (typeof p === 'string') return ok(false, p);
  const id = p.positions[0]!.id;
  ok(typeof programmerCloture(p, id, Date.now() - 1000) === 'string', 'heure passée refusée');
  const futur = programmerCloture(p, id, Date.now() + 3600000);
  if (typeof futur === 'string') return ok(false, futur);
  ok(appliquerFlux(futur, t(80500), 0).portefeuille.positions.length === 1, 'avant l’heure : position gardée');
  const echu = programmerCloture(p, id, Date.now() + 5);
  if (typeof echu === 'string') return ok(false, echu);
  const avant = Date.now();
  while (Date.now() <= avant + 10) {
    // attente active de quelques millisecondes : l'heure programmée passe
  }
  ok(appliquerFlux(echu, t(80500), 0, undefined, () => false).portefeuille.positions.length === 1, 'heure passée mais marché fermé : attend la réouverture');
  const ferme = appliquerFlux(echu, t(80500), 0).portefeuille;
  ok(ferme.positions.length === 0 && ferme.operations[0]!.origine === 'programmee' && ferme.operations[0]!.resultat === 500, 'heure passée : fermée au marché (+500)');
  const annule = programmerCloture(futur, id, undefined);
  ok(typeof annule !== 'string' && annule.positions[0]!.fermerLe === undefined, 'programmation annulée');
});
