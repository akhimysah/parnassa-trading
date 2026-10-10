import { instrument, type CategorieInstrument } from './instruments';

/**
 * Horaires de cotation simulés, comme chez un courtier CFD. Les heures sont données dans le fuseau de la place
 * (New York ou Paris), ce qui suit tout seul les changements d'heure d'été et d'hiver.
 */
export type Marche = 'crypto' | 'forex' | 'cme' | 'europe' | 'actions-us' | 'actions-fr';

export const LIBELLES_MARCHE: Record<Marche, string> = {
  crypto: 'Crypto : 24 h/24, 7 j/7',
  forex: 'Change : du dimanche 17 h au vendredi 17 h (New York), sans pause',
  cme: 'Contrats à terme : du dimanche 18 h au vendredi 17 h (New York), pause chaque jour de 17 h à 18 h',
  europe: 'Indices européens : 8 h – 22 h (Paris), du lundi au vendredi',
  'actions-us': 'Actions US : 9 h 30 – 16 h (New York), du lundi au vendredi, hors jours fériés',
  'actions-fr': 'Actions françaises : 9 h – 17 h 30 (Paris), du lundi au vendredi, hors jours fériés',
};

export function marcheDe(symbole: string): Marche {
  const i = instrument(symbole);
  if (!i) return 'crypto';
  const parCategorie: Record<CategorieInstrument, Marche> = {
    crypto: 'crypto',
    forex: 'forex',
    metaux: 'cme',
    energie: 'cme',
    indices: 'cme',
    'actions-us': 'actions-us',
    'actions-fr': 'actions-fr',
  };
  // Indices européens (DAX, CAC 40, FTSE 100) : séance européenne ; les autres suivent les contrats à terme US.
  if (i.categorie === 'indices' && (i.devise === 'EUR' || i.devise === 'GBP')) return 'europe';
  return parCategorie[i.categorie];
}

