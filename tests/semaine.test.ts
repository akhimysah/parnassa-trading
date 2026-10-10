import { test } from 'node:test';
import { ok } from './outils';
import { cleSemaine, debutSemaine, revueSemaine } from '../src/semaine';
import { reinitialiser } from '../src/trading';
import type { Operation } from '../src/types';

let n = 0;
const cloture = (symbole: string, date: Date, resultat: number, frais = 0): Operation => ({ id: `c${++n}`, date: date.getTime(), type: 'cloture', symbole, sens: 'vente', quantite: 1, prix: 1, frais, resultat });
const ouverture = (symbole: string, date: Date, frais: number): Operation => ({ id: `o${++n}`, date: date.getTime(), type: 'ouverture', symbole, sens: 'achat', quantite: 1, prix: 1, frais });

test('Revue de la semaine', () => {
  const lundi12 = new Date(2026, 9, 12, 9); // lundi 12 octobre 2026
  ok(debutSemaine(new Date(2026, 9, 18, 23).getTime()) === new Date(2026, 9, 12).getTime(), 'dimanche 18 → lundi 12');
  ok(cleSemaine(lundi12.getTime()) === '2026-10-12', 'clé : date du lundi');
  ok(revueSemaine(reinitialiser(1000), lundi12.getTime()) === null, 'aucun trade : pas de revue');

  const ops: Operation[] = [
    cloture('FX:EURUSD', new Date(2026, 9, 12, 8), 999), // semaine en cours : exclue
    cloture('FX:EURUSD', new Date(2026, 9, 9, 16), 400, 5), // vendredi 9
    ouverture('FX:EURUSD', new Date(2026, 9, 9, 10), 5),
    cloture('OANDA:XAUUSD', new Date(2026, 9, 7, 15), -300), // mercredi 7
    cloture('FX:EURUSD', new Date(2026, 9, 5, 11), 150), // lundi 5
    cloture('FX:EURUSD', new Date(2026, 9, 2, 11), -80), // semaine d'avant
  ];
  const p = { ...reinitialiser(100000), operations: ops, plans: [{ date: '2026-10-09', texte: 'plan', majLe: 0 }, { date: '2026-10-06', texte: 'plan', majLe: 0 }] };
  const r = revueSemaine(p, lundi12.getTime());
  ok(r !== null, 'revue disponible');
  if (!r) return;
  ok(r.debut === new Date(2026, 9, 5).getTime() && r.fin === new Date(2026, 9, 12).getTime(), 'du lundi 5 au lundi 12');
  ok(r.trades === 3 && r.gagnants === 2, '3 clôtures, 2 gagnantes');
  ok(Math.abs(r.net - (400 - 5 - 5 - 300 + 150)) < 1e-9, 'résultat net, frais d’ouverture compris');
  ok(r.jours[0] === 150 && r.jours[2] === -300 && r.jours[4] === 390 && r.jours[6] === 0, 'résultat par jour');
  ok(r.precedente === -80, 'semaine précédente');
  ok(r.meilleur?.resultat === 400 && r.pire?.resultat === -300, 'meilleur et pire trade');
  ok(r.instruments[0]!.symbole === 'FX:EURUSD' && r.instruments[r.instruments.length - 1]!.symbole === 'OANDA:XAUUSD', 'instruments triés');
  ok(r.joursTrades === 3 && r.joursAvecPlan === 1, 'plan écrit 1 jour tradé sur 3 (le plan du mardi ne compte pas)');
});
