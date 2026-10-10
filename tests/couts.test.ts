import { test } from 'node:test';
import { ok } from './outils';
import { appliquerSwaps, coteEntree, coteSortie, fourchette, multiplicateurSwap, rollovers, swapNuit } from '../src/couts';
import { appliquerFlux, cloturer, lotsParRisque, ouvrir, placerOrdre, pnlMarche, reinitialiser, valeurPortefeuille } from '../src/trading';

const tick = (prix: number) => ({ prix, variation: 0, variationPct: 0, haut: prix, bas: prix, volume: 0 }) as any;
const proche = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

test('Spread : achat à l’ask, vente au bid, stops et cibles côté sortie', () => {
  const f = fourchette('FX:EURUSD', 1.1);
  ok(proche(f.spread, 1.1 * 0.7e-4) && proche(f.ask - f.bid, f.spread), 'EURUSD : spread ≈ 0,77 pip');
  ok(coteEntree('FX:EURUSD', 'achat', 1.1) === f.ask && coteEntree('FX:EURUSD', 'vente', 1.1) === f.bid, 'entrée : ask à l’achat, bid à la vente');
  ok(coteSortie('FX:EURUSD', 'achat', 1.1) === f.bid && coteSortie('FX:EURUSD', 'vente', 1.1) === f.ask, 'sortie : bid pour un long, ask pour un short');

  const ticks = { EURUSD: tick(1.1) };
  const p = ouvrir(reinitialiser(100000), 'FX:EURUSD', 'achat', 1, 1.1, ticks, { levier: 100, tauxCrypto: 0 });
  if (typeof p === 'string') return ok(false, p);
  const pos = p.positions[0]!;
  ok(proche(pos.prixEntree, f.ask), 'achat au marché exécuté à l’ask');
  ok(proche(pnlMarche(pos, 1.1, ticks), -f.spread * 100000), 'tout juste ouverte : le spread se voit en perte latente (≈ −7,7 $)');
  ok(proche(valeurPortefeuille(p, ticks).latent, -f.spread * 100000), 'fonds propres valorisés au bid');
  const ferme = cloturer(p, pos.id, 1.1, ticks, { tauxCrypto: 0 });
  if (typeof ferme === 'string') return ok(false, ferme);
  ok(proche(ferme.operations[0]!.prix, f.bid) && proche(ferme.operations[0]!.resultat!, -f.spread * 100000), 'fermé au bid : on perd exactement le spread');

  // Stop-loss d'un long jugé sur le bid : déclenché quand le bid touche le stop, même si le milieu est au-dessus.
  const avecStop = ouvrir(reinitialiser(100000), 'FX:EURUSD', 'achat', 1, 1.1, ticks, { levier: 100, tauxCrypto: 0, prot: { stopLoss: 1.0999, takeProfit: 1.102 } });
  if (typeof avecStop === 'string') return ok(false, avecStop);
  const milieuStop = 1.0999 + fourchette('FX:EURUSD', 1.0999).spread / 2 + 1e-7; // bid juste au-dessus du stop
  ok(appliquerFlux(avecStop, { EURUSD: tick(milieuStop) }, 0).portefeuille.positions.length === 1, 'bid au-dessus du stop : rien');
  const touche = appliquerFlux(avecStop, { EURUSD: tick(1.0999 + 0.00002) }, 0).portefeuille;
  ok(touche.positions.length === 0 && touche.operations[0]!.origine === 'stop-loss', 'bid sous le stop (milieu encore au-dessus) : stoppé');
  const cible = appliquerFlux(avecStop, { EURUSD: tick(1.1025) }, 0).portefeuille;
  ok(cible.operations[0]!.origine === 'take-profit' && cible.operations[0]!.prix === 1.102, 'take-profit exécuté à son prix exact');

  // Ordre limite d'achat : déclenché sur l'ask, exécuté à son prix.
  const lim = placerOrdre(reinitialiser(100000), { symbole: 'FX:EURUSD', sens: 'achat', type: 'limite', prix: 1.099, lots: 1, levier: 100 }, 1.1, ticks);
  if (typeof lim === 'string') return ok(false, lim);
  ok(appliquerFlux(lim, { EURUSD: tick(1.099) }, 0).portefeuille.positions.length === 0, 'milieu au prix limite mais ask au-dessus : pas encore');
  const execute = appliquerFlux(lim, { EURUSD: tick(1.09895) }, 0).portefeuille;
  ok(execute.positions.length === 1 && execute.positions[0]!.prixEntree === 1.099, 'ask sous la limite : exécuté au prix limite');

  // Taille au risque : avec une entrée prévue à l'ask, la perte au stop vaut exactement le risque.
  const lots = lotsParRisque(1000, f.ask, 1.09, 'FX:EURUSD', ticks)!;
  ok(proche((f.ask - 1.09) * lots * 100000, 1000, 1e-6), 'lots au risque calculés depuis l’ask');
});

