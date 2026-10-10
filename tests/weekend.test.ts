import { test } from 'node:test';
import { ok } from './outils';
import { estWeekendMarche, fermeAuWeekend, regleWeekendActive } from '../src/weekend';
import { controleOuverture } from '../src/ordre';
import { nouveauChallenge, FORMULES } from '../src/challenge';
import { reinitialiser } from '../src/trading';
import { marcheFerme } from '../src/horaires';

test('Fermeture du week-end', () => {
  const u = (j: number, h: number, m = 0) => Date.UTC(2026, 9, 4 + j, h, m); // 2026-10-04 est un dimanche
  // Octobre : New York en heure d'été (UTC−4). Vendredi 16 h 50 NY = 20:50 UTC ; dimanche 17 h NY = 21:00 UTC.
  ok(!estWeekendMarche(u(5, 20, 49)) && estWeekendMarche(u(5, 20, 50)), 'vendredi 16 h 49 New York ouvert, 16 h 50 fermé');
  ok(estWeekendMarche(u(6, 12)), 'samedi fermé');
  ok(estWeekendMarche(u(7, 20, 59)) && !estWeekendMarche(u(7, 21, 0)), 'dimanche 16 h 59 New York fermé, 17 h rouvert');
  ok(!estWeekendMarche(Date.UTC(2026, 11, 4, 21, 49)) && estWeekendMarche(Date.UTC(2026, 11, 4, 21, 50)), 'heure d’hiver : vendredi 21:50 UTC (16 h 50 New York)');
  ok(!estWeekendMarche(u(3, 15)), 'mercredi ouvert');
  ok(fermeAuWeekend('OANDA:XAUUSD', u(6, 12)) && !fermeAuWeekend('BINANCE:BTCUSDT', u(6, 12)), 'or fermé le samedi, bitcoin ouvert');
  const f = FORMULES.find((x) => x.id === 'instantane')!;
  const ch = nouveauChallenge({ formule: f.nom, capital: 100000, ...f.regles });
  ok(regleWeekendActive({ challenge: ch, parametres: {} as any }), 'Instantané : règle du week-end active');
  ok(!regleWeekendActive({ challenge: null, parametres: { discipline: { actif: true, fermerAuto: true } } as any }), 'discipline sans l’option : pas de règle');
  ok(regleWeekendActive({ challenge: null, parametres: { discipline: { actif: true, fermerAuto: true, fermetureWeekend: true } } as any }), 'discipline avec l’option : règle active');
  const etat = { portefeuille: reinitialiser(100000), challenge: ch, parametres: {} } as any;
  const r = controleOuverture({ etat, symbole: 'OANDA:XAUUSD', prix: 4100, lots: 1, volumeMax: 500, lecture: false });
  const ferme = estWeekendMarche() || marcheFerme('OANDA:XAUUSD') !== null;
  ok(ferme ? Boolean(r?.startsWith('Marché fermé')) : r === null, `contrôle d’ordre cohérent avec l’heure actuelle (${ferme ? 'fermé' : 'ouvert'})`);
});
