import { test } from 'node:test';
import { ok } from './outils';
import { bilanVeille } from '../src/bilan';

const jour = (j: number, h = 10) => new Date(2026, 9, j, h).getTime();
const cl = (d: number, resultat: number, frais = 0) => ({ id: String(Math.random()), date: d, type: 'cloture', symbole: 'X', sens: 'vente', quantite: 1, prix: 1, frais, resultat }) as any;

test('Bilan de la veille', () => {
  const ops = [cl(jour(6), 100), cl(jour(7), 300), cl(jour(7), -50, 10), cl(jour(9), 500), cl(jour(9), 200), cl(jour(9), -100), cl(jour(10), 999)];
  const b = bilanVeille(ops, jour(10, 15))!;
  ok(b.date.getDate() === 9 && b.trades === 3 && b.net === 600 && b.gagnants === 2, 'veille = le 9 : 3 trades, +600');
  ok(b.meilleur!.resultat === 500 && b.pire!.resultat === -100, 'meilleur +500, pire −100');
  ok(b.precedent === 240, 'séance précédente (le 7) : +240 frais déduits');
  ok(b.serieGagnante === 3, '3 jours gagnants d’affilée (9, 7, 6)');
  ok(bilanVeille([cl(jour(10), 50)], jour(10, 15)) === null, 'rien avant aujourd’hui : pas de bilan');
  const perte = bilanVeille([cl(jour(8), 100), cl(jour(9), -40)], jour(10))!;
  ok(perte.net === -40 && perte.serieGagnante === 0, 'veille perdante : série à 0');
});
