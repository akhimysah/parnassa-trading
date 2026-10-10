import { test } from 'node:test';
import { ok } from './outils';
import { generateur, monteCarlo, rendementsTrades } from '../src/montecarlo';
import { reinitialiser } from '../src/trading';
import type { Operation } from '../src/types';

const cloture = (id: string, date: number, resultat: number, frais = 0): Operation => ({ id, date, type: 'cloture', symbole: 'X', sens: 'achat', quantite: 1, prix: 1, frais, resultat });

test('Projection Monte-Carlo', () => {
  const a = generateur(7);
  const b = generateur(7);
  ok([1, 2, 3].every(() => a() === b()), 'graine identique : mêmes tirages');

  const p = { ...reinitialiser(1000), operations: [cloture('2', 2, -110, 0), cloture('1', 1, 100, 0)] };
  const r = rendementsTrades(p);
  ok(r.length === 2 && Math.abs(r[0]! - 0.1) < 1e-12 && Math.abs(r[1]! - -0.1) < 1e-12, 'rendements dans l’ordre, rapportés aux fonds réalisés avant le trade');

  const gagnant = monteCarlo([0.01], { trades: 20, objectifPct: 10, perteMaxPct: 10, simulations: 200 });
  ok(gagnant.probaObjectif === 1 && gagnant.probaRuine === 0, 'toujours +1 % : objectif sûr, aucune ruine');
  ok(Math.abs(gagnant.final.p50 - 1.01 ** 20) < 1e-9, 'fonds finaux composés');
  ok(gagnant.bandes[0]!.n === 0 && gagnant.bandes[gagnant.bandes.length - 1]!.n === 20, 'éventail du départ au dernier trade');

  const perdant = monteCarlo([-0.05], { trades: 120, perteMaxPct: 99, simulations: 100 });
  ok(perdant.probaRuine === 1 && perdant.probaObjectif === null, 'toujours −5 % : ruine certaine à la règle des 99 %');
  ok(perdant.final.p95 <= 0.01, 'la trajectoire reste figée au plancher');
  ok(Math.abs(perdant.drawdown.p50 - 99.03) < 0.1, 'drawdown mesuré jusqu’à l’arrêt');

  const mixte = monteCarlo([0.02, -0.01], { trades: 100, objectifPct: 10, perteMaxPct: 10, simulations: 2000, graine: 1 });
  const encore = monteCarlo([0.02, -0.01], { trades: 100, objectifPct: 10, perteMaxPct: 10, simulations: 2000, graine: 1 });
  ok(mixte.probaObjectif === encore.probaObjectif, 'reproductible');
  ok(mixte.probaObjectif! > 0.9 && mixte.probaRuine < 0.05, 'espérance positive : objectif très probable, ruine rare');
  ok(mixte.final.p5 <= mixte.final.p50 && mixte.final.p50 <= mixte.final.p95, 'centiles ordonnés');
  const b50 = mixte.bandes[30]!;
  ok(b50.p5 <= b50.p25 && b50.p25 <= b50.p50 && b50.p50 <= b50.p75 && b50.p75 <= b50.p95, 'bandes ordonnées');

  const opts = { trades: 200, objectifPct: 10, perteMaxPct: 6, simulations: 1000, graine: 3 };
  const fixe = monteCarlo([0.03, -0.03, 0.01], opts);
  const suiveuse = monteCarlo([0.03, -0.03, 0.01], { ...opts, suiveuse: true });
  ok(suiveuse.probaRuine >= fixe.probaRuine && suiveuse.probaRuine > 0, 'perte suiveuse : plus de ruines qu’avec un plancher fixe (mêmes tirages)');
  const jour = monteCarlo([0.03, -0.03, 0.01], { ...opts, perteJourPct: 2, tradesParJour: 3 });
  ok(jour.probaRuine >= fixe.probaRuine && jour.probaRuine > 0.3, 'perte du jour de 2 % avec 3 trades par jour : beaucoup plus de ruines');
  ok(monteCarlo([0.01], { ...opts, suiveuse: true, perteJourPct: 2, tradesParJour: 5 }).probaRuine === 0, 'toujours gagnant : jamais de ruine, même avec les limites');
});
