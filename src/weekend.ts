import { estBinance } from './binance';
import { instrument } from './instruments';
import type { Etat } from './types';
import { reglesCompletes } from './challenge';
import { heureLocale, prochaineOuverture } from './horaires';

/**
 * Fermeture du week-end : du vendredi 16 h 50 au dimanche 17 h (heure de New York), soit 10 min avant la clôture
 * hebdomadaire du change jusqu'à sa réouverture. Les marchés hors crypto sont fermés ; la crypto tourne 7 j/7.
 */
export function estWeekendMarche(ms = Date.now()): boolean {
  const { jour, minutes } = heureLocale(ms, 'America/New_York');
  if (jour === 6) return true;
  if (jour === 5) return minutes >= 16 * 60 + 50;
  if (jour === 0) return minutes < 17 * 60;
  return false;
}

export function estCrypto(symbole: string): boolean {
  return estBinance(symbole) || instrument(symbole)?.categorie === 'crypto';
}

/** Instruments touchés par la fermeture du week-end en ce moment. */
export function fermeAuWeekend(symbole: string, ms = Date.now()): boolean {
  return !estCrypto(symbole) && estWeekendMarche(ms);
}

/** Réouverture des marchés après le week-end (dimanche 17 h à New York), en heure locale lisible. */
export function reouverture(ms = Date.now()): string {
  const ouverture = prochaineOuverture('forex', ms);
  return new Date(ouverture).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** La règle du week-end s'applique-t-elle (challenge en cours qui l'exige, ou discipline qui l'active) ? */
export function regleWeekendActive(e: Pick<Etat, 'challenge' | 'parametres'>): boolean {
  const ch = e.challenge;
  const parChallenge = Boolean(ch && ch.statut === 'en-cours' && reglesCompletes(ch.regles).fermetureWeekend);
  const parDiscipline = Boolean(e.parametres.discipline?.actif && e.parametres.discipline.fermetureWeekend);
  return parChallenge || parDiscipline;
}
