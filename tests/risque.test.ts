import { test } from 'node:test';
import { ok } from './outils';
import { lotsParRisque } from '../src/trading';

test('Volume au risque %', () => {
  // Or : 1 lot = 100 onces ; stop à 5 $ → 500 $ par lot ; risquer 1 % de 100 000 = 1 000 $ → 2 lots
  const l = lotsParRisque(1000, 4100, 4095, 'OANDA:XAUUSD', {});
  ok(Math.abs((l ?? 0) - 2) < 1e-9, `or : 1 % de 100 k$ avec stop à 5 $ → ${l} lots (attendu 2)`);
  // Compte de 2 Md$ : 1 % = 20 M$ ; stop 5 $ → 40 000 lots
  const g = lotsParRisque(20_000_000, 4100, 4095, 'OANDA:XAUUSD', {});
  ok(Math.abs((g ?? 0) - 40000) < 1e-6, `2 Md$ à 1 % avec stop à 5 $ → ${g} lots (attendu 40 000, borné ensuite au maximum par ordre)`);
});
