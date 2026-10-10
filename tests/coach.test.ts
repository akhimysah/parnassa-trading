import { test } from 'node:test';
import { ok } from './outils';
import { conseilsCoach, MIN_CLOTURES_COACH } from '../src/coach';
import { reinitialiser } from '../src/trading';
import type { Operation } from '../src/types';

const MIN = 60000;
let n = 0;
/** Un trade complet : ouverture à `debut`, clôture `dureeMin` plus tard avec ce résultat. */
function trade(symbole: string, debut: number, dureeMin: number, resultat: number, origine: Operation['origine'] = 'marche'): Operation[] {
  n++;
  return [
    { id: `o${n}`, symbole, sens: 'achat', type: 'ouverture', quantite: 1, prix: 1, frais: 0, date: debut },
    { id: `c${n}`, symbole, sens: 'vente', type: 'cloture', origine, quantite: 1, prix: 1, frais: 0, resultat, date: debut + dureeMin * MIN },
  ];
}

test('Coach : constats tirés de l’historique', () => {
  const base = new Date(2026, 8, 7, 10).getTime(); // lundi 7 septembre 2026, 10 h
  const jour = 24 * 60 * MIN;
  ok(conseilsCoach({ ...reinitialiser(100000), operations: trade('FX:EURUSD', base, 5, 100) }).length === 0, `moins de ${MIN_CLOTURES_COACH} clôtures : rien`);

  const ops: Operation[] = [];
  // Huit jours : EURUSD gagnant vite (TP) ; XAUUSD perdant lentement ; revanche après chaque perte.
  for (let d = 0; d < 8; d++) {
    const t0 = base + d * jour;
    ops.push(...trade('FX:EURUSD', t0, 10, 300, 'take-profit'));
    ops.push(...trade('OANDA:XAUUSD', t0 + 60 * MIN, 120, -400, 'stop-loss'));
    ops.push(...trade('OANDA:XAUUSD', t0 + 185 * MIN, 30, -250));
  }
  const c = conseilsCoach({ ...reinitialiser(100000), operations: ops });
  const ids = c.map((x) => x.id);
  ok(ids.includes('revanche'), 'revanche détectée (ouverture 5 min après une perte)');
  ok(ids.includes('pertes-longues'), 'pertes gardées plus longtemps que les gains');
  ok(ids.includes('instrument-pire') && c.find((x) => x.id === 'instrument-pire')!.titre.includes('XAUUSD'), 'pire instrument : XAUUSD');
  ok(ids.includes('instrument-meilleur') && c.find((x) => x.id === 'instrument-meilleur')!.titre.includes('EURUSD'), 'meilleur instrument : EURUSD');
  ok(c.find((x) => x.id === 'avantage')?.ton === 'negatif', '33 % de réussite, gains plus petits que les pertes : avantage négatif');
  const tons = c.map((x) => x.ton);
  ok(tons.indexOf('positif') === -1 || tons.lastIndexOf('negatif') < tons.indexOf('positif'), 'négatifs avant positifs');

  const bons: Operation[] = [];
  for (let d = 0; d < 12; d++) bons.push(...trade('FX:EURUSD', base + d * jour, 30, d % 3 === 0 ? -100 : 250, d % 3 === 0 ? 'stop-loss' : 'take-profit'));
  const b = conseilsCoach({ ...reinitialiser(100000), operations: bons });
  ok(b.find((x) => x.id === 'avantage')?.ton === 'positif', 'avantage positif reconnu');
  ok(!b.some((x) => x.id === 'revanche' || x.id === 'stop-out'), 'pas de faux constat');
});