test('Swap : nuits facturées, triple jour, réalisé à la clôture', () => {
  const mer = Date.UTC(2026, 9, 14, 21); // mercredi 14 octobre 2026, 21 h UTC
  ok(multiplicateurSwap('forex', mer) === 3 && multiplicateurSwap('indices', mer) === 1, 'mercredi : triple pour le change, simple pour les indices');
  const ven = Date.UTC(2026, 9, 16, 21);
  ok(multiplicateurSwap('indices', ven) === 3 && multiplicateurSwap('forex', ven) === 1, 'vendredi : triple pour les indices');
  ok(multiplicateurSwap('forex', Date.UTC(2026, 9, 17, 21)) === 0 && multiplicateurSwap('crypto', Date.UTC(2026, 9, 17, 21)) === 1, 'samedi : rien, sauf la crypto');
  ok(rollovers(Date.UTC(2026, 9, 14, 20), Date.UTC(2026, 9, 16, 22)).length === 3, '3 passages de nuit (mer, jeu, ven)');
  ok(rollovers(Date.UTC(2026, 9, 14, 21), Date.UTC(2026, 9, 15, 20)).length === 0, 'le passage déjà compté ne compte pas deux fois');

  const ticks = { EURUSD: tick(1.1) };
  const p0 = ouvrir(reinitialiser(100000), 'FX:EURUSD', 'achat', 1, 1.1, ticks, { levier: 100, tauxCrypto: 0 });
  if (typeof p0 === 'string') return ok(false, p0);
  const pos = p0.positions[0]!;
  const unJour = swapNuit(pos, 1.1, ticks, Date.UTC(2026, 9, 13, 21));
  ok(proche(unJour, (-110000 * 0.015) / 365), 'une nuit EURUSD : 110 000 $ × 1,5 % ÷ 365 ≈ −4,52 $');
  // Position ouverte mardi 18 h UTC, on regarde jeudi 22 h UTC : mardi ×1 + mercredi ×3 = 4 jours.
  const p = { ...p0, positions: [{ ...pos, swapCompteAu: Date.UTC(2026, 9, 13, 18) }] };
  const apres = appliquerSwaps(p, ticks, Date.UTC(2026, 9, 15, 22));
  const s = apres.positions[0]!.swap!;
  ok(proche(s, Math.round(unJour * 5 * 100) / 100, 0.011), `mardi + mercredi (×3) + jeudi = 5 jours de swap : ${s}`);
  ok(apres.positions[0]!.swapCompteAu === Date.UTC(2026, 9, 15, 21), 'dernier passage compté');
  ok(appliquerSwaps(apres, ticks, Date.UTC(2026, 9, 15, 23)) === apres, 'rien de neuf : portefeuille inchangé');
  const ancienne = { ...p0, positions: [{ ...pos, swapCompteAu: undefined }] };
  const init = appliquerSwaps(ancienne, ticks, Date.UTC(2026, 9, 15, 22));
  ok(init.positions[0]!.swap === undefined && init.positions[0]!.swapCompteAu === Date.UTC(2026, 9, 15, 22), 'position d’avant les swaps : rien de rétroactif');

  ok(proche(valeurPortefeuille(apres, ticks).latent, pnlMarche(apres.positions[0]!, 1.1, ticks)), 'swap compris dans les fonds propres');
  const moitie = cloturer(apres, pos.id, 1.1, ticks, { tauxCrypto: 0, quantite: 50000 });
  if (typeof moitie === 'string') return ok(false, moitie);
  ok(proche(moitie.operations[0]!.swap!, Math.round(s * 50) / 100, 0.011) && proche(moitie.positions[0]!.swap!, s - moitie.operations[0]!.swap!, 0.011), 'clôture de moitié : la moitié du swap réalisée, le reste sur la position');
});
