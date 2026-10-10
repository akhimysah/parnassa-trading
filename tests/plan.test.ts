import { test } from 'node:test';
import { ok } from './outils';
import { contenuPlan, enregistrerPlan, MODELE_PLAN, planDuJour, planManquant, PLANS_MAX } from '../src/plan';
import { reinitialiser } from '../src/trading';

test('Plan du jour', () => {
  const maintenant = new Date(2026, 9, 12, 8, 30).getTime();
  const lendemain = maintenant + 24 * 3600 * 1000;
  const regles = { actif: true, fermerAuto: true, planObligatoire: true };
  let p = reinitialiser(100000);
  ok(planDuJour(p, maintenant) === null, 'aucun plan au départ');
  ok(planManquant(p, regles, maintenant)?.includes('obligatoire') === true, 'règle active sans plan : ouverture bloquée');
  ok(planManquant(p, { ...regles, actif: false }, maintenant) === null, 'discipline inactive : libre');

  ok(contenuPlan(MODELE_PLAN) === '', 'le modèle seul n’a pas de contenu');
  p = enregistrerPlan(p, MODELE_PLAN, maintenant);
  ok(planDuJour(p, maintenant) === null && planManquant(p, regles, maintenant) !== null, 'modèle laissé vide : rien d’enregistré, toujours bloqué');
  p = enregistrerPlan(p, 'Biais du jour : court', maintenant);
  ok(planManquant(p, regles, maintenant) !== null, 'plan trop court : toujours bloqué');

  p = enregistrerPlan(p, `${MODELE_PLAN}\nHaussier sur l'or au-dessus de 4 150, pas de trade avant le CPI.`, maintenant);
  ok(p.plans!.length === 1, 'le plan du jour remplace le précédent');
  ok(!p.plans![0]!.texte.includes('Niveaux clés') && p.plans![0]!.texte.includes('4 150'), 'intitulés vides retirés, contenu gardé');
  ok(planManquant(p, regles, maintenant) === null, 'plan détaillé : ouverture permise');
  ok(planManquant(p, regles, lendemain) !== null, 'le lendemain, il faut un nouveau plan');

  p = enregistrerPlan(p, 'Range EURUSD 1,10 – 1,12 : vendre le haut, acheter le bas.', lendemain);
  ok(p.plans!.length === 2 && p.plans![0]!.date > p.plans![1]!.date, 'plus récent d’abord');
  p = enregistrerPlan(p, '   ', lendemain);
  ok(p.plans!.length === 1 && planDuJour(p, lendemain) === null, 'texte vide : plan du jour supprimé');

  let q = reinitialiser(1);
  for (let i = 0; i < PLANS_MAX + 10; i++) q = enregistrerPlan(q, `plan ${i}`, maintenant + i * 24 * 3600 * 1000);
  ok(q.plans!.length === PLANS_MAX && q.plans![0]!.texte === `plan ${PLANS_MAX + 9}`, `au plus ${PLANS_MAX} plans, les plus récents`);
});
