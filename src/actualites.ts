import { useEffect, useRef, useState } from 'react';

export const URL_ACTUALITES = 'https://parnassa-actualites.neobank.workers.dev';

export type CategorieDepeche = 'annonces' | 'marches' | 'forex' | 'crypto' | 'banques-centrales' | 'france' | 'matieres';

export interface Donnee {
  indicateur: string;
  indicateurFr?: string;
  indicateurEn?: string;
  actuel: string;
  prevision: string | null;
  precedent: string | null;
  ecart: 1 | -1 | 0 | null;
}

export interface EvenementCalendrier {
  id: string;
  titre: string;
  titreFr?: string;
  pays: string;
  devise: string;
  periode: string;
  date: number;
  importance: number;
  actuel: number | null;
  prevision: number | null;
  precedent: number | null;
  unite: string;
  echelle: string;
}

export interface Depeche {
  id: string;
  titre: string;
  lien: string;
  source: string;
  categorie: CategorieDepeche;
  langue: 'fr' | 'en';
  date: number;
  important: boolean;
  donnee?: Donnee;
  titreFr?: string;
  titreEn?: string;
}

export type LangueAffichage = 'fr' | 'en' | 'fr+en';

/** Titre affiché en premier selon la langue choisie (le français en mode bilingue). */
export function titrePrincipal(d: Depeche, langue: LangueAffichage): string {
  return langue === 'en' ? (d.titreEn ?? d.titre) : (d.titreFr ?? d.titre);
}

/** En mode bilingue : la version anglaise, si elle diffère du titre principal. */
export function titreSecondaire(d: Depeche, langue: LangueAffichage): string | null {
  if (langue !== 'fr+en') return null;
  const en = d.titreEn ?? d.titre;
  return en !== titrePrincipal(d, langue) ? en : null;
}

/** Texte complet (FR + EN) sur lequel portent la recherche et les mots-clés. */
export function texteRecherche(d: Depeche): string {
  return `${d.titreFr ?? ''} ${d.titreEn ?? ''} ${d.titre}`;
}

export function indicateurAffiche(d: Donnee, langue: LangueAffichage): { principal: string; secondaire: string | null } {
  const fr = d.indicateurFr ?? d.indicateur;
  const en = d.indicateurEn ?? d.indicateur;
  if (langue === 'en') return { principal: en, secondaire: null };
  return { principal: fr, secondaire: langue === 'fr+en' && en !== fr ? en : null };
}

export const LIBELLES_DONNEE: Record<LangueAffichage, { reel: string; prev: string; prec: string }> = {
  fr: { reel: 'Réel', prev: 'Prév.', prec: 'Préc.' },
  'fr+en': { reel: 'Réel', prev: 'Prév.', prec: 'Préc.' },
  en: { reel: 'Actual', prev: 'Fcst', prec: 'Prev.' },
};

export const CATEGORIES_DEPECHES: { id: CategorieDepeche; libelle: string }[] = [
  { id: 'annonces', libelle: 'Annonces' },
  { id: 'marches', libelle: 'Marchés' },
  { id: 'france', libelle: 'France' },
  { id: 'forex', libelle: 'Forex' },
  { id: 'banques-centrales', libelle: 'Banques centrales' },
  { id: 'crypto', libelle: 'Crypto' },
  { id: 'matieres', libelle: 'Matières premières' },
];

interface Reponse {
  generéLe: number;
  depeches: Depeche[];
}

async function charger(chemin: string, signal?: AbortSignal): Promise<Depeche[]> {
  const reponse = await fetch(`${URL_ACTUALITES}${chemin}`, { signal });
  if (!reponse.ok) throw new Error(`Relais d'actualités : ${reponse.status}`);
  const donnees = (await reponse.json()) as Reponse;
  return donnees.depeches;
}

/** Fil principal, rafraîchi toutes les `intervalleMs` ms ; signale les nouvelles dépêches par rapport au passage précédent. */
export function useFilActualites(intervalleMs = 60000, actif = true) {
  const [depeches, setDepeches] = useState<Depeche[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [majLe, setMajLe] = useState<number | null>(null);
  const [nouvelles, setNouvelles] = useState<Depeche[]>([]);
  const connus = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    const controleur = new AbortController();
    const tour = async () => {
      try {
        const liste = await charger('/flux', controleur.signal);
        if (!vivant) return;
        if (connus.current) {
          const fraiches = liste.filter((d) => !connus.current!.has(d.id));
          if (fraiches.length > 0) setNouvelles(fraiches);
        }
        connus.current = new Set(liste.map((d) => d.id));
        setDepeches(liste);
        setErreur(null);
        setMajLe(Date.now());
      } catch (e) {
        if (vivant && !(e instanceof DOMException && e.name === 'AbortError')) setErreur(e instanceof Error ? e.message : 'Erreur réseau');
      } finally {
        if (vivant) setChargement(false);
      }
    };
    void tour();
    const minuteur = window.setInterval(() => void tour(), intervalleMs);
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') void tour();
    };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      vivant = false;
      controleur.abort();
      window.clearInterval(minuteur);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [intervalleMs, actif]);

  return { depeches, erreur, chargement, majLe, nouvelles, effacerNouvelles: () => setNouvelles([]) };
}

