import assert from 'node:assert/strict';

/** Vérification nommée : échoue avec le libellé du scénario. */
export function ok(condition: boolean, libelle: string): void {
  assert.ok(condition, libelle);
}
