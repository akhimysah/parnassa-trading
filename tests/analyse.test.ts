import { test } from 'node:test';
import { ok } from './outils';
import { analyser } from '../src/analyse';
import { reinitialiser } from '../src/trading';

test('Analyse avancée', () => {
  const lundi10h = new Date(2026, 9, 5, 10, 0).getTime();
  const op = (i: number, resultat: number, sens: 'achat' | 'vente', h = 10) => ({ id: 'o' + i, date: lundi10h + i * 86400000 + (h - 10) * 3600000, type: 'cloture', symbole: 'X', sens, quantite: 1, prix: 1, frais: 0, resultat } as any);
  // +100, +50, -200, -100, +300, +10 → cumul 100,150,-50,-150,150,160 ; drawdown max = 150 - (-150) = 300 (du trade 2 au trade 4)
  const ops = [op(0, 100, 'vente'), op(1, 50, 'vente'), op(2, -200, 'achat'), op(3, -100, 'vente'), op(4, 300, 'achat', 15), op(5, 10, 'vente')];
  const a = analyser({ ...reinitialiser(10000), operations: ops });
  ok(a.courbe.map((p) => p.cumul).join(',') === '100,150,-50,-150,150,160', 'courbe cumulée');
  ok(a.drawdown?.montant === 300 && a.drawdown.debut === 2 && a.drawdown.fin === 4, 'drawdown max 300 $ du trade 2 au trade 4');
  ok(Math.abs((a.drawdown?.pct ?? 0) - (300 / 10150) * 100) < 1e-9, 'drawdown en % du compte au sommet');
  ok(Math.abs(a.esperance - 160 / 6) < 1e-9, 'espérance = 160 / 6');
  ok(a.series.gainsMax === 2 && a.series.pertesMax === 2 && a.series.courante?.sens === 'gain' && a.series.courante.nb === 2, 'séries : 2 gains, 2 pertes, en cours 2 gains');
  ok(a.parSens.long.nb === 4 && a.parSens.long.net === 60 && a.parSens.short.nb === 2 && a.parSens.short.net === 100, 'achats (long) et ventes (short) séparés');
  ok(a.parJour[0]!.nb === 1 && a.parJour[0]!.net === 100 && a.parJour[4]!.net === 300, 'par jour : lundi +100, vendredi +300');
  ok(a.parHeure[15]!.net === 300 && a.parHeure[10]!.nb === 5, 'par heure : 15 h +300, 10 h ×5');
  ok(Math.abs((a.ratioGainPerte ?? 0) - (115 / 150)) < 1e-9, 'ratio gain moyen / perte moyenne');
  const vide = analyser(reinitialiser(1000));
  ok(vide.courbe.length === 0 && vide.drawdown === null && vide.series.courante === null, 'sans trade : tout vide');
});
