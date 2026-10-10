import { estBinance } from './binance';
import { instrument } from './instruments';
import type { Etat } from './types';
import { reglesCompletes } from './challenge';

/**
 * Fermeture du week-end : de vendredi 21 h 50 à dimanche 22 h 00 (UTC), les marchés hors crypto (or, forex, indices,
 * actions, énergie) sont fermés. La crypto tourne 7 jours sur 7.
 */
export function estWeekendMarche(ms = Date.now()): boolean {
  const d = new Date(ms);
  const jour = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (jour === 6) return true;
  if (jour === 5) return minutes >= 21 * 60 + 50;
  if (jour === 0) return minutes < 22 * 60;
  return false;
}

export function estCrypto(symbole: string): boolean {
  return estBinance(symbole) || instrument(symbole)?.categorie === 'crypto';
}

/** Instruments touchés par la fermeture du week-end en ce moment. */
export function fermeAuWeekend(symbole: string, ms = Date.now()): boolean {
  return !estCrypto(symbole) && estWeekendMarche(ms);
}

/** Réouverture : dimanche 22 h 00 UTC, en heure locale lisible. */
export function reouverture(ms = Date.now()): string {
  const d = new Date(ms);
  const jours = (7 - d.getUTCDay()) % 7;
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + jours, 22, 0));
  return r.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** La règle du week-end s'applique-t-elle (challenge en cours qui l'exige, ou discipline qui l'active) ? */
export function regleWeekendActive(e: Pick<Etat, 'challenge' | 'parametres'>): boolean {
  const ch = e.challenge;
  const parChallenge = Boolean(ch && ch.statut === 'en-cours' && reglesCompletes(ch.regles).fermetureWeekend);
  const parDiscipline = Boolean(e.parametres.discipline?.actif && e.parametres.discipline.fermetureWeekend);
  return parChallenge || parDiscipline;
}
