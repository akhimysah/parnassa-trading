import { test } from 'node:test';
import { ok } from './outils';
import { genererRapport } from '../src/rapport';
import { reinitialiser } from '../src/trading';

test('Rapport de performance', () => {
  const ops = [
    { id: 'a', date: 1, type: 'cloture', symbole: 'OANDA:XAUUSD', sens: 'vente', quantite: 1, lots: 1, prix: 4100, prixEntree: 4090, frais: 2, resultat: 500, etiquettes: ['Cassure'] },
    { id: 'b', date: 2, type: 'cloture', symbole: 'OANDA:XAUUSD', sens: 'achat', quantite: 1, lots: 1, prix: 4080, prixEntree: 4090, frais: 2, resultat: -200 },
  ] as any[];
  const p = { ...reinitialiser(100000), operations: ops, solde: 100296 };
  const html = genererRapport({ portefeuille: p, challenge: null, parametres: {} } as any, p.solde, { login: '51112222', serveur: 'Parnassa-Demo', nom: 'Démo <script>' });
  ok(html.includes('Démo &lt;script&gt;') && !html.includes('<script>'), 'nom du compte échappé');
  ok(html.includes('Par étiquette') && html.includes('Cassure'), 'section par étiquette');
  ok(html.includes('+296,00 $'), 'résultat réalisé frais inclus');
});
