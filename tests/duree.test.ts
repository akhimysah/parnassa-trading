import { test } from 'node:test';
import { ok } from './outils';
import { statistiques, reinitialiser } from '../src/trading';

test('Durée moyenne des trades', () => {
  let g = 3; const a = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
  const ops: any[] = [];
  for (let i = 0; i < 1500; i++) { const s = a() > 0.5 ? 'A' : 'B'; const d = Math.floor(a() * 1e7); ops.push({ id: 'x' + i, date: d, type: a() > 0.5 ? 'ouverture' : 'cloture', symbole: s, sens: 'vente', quantite: 1, prix: 1, frais: 0, resultat: 1 }); }
  const p = { ...reinitialiser(1000), operations: ops };
  // Ancien algorithme
  const clotures = ops.filter((o) => o.type === 'cloture');
  const ouvertures = ops.filter((o) => o.type === 'ouverture').slice().sort((x, y) => x.date - y.date);
  const durees: number[] = [];
  for (const c of clotures) { const o = [...ouvertures].reverse().find((x) => x.symbole === c.symbole && x.date <= c.date); if (o) durees.push(c.date - o.date); }
  const ancien = durees.reduce((s, d) => s + d, 0) / durees.length;
  const nouveau = statistiques(p as any).dureeMoyenneMs!;
  ok(Math.abs(ancien - nouveau) < 1e-6, `durée moyenne identique (${ancien} / ${nouveau})`);
});