interface HeureLocale {
  /** 0 = dimanche … 6 = samedi */
  jour: number;
  /** Minutes depuis minuit, heure locale de la place. */
  minutes: number;
  /** AAAA-MM-JJ, date locale de la place. */
  date: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();
const JOURS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function heureLocale(ms: number, fuseau: string): HeureLocale {
  let f = formats.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: fuseau, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formats.set(fuseau, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { jour: JOURS[p.weekday!]!, minutes: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

const iso = (a: number, m: number, j: number) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

/** Dimanche de Pâques (algorithme grégorien anonyme). */
export function paques(annee: number): { mois: number; jour: number } {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  return { mois, jour: ((h + l - 7 * m + 114) % 31) + 1 };
}

function decaler(annee: number, mois: number, jour: number, delta: number): string {
  const d = new Date(Date.UTC(annee, mois - 1, jour + delta));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** n-ième jour de semaine du mois (n = -1 : le dernier). */
function nieme(annee: number, mois: number, jourSemaine: number, n: number): string {
  if (n > 0) {
    const premier = new Date(Date.UTC(annee, mois - 1, 1)).getUTCDay();
    return iso(annee, mois, 1 + ((jourSemaine - premier + 7) % 7) + (n - 1) * 7);
  }
  const dernierJour = new Date(Date.UTC(annee, mois, 0));
  return iso(annee, mois, dernierJour.getUTCDate() - ((dernierJour.getUTCDay() - jourSemaine + 7) % 7));
}

/** Jour férié tombant un week-end : observé le vendredi (samedi) ou le lundi (dimanche), règle de la bourse de New York. */
function observe(annee: number, mois: number, jour: number): string {
  const j = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay();
  return j === 6 ? decaler(annee, mois, jour, -1) : j === 0 ? decaler(annee, mois, jour, 1) : iso(annee, mois, jour);
}

const feriesCache = new Map<string, Set<string>>();

/** Jours de fermeture de la bourse de New York (NYSE) pour l'année. */
export function feriesNyse(annee: number): Set<string> {
  const cle = `us${annee}`;
  let s = feriesCache.get(cle);
  if (s) return s;
  const p = paques(annee);
  s = new Set([
    observe(annee, 1, 1),
    nieme(annee, 1, 1, 3), // Martin Luther King
    nieme(annee, 2, 1, 3), // Presidents' Day
    decaler(annee, p.mois, p.jour, -2), // Vendredi saint
    nieme(annee, 5, 1, -1), // Memorial Day
    observe(annee, 6, 19), // Juneteenth
    observe(annee, 7, 4),
    nieme(annee, 9, 1, 1), // Labor Day
    nieme(annee, 11, 4, 4), // Thanksgiving
    observe(annee, 12, 25),
  ]);
  feriesCache.set(cle, s);
  return s;
}

/** Jours de fermeture d'Euronext Paris pour l'année. */
export function feriesEuronext(annee: number): Set<string> {
  const cle = `fr${annee}`;
  let s = feriesCache.get(cle);
  if (s) return s;
  const p = paques(annee);
  s = new Set([iso(annee, 1, 1), decaler(annee, p.mois, p.jour, -2), decaler(annee, p.mois, p.jour, 1), iso(annee, 5, 1), iso(annee, 12, 25), iso(annee, 12, 26)]);
  feriesCache.set(cle, s);
  return s;
}

/** Le marché est-il ouvert à cet instant ? */
export function marcheOuvert(marche: Marche, ms = Date.now()): boolean {
  if (marche === 'crypto') return true;
  if (marche === 'forex' || marche === 'cme') {
    const { jour, minutes } = heureLocale(ms, 'America/New_York');
    const ouverture = marche === 'forex' ? 17 * 60 : 18 * 60;
    if (jour === 6) return false;
    if (jour === 0) return minutes >= ouverture;
    if (jour === 5) return minutes < 17 * 60;
    // Contrats à terme : pause quotidienne de 17 h à 18 h.
    return marche === 'forex' || minutes < 17 * 60 || minutes >= 18 * 60;
  }
  if (marche === 'europe') {
    const { jour, minutes } = heureLocale(ms, 'Europe/Paris');
    return jour >= 1 && jour <= 5 && minutes >= 8 * 60 && minutes < 22 * 60;
  }
  if (marche === 'actions-us') {
    const { jour, minutes, date } = heureLocale(ms, 'America/New_York');
    return jour >= 1 && jour <= 5 && minutes >= 9 * 60 + 30 && minutes < 16 * 60 && !feriesNyse(Number(date.slice(0, 4))).has(date);
  }
  const { jour, minutes, date } = heureLocale(ms, 'Europe/Paris');
  return jour >= 1 && jour <= 5 && minutes >= 9 * 60 && minutes < 17 * 60 + 30 && !feriesEuronext(Number(date.slice(0, 4))).has(date);
}

export interface EtatMarche {
  marche: Marche;
  ouvert: boolean;
  /** Prochaine ouverture (si fermé) ou fermeture (si ouvert), à la minute près ; null pour la crypto. */
  changement: number | null;
}

const cacheEtat = new Map<string, EtatMarche>();

/** État du marché d'un instrument et prochain changement (recherché par pas de 15 min, puis à la minute). */
export function etatMarche(symbole: string, ms = Date.now()): EtatMarche {
  const marche = marcheDe(symbole);
  if (marche === 'crypto') return { marche, ouvert: true, changement: null };
  const minute = Math.floor(ms / 60000) * 60000;
  const cle = `${marche}:${minute}`;
  const connu = cacheEtat.get(cle);
  if (connu) return connu;
  const ouvert = marcheOuvert(marche, minute);
  let changement: number | null = null;
  const pas = 15 * 60000;
  for (let t = minute + pas; t <= minute + 10 * 24 * 3600000; t += pas) {
    if (marcheOuvert(marche, t) !== ouvert) {
      let debut = t - pas;
      while (marcheOuvert(marche, debut + 60000) === ouvert) debut += 60000;
      changement = debut + 60000;
      break;
    }
  }
  const etat = { marche, ouvert, changement };
  if (cacheEtat.size > 200) cacheEtat.clear();
  cacheEtat.set(cle, etat);
  return etat;
}

/** Prochaine ouverture du marché après cet instant (après sa prochaine fermeture s'il est ouvert). */
export function prochaineOuverture(marche: Marche, ms = Date.now()): number {
  if (marche === 'crypto') return ms;
  const pas = 15 * 60000;
  let t = Math.floor(ms / 60000) * 60000;
  const limite = t + 10 * 24 * 3600000;
  while (t < limite && marcheOuvert(marche, t)) t += pas;
  while (t < limite && !marcheOuvert(marche, t)) t += pas;
  // Affinage à la minute.
  while (marcheOuvert(marche, t - 60000)) t -= 60000;
  return t;
}

/** « lundi 15:30 », « dans 2 h 10 »… pour annoncer une ouverture ou une fermeture. */
export function quand(ms: number, maintenant = Date.now()): string {
  const min = Math.round((ms - maintenant) / 60000);
  if (min < 60) return `dans ${Math.max(1, min)} min`;
  if (min < 12 * 60) return `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  return new Date(ms).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Message de refus d'un ordre quand le marché est fermé, ou null. */
export function marcheFerme(symbole: string, ms = Date.now()): string | null {
  const e = etatMarche(symbole, ms);
  if (e.ouvert) return null;
  return `Marché fermé (${LIBELLES_MARCHE[e.marche].split(' :')[0]}) : réouverture ${e.changement ? quand(e.changement, ms) : 'prochainement'}.`;
}
