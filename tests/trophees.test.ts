import { test } from 'node:test';
import { ok } from './outils';
import { nouveauxTrophees } from '../src/trophees';
import { nouveauChallenge, FORMULES } from '../src/challenge';
import { reinitialiser } from '../src/trading';

const op = (i: number, resultat: number, extra: object = {}) => ({ id: 'o' + i, date: Date.UTC(2026, 9, 5, 10) + i * 60000, type: 'cloture', symbole: 'X', sens: 'vente', quantite: 1, prix: 1, frais: 0, resultat, ...extra }) as any;

test('Trophées', () => {
  const vide = { portefeuille: reinitialiser(100000), challenge: null, challengesPasses: [], trophees: {} } as any;
  ok(nouveauxTrophees(vide).length === 0, 'aucun trophée sans trade');
  const ops = [op(0, -50), ...Array.from({ length: 6 }, (_, i) => op(i + 1, 200))];
  const e = { ...vide, portefeuille: { ...vide.portefeuille, operations: ops } };
  const ids = nouveauxTrophees(e).map((t) => t.id);
  ok(ids.includes('premier-trade') && ids.includes('premier-gain') && ids.includes('serie-5') && ids.includes('journee-1'), `débloqués : ${ids.join(', ')}`);
  ok(!ids.includes('serie-10') && !ids.includes('cent-trades'), 'pas de série de 10 ni de centurion');
  const deja = { ...e, trophees: { 'premier-trade': 1, 'premier-gain': 1, 'serie-5': 1, 'journee-1': 1 } };
  ok(nouveauxTrophees(deja).length === 0, 'un trophée déjà débloqué ne revient pas');
  const f = FORMULES.find((x) => x.id === 'finance')!;
  const finance = { ...nouveauChallenge({ formule: f.nom, capital: 100000, ...f.regles }), versements: [{ date: 1, profit: 10, montant: 8 }] };
  const ids2 = nouveauxTrophees({ ...vide, challenge: finance }).map((t) => t.id);
  ok(ids2.includes('finance') && ids2.includes('versement'), 'compte financé et premier versement');
  const baleine = nouveauxTrophees({ ...vide, portefeuille: { ...vide.portefeuille, operations: [op(0, 1_200_000)] } }).map((t) => t.id);
  ok(baleine.includes('baleine'), 'baleine : +1,2 M$ sur un trade');
  ok(nouveauxTrophees({ ...vide, portefeuille: { ...vide.portefeuille, crameLe: 1 } }).some((t) => t.id === 'crame'), 'cramé');
});
