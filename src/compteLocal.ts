import type { Challenge, Etat, Portefeuille, ReglesChallenge } from './types';

/**
 * Comptes de trading à accès (numéro, mot de passe, serveur) : session ouverte sur cet appareil, et
 * portefeuille local mis de côté pendant qu'on trade sur un compte (restauré à la déconnexion).
 */
const CLE_SESSION = 'parnassa-trading:compte-session:v1';
const CLE_LOCAL = 'parnassa-trading:portefeuille-local:v1';

export type TypeCompte = 'demo' | 'challenge';

export interface CompteDistant {
  login: string;
  nom: string;
  type: TypeCompte;
  serveur: string;
  capital: number;
  regles: ReglesChallenge | null;
  creeLe: number;
  derniereConnexion: number | null;
  majLe: number | null;
}

export interface SessionCompte {
  jeton: string;
  lecture: boolean;
  compte: CompteDistant;
  /** Date de la copie du compte sur laquelle cet appareil s'appuie. */
  base: number | null;
}

/** Ce qui appartient à un compte : son portefeuille et son challenge. */
export interface PartieCompte {
  portefeuille: Portefeuille;
  challenge: Challenge | null;
  challengesPasses: Challenge[];
}

/** Ce qui est mis de côté pendant la connexion à un compte. */
export interface PartieLocale extends PartieCompte {
  portefeuilleHorsChallenge: Portefeuille | null;
}

function lireJson<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}
function ecrireJson(cle: string, valeur: unknown) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // stockage indisponible
  }
}

export const lireSessionCompte = () => lireJson<SessionCompte>(CLE_SESSION);
export const ecrireSessionCompte = (s: SessionCompte | null) => ecrireJson(CLE_SESSION, s);
export const lirePortefeuilleLocal = () => lireJson<PartieLocale>(CLE_LOCAL);
export const ecrirePortefeuilleLocal = (p: PartieLocale | null) => ecrireJson(CLE_LOCAL, p);

export function partieCompte(e: Pick<Etat, 'portefeuille' | 'challenge' | 'challengesPasses'>): PartieCompte {
  return { portefeuille: e.portefeuille, challenge: e.challenge ?? null, challengesPasses: e.challengesPasses ?? [] };
}

export function partieLocale(e: Etat): PartieLocale {
  return { ...partieCompte(e), portefeuilleHorsChallenge: e.portefeuilleHorsChallenge ?? null };
}
