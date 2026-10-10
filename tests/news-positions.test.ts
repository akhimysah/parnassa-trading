import { test } from 'node:test';
import { ok } from './outils';
import { annoncesSurPositions, devisesPosition } from '../src/newsPositions';
import type { Position } from '../src/types';

const pos = (id: string, symbole: string): Position => ({ id, symbole, sens: 'achat', quantite: 1, prixEntree: 1, cout: 0, ouvertLe: 0 });
const ev = (id: string, devise: string, dans: number, importance = 2, actuel: number | null = null) => ({ id, devise, importance, actuel, date: T + dans * 60000 });
const T = new Date(2026, 9, 14, 14, 0).getTime();

test('Annonces qui touchent les positions ouvertes', () => {
  ok(devisesPosition('FX:EURUSD').join() === 'USD,EUR', 'EURUSD : USD et EUR');
  ok(devisesPosition('SP:SPX').includes('USD'), 'S&P 500 : USD');
  ok(devisesPosition('FX:USDJPY').includes('JPY'), 'USDJPY : JPY');

  const positions = [pos('a', 'FX:EURUSD'), pos('b', 'OANDA:XAUUSD'), pos('c', 'FX:USDJPY')];
  const evenements = [ev('cpi', 'USD', 25), ev('bce', 'EUR', 50), ev('boj', 'JPY', 90), ev('faible', 'USD', 10, 0), ev('publie', 'USD', 5, 2, 3.1), ev('passe', 'GBP', 5), ev('recent', 'JPY', -1)];
  const a = annoncesSurPositions(positions, evenements, T);
  ok(a.map((x) => x.evenement.id).join() === 'recent,cpi,bce', 'dans l’heure, fort impact, non publiées, triées (une annonce d’il y a 1 min reste affichée)');
  ok(a.find((x) => x.evenement.id === 'cpi')!.positions.length === 3, 'CPI US : les trois positions (toutes cotées en dollar)');
  ok(a.find((x) => x.evenement.id === 'bce')!.positions.map((p) => p.id).join() === 'a', 'BCE : seulement EURUSD');
  ok(a.find((x) => x.evenement.id === 'cpi')!.minutes === 25, 'minutes avant l’annonce');
  ok(annoncesSurPositions([], evenements, T).length === 0, 'aucune position : rien');
  ok(annoncesSurPositions(positions, evenements, T, 120).some((x) => x.evenement.id === 'boj'), 'horizon élargi : BoJ dans 90 min');
});
