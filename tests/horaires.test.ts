import { test } from 'node:test';
import { ok } from './outils';
import { appliquerFlux, ouvrir, reinitialiser } from '../src/trading';
import { levierEffectif } from '../src/couts';
import { etatMarche, feriesEuronext, feriesNyse, marcheDe, marcheFerme, marcheOuvert, paques } from '../src/horaires';

// Instants en UTC. Octobre 2026 : New York en heure d'été (UTC−4), Paris en heure d'été (UTC+2) jusqu'au 25.
const utc = (j: number, h: number, m = 0, mois = 10) => Date.UTC(2026, mois - 1, j, h, m);

test('Horaires de marché', () => {
  ok(marcheDe('BINANCE:BTCUSDT') === 'crypto' && marcheDe('FX:EURUSD') === 'forex' && marcheDe('OANDA:XAUUSD') === 'cme', 'marchés des instruments');
  ok(marcheDe('XETR:DAX') === 'europe' && marcheDe('SP:SPX') === 'cme' && marcheDe('NASDAQ:AAPL') === 'actions-us' && marcheDe('EURONEXT:MC') === 'actions-fr', 'indices européens à part');

  // Forex : vendredi 16 octobre 20:59 UTC (16:59 NY) ouvert, 21:00 fermé ; dimanche 18 à 21:00 UTC (17:00 NY) rouvert.
  ok(marcheOuvert('forex', utc(16, 20, 59)) && !marcheOuvert('forex', utc(16, 21)), 'forex : fermeture vendredi 17 h New York');
  ok(!marcheOuvert('forex', utc(17, 12)) && !marcheOuvert('forex', utc(18, 20, 59)) && marcheOuvert('forex', utc(18, 21)), 'forex : fermé le samedi, rouvre dimanche 17 h New York');
  ok(marcheOuvert('forex', utc(14, 21, 30)), 'forex : pas de pause en semaine');
  // Or (CME) : pause de 17 h à 18 h New York chaque jour.
  ok(!marcheOuvert('cme', utc(14, 21, 30)) && marcheOuvert('cme', utc(14, 22)), 'or : pause quotidienne 17 h – 18 h New York');
  ok(!marcheOuvert('cme', utc(18, 21, 30)) && marcheOuvert('cme', utc(18, 22)), 'or : rouvre dimanche 18 h New York');
  // Heure d'hiver (décembre : New York UTC−5) : fermeture du forex le vendredi à 22:00 UTC.
  ok(marcheOuvert('forex', Date.UTC(2026, 11, 4, 21, 30)) && !marcheOuvert('forex', Date.UTC(2026, 11, 4, 22)), 'heure d’hiver : décalage suivi');

  // Actions US : 9 h 30 – 16 h New York = 13:30 – 20:00 UTC en octobre.
  ok(!marcheOuvert('actions-us', utc(14, 13, 29)) && marcheOuvert('actions-us', utc(14, 13, 30)) && !marcheOuvert('actions-us', utc(14, 20)), 'actions US : séance de New York');
  ok(feriesNyse(2026).has('2026-11-26') && feriesNyse(2026).has('2026-07-03') && feriesNyse(2026).has('2026-04-03'), 'NYSE 2026 : Thanksgiving, 4 juillet observé le 3, Vendredi saint');
  ok(!marcheOuvert('actions-us', Date.UTC(2026, 10, 26, 16)), 'actions US fermées à Thanksgiving');
  ok(feriesNyse(2027).has('2027-06-18') && feriesNyse(2027).has('2027-12-24'), 'NYSE 2027 : jours fériés du week-end observés le vendredi');
  // Actions françaises : 9 h – 17 h 30 Paris = 7:00 – 15:30 UTC en octobre.
  ok(marcheOuvert('actions-fr', utc(14, 7)) && !marcheOuvert('actions-fr', utc(14, 15, 30)), 'actions françaises : séance de Paris');
  ok(paques(2026).mois === 4 && paques(2026).jour === 5 && feriesEuronext(2026).has('2026-04-06'), 'Pâques 2026 le 5 avril, lundi de Pâques fermé');
  // Indices européens : 8 h – 22 h Paris.
  ok(marcheOuvert('europe', utc(14, 6)) && !marcheOuvert('europe', utc(14, 20)), 'DAX : 8 h – 22 h Paris');

  // État et prochain changement.
  const samedi = utc(17, 12);
  const e = etatMarche('FX:EURUSD', samedi);
  ok(!e.ouvert && e.changement === utc(18, 21), 'samedi : forex fermé, réouverture dimanche 21:00 UTC');
  const o = etatMarche('NASDAQ:AAPL', utc(14, 15));
  ok(o.ouvert && o.changement === utc(14, 20), 'Apple ouverte, fermeture à 20:00 UTC');
  ok(etatMarche('BINANCE:BTCUSDT', samedi).ouvert && marcheFerme('BINANCE:BTCUSDT', samedi) === null, 'crypto toujours ouverte');
  ok(marcheFerme('FX:EURUSD', samedi)?.startsWith('Marché fermé (Change)') === true, 'message de refus');

  // Moteur : marché fermé, le stop attend la réouverture.
  const t = (prix: number) => ({ EURUSD: { prix } }) as any;
  const p = ouvrir(reinitialiser(100000), 'FX:EURUSD', 'achat', 1, 1.1, t(1.1), { levier: 100, tauxCrypto: 0, prot: { stopLoss: 1.09 } });
  if (typeof p === 'string') return ok(false, p);
  ok(appliquerFlux(p, t(1.08), 0, undefined, () => false).portefeuille.positions.length === 1, 'marché fermé : stop non déclenché');
  ok(appliquerFlux(p, t(1.08), 0, undefined, () => true).portefeuille.positions.length === 0, 'à la réouverture : stop déclenché (avec le gap)');

  // Levier plafonné par catégorie.
  ok(levierEffectif('FX:EURUSD', 500) === 100 && levierEffectif('SP:SPX', 100) === 50 && levierEffectif('BINANCE:BTCUSDT', 100) === 10 && levierEffectif('NASDAQ:AAPL', 10) === 10, 'levier : forex 1:100, indices 1:50, crypto 1:10, en dessous du plafond inchangé');
  const btc = ouvrir(reinitialiser(100000), 'BINANCE:BTCUSDT', 'achat', 1, 80000, { BTCUSDT: { prix: 80000 } } as any, { levier: 100, tauxCrypto: 0 });
  if (typeof btc === 'string') return ok(false, btc);
  ok(btc.positions[0]!.levier === 10 && Math.abs(btc.positions[0]!.cout - btc.positions[0]!.prixEntree / 10) < 1e-6, 'BTC en 1:100 demandé : ouvert en 1:10, marge = notionnel ÷ 10');
});
