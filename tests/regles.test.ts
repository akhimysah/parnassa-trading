import { test } from 'node:test';
import { ok } from './outils';
import { annonceBloquante, devisesInstrument, evaluerChallenge, FORMULES, formuleSuivante, nouveauChallenge, reglesCompletes } from '../src/challenge';

test('Règles de challenge (suiveuse, régularité, news)', () => {
  const f = (id: string) => FORMULES.find((x) => x.id === id)!;
  const ch = (id: string, capital = 100000) => ({ ...nouveauChallenge({ formule: f(id).nom, capital, ...f(id).regles }), debutLe: Date.now() - 10 * 86400000, jour: { date: '2000-01-01', capitalDebut: capital } });
  const op = (jour: number, resultat: number) => ({ id: String(Math.random()), date: Date.now() + jour * 86400000 - 3 * 86400000, type: 'cloture', symbole: 'X', sens: 'achat', quantite: 1, prix: 1, frais: 0, resultat } as any);

  // Perte max classique (Évaluation, 10 %) : 91 000 passe, 90 000 échoue
  let c = ch('evaluation');
  ok(evaluerChallenge(c, 91000, 91000, 0, 0, []).challenge.statut === 'en-cours', 'classique : 9 % de perte, en cours');
  ok(evaluerChallenge(c, 90000, 90000, 0, 0, []).challenge.statut === 'echoue', 'classique : 10 % de perte, échoué');

  // Suiveuse (Express, 8 %) : après un plus haut à 105 000, le plancher passe à 97 000
  c = { ...ch('express'), plusHaut: 105000, jour: { date: '2000-01-01', capitalDebut: 105000 } };
  let v = evaluerChallenge(c, 97500, 97500, 0, 0, []);
  ok(v.challenge.statut === 'en-cours', 'suiveuse : 97 500 au-dessus du plancher 97 000');
  c = { ...v.challenge, jour: { date: v.challenge.jour.date, capitalDebut: 100000 } };
  ok(evaluerChallenge(c, 96900, 96900, 0, 0, []).challenge.statut === 'echoue', 'suiveuse : 96 900 sous le plancher 97 000, échoué');
  // Plancher bloqué au capital de départ quand le plus haut dépasse capital + limite
  c = { ...ch('express'), plusHaut: 120000, jour: { date: '2000-01-01', capitalDebut: 120000 } };
  c = { ...evaluerChallenge(c, 100500, 100500, 0, 0, []).challenge };
  ok(c.statut === 'en-cours', 'suiveuse bloquée : 100 500 au-dessus de 100 000');
  c = { ...c, jour: { date: c.jour.date, capitalDebut: 100500 } };
  ok(evaluerChallenge(c, 99990, 99990, 0, 0, []).challenge.statut === 'echoue', 'suiveuse bloquée : sous le capital de départ, échoué');

  // Régularité (Instantané, 40 %) : +10 000 dont 6 000 un seul jour → refusé ; réparti → validé
  c = ch('instantane');
  const irregulier = [op(0, 6000), op(1, 2000), op(2, 2000)];
  ok(evaluerChallenge(c, 110000, 110000, 0, 0, irregulier).challenge.statut === 'en-cours', 'régularité : meilleur jour 60 % du profit, pas encore validé');
  const regulier = [op(0, 3500), op(1, 3500), op(2, 3000)];
  ok(evaluerChallenge(c, 110000, 110000, 0, 0, regulier).challenge.statut === 'reussi', 'régularité : meilleur jour 35 %, validé');
  ok(evaluerChallenge(ch('evaluation'), 110000, 110000, 0, 0, [op(0, 6000), op(1, 2000), op(2, 1000), op(-1, 1000)]).challenge.statut === 'reussi', 'Évaluation : pas de régularité exigée');

  // Règles complètes pour un compte (le serveur ne garde que les règles de base)
  const r = reglesCompletes({ formule: 'Instantané (1 phase)', capital: 50000, objectifPct: 10, perteJourPct: 3, perteMaxPct: 6, joursMin: 3 });
  ok(r.suiveuse === true && r.regularitePct === 40 && r.newsMinutes === 2, 'règles avancées retrouvées par le nom de la formule');
  ok(formuleSuivante('Évaluation (phase 1)')?.id === 'verification' && formuleSuivante('Vérification (phase 2)')?.id === 'finance' && !formuleSuivante('Compte financé'), 'phase 1 → phase 2 → financé, puis fin');

  // News
  const evs = [{ date: Date.now() + 60000, importance: 1, devise: 'USD' }, { date: Date.now() + 30000, importance: 0, devise: 'EUR' }];
  ok(Boolean(annonceBloquante(evs, devisesInstrument('XAUUSD', 'USD'), 2)), 'news : NFP USD dans 1 min bloque XAUUSD');
  ok(!annonceBloquante(evs, devisesInstrument('EURJPY', 'JPY'), 2), 'news : rien de fort impact sur EUR/JPY');
  ok(!annonceBloquante([{ date: Date.now() + 5 * 60000, importance: 1, devise: 'USD' }], ['USD'], 2), 'news : annonce dans 5 min, pas encore bloquée');
  ok(JSON.stringify(devisesInstrument('BTCUSDT', 'USDT')) === '["USD"]', 'news : crypto en USDT → USD');
});