/** Dépêches sur un sujet (nom du symbole) et un ticker Yahoo éventuel. */
export function useRechercheActualites(sujet: string, ticker?: string) {
  const [depeches, setDepeches] = useState<Depeche[]>([]);
  const [chargement, setChargement] = useState(false);
  useEffect(() => {
    if (!sujet && !ticker) return;
    let actif = true;
    const controleur = new AbortController();
    setChargement(true);
    const params = new URLSearchParams();
    if (sujet) params.set('q', sujet);
    if (ticker) params.set('ticker', ticker);
    charger(`/recherche?${params.toString()}`, controleur.signal)
      .then((liste) => {
        if (actif) setDepeches(liste);
      })
      .catch(() => {
        if (actif) setDepeches([]);
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
      controleur.abort();
    };
  }, [sujet, ticker]);
  return { depeches, chargement };
}

export type FilActualites = ReturnType<typeof useFilActualites>;

/** Calendrier économique (hier → J+6) avec valeurs publiées, rafraîchi chaque minute. */
export function useCalendrier(actif = true) {
  const [evenements, setEvenements] = useState<EvenementCalendrier[]>([]);
  const [chargement, setChargement] = useState(true);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    const tour = async () => {
      try {
        const r = await fetch(`${URL_ACTUALITES}/calendrier`);
        if (!r.ok) return;
        const d = (await r.json()) as { evenements: EvenementCalendrier[] };
        if (vivant) setEvenements(d.evenements);
      } catch {
        // on garde la dernière version affichée
      } finally {
        if (vivant) setChargement(false);
      }
    };
    void tour();
    const t = window.setInterval(() => void tour(), 60000);
    return () => {
      vivant = false;
      window.clearInterval(t);
    };
  }, [actif]);
  return { evenements, chargement };
}

export function drapeau(pays: string): string {
  if (!/^[A-Z]{2}$/.test(pays)) return '🌐';
  return String.fromCodePoint(...[...pays].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function valeurCalendrier(v: number | null, unite: string, echelle: string): string {
  if (v === null) return '–';
  const nombre = v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const ech = echelle === 'B' ? ' Md' : echelle === 'M' ? ' M' : echelle === 'K' ? ' k' : echelle === 'T' ? ' Bn' : echelle ? ` ${echelle}` : '';
  const un = unite === '%' ? ' %' : unite ? ` ${unite}` : '';
  return `${nombre}${ech}${un}`;
}

export function compteARebours(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 0) return 'maintenant';
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (j > 0) return `dans ${j} j ${h} h`;
  if (h > 0) return `dans ${h} h ${String(m).padStart(2, '0')}`;
  if (m > 0) return `dans ${m} min`;
  return `dans ${s} s`;
}

/** Mots-clés présents dans un titre (insensible à la casse et aux accents, mot entier). */
export function motsClesTrouves(titre: string, motsCles: string[]): string[] {
  const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = sansAccents(titre);
  return motsCles.filter((m) => {
    const mot = sansAccents(m.trim());
    if (!mot) return false;
    const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${echappe}([^a-z0-9]|$)`).test(t);
  });
}

export function heureCourte(ms: number): string {
  const d = new Date(ms);
  const aujourdHui = new Date().toDateString() === d.toDateString();
  return aujourdHui
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ilYA(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/** Sujet de recherche lisible à partir d'un symbole TradingView ("INDEX:DEU40" → "DAX"). */
export function sujetDepuisSymbole(id: string, nom: string): { sujet: string; ticker?: string } {
  const [bourse, ticker] = id.includes(':') ? id.split(':') : ['', id];
  const estCrypto = bourse === 'BINANCE' || bourse === 'CRYPTOCAP';
  const estIndiceOuFx = ['INDEX', 'FOREXCOM', 'FX', 'TVC', 'CAPITALCOM', 'OANDA', 'SP', 'DJ'].includes(bourse);
  if (estCrypto) return { sujet: `${nom} crypto` };
  if (estIndiceOuFx) return { sujet: `${nom} bourse` };
  const tickerYahoo = bourse === 'EURONEXT' ? `${ticker}.PA` : bourse === 'XETR' ? `${ticker}.DE` : ticker;
  return { sujet: `${nom} action bourse`, ticker: tickerYahoo };
}
