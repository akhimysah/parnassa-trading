// Journal des erreurs de Parnassa Trading, lu sur le relais : node scripts/erreurs.mjs [--vider]
// La clé de lecture est dans .erreurs-cle (non versionné), la même que le secret ERREURS_CLE du relais.
import { readFileSync } from 'node:fs';

const RELAIS = 'https://parnassa-actualites.neobank.workers.dev/erreurs';
let cle;
try {
  cle = readFileSync(new URL('../.erreurs-cle', import.meta.url), 'utf8').trim();
} catch {
  console.error('Clé introuvable : créez .erreurs-cle avec la valeur du secret ERREURS_CLE du relais.');
  process.exit(1);
}
const entetes = { Authorization: `Bearer ${cle}` };

if (process.argv.includes('--vider')) {
  const r = await fetch(RELAIS, { method: 'DELETE', headers: entetes });
  console.log(r.ok ? 'Journal vidé.' : `Échec : ${r.status}`);
  process.exit(r.ok ? 0 : 1);
}

const r = await fetch(RELAIS, { headers: entetes });
if (!r.ok) {
  console.error(`Lecture impossible : ${r.status} ${await r.text()}`);
  process.exit(1);
}
const { distinctes, occurrences, erreurs } = await r.json();
console.log(`${distinctes} erreur(s) distincte(s), ${occurrences} occurrence(s) au total.\n`);
const date = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
for (const e of erreurs) {
  console.log(`× ${e.nombre}  ${e.message}`);
  console.log(`   ${e.type} · page ${e.page || '?'} · version ${e.version || '?'} · ${date(e.premiere)} → ${date(e.derniere)}`);
  const cadre = (e.pile || '').split('\n').find((l) => /\.(js|ts|tsx)/.test(l));
  if (cadre) console.log(`   ${cadre.trim()}`);
  console.log(`   ${e.agent}\n`);
}
