import { test } from 'node:test';
import { ok } from './outils';
import { demanderVersement, evaluerChallenge, FORMULES, FORMULES_OUVERTES, formuleSuivante, nouveauChallenge, prochainVersement, DELAI_VERSEMENT_MS } from '../src/challenge';
import { reinitialiser } from '../src/trading';

test('Compte financé et versements', () => {
  const f = FORMULES.find((x) => x.id === 'finance')!;
  ok(!FORMULES_OUVERTES.some((x) => x.id === 'finance'), 'le compte financé n’est pas proposé au départ');
  ok(formuleSuivante('Vérification (phase 2)')?.id === 'finance' && formuleSuivante('Instantané (1 phase)')?.id === 'finance' && formuleSuivante('Évaluation (phase 1)')?.id === 'verification', 'phase 1 → phase 2 → financé ; express et instantané → financé');
  const debut = Date.now() - 8 * 86400000;
  let ch = { ...nouveauChallenge({ formule: f.nom, capital: 100000, ...f.regles }), debutLe: debut, jour: { date: '2000-01-01', capitalDebut: 100000 } };
  const ops = [{ id: 'a', date: debut + 86400000, type: 'cloture', symbole: 'X', sens: 'achat', quantite: 1, prix: 1, frais: 0, resultat: 30000 } as any];
  ok(evaluerChallenge(ch, 130000, 130000, 0, 0, ops).challenge.statut === 'en-cours', 'financé : +30 % ne « réussit » pas, le compte continue');
  ok(evaluerChallenge(ch, 89000, 89000, 0, 0, []).challenge.statut === 'echoue', 'financé : perte max 10 % toujours appliquée');
  const p = { ...reinitialiser(100000), solde: 112000 };
  const v = demanderVersement(ch, p);
  ok(typeof v !== 'string' && v.versement.profit === 12000 && v.versement.montant === 9600, 'versement : 12 000 $ de profit, 9 600 $ versés (80 %)');
  if (typeof v !== 'string') {
    ok(v.portefeuille.solde === 100000, 'le compte repart du capital');
    ok(evaluerChallenge({ ...v.challenge, jour: { date: v.challenge.jour.date, capitalDebut: v.challenge.jour.capitalDebut } }, 100000, 100000, 0, 0, []).challenge.statut === 'en-cours', 'le retrait ne compte pas comme une perte du jour');
    ok(typeof demanderVersement(v.challenge, { ...v.portefeuille, solde: 105000 }) === 'string', 'deuxième versement refusé avant 7 jours');
    ok(prochainVersement(v.challenge) - Date.now() > DELAI_VERSEMENT_MS - 5000, 'prochain versement dans 7 jours');
  }
  ok(typeof demanderVersement({ ...ch, debutLe: Date.now() }, p) === 'string', 'premier versement seulement 7 jours après l’ouverture');
  ok(typeof demanderVersement(ch, { ...p, positions: [{} as any] }) === 'string', 'positions ouvertes : versement refusé');
  ok(typeof demanderVersement(ch, { ...p, solde: 99000 }) === 'string', 'pas de profit : rien à verser');
  const normal = nouveauChallenge({ formule: 'Évaluation (phase 1)', capital: 100000, objectifPct: 10, perteJourPct: 5, perteMaxPct: 10, joursMin: 4 });
  ok(typeof demanderVersement(normal, p) === 'string', 'pas de versement sur un challenge');
});
