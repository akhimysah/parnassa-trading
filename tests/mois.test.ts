import { test } from 'node:test';
import { ok } from './outils';
import { blocageDiscipline, debutDuMois, evaluerDiscipline, finDuBlocage, mesurerMois } from '../src/discipline';
import { reinitialiser } from '../src/trading';
import type { Operation } from '../src/types';

const cloture = (id: string, date: number, resultat: number, frais = 0): Operation => ({ id, date, type: 'cloture', symbole: 'X', sens: 'achat', quantite: 1, prix: 1, frais, resultat });

test('Bilan et limites du mois', () => {
  const maintenant = new Date(2026, 9, 20, 15).getTime();
  const jour = (j: number) => new Date(2026, 9, j, 12).getTime();
  ok(debutDuMois(maintenant) === new Date(2026, 9, 1).getTime(), 'début du mois : le 1er à minuit');
  const p = {
    ...reinitialiser(100000),
    solde: 95000,
    operations: [cloture('a', new Date(2026, 8, 28).getTime(), 3000), cloture('b', jour(2), 1000, 10), cloture('c', jour(5), -4000, 10), cloture('d', jour(5), -1000)],
  };
  const m = mesurerMois(p, 94500, 95000, maintenant);
  ok(Math.abs(m.realise - -4020) < 1e-9, 'réalisé du mois : septembre exclu, frais déduits');
  ok(Math.abs(m.capitalDebut - 99020) < 1e-9 && Math.abs(m.variation - -4520) < 1e-9, 'variation = réalisé + latent depuis la balance du début du mois');
  ok(m.joursGagnants === 1 && m.joursPerdants === 1, 'un jour gagnant, un jour perdant (opérations regroupées par jour)');

  const regles = { actif: true, perteMoisPct: 4, fermerAuto: true };
  const d = evaluerDiscipline(p, 94500, regles, maintenant, 95000);
  ok(Boolean(d.message?.includes('Perte du mois')) && Boolean(d.message?.includes('mois prochain')) && d.fermerTout === true, 'perte de 4,6 % sur le mois : blocage jusqu’au mois prochain');
  ok(d.portefeuille.journee?.bloque?.mois === true && finDuBlocage(d.portefeuille) === "jusqu'au mois prochain", 'blocage marqué comme mensuel');
  ok(blocageDiscipline(d.portefeuille, regles, maintenant)?.includes('Perte du mois') === true, 'ordres refusés');
  const lendemain = { ...d.portefeuille, journee: { ...d.portefeuille.journee!, date: '2026-10-19' } };
  ok(Boolean(evaluerDiscipline(lendemain, 94500, regles, maintenant, 95000).portefeuille.journee?.bloque?.mois), 'le lendemain, toujours bloqué');
  const moisSuivant = new Date(2026, 10, 2, 9).getTime();
  ok(!evaluerDiscipline(lendemain, 94500, regles, moisSuivant, 95000).portefeuille.journee?.bloque, 'au mois suivant : débloqué');
  ok(!evaluerDiscipline(p, 96000, regles, maintenant, 95000).message, 'gain latent qui ramène la perte du mois à 3 % : pas de blocage');
  ok(finDuBlocage(reinitialiser(1)) === "jusqu'à demain", 'blocage du jour : jusqu’à demain');
});
