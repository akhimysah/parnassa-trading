import { test } from 'node:test';
import { ok } from './outils';
import { controleRisqueTrade, perteAuStop } from '../src/discipline';
import { modifierProtections, ouvrir, placerOrdre, reinitialiser } from '../src/trading';
import { COUTS } from '../src/couts';

// Logique pure, sur des prix exacts : sans spread ni swap (testés à part dans couts.test.ts).
COUTS.spread = false;
COUTS.swap = false;

const tick = (prix: number) => ({ prix, variation: 0, variationPct: 0, haut: prix, bas: prix, volume: 0 }) as any;

test('Risque max par trade et stop obligatoire', () => {
  const ticks = { EURUSD: tick(1.1) };
  const p = reinitialiser(100000);
  const regles = { actif: true, fermerAuto: true, stopObligatoire: true, risqueTradePct: 1 };
  ok(Math.abs(perteAuStop({ symbole: 'FX:EURUSD', sens: 'achat', unites: 100000, entree: 1.1, stopLoss: 1.09 }, ticks) - 1000) < 1e-6, '1 lot EURUSD, stop à 100 pips : 1 000 $');
  ok(perteAuStop({ symbole: 'FX:EURUSD', sens: 'vente', unites: 100000, entree: 1.1, stopLoss: 1.09 }, ticks) === 0, 'stop déjà en gain : aucune perte');

  const sansStop = ouvrir(p, 'FX:EURUSD', 'achat', 1, 1.1, ticks, { levier: 100 });
  ok(typeof sansStop !== 'string', 'ouverture moteur');
  if (typeof sansStop === 'string') return;
  ok(controleRisqueTrade(p, sansStop, regles, 100000, ticks)?.includes('stop-loss obligatoire') === true, 'sans stop : refusé');
  ok(controleRisqueTrade(p, sansStop, { ...regles, stopObligatoire: false }, 100000, ticks)?.includes('Posez un stop-loss') === true, 'risque max sans stop : refusé aussi');
  ok(controleRisqueTrade(p, sansStop, { ...regles, actif: false }, 100000, ticks) === null, 'discipline inactive : libre');

  const large = ouvrir(p, 'FX:EURUSD', 'achat', 2, 1.1, ticks, { levier: 100, prot: { stopLoss: 1.09 } });
  if (typeof large === 'string') return ok(false, large);
  const msg = controleRisqueTrade(p, large, regles, 100000, ticks);
  ok(Boolean(msg?.includes('(2 %)') && msg?.includes('Volume max à ce stop : 1 lot')), '2 lots à 100 pips = 2 % : refusé, conseil 1 lot');
  const juste = ouvrir(p, 'FX:EURUSD', 'achat', 1, 1.1, ticks, { levier: 100, prot: { stopLoss: 1.09 } });
  if (typeof juste === 'string') return ok(false, juste);
  ok(controleRisqueTrade(p, juste, regles, 100000, ticks) === null, '1 lot à 100 pips = 1 % : accepté');

  const pos = juste.positions[0]!;
  const elargi = modifierProtections(juste, pos.id, { stopLoss: 1.08 }, 1.1);
  if (typeof elargi === 'string') return ok(false, elargi);
  ok(controleRisqueTrade(juste, elargi, regles, 100000, ticks)?.includes('Rapprochez le stop') === true, 'stop élargi au-delà du risque : refusé');
  const retire = modifierProtections(juste, pos.id, {}, 1.1);
  if (typeof retire === 'string') return ok(false, retire);
  ok(controleRisqueTrade(juste, retire, regles, 100000, ticks)?.includes('ne peut pas être retiré') === true, 'stop retiré : refusé');
  const tpSeul = modifierProtections(juste, pos.id, { stopLoss: 1.09, takeProfit: 1.12 }, 1.1);
  if (typeof tpSeul === 'string') return ok(false, tpSeul);
  ok(controleRisqueTrade(juste, tpSeul, regles, 100000, ticks) === null, 'ajout d’un TP sans toucher au stop : accepté');

  // Position ouverte avant la règle avec un stop à 3 % : on peut le rapprocher, pas l'éloigner.
  const ancienne = ouvrir(p, 'FX:EURUSD', 'achat', 3, 1.1, ticks, { levier: 100, prot: { stopLoss: 1.09 } });
  if (typeof ancienne === 'string') return ok(false, ancienne);
  const idA = ancienne.positions[0]!.id;
  const rapproche = modifierProtections(ancienne, idA, { stopLoss: 1.095 }, 1.1);
  if (typeof rapproche === 'string') return ok(false, rapproche);
  ok(controleRisqueTrade(ancienne, rapproche, regles, 100000, ticks) === null, 'stop rapproché de 3 % à 1,5 % : permis même au-dessus de la limite');
  const eloigne = modifierProtections(ancienne, idA, { stopLoss: 1.085 }, 1.1);
  if (typeof eloigne === 'string') return ok(false, eloigne);
  ok(controleRisqueTrade(ancienne, eloigne, regles, 100000, ticks) !== null, 'stop éloigné : refusé');
  const sansStopAvant = ouvrir(p, 'FX:EURUSD', 'achat', 3, 1.1, ticks, { levier: 100 });
  if (typeof sansStopAvant === 'string') return ok(false, sansStopAvant);
  const premierStop = modifierProtections(sansStopAvant, sansStopAvant.positions[0]!.id, { stopLoss: 1.09 }, 1.1);
  if (typeof premierStop === 'string') return ok(false, premierStop);
  ok(controleRisqueTrade(sansStopAvant, premierStop, regles, 100000, ticks) === null, 'poser un premier stop sur une position qui n’en avait pas : permis');

  const ordre = placerOrdre(p, { symbole: 'FX:EURUSD', sens: 'achat', type: 'limite', prix: 1.09, lots: 3, levier: 100, stopLoss: 1.085 }, 1.1, ticks);
  if (typeof ordre === 'string') return ok(false, ordre);
  ok(controleRisqueTrade(p, ordre, regles, 100000, ticks)?.includes('ordre limite') === true, 'ordre limite : 3 lots à 50 pips = 1 500 $, refusé');
  const petit = placerOrdre(p, { symbole: 'FX:EURUSD', sens: 'achat', type: 'limite', prix: 1.09, lots: 2, levier: 100, stopLoss: 1.085 }, 1.1, ticks);
  if (typeof petit === 'string') return ok(false, petit);
  ok(controleRisqueTrade(p, petit, regles, 100000, ticks) === null, 'ordre limite : 2 lots à 50 pips = 1 000 $, accepté');
});
