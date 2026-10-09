import { useCallback, useEffect, useRef, useState } from 'react';
import type { Etat, ReglesChallenge } from './types';
import { nouveauChallenge } from './challenge';
import { reinitialiser } from './trading';
import { jetonParnassa, URL_NEOBANQUE } from './synchro';
import {
  ecrirePortefeuilleLocal,
  ecrireSessionCompte,
  lirePortefeuilleLocal,
  lireSessionCompte,
  partieCompte,
  partieLocale,
  type CompteDistant,
  type PartieCompte,
  type SessionCompte,
  type TypeCompte,
} from './compteLocal';

const API = `${URL_NEOBANQUE}/api/parnassa/trading`;
export const SERVEURS = ['Parnassa-Demo', 'Parnassa-Challenge'];
export const CAPITAUX_DEMO = [1000, 5000, 10000, 25000, 50000, 100000, 200000, 500000, 1000000];

export interface Acces {
  login: string;
  serveur?: string;
  motDePasse: string;
  motDePasseInvestisseur: string;
}

async function appel(
  chemin: string,
  init: { methode?: string; jeton?: string | null; corps?: unknown } = {},
): Promise<{ statut: number; donnees: Record<string, unknown> }> {
  try {
    const r = await fetch(`${API}/${chemin}`, {
      method: init.methode ?? 'GET',
      headers: { ...(init.jeton ? { Authorization: `Bearer ${init.jeton}` } : {}), ...(init.corps !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.corps !== undefined ? JSON.stringify(init.corps) : undefined,
    });
    let donnees: Record<string, unknown> = {};
    try {
      donnees = (await r.json()) as Record<string, unknown>;
    } catch {
      donnees = {};
    }
    return { statut: r.status, donnees };
  } catch {
    return { statut: 0, donnees: { error: { message: 'Serveur Parnassa injoignable : vérifiez la connexion.' } } };
  }
}

const messageErreur = (d: Record<string, unknown>, defaut: string) => String((d.error as { message?: string } | undefined)?.message ?? defaut);

/* ---- Gestion des comptes du client (application reliée au compte Parnassa) ---- */

export async function listerComptes(): Promise<{ comptes: CompteDistant[]; max: number } | string> {
  const r = await appel('comptes', { jeton: jetonParnassa() });
  if (r.statut !== 200) return messageErreur(r.donnees, 'Comptes indisponibles.');
  return { comptes: r.donnees.comptes as CompteDistant[], max: Number(r.donnees.max) || 20 };
}

export async function ouvrirCompte(demande: { type: TypeCompte; capital: number; nom?: string; regles?: Omit<ReglesChallenge, 'capital'> }): Promise<{ compte: CompteDistant; acces: Acces } | string> {
  const r = await appel('comptes', { methode: 'POST', jeton: jetonParnassa(), corps: demande });
  if (r.statut !== 201) return messageErreur(r.donnees, 'Ouverture du compte impossible.');
  return { compte: r.donnees.compte as CompteDistant, acces: r.donnees.acces as Acces };
}

export async function regenererMotsDePasse(login: string): Promise<Acces | string> {
  const r = await appel('comptes', { methode: 'PATCH', jeton: jetonParnassa(), corps: { action: 'mots-de-passe', login } });
  if (r.statut !== 200) return messageErreur(r.donnees, 'Nouveaux mots de passe impossibles.');
  return r.donnees.acces as Acces;
}

export async function renommerCompte(login: string, nom: string): Promise<string | null> {
  const r = await appel('comptes', { methode: 'PATCH', jeton: jetonParnassa(), corps: { action: 'renommer', login, nom } });
  return r.statut === 200 ? null : messageErreur(r.donnees, 'Renommage impossible.');
}

export async function fermerCompteDistant(login: string): Promise<string | null> {
  const r = await appel('comptes', { methode: 'DELETE', jeton: jetonParnassa(), corps: { login } });
  return r.statut === 200 ? null : messageErreur(r.donnees, 'Fermeture impossible.');
}

/* ---- Classement des traders ---- */

export interface LigneClassement {
  rang: number;
  pseudo: string;
  type: 'demo' | 'challenge';
  formule: string | null;
  capital: number;
  balance: number;
  performance: number;
  trades: number;
  statut: 'en-cours' | 'reussi' | 'echoue' | null;
  crame: boolean;
  depuis: number;
}

export async function chargerClassement(): Promise<LigneClassement[] | string> {
  const r = await appel('classement');
  if (r.statut !== 200) return messageErreur(r.donnees, 'Classement indisponible.');
  return (r.donnees.classement as LigneClassement[]) ?? [];
}

/* ---- Session sur un compte ---- */

function empreinte(p: PartieCompte): string {
  const texte = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${texte.length}:${h >>> 0}`;
}

/** État de départ d'un compte neuf : son capital, et son challenge s'il en est un. */
function partieInitiale(c: CompteDistant): PartieCompte {
  return {
    portefeuille: reinitialiser(c.capital),
    challenge: c.type === 'challenge' && c.regles ? nouveauChallenge({ ...c.regles, capital: c.capital }) : null,
    challengesPasses: [],
  };
}

function partieValide(e: unknown): e is PartieCompte {
  const p = (e as PartieCompte | null)?.portefeuille;
  return Boolean(p && typeof p === 'object' && Array.isArray(p.positions) && Array.isArray(p.operations) && Array.isArray(p.ordres));
}

export type StatutCompte = 'local' | 'connexion' | 'a-jour' | 'envoi' | 'erreur';

export interface GestionCompte {
  session: SessionCompte | null;
  statut: StatutCompte;
  erreur: string | null;
  connecterAvecAcces: (login: string, motDePasse: string, serveur: string) => Promise<string | null>;
  connecterProprietaire: (login: string) => Promise<string | null>;
  /** Inscrit le compte au classement sous ce pseudo, ou l'en retire (null). Renvoie une erreur ou null. */
  changerPseudo: (pseudo: string | null) => Promise<string | null>;
  deconnecter: (message?: string) => Promise<void>;
}

/**
 * Connexion à un compte de trading : son portefeuille remplace celui de l'appareil (mis de côté), ses
 * changements sont envoyés au compte, et ceux faits ailleurs sont repris. Accès investisseur : lecture seule.
 */
export function useCompteTrading(etat: Etat, setEtat: (f: (e: Etat) => Etat) => void, signaler: (m: string) => void): GestionCompte {
  const [session, setSession] = useState<SessionCompte | null>(() => lireSessionCompte());
  const [statut, setStatut] = useState<StatutCompte>(session ? 'connexion' : 'local');
  const [erreur, setErreur] = useState<string | null>(null);
  const refSession = useRef(session);
  refSession.current = session;
  const refEtat = useRef(etat);
  refEtat.current = etat;
  const envoyee = useRef<string | null>(null);
  const dernierEnvoi = useRef(0);

  const fixerSession = (s: SessionCompte | null) => {
    refSession.current = s;
    ecrireSessionCompte(s);
    setSession(s);
  };

  const appliquerPartie = useCallback(
    (partie: PartieCompte) => {
      envoyee.current = empreinte(partie);
      setEtat((e) => ({ ...e, ...partie, portefeuilleHorsChallenge: null }));
    },
    [setEtat],
  );

  /** Retour au portefeuille de l'appareil. */
  const restaurerLocal = useCallback(() => {
    const local = lirePortefeuilleLocal();
    setEtat((e) => ({
      ...e,
      ...(local ?? { portefeuille: reinitialiser(), challenge: null, portefeuilleHorsChallenge: null, challengesPasses: e.challengesPasses ?? [] }),
    }));
    ecrirePortefeuilleLocal(null);
    fixerSession(null);
    envoyee.current = null;
    setStatut('local');
    setErreur(null);
  }, [setEtat]);

  const ouvrirSession = useCallback(
    async (r: { statut: number; donnees: Record<string, unknown> }): Promise<string | null> => {
      if (r.statut !== 200) return messageErreur(r.donnees, 'Connexion impossible.');
      const jeton = String(r.donnees.jeton);
      const lecture = r.donnees.lecture === true;
      const compte = r.donnees.compte as CompteDistant;
      const lu = await appel('compte', { jeton });
      if (lu.statut !== 200) return messageErreur(lu.donnees, 'Compte illisible.');
      let partie: PartieCompte;
      let majLe = typeof lu.donnees.majLe === 'number' ? lu.donnees.majLe : null;
      if (partieValide(lu.donnees.etat)) partie = { ...partieInitiale(compte), ...lu.donnees.etat };
      else {
        partie = partieInitiale(compte);
        if (!lecture) {
          const envoi = await appel('compte', { methode: 'PUT', jeton, corps: { etat: partie, base: null, forcer: true } });
          if (envoi.statut === 200) majLe = Number(envoi.donnees.majLe);
        }
      }
      const precedente = refSession.current;
      if (precedente) void appel('connexion', { methode: 'DELETE', jeton: precedente.jeton });
      else ecrirePortefeuilleLocal(partieLocale(refEtat.current));
      fixerSession({ jeton, lecture, compte, base: majLe });
      appliquerPartie(partie);
      setStatut('a-jour');
      setErreur(null);
      signaler(`Connecté au compte ${compte.login} (${compte.serveur})${lecture ? ' · lecture seule' : ''}`);
      return null;
    },
    [appliquerPartie, signaler],
  );

  const connecterAvecAcces = useCallback(
    async (login: string, motDePasse: string, serveur: string) =>
      ouvrirSession(await appel('connexion', { methode: 'POST', corps: { login: login.trim(), motDePasse, serveur } })),
    [ouvrirSession],
  );

  const connecterProprietaire = useCallback(
    async (login: string) => ouvrirSession(await appel('connexion', { methode: 'POST', jeton: jetonParnassa(), corps: { login, proprietaire: true } })),
    [ouvrirSession],
  );

  const deconnecter = useCallback(
    async (message = 'Déconnecté du compte : retour au portefeuille de cet appareil.') => {
      const s = refSession.current;
      if (s) void appel('connexion', { methode: 'DELETE', jeton: s.jeton });
      restaurerLocal();
      signaler(message);
    },
    [restaurerLocal, signaler],
  );

  const adopter = useCallback(
    (distant: unknown, majLe: number | null, message?: string) => {
      const s = refSession.current;
      if (!s || !partieValide(distant)) return;
      fixerSession({ ...s, base: majLe });
      appliquerPartie({ ...partieInitiale(s.compte), ...distant });
      if (message) signaler(message);
    },
    [appliquerPartie, signaler],
  );

  // Reprise des changements faits ailleurs (toutes les 5 s en lecture seule, 30 s sinon, et au retour sur l'onglet).
  const lire = useCallback(async () => {
    const s = refSession.current;
    if (!s) return;
    const r = await appel('compte', { jeton: s.jeton });
    if (refSession.current?.jeton !== s.jeton) return;
    if (r.statut === 401) return void deconnecter('Session du compte expirée ou mots de passe changés : reconnectez-vous avec vos accès.');
    if (r.statut !== 200) {
      setErreur(messageErreur(r.donnees, 'Compte injoignable.'));
      setStatut('erreur');
      return;
    }
    const majLe = typeof r.donnees.majLe === 'number' ? r.donnees.majLe : null;
    if (majLe !== null && (s.base === null || majLe > s.base)) adopter(r.donnees.etat, majLe, s.lecture ? undefined : 'Compte mis à jour depuis un autre appareil.');
    setErreur(null);
    setStatut('a-jour');
  }, [adopter, deconnecter]);

  const jetonActif = session?.jeton ?? null;
  const lectureSeule = session?.lecture ?? false;
  useEffect(() => {
    if (!jetonActif) return;
    void lire();
    const t = window.setInterval(() => void lire(), lectureSeule ? 5000 : 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') void lire();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [jetonActif, lectureSeule, lire]);

  const envoyer = useCallback(async () => {
    const s = refSession.current;
    if (!s || s.lecture) return;
    const partie = partieCompte(refEtat.current);
    const cle = empreinte(partie);
    setStatut('envoi');
    const r = await appel('compte', { methode: 'PUT', jeton: s.jeton, corps: { etat: partie, base: s.base } });
    if (refSession.current?.jeton !== s.jeton) return;
    if (r.statut === 401) return void deconnecter('Session du compte expirée ou mots de passe changés : reconnectez-vous avec vos accès.');
    if (r.statut === 409) {
      adopter(r.donnees.etat, typeof r.donnees.majLe === 'number' ? r.donnees.majLe : null, 'Compte mis à jour depuis un autre appareil.');
      setStatut('a-jour');
      return;
    }
    if (r.statut !== 200) {
      setErreur(messageErreur(r.donnees, 'Enregistrement impossible.'));
      setStatut('erreur');
      return;
    }
    envoyee.current = cle;
    dernierEnvoi.current = Date.now();
    fixerSession({ ...s, base: Number(r.donnees.majLe) });
    setErreur(null);
    setStatut('a-jour');
  }, [adopter, deconnecter]);

  // Envoi des changements du compte, au plus toutes les 5 secondes.
  const cle = session && !session.lecture ? empreinte(partieCompte(etat)) : null;
  useEffect(() => {
    if (cle === null || cle === envoyee.current) return;
    const attente = Math.max(1200, dernierEnvoi.current + 5000 - Date.now());
    const t = window.setTimeout(() => void envoyer(), attente);
    return () => window.clearTimeout(t);
  }, [cle, envoyer]);

  const changerPseudo = useCallback(async (pseudo: string | null) => {
    const s = refSession.current;
    if (!s) return 'Connectez-vous d’abord à un compte.';
    const r = await appel('compte', { methode: 'PATCH', jeton: s.jeton, corps: { pseudo } });
    if (r.statut !== 200) return messageErreur(r.donnees, 'Inscription au classement impossible.');
    const actuelle = refSession.current;
    if (actuelle?.jeton === s.jeton) fixerSession({ ...actuelle, compte: { ...actuelle.compte, pseudo: (r.donnees.pseudo as string | null) ?? null } });
    return null;
  }, []);

  return { session, statut, erreur, connecterAvecAcces, connecterProprietaire, deconnecter, changerPseudo };
}
