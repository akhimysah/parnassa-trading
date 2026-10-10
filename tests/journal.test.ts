import { test } from 'node:test';
import { ok } from './outils';
import { statsParEtiquette } from '../src/journal';
import { etiqueterOperation, reinitialiser } from '../src/trading';

test('Étiquettes du journal', () => {
  const op = (id: string, resultat: number, etiquettes?: string[]) => ({ id, date: 1, type: 'cloture', symbole: 'X', sens: 'vente', quantite: 1, prix: 1, frais: 0, resultat, etiquettes } as any);
  const s = statsParEtiquette([op('a', 300, ['Cassure', 'Plan respecté']), op('b', -100, ['Cassure', 'FOMO']), op('c', -250, ['FOMO']), op('d', 50)]);
  const cassure = s.find((x) => x.etiquette === 'Cassure')!;
  ok(cassure.nb === 2 && cassure.net === 200 && cassure.gagnants === 1 && cassure.esperance === 100, 'Cassure : 2 trades, +200, 50 %');
  ok(s[0]!.etiquette === 'Plan respecté' && s[s.length - 1]!.etiquette === 'FOMO' && s[s.length - 1]!.net === -350, 'classées du plus rentable (plan respecté) au plus coûteux (FOMO −350)');
  let p: any = { ...reinitialiser(1000), operations: [op('a', 1)] };
  p = etiqueterOperation(p, 'a', [' Cassure ', 'Cassure', '', 'x'.repeat(40)]);
  ok(p.operations[0].etiquettes.length === 2 && p.operations[0].etiquettes[0] === 'Cassure' && p.operations[0].etiquettes[1].length === 24, 'étiquettes nettoyées, sans doublon, 24 caractères max');
  p = etiqueterOperation(p, 'a', []);
  ok(p.operations[0].etiquettes === undefined, 'tout retirer');
});
