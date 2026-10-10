import { test } from 'node:test';
import { ok } from './outils';
import { evaluerDiscipline, finDePause, pauseApresPerte, pertesDAffilee } from '../src/discipline';
import { reinitialiser } from '../src/trading';
import type { Operation } from '../src/types';

const MIN = 60000;
const cloture = (id: string, date: number, resultat: number, frais = 0): Operation => ({ id, date, type: 'cloture', symbole: 'X', sens: 'vente', quantite: 1, prix: 1, frais, resultat });

test('Anti-tilt : pause après une perte et pertes d’affilée', () => {
  const maintenant = new Date(2026, 9, 12, 15, 0).getTime();
  const regles = { actif: true, fermerAuto: true, pauseApresPerteMin: 10, pertesConsecutivesMax: 3 };
  // Opérations de la plus récente à la plus ancienne, comme dans le portefeuille.
  const p = { ...reinitialiser(100000), operations: [cloture('c', maintenant - 4 * MIN, -50), cloture('b', maintenant - 30 * MIN, -20), cloture('a', maintenant - 60 * MIN, 100)] };
  ok(finDePause(p, regles, maintenant) === maintenant + 6 * MIN, 'perte il y a 4 min, pause de 10 min : encore 6 min');
  ok(pauseApresPerte(p, regles, maintenant)?.includes('dans 6 min') === true, 'message avec le compte à rebours');
  ok(finDePause(p, regles, maintenant + 7 * MIN) === null, 'pause terminée');
  ok(finDePause(p, { ...regles, actif: false }, maintenant) === null, 'discipline inactive : pas de pause');
  const gainFraisInclus = { ...p, operations: [cloture('d', maintenant - MIN, 5, 8), ...p.operations] };
  ok(finDePause(gainFraisInclus, regles, maintenant) === maintenant + 9 * MIN, 'gain brut mangé par les frais : compte comme une perte');

  ok(pertesDAffilee(p, maintenant) === 2, 'deux pertes depuis le dernier gain');
  ok(!evaluerDiscipline(p, 100000, regles, maintenant).message, '2 pertes sur 3 : rien');
  const trois = { ...p, operations: [cloture('e', maintenant - MIN, -10), ...p.operations] };
  const d = evaluerDiscipline(trois, 100000, regles, maintenant);
  ok(Boolean(d.message?.includes("3 pertes d'affilée")) && d.fermerTout === false && Boolean(d.portefeuille.journee?.bloque), '3 pertes : journée bloquée, positions gardées');
  const zero = { ...p, operations: [cloture('z', maintenant - MIN, 0), ...p.operations] };
  ok(pertesDAffilee(zero, maintenant) === 2, 'un trade à zéro ne coupe pas la série');
  const hier = { ...p, operations: [...p.operations, cloture('h1', maintenant - 20 * 60 * MIN, -10), cloture('h2', maintenant - 21 * 60 * MIN, -10)] };
  ok(pertesDAffilee({ ...hier, operations: hier.operations.filter((o) => o.id !== 'a') }, maintenant) === 2, 'les pertes de la veille ne comptent pas');
});
