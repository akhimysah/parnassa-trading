import { test } from 'node:test';
import { ok } from './outils';
import { estWeekendMarche, fermeAuWeekend, regleWeekendActive } from '../src/weekend';
import { controleOuverture } from '../src/ordre';
import { nouveauChallenge, FORMULES } from '../src/challenge';
import { reinitialiser } from '../src/trading';

test('Fermeture du week-end', () => {
  const u = (j: number, h: number, m = 0) => Date.UTC(2026, 9, 4 + j, h, m); // 2026-10-04 est un dimanche
  ok(!estWeekendMarche(u(5, 21, 49)) && estWeekendMarche(u(5, 21, 50)), 'vendredi 21:49 ouvert, 21:50 fermé');
  ok(estWeekendMarche(u(6, 12)), 'samedi fermé');
  ok(estWeekendMarche(u(7, 21, 59)) && !estWeekendMarche(u(7, 22, 0)), 'dimanche 21:59 fermé, 22:00 rouvert');
  ok(!estWeekendMarche(u(3, 15)), 'mercredi ouvert');
  ok(fermeAuWeekend('OANDA:XAUUSD', u(6, 12)) && !fermeAuWeekend('BINANCE:BTCUSDT', u(6, 12)), 'or fermé le samedi, bitcoin ouvert');
  const f = FORMULES.find((x) => x.id === 'instantane')!;
  const ch = nouveauChallenge({ formule: f.nom, capital: 100000, ...f.regles });
  ok(regleWeekendActive({ challenge: ch, parametres: {} as any }), 'Instantané : règle du week-end active');
  ok(!regleWeekendActive({ challenge: null, parametres: { discipline: { actif: true, fermerAuto: true } } as any }), 'discipline sans l’option : pas de règle');
  ok(regleWeekendActive({ challenge: null, parametres: { discipline: { actif: true, fermerAuto: true, fermetureWeekend: true } } as any }), 'discipline avec l’option : règle active');
  const etat = { portefeuille: reinitialiser(100000), challenge: ch, parametres: {} } as any;
  const r = controleOuverture({ etat, symbole: 'OANDA:XAUUSD', prix: 4100, lots: 1, volumeMax: 500, lecture: false });
  ok(estWeekendMarche() ? Boolean(r?.startsWith('Marché fermé')) : r === null, `contrôle d’ordre cohérent avec l’heure actuelle (${estWeekendMarche() ? 'week-end' : 'semaine'})`);
});
