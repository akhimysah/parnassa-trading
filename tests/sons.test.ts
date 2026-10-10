import { test } from 'node:test';
import { ok } from './outils';
import { sonDesOperations } from '../src/sons';

test('Sons des opérations', () => {
  ok(sonDesOperations([{ type: 'cloture', sens: 'vente', resultat: 120, frais: 2 }]) === 'gain', 'take-profit en gain → carillon');
  ok(sonDesOperations([{ type: 'cloture', sens: 'vente', resultat: -50, frais: 2 }]) === 'perte', 'stop-loss en perte → son sourd');
  ok(sonDesOperations([{ type: 'cloture', sens: 'vente', resultat: 100, frais: 0 }, { type: 'cloture', sens: 'achat', resultat: -300, frais: 0 }]) === 'perte', 'plusieurs clôtures : selon le total');
  ok(sonDesOperations([{ type: 'ouverture', sens: 'achat', frais: 1 }]) === 'achat', 'ordre limite déclenché à l’achat');
  ok(sonDesOperations([]) === null, 'rien de nouveau : son par défaut');
});
