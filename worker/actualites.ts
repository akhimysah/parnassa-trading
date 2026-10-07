/**
 * Relais d'actualités financières : agrège des flux RSS publics, les normalise et les sert en JSON
 * avec CORS, mis en cache 60 s. Déployé sur Cloudflare Workers (aucune donnée personnelle traitée).
 */

type Categorie = 'annonces' | 'marches' | 'forex' | 'crypto' | 'banques-centrales' | 'france' | 'matieres';

interface Flux {
  url: string;
  source: string;
  categorie: Categorie;
  langue: 'fr' | 'en';
}

interface Donnee {
  indicateur: string;
  indicateurFr?: string;
  indicateurEn?: string;
  actuel: string;
  prevision: string | null;
  precedent: string | null;
  /** Comparaison réel / prévision : 1 au-dessus, -1 en dessous, 0 égal, null si non comparable. */
  ecart: 1 | -1 | 0 | null;
}

interface Depeche {
  id: string;
  titre: string;
  lien: string;
  source: string;
  categorie: Categorie;
  langue: 'fr' | 'en';
  date: number;
  important: boolean;
  donnee?: Donnee;
  titreFr?: string;
  titreEn?: string;
}

interface EvenementCalendrier {
  id: string;
  titre: string;
  titreFr?: string;
  pays: string;
  devise: string;
  periode: string;
  date: number;
  /** -1 faible / jour férié, 0 moyen, 1 fort. */
  importance: number;
  actuel: number | null;
  prevision: number | null;
  precedent: number | null;
  unite: string;
  echelle: string;
}

const FLUX_FINANCIALJUICE: Flux = { url: 'https://www.financialjuice.com/feed.ashx?xy=rss', source: 'FinancialJuice', categorie: 'annonces', langue: 'en' };

const FLUX: Flux[] = [
  FLUX_FINANCIALJUICE,
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', source: 'MarketWatch', categorie: 'marches', langue: 'en' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch', categorie: 'marches', langue: 'en' },
  { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC', categorie: 'marches', langue: 'en' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC', categorie: 'marches', langue: 'en' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com', categorie: 'marches', langue: 'en' },
  { url: 'https://www.investing.com/rss/news_11.rss', source: 'Investing.com', categorie: 'matieres', langue: 'en' },
  { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet', categorie: 'forex', langue: 'en' },
  { url: 'https://www.forexlive.com/feed/news', source: 'ForexLive', categorie: 'forex', langue: 'en' },
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', source: 'Fed', categorie: 'banques-centrales', langue: 'en' },
  { url: 'https://www.ecb.europa.eu/rss/press.html', source: 'BCE', categorie: 'banques-centrales', langue: 'en' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', categorie: 'crypto', langue: 'en' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph', categorie: 'crypto', langue: 'en' },
  { url: 'https://fr.investing.com/rss/news.rss', source: 'Investing.com', categorie: 'france', langue: 'fr' },
  { url: 'https://fr.investing.com/rss/market_overview.rss', source: 'Investing.com', categorie: 'france', langue: 'fr' },
  { url: 'https://www.abcbourse.com/rss/displaynewsrss', source: 'ABC Bourse', categorie: 'france', langue: 'fr' },
  { url: 'https://www.bfmtv.com/rss/economie/', source: 'BFM', categorie: 'france', langue: 'fr' },
];

const MOTS_IMPORTANTS = [
  /\b(breaking|urgent|flash|alerte|just in)\b/i,
  /\b(fed|fomc|powell|bce|ecb|lagarde|boe|boj|snb|banque centrale|central bank)\b/i,
  /\b(taux directeur|rate decision|rate hike|rate cut|hausse des taux|baisse des taux|interest rate)\b/i,
  /\b(cpi|inflation|pce|nfp|non-farm|payrolls|emploi|unemployment|chômage|gdp|pib|pmi|ism)\b/i,
  /\b(krach|crash|plunge|soars|record|all-time high|plus haut historique|circuit breaker|halted)\b/i,
  /\b(tarif|tariff|sanction|default|défaut de paiement|faillite|bankruptcy)\b/i,
];

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#8230': '…', '#x27': "'", '#160': ' ' };

function decoder(texte: string): string {
  return texte
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tout, code: string) => {
      const c = code.toLowerCase();
      if (ENTITES[c]) return ENTITES[c];
      if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return tout;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function balise(bloc: string, nom: string): string | null {
  const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i'));
  return m ? m[1] : null;
}

function lienAtom(bloc: string): string | null {
  const m = bloc.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

function nombreDonnee(v: string | null): number | null {
  if (!v || v === '-') return null;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (/k$/i.test(v)) n *= 1e3;
  if (/m$/i.test(v)) n *= 1e6;
  if (/b$/i.test(v)) n *= 1e9;
  return n;
}

/** « German CPI YoY Actual 2.1% (Forecast 2.0%, Previous 1.9%) » → données structurées. */
function analyserDonnee(titre: string): Donnee | undefined {
  const m = titre.match(/^(.*?)\s+Actual\s+(.+?)\s*\(Forecast\s+([^,]*),\s*Previous\s+([^)]*)\)/i);
  if (!m) return undefined;
  const [, indicateur, actuel, prevision, precedent] = m.map((x) => x.trim());
  const a = nombreDonnee(actuel);
  const f = nombreDonnee(prevision);
  return {
    indicateur,
    actuel,
    prevision: prevision && prevision !== '-' ? prevision : null,
    precedent: precedent && precedent !== '-' ? precedent : null,
    ecart: a === null || f === null ? null : a > f ? 1 : a < f ? -1 : 0,
  };
}

/** Catégorie d'une annonce FinancialJuice déduite de son titre. */
function categorieAnnonce(titre: string): Categorie {
  if (/\b(fed|fomc|powell|ecb|lagarde|boe|bailey|boj|ueda|snb|rba|rbnz|boc|pboc|central bank|rate decision)\b/i.test(titre)) return 'banques-centrales';
  if (/\b(bitcoin|btc|ether|crypto|stablecoin)\b/i.test(titre)) return 'crypto';
  if (/\b(oil|crude|brent|wti|opec|gold|silver|copper|natgas|natural gas|wheat)\b/i.test(titre)) return 'matieres';
  if (/\b(eur\/|usd\/|gbp\/|jpy|yen|yuan|dollar|fx options|forex)\b/i.test(titre)) return 'forex';
  return 'annonces';
}

function parser(xml: string, flux: Flux): Depeche[] {
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const depeches: Depeche[] = [];
  for (const bloc of blocs) {
    const titre = decoder(balise(bloc, 'title') ?? '').replace(/^FinancialJuice:\s*/i, '');
    // Les liens « FJElite » renvoient vers l'offre payante de FinancialJuice : on les écarte.
    if (!titre || /-\s*FJElite\s*$/i.test(titre)) continue;
    const estFJ = flux.source === 'FinancialJuice';
    const donnee = estFJ ? analyserDonnee(titre) : undefined;
    const lienBrut = balise(bloc, 'link') ?? lienAtom(bloc) ?? balise(bloc, 'guid') ?? '';
    const lien = decoder(lienBrut);
    const dateBrute = balise(bloc, 'pubDate') ?? balise(bloc, 'published') ?? balise(bloc, 'updated') ?? balise(bloc, 'dc:date') ?? '';
    const date = Date.parse(decoder(dateBrute)) || Date.now();
    const important = MOTS_IMPORTANTS.some((r) => r.test(titre));
    const sourceBing = balise(bloc, 'News:Source');
    depeches.push({
      id: `${flux.source}:${hacher(titre)}`,
      titre,
      lien,
      source: sourceBing ? decoder(sourceBing) : flux.source,
      categorie: estFJ ? (donnee ? 'annonces' : categorieAnnonce(titre)) : flux.categorie,
      langue: flux.langue,
      date,
      // Une donnée économique très éloignée de la prévision est signalée comme importante.
      important: important || (donnee?.ecart !== null && donnee?.ecart !== undefined && donnee.ecart !== 0 && MOTS_IMPORTANTS[3].test(donnee.indicateur)),
      donnee,
    });
  }
  return depeches;
}

function hacher(texte: string): string {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normaliserTitre(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Récupère un texte distant. Une copie en mémoire de l'isolat évite de solliciter la source plus d'une fois
 * par `fraicheur` secondes ; si la source refuse (FinancialJuice limite les appels), on sert la dernière copie
 * connue, en mémoire ou dans la copie de secours groupée du cache Cloudflare (une seule entrée pour tous les flux,
 * car l'offre gratuite limite chaque appel du relais à 50 sous-requêtes).
 */
const memoireFlux = new Map<string, { recuLe: number; texte: string }>();
let secoursCharge: Record<string, string> | null = null;
let secoursModifie = false;
/** Origine réelle du relais : le cache Cloudflare ignore les clés sur un domaine étranger. */
let origine = 'https://parnassa-actualites.neobank.workers.dev';
const cleSecours = () => new Request(`${origine}/__cache/secours-flux-v3`);

async function chargerSecours(forcer = false): Promise<Record<string, string>> {
  if (secoursCharge && !forcer) return secoursCharge;
  const r = await caches.default.match(cleSecours());
  secoursCharge = r ? ((await r.json()) as Record<string, string>) : {};
  return secoursCharge;
}

async function sauverSecours(): Promise<void> {
  if (!secoursModifie || !secoursCharge) return;
  secoursModifie = false;
  await caches.default.put(cleSecours(), new Response(JSON.stringify(secoursCharge), { headers: { 'Cache-Control': 'max-age=86400' } }));
}

const echecsRecents = new Map<string, number>();

async function recupererTexte(url: string, fraicheur: number): Promise<string | null> {
  const enMemoire = memoireFlux.get(url);
  if (enMemoire && Date.now() - enMemoire.recuLe < fraicheur * 1000) return enMemoire.texte;
  // Après un refus (429…), on laisse la source tranquille une minute et on sert la copie connue.
  const dernierEchec = echecsRecents.get(url);
  if (dernierEchec && Date.now() - dernierEchec < 60000) return enMemoire?.texte ?? (await chargerSecours())[url] ?? (await chargerSecours(true))[url] ?? null;
  try {
    const reponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if (reponse.ok) {
      const texte = await reponse.text();
      memoireFlux.set(url, { recuLe: Date.now(), texte });
      const secours = await chargerSecours();
      if (secours[url] !== texte) {
        secours[url] = texte;
        secoursModifie = true;
      }
      return texte;
    }
    echecsRecents.set(url, Date.now());
  } catch {
    // réseau ou délai dépassé : on tente une copie connue
    echecsRecents.set(url, Date.now());
  }
  if (enMemoire) return enMemoire.texte;
  // La copie de l'isolat peut être plus ancienne que celle enregistrée par un autre isolat : on relit.
  const secours = await chargerSecours();
  return secours[url] ?? (await chargerSecours(true))[url] ?? null;
}


// ---------- Traduction FR ⇄ EN ----------

type Langue = 'fr' | 'en';
/**
 * Dictionnaire de traductions par langue cible : en mémoire de l'isolat et dans une seule entrée du cache
 * Cloudflare (7 jours), pour que chaque titre ne soit traduit qu'une fois sans multiplier les sous-requêtes.
 */
const dictionnaires: Record<Langue, Map<string, string> | null> = { fr: null, en: null };
const dictionnaireModifie: Record<Langue, boolean> = { fr: false, en: false };
const cleDictionnaire = (cible: Langue) => new Request(`${origine}/__cache/dictionnaire-${cible}-v2`);

async function dictionnaire(cible: Langue): Promise<Map<string, string>> {
  const existant = dictionnaires[cible];
  if (existant) return existant;
  const r = await caches.default.match(cleDictionnaire(cible));
  const carte = new Map<string, string>(r ? Object.entries((await r.json()) as Record<string, string>) : []);
  dictionnaires[cible] = carte;
  return carte;
}

async function sauverDictionnaires(): Promise<void> {
  for (const cible of ['fr', 'en'] as Langue[]) {
    const carte = dictionnaires[cible];
    if (!carte || !dictionnaireModifie[cible]) continue;
    dictionnaireModifie[cible] = false;
    // On garde les 5 000 traductions les plus récentes (ordre d'insertion).
    const entrees = [...carte.entries()].slice(-5000);
    if (entrees.length < carte.size) dictionnaires[cible] = new Map(entrees);
    await caches.default.put(
      cleDictionnaire(cible),
      new Response(JSON.stringify(Object.fromEntries(entrees)), { headers: { 'Cache-Control': 'max-age=604800' } }),
    );
  }
}

async function appelTraduction(textes: string[], source: Langue, cible: Langue): Promise<string[] | null> {
  const corps = new URLSearchParams();
  for (const t of textes) corps.append('q', t);
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=${source}&tl=${cible}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0)' },
      body: corps.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const brut = (await r.json()) as unknown;
    const liste = Array.isArray(brut) ? brut : [brut];
    // Un seul texte → chaîne ; plusieurs → tableau de chaînes ou de [traduction, langue].
    const sortie = liste.map((x) => (Array.isArray(x) ? String(x[0]) : String(x)));
    return sortie.length === textes.length ? sortie : null;
  } catch {
    return null;
  }
}

/** Traduit une liste de textes de `source` vers `cible` ; renvoie l'original pour ce qui n'a pas pu être traduit. */
async function traduire(textes: string[], source: Langue, cible: Langue): Promise<string[]> {
  if (textes.length === 0) return [];
  const carte = await dictionnaire(cible);
  const manquants = [...new Set(textes.filter((t) => !carte.has(t)))];
  // Lots d'environ 60 titres / 6 000 caractères ; 12 lots au plus par appel (le reste au passage suivant).
  const lots: string[][] = [];
  let lot: string[] = [];
  let taille = 0;
  for (const t of manquants) {
    if (lot.length >= 60 || taille + t.length > 6000) {
      lots.push(lot);
      lot = [];
      taille = 0;
    }
    lot.push(t);
    taille += t.length;
  }
  if (lot.length) lots.push(lot);
  await Promise.all(
    lots.slice(0, 12).map(async (l) => {
      const traductions = await appelTraduction(l, source, cible);
      if (!traductions) return;
      l.forEach((t, k) => carte.set(t, traductions[k]));
      dictionnaireModifie[cible] = true;
    }),
  );
  return textes.map((t) => carte.get(t) ?? t);
}

/** Ajoute titreFr / titreEn à chaque dépêche (et l'indicateur des données économiques). */
async function bilingue(depeches: Depeche[]): Promise<Depeche[]> {
  const versFr = depeches.filter((d) => d.langue === 'en');
  const versEn = depeches.filter((d) => d.langue === 'fr');
  const indicateurs = versFr.filter((d) => d.donnee).map((d) => d.donnee!.indicateur);
  const [fr, en, indicFr] = await Promise.all([
    traduire(versFr.map((d) => d.titre), 'en', 'fr'),
    traduire(versEn.map((d) => d.titre), 'fr', 'en'),
    traduire(indicateurs, 'en', 'fr'),
  ]);
  const tradFr = new Map(versFr.map((d, i) => [d.id, fr[i]]));
  const tradEn = new Map(versEn.map((d, i) => [d.id, en[i]]));
  const tradIndic = new Map(indicateurs.map((t, i) => [t, indicFr[i]]));
  return depeches.map((d) => ({
    ...d,
    titreFr: d.langue === 'fr' ? d.titre : tradFr.get(d.id) ?? d.titre,
    titreEn: d.langue === 'en' ? d.titre : tradEn.get(d.id) ?? d.titre,
    donnee: d.donnee ? { ...d.donnee, indicateurEn: d.donnee.indicateur, indicateurFr: tradIndic.get(d.donnee.indicateur) ?? d.donnee.indicateur } : undefined,
  }));
}

import { envoyerPush, type AbonnementPush, type MessagePush } from './push';

interface Env {
  ANNONCES: KVNamespace;
  VAPID_PRIVEE: string;
  VAPID_PUBLIQUE: string;
}

let envGlobal: Env | undefined;
let contexteRequete: ExecutionContext | undefined;
const CLE_KV_FJ = 'financialjuice-rss';
let memoireFJ: { lueLe: number; texte: string | null } | null = null;

/**
 * FinancialJuice bloque les adresses qui l'interrogent trop souvent. Seule la tâche planifiée l'appelle
 * (toutes les 2 min) et dépose le flux dans KV ; les requêtes lisent cette copie (mémoire de l'isolat 20 s).
 */
interface CopieFJ {
  t: number;
  texte: string;
}

/** La copie KV contient l'heure de récupération ; l'ancien format (XML brut) est accepté. */
async function lireCopieFJ(env: Env): Promise<CopieFJ | null> {
  const brut = await env.ANNONCES.get(CLE_KV_FJ);
  if (!brut) return null;
  if (brut.startsWith('{')) {
    try {
      return JSON.parse(brut) as CopieFJ;
    } catch {
      return null;
    }
  }
  return { t: 0, texte: brut };
}

async function texteFinancialJuice(ctx?: ExecutionContext): Promise<string | null> {
  if (memoireFJ && Date.now() - memoireFJ.lueLe < 20000) return memoireFJ.texte;
  if (!envGlobal) return null;
  const copie = await lireCopieFJ(envGlobal);
  memoireFJ = { lueLe: Date.now(), texte: copie?.texte ?? null };
  // Plan B si la tâche planifiée ne tourne pas : copie de plus de 150 s → un visiteur la rafraîchit,
  // au plus une tentative toutes les 2 minutes par centre de données (verrou dans le cache Cloudflare).
  if (!copie || Date.now() - copie.t > 300000) {
    const verrou = new Request(`${origine}/__cache/fj-tentative`);
    if (!(await caches.default.match(verrou))) {
      await caches.default.put(verrou, new Response('1', { headers: { 'Cache-Control': 'max-age=120' } }));
      const env = envGlobal;
      const tache = rafraichirFinancialJuice(env).then((etat) => console.log(`FinancialJuice (plan B) : ${etat}`));
      if (ctx) ctx.waitUntil(tache);
    }
  }
  return memoireFJ.texte;
}

async function rafraichirFinancialJuice(env: Env): Promise<string> {
  const actuelle = await lireCopieFJ(env);
  if (actuelle && Date.now() - actuelle.t < 90000) return 'déjà à jour';
  try {
    const r = await fetch(FLUX_FINANCIALJUICE.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)', Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return `refus ${r.status}`;
    const texte = await r.text();
    if (!/<item>/i.test(texte)) return 'flux vide';
    await env.ANNONCES.put(CLE_KV_FJ, JSON.stringify({ t: Date.now(), texte } satisfies CopieFJ));
    memoireFJ = { lueLe: Date.now(), texte };
    return 'mis à jour';
  } catch (e) {
    return `erreur ${e instanceof Error ? e.message : ''}`;
  }
}

async function lireFlux(flux: Flux): Promise<Depeche[]> {
  if (flux.source === 'FinancialJuice') {
    const texte = await texteFinancialJuice(contexteRequete);
    return texte ? parser(texte, flux) : [];
  }
  const texte = await recupererTexte(flux.url, 90);
  return texte ? parser(texte, flux) : [];
}

const PAYS_CALENDRIER = 'US,EU,DE,FR,GB,JP,CN,CA,AU,CH,IT,ES,NZ';

/** Calendrier économique (hier → J+6) avec valeurs réelles publiées, prévisions et précédents. */
async function calendrier(): Promise<EvenementCalendrier[]> {
  const jour = 86400000;
  const debut = new Date(Math.floor(Date.now() / jour) * jour - jour).toISOString();
  const fin = new Date(Math.floor(Date.now() / jour) * jour + 7 * jour).toISOString();
  const url = `https://economic-calendar.tradingview.com/events?from=${debut}&to=${fin}&countries=${PAYS_CALENDRIER}`;
  let texte: string | null = null;
  try {
    const r = await fetch(url, { headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0)' }, signal: AbortSignal.timeout(8000) });
    if (r.ok) texte = await r.text();
  } catch {
    texte = null;
  }
  if (!texte) return [];
  try {
    const brut = (JSON.parse(texte) as { result?: Record<string, unknown>[] }).result ?? [];
    return brut
      .map((e) => ({
        id: String(e.id),
        titre: String(e.title ?? ''),
        pays: String(e.country ?? ''),
        devise: String(e.currency ?? ''),
        periode: String(e.period ?? ''),
        date: Date.parse(String(e.date)),
        importance: Number(e.importance ?? -1),
        actuel: typeof e.actual === 'number' ? e.actual : null,
        prevision: typeof e.forecast === 'number' ? e.forecast : null,
        precedent: typeof e.previous === 'number' ? e.previous : null,
        unite: String(e.unit ?? ''),
        echelle: String(e.scale ?? ''),
      }))
      .filter((e) => Number.isFinite(e.date) && e.titre)
      .sort((a, b) => a.date - b.date);
  } catch {
    return [];
  }
}

// ---------- Indice de surprise économique ----------

/** Indicateurs pour lesquels un chiffre plus haut que prévu est une mauvaise nouvelle pour l'économie. */
const INVERSES = /unemployment|jobless|claims|chômage|layoff|bankrupt|insolvenc|deficit/i;

interface SurprisePays {
  pays: string;
  devise: string;
  indice: number;
  publies: number;
  meilleurs: number;
  moins_bons: number;
  conformes: number;
  marquants: { titre: string; titreFr: string; date: number; actuel: number; prevision: number; unite: string; echelle: string; signe: number; importance: number }[];
}

/**
 * Pour chaque pays, sur 30 jours : chaque publication compte +1 si elle bat la prévision, -1 si elle la rate
 * (sens inversé pour chômage, inscriptions… ), avec un poids double pour les annonces à fort impact.
 * L'indice va de -100 (que des déceptions) à +100 (que des bonnes surprises).
 */
async function surprises(): Promise<SurprisePays[]> {
  const jour = 86400000;
  const debut = new Date(Date.now() - 30 * jour).toISOString();
  const fin = new Date().toISOString();
  let brut: Record<string, unknown>[] = [];
  try {
    const r = await fetch(`https://economic-calendar.tradingview.com/events?from=${debut}&to=${fin}&countries=${PAYS_CALENDRIER}`, {
      headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) brut = ((await r.json()) as { result?: Record<string, unknown>[] }).result ?? [];
  } catch {
    brut = [];
  }
  const parPays = new Map<string, SurprisePays & { somme: number; poids: number }>();
  for (const e of brut) {
    const actuel = typeof e.actual === 'number' ? e.actual : null;
    const prevision = typeof e.forecast === 'number' ? e.forecast : null;
    const importance = Number(e.importance ?? -1);
    if (actuel === null || prevision === null || importance < 0) continue;
    const titre = String(e.title ?? '');
    const pays = String(e.country ?? '');
    const brutSigne = Math.sign(actuel - prevision);
    const signe = INVERSES.test(titre) ? -brutSigne : brutSigne;
    const poids = importance >= 1 ? 2 : 1;
    const entree =
      parPays.get(pays) ??
      { pays, devise: String(e.currency ?? ''), indice: 0, publies: 0, meilleurs: 0, moins_bons: 0, conformes: 0, marquants: [], somme: 0, poids: 0 };
    entree.publies += 1;
    entree.somme += signe * poids;
    entree.poids += poids;
    if (signe > 0) entree.meilleurs += 1;
    else if (signe < 0) entree.moins_bons += 1;
    else entree.conformes += 1;
    if (signe !== 0 && importance >= 1) {
      entree.marquants.push({
        titre,
        titreFr: titre,
        date: Date.parse(String(e.date)),
        actuel,
        prevision,
        unite: String(e.unit ?? ''),
        echelle: String(e.scale ?? ''),
        signe,
        importance,
      });
    }
    parPays.set(pays, entree);
  }
  const liste = [...parPays.values()]
    .filter((p) => p.publies >= 3)
    .map(({ somme, poids, ...p }) => ({
      ...p,
      indice: poids ? Math.round((somme / poids) * 100) : 0,
      marquants: p.marquants.sort((a, b) => b.date - a.date).slice(0, 5),
    }))
    .sort((a, b) => b.indice - a.indice);
  // Titres des publications marquantes traduits en français.
  const titres = [...new Set(liste.flatMap((p) => p.marquants.map((m) => m.titre)))];
  const fr = await traduire(titres, 'en', 'fr');
  const carte = new Map(titres.map((t, i) => [t, fr[i]]));
  for (const p of liste) for (const m of p.marquants) m.titreFr = carte.get(m.titre) ?? m.titre;
  return liste;
}

// ---------- Banques centrales ----------

const BANQUES: Record<string, { nom: string; nomFr: string }> = {
  US: { nom: 'Federal Reserve', nomFr: 'Réserve fédérale (Fed)' },
  EU: { nom: 'European Central Bank', nomFr: 'Banque centrale européenne (BCE)' },
  GB: { nom: 'Bank of England', nomFr: "Banque d'Angleterre (BoE)" },
  JP: { nom: 'Bank of Japan', nomFr: 'Banque du Japon (BoJ)' },
  CH: { nom: 'Swiss National Bank', nomFr: 'Banque nationale suisse (BNS)' },
  CA: { nom: 'Bank of Canada', nomFr: 'Banque du Canada (BoC)' },
  AU: { nom: 'Reserve Bank of Australia', nomFr: "Banque de réserve d'Australie (RBA)" },
  NZ: { nom: 'Reserve Bank of New Zealand', nomFr: 'Banque de réserve de Nouvelle-Zélande (RBNZ)' },
  CN: { nom: "People's Bank of China (1-year LPR)", nomFr: 'Banque populaire de Chine (LPR 1 an)' },
};

interface BanqueCentrale {
  pays: string;
  devise: string;
  nom: string;
  nomFr: string;
  taux: number | null;
  derniere: { date: number; actuel: number; precedent: number | null; variation: number | null } | null;
  prochaine: { date: number; prevision: number | null } | null;
}

async function evenementsBruts(debut: number, fin: number, pays: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await fetch(
      `https://economic-calendar.tradingview.com/events?from=${new Date(debut).toISOString()}&to=${new Date(fin).toISOString()}&countries=${pays}`,
      { headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0)' }, signal: AbortSignal.timeout(10000) },
    );
    return r.ok ? (((await r.json()) as { result?: Record<string, unknown>[] }).result ?? []) : [];
  } catch {
    return [];
  }
}

const EST_DECISION = (titre: string) => /(interest rate decision|loan prime rate 1y)/i.test(titre) && !/minutes/i.test(titre);

async function banquesCentrales(): Promise<BanqueCentrale[]> {
  const jour = 86400000;
  const maintenant = Date.now();
  const pays = Object.keys(BANQUES).join(',');
  // Le service tronque à 2 000 événements : trois tranches pour couvrir 100 jours passés et 120 à venir.
  const tranches = await Promise.all([
    evenementsBruts(maintenant - 100 * jour, maintenant - 50 * jour, pays),
    evenementsBruts(maintenant - 50 * jour, maintenant, pays),
    evenementsBruts(maintenant, maintenant + 120 * jour, pays),
  ]);
  const decisions = tranches
    .flat()
    .filter((e) => EST_DECISION(String(e.title ?? '')))
    .map((e) => ({
      pays: String(e.country),
      devise: String(e.currency ?? ''),
      date: Date.parse(String(e.date)),
      actuel: typeof e.actual === 'number' ? e.actual : null,
      prevision: typeof e.forecast === 'number' ? e.forecast : null,
      precedent: typeof e.previous === 'number' ? e.previous : null,
    }))
    .sort((a, b) => a.date - b.date);
  return Object.entries(BANQUES).map(([code, b]) => {
    const liste = decisions.filter((d) => d.pays === code);
    const passees = liste.filter((d) => d.actuel !== null && d.date <= maintenant);
    const derniere = passees[passees.length - 1] ?? null;
    const prochaine = liste.find((d) => d.date > maintenant) ?? null;
    return {
      pays: code,
      devise: liste[0]?.devise ?? '',
      nom: b.nom,
      nomFr: b.nomFr,
      taux: derniere?.actuel ?? prochaine?.precedent ?? null,
      derniere: derniere
        ? {
            date: derniere.date,
            actuel: derniere.actuel!,
            precedent: derniere.precedent,
            variation: derniere.precedent !== null ? Math.round((derniere.actuel! - derniere.precedent) * 100) / 100 : null,
          }
        : null,
      prochaine: prochaine ? { date: prochaine.date, prevision: prochaine.prevision } : null,
    };
  });
}

// ---------- Résultats d'entreprises (marché américain, Nasdaq) ----------

interface Resultat {
  date: string;
  symbole: string;
  nom: string;
  moment: 'avant-ouverture' | 'apres-cloture' | 'inconnu';
  capitalisation: number | null;
  bpaPrevu: string | null;
  bpaReel: string | null;
  surprisePct: number | null;
  bpaAnDernier: string | null;
  trimestre: string;
}

function nombreDollars(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim() || v === 'N/A') return null;
  const n = Number(v.replace(/[$,()]/g, ''));
  return Number.isFinite(n) ? (v.includes('(') ? -n : n) : null;
}

async function resultatsDuJour(date: string): Promise<Resultat[]> {
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { data?: { rows?: Record<string, string>[] | null } };
    return (d.data?.rows ?? []).map((l) => ({
      date,
      symbole: l.symbol,
      nom: l.name,
      moment: l.time === 'time-pre-market' ? 'avant-ouverture' : l.time === 'time-after-hours' ? 'apres-cloture' : 'inconnu',
      capitalisation: nombreDollars(l.marketCap),
      bpaPrevu: l.epsForecast || null,
      bpaReel: l.eps || null,
      surprisePct: l.surprise && l.surprise !== 'N/A' ? Number(l.surprise) : null,
      bpaAnDernier: l.lastYearEPS || null,
      trimestre: l.fiscalQuarterEnding ?? '',
    }));
  } catch {
    return [];
  }
}

async function resultats(): Promise<Resultat[]> {
  const jour = 86400000;
  const dates: string[] = [];
  for (let i = -1; i <= 7; i++) {
    const d = new Date(Date.now() + i * jour);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  const parJour = await Promise.all(dates.map(resultatsDuJour));
  // Les 40 plus grosses capitalisations de chaque jour suffisent largement pour suivre le marché.
  return parJour.flatMap((l) => l.sort((a, b) => (b.capitalisation ?? 0) - (a.capitalisation ?? 0)).slice(0, 40));
}

async function calendrierBilingue(): Promise<EvenementCalendrier[]> {
  const evenements = await calendrier();
  const titres = [...new Set(evenements.map((e) => e.titre))];
  const fr = await traduire(titres, 'en', 'fr');
  const carte = new Map(titres.map((t, i) => [t, fr[i]]));
  return evenements.map((e) => ({ ...e, titreFr: carte.get(e.titre) ?? e.titre }));
}

async function agreger(fluxs: Flux[], limite: number): Promise<Depeche[]> {
  const listes = await Promise.all(fluxs.map(lireFlux));
  const vus = new Set<string>();
  const toutes = listes
    .flat()
    .filter((d) => d.date <= Date.now() + 3600000)
    .sort((a, b) => b.date - a.date)
    .filter((d) => {
      const cle = normaliserTitre(d.titre).slice(0, 80);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
  return toutes.slice(0, limite);
}

// ---------- Bougies (Yahoo Finance) ----------

const INTERVALLES_YAHOO = new Set(['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo']);
const PERIODES_YAHOO = new Set(['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']);

/** Bougies [temps (s), ouverture, plus haut, plus bas, clôture, volume], des plus anciennes aux plus récentes. */
async function bougiesYahoo(symbole: string, intervalle: string, periode: string): Promise<number[][] | null> {
  for (const hote of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${hote}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?interval=${intervalle}&range=${periode}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
      });
      if (!r.ok) continue;
      const d = (await r.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume?: (number | null)[] }[] } }[] };
      };
      const res = d.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0];
      if (!res?.timestamp || !q) continue;
      const sortie: number[][] = [];
      res.timestamp.forEach((t, k) => {
        const o = q.open[k];
        const h = q.high[k];
        const l = q.low[k];
        const c = q.close[k];
        if (o == null || h == null || l == null || c == null) return;
        sortie.push([t, o, h, l, c, q.volume?.[k] ?? 0]);
      });
      return sortie;
    } catch {
      // essai sur l'autre hôte
    }
  }
  return null;
}

function json(donnees: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(donnees), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async scheduled(evenement: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    envGlobal = env;
    ctx.waitUntil(
      (async () => {
        const avant = await lireCopieFJ(env);
        const etat = await rafraichirFinancialJuice(env);
        console.log(`FinancialJuice : ${etat}`);
        const apres = await lireCopieFJ(env);
        // Annonces parues depuis la dernière récupération réussie : rien n'est perdu si FinancialJuice
        // a refusé un passage (429), et rien n'est envoyé deux fois.
        const fenetreFJ = apres && avant && apres.t > avant.t && avant.t > 0 ? { debut: avant.t, fin: apres.t, texte: apres.texte } : null;
        const bilan = await tourneePush(env, evenement.scheduledTime, fenetreFJ);
        console.log(`Push : ${bilan}`);
        await Promise.all([sauverSecours(), sauverDictionnaires()]);
      })(),
    );
  },

  async fetch(requete: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    envGlobal = env;
    contexteRequete = ctx;
    if (requete.method === 'OPTIONS') return json(null, 86400);
    const url = new URL(requete.url);
    origine = url.origin;
    if (url.pathname.startsWith('/__cache/')) return json({ erreur: 'Route inconnue.' }, 0);
    if (url.pathname.startsWith('/push/')) return routePush(requete, url, env);
    const cache = caches.default;
    const cleCache = new Request(url.toString(), { method: 'GET' });
    const enCache = await cache.match(cleCache);
    if (enCache) return enCache;

    let reponse: Response;
    if (url.pathname === '/flux') {
      const depeches = await bilingue(await agreger(FLUX, 500));
      reponse = json({ generéLe: Date.now(), depeches }, 30);
    } else if (url.pathname === '/annonces') {
      const depeches = await bilingue(await agreger([FLUX_FINANCIALJUICE], 200));
      reponse = json({ generéLe: Date.now(), depeches }, 20);
    } else if (url.pathname === '/binance/paires') {
      reponse = json({ generéLe: Date.now(), champs: ['symbole', 'base', 'cotation', 'prix', 'variation24h', 'volume24h'], paires: await pairesBinance() }, 300);
    } else if (url.pathname === '/banques-centrales') {
      reponse = json({ generéLe: Date.now(), banques: await banquesCentrales() }, 3600);
    } else if (url.pathname === '/resultats') {
      reponse = json({ generéLe: Date.now(), resultats: await resultats() }, 1800);
    } else if (url.pathname === '/surprises') {
      reponse = json({ generéLe: Date.now(), jours: 30, pays: await surprises() }, 1800);
    } else if (url.pathname === '/calendrier') {
      reponse = json({ generéLe: Date.now(), evenements: await calendrierBilingue() }, 60);
    } else if (url.pathname === '/recherche') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
      const ticker = (url.searchParams.get('ticker') ?? '').trim().slice(0, 20);
      if (!q && !ticker) return json({ erreur: 'Paramètre q ou ticker requis.' }, 0);
      const fluxs: Flux[] = [];
      if (q) {
        // Bing News répond depuis les adresses Cloudflare ; Google News les bloque.
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=fr&cc=FR`, source: 'Bing Actualités', categorie: 'marches', langue: 'fr' });
        fluxs.push({ url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en&cc=US`, source: 'Bing News', categorie: 'marches', langue: 'en' });
      }
      if (ticker && /^[A-Z0-9.^=-]+$/i.test(ticker)) {
        fluxs.push({ url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`, source: 'Yahoo Finance', categorie: 'marches', langue: 'en' });
      }
      const depeches = await bilingue(await agreger(fluxs, 80));
      reponse = json({ generéLe: Date.now(), depeches }, 120);
    } else if (url.pathname === '/bougies') {
      // Historique des graphiques de Parnassa Trader (forex, indices, actions) : l'API Yahoo n'a pas de CORS.
      const s = (url.searchParams.get('s') ?? '').trim();
      const i = url.searchParams.get('i') ?? '';
      const r = url.searchParams.get('r') ?? '';
      if (!/^[A-Z0-9.^=-]{1,20}$/i.test(s) || !INTERVALLES_YAHOO.has(i) || !PERIODES_YAHOO.has(r)) return json({ erreur: 'Paramètres s, i et r requis.' }, 0);
      const bougies = await bougiesYahoo(s, i, r);
      if (!bougies) return json({ erreur: 'Historique indisponible.' }, 0);
      reponse = json({ generéLe: Date.now(), bougies }, i === '1m' || i === '5m' ? 30 : 120);
    } else if (url.pathname === '/' || url.pathname === '/sante') {
      reponse = json({ service: 'parnassa-actualites', flux: FLUX.length, routes: ['/flux', '/annonces', '/calendrier', '/surprises', '/banques-centrales', '/resultats', '/recherche?q=…&ticker=…', '/bougies?s=…&i=…&r=…'] }, 0);
    } else {
      return json({ erreur: 'Route inconnue.' }, 0);
    }
    ctx.waitUntil(Promise.all([cache.put(cleCache, reponse.clone()), sauverSecours(), sauverDictionnaires()]));
    return reponse;
  },
};


// ---------- Liste complète des paires Binance ----------

const DEVISES_COTATION = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'USD1', 'EURI', 'AEUR', 'DAI', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL', 'JPY', 'MXN', 'PLN', 'RON', 'ARS', 'ZAR', 'UAH', 'COP', 'CZK', 'IDR', 'GBP', 'AUD', 'RUB', 'NGN', 'USD', 'XRP', 'DOGE', 'TRX', 'SOL', 'DOT'].sort(
  (a, b) => b.length - a.length,
);

function decomposer(symbole: string): [string, string] | null {
  for (const q of DEVISES_COTATION) if (symbole.endsWith(q) && symbole.length > q.length) return [symbole.slice(0, -q.length), q];
  return null;
}

/** Toutes les paires actives : [symbole, base, cotation, dernier prix, variation 24 h en %, volume 24 h en devise de cotation]. */
async function pairesBinance(): Promise<(string | number)[][]> {
  const r = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const brut = (await r.json()) as { symbol: string; openPrice: string; lastPrice: string; quoteVolume: string; count: number }[];
  const sortie: (string | number)[][] = [];
  for (const t of brut) {
    if (!t.count) continue;
    const volume = Number(t.quoteVolume);
    if (!(volume > 0)) continue;
    const parties = decomposer(t.symbol);
    if (!parties) continue;
    const dernier = Number(t.lastPrice);
    const ouverture = Number(t.openPrice);
    sortie.push([t.symbol, parties[0], parties[1], dernier, ouverture > 0 ? Math.round(((dernier - ouverture) / ouverture) * 10000) / 100 : 0, Math.round(volume)]);
  }
  return sortie.sort((a, b) => (b[5] as number) - (a[5] as number));
}

// ---------- Notifications push (application fermée) ----------

interface PreferencesPush {
  langue: 'fr' | 'en';
  annonces: 'aucune' | 'importantes' | 'toutes';
  motsCles: string[];
  rappels: { ids: string[]; delaiMinutes: number; fortImpactAuto: boolean };
  alertes: { id: string; symbole: string; condition: 'au-dessus' | 'en-dessous'; seuil: number; note?: string; reference?: number }[];
}

interface EnregistrementPush {
  abonnement: AbonnementPush;
  preferences: PreferencesPush;
  /** Identifiants déjà notifiés (alertes déclenchées, publications), pour ne jamais notifier deux fois. */
  envoyes: string[];
  majLe: number;
}

const URL_APP = 'https://akhimysah.github.io/parnassa-trading/';
// Seuls les services de push des navigateurs sont acceptés (pas d'envoi vers une adresse arbitraire).
const SERVICES_PUSH = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;

async function cleAbonnement(endpoint: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return `abo:${[...new Uint8Array(empreinte)].slice(0, 12).map((o) => o.toString(16).padStart(2, '0')).join('')}`;
}

function nettoyerPreferences(p: Partial<PreferencesPush> | undefined): PreferencesPush {
  return {
    langue: p?.langue === 'en' ? 'en' : 'fr',
    annonces: p?.annonces === 'toutes' || p?.annonces === 'aucune' ? p.annonces : 'importantes',
    motsCles: (p?.motsCles ?? []).filter((m) => typeof m === 'string').slice(0, 30).map((m) => m.slice(0, 40)),
    rappels: {
      ids: (p?.rappels?.ids ?? []).filter((x) => typeof x === 'string').slice(0, 100),
      delaiMinutes: Math.min(60, Math.max(1, Number(p?.rappels?.delaiMinutes) || 5)),
      fortImpactAuto: Boolean(p?.rappels?.fortImpactAuto),
    },
    alertes: (p?.alertes ?? [])
      .filter((a) => a && typeof a.id === 'string' && /^[A-Z_]{2,12}:[A-Z0-9.!_]{1,20}$/.test(a.symbole) && Number.isFinite(a.seuil))
      .slice(0, 50)
      .map((a) => ({
        id: a.id,
        symbole: a.symbole,
        condition: a.condition === 'en-dessous' ? 'en-dessous' : 'au-dessus',
        seuil: Number(a.seuil),
        note: a.note?.slice(0, 80),
        reference: Number.isFinite(Number(a.reference)) && Number(a.reference) > 0 ? Number(a.reference) : undefined,
      })),
  };
}

function vapid(env: Env) {
  return { publique: env.VAPID_PUBLIQUE, privee: JSON.parse(env.VAPID_PRIVEE) as JsonWebKey, contact: URL_APP };
}

async function routePush(requete: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === '/push/cle') return json({ cle: env.VAPID_PUBLIQUE }, 3600);
  if (requete.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 0);
  let corps: { abonnement?: AbonnementPush; preferences?: Partial<PreferencesPush>; endpoint?: string };
  try {
    corps = (await requete.json()) as typeof corps;
  } catch {
    return json({ erreur: 'Corps JSON invalide.' }, 0);
  }
  const endpoint = corps.abonnement?.endpoint ?? corps.endpoint ?? '';
  if (!SERVICES_PUSH.test(endpoint)) return json({ erreur: 'Service de push non reconnu.' }, 0);
  const cle = await cleAbonnement(endpoint);

  if (url.pathname === '/push/abonnement') {
    const a = corps.abonnement;
    if (!a?.keys?.p256dh || !a.keys.auth) return json({ erreur: 'Abonnement incomplet.' }, 0);
    const existant = (await env.ANNONCES.get(cle, 'json')) as EnregistrementPush | null;
    const enregistrement: EnregistrementPush = {
      abonnement: { endpoint: a.endpoint, keys: { p256dh: a.keys.p256dh, auth: a.keys.auth } },
      preferences: nettoyerPreferences(corps.preferences),
      envoyes: existant?.envoyes ?? [],
      majLe: Date.now(),
    };
    await env.ANNONCES.put(cle, JSON.stringify(enregistrement), { expirationTtl: 60 * 86400 });
    return json({ ok: true }, 0);
  }
  if (url.pathname === '/push/desabonnement') {
    await env.ANNONCES.delete(cle);
    return json({ ok: true }, 0);
  }
  if (url.pathname === '/push/test') {
    const e = (await env.ANNONCES.get(cle, 'json')) as EnregistrementPush | null;
    if (!e) return json({ erreur: 'Abonnement inconnu.' }, 0);
    const fr = e.preferences.langue === 'fr';
    const r = await envoyerPush(
      e.abonnement,
      { titre: 'Parnassa Trading', corps: fr ? 'Les notifications push fonctionnent, même application fermée.' : 'Push notifications work, even with the app closed.', url: URL_APP, tag: 'test' },
      vapid(env),
    );
    return json({ resultat: r }, 0);
  }
  return json({ erreur: 'Route inconnue.' }, 0);
}

function titreLangue(d: Depeche, langue: 'fr' | 'en'): string {
  if (d.donnee) {
    const indic = langue === 'fr' ? (d.donnee.indicateurFr ?? d.donnee.indicateur) : d.donnee.indicateur;
    return `${indic} : ${langue === 'fr' ? 'réel' : 'actual'} ${d.donnee.actuel} (${langue === 'fr' ? 'prév.' : 'fcst'} ${d.donnee.prevision ?? '–'}, ${langue === 'fr' ? 'préc.' : 'prev.'} ${d.donnee.precedent ?? '–'})`;
  }
  return langue === 'fr' ? (d.titreFr ?? d.titre) : (d.titreEn ?? d.titre);
}

function motCleTrouve(texte: string, motsCles: string[]): string | null {
  const sans = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = sans(texte);
  for (const m of motsCles) {
    const mot = sans(m.trim());
    if (!mot) continue;
    const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${echappe}([^a-z0-9]|$)`).test(t)) return m;
  }
  return null;
}

function valeurTexte(v: number | null, unite: string, echelle: string): string {
  if (v === null) return '–';
  return `${v}${echelle ? ` ${echelle}` : ''}${unite === '%' ? ' %' : unite ? ` ${unite}` : ''}`;
}

/**
 * Tournée de la tâche planifiée : pour chaque appareil abonné, annonces FinancialJuice parues dans la fenêtre
 * des 2 dernières minutes, rappels d'événements, publications suivies et alertes de prix franchies.
 */
async function tourneePush(env: Env, heurePlanifiee: number, fenetreFJ: { debut: number; fin: number; texte: string } | null): Promise<string> {
  const liste = await env.ANNONCES.list({ prefix: 'abo:' });
  if (liste.keys.length === 0) return 'aucun abonné';
  const enregistrements = (
    await Promise.all(liste.keys.slice(0, 15).map(async (k) => ({ cle: k.name, e: (await env.ANNONCES.get(k.name, 'json')) as EnregistrementPush | null })))
  ).filter((x): x is { cle: string; e: EnregistrementPush } => x.e !== null);

  const fin = heurePlanifiee;
  const debut = fin - 120000;

  // Annonces FinancialJuice parues depuis la récupération précédente, traduites.
  const nouvelles = fenetreFJ ? parser(fenetreFJ.texte, FLUX_FINANCIALJUICE).filter((d) => d.date >= fenetreFJ.debut && d.date < fenetreFJ.fin) : [];
  const nouvellesBilingues = nouvelles.length ? await bilingue(nouvelles) : [];

  // Calendrier (rappels et publications) seulement si un abonné en a besoin.
  const besoinCalendrier = enregistrements.some((x) => x.e.preferences.rappels.ids.length > 0 || x.e.preferences.rappels.fortImpactAuto);
  const evenements = besoinCalendrier ? await calendrierBilingue() : [];

  // Prix des alertes actives : bougies 1 min pour Binance, scanner pour l'or, le forex, les indices…
  const alertesActives = enregistrements.flatMap((x) => x.e.preferences.alertes.filter((a) => !x.e.envoyes.includes(`alerte:${a.id}`)));
  const paires = [...new Set(alertesActives.filter((a) => a.symbole.startsWith('BINANCE:')).map((a) => a.symbole.split(':')[1]))].slice(0, 10);
  const autres = [...new Set(alertesActives.filter((a) => !a.symbole.startsWith('BINANCE:')).map((a) => a.symbole))].slice(0, 60);
  const cotations = new Map<string, number>();
  if (autres.length) {
    try {
      const r = await fetch('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        body: JSON.stringify({ symbols: { tickers: autres }, columns: ['close'] }),
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = (await r.json()) as { data?: { s: string; d: (number | null)[] }[] };
        for (const l of d.data ?? []) if (typeof l.d[0] === 'number') cotations.set(l.s, l.d[0]);
      }
    } catch {
      // cotations indisponibles : alertes vérifiées au passage suivant
    }
  }
  const bougies = new Map<string, { ouverture: number; haut: number; bas: number; cloture: number }>();
  await Promise.all(
    paires.map(async (p) => {
      try {
        const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${p}&interval=1m&limit=3`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const k = (await r.json()) as string[][];
        if (k.length === 0) return;
        bougies.set(p, {
          ouverture: Number(k[0][1]),
          haut: Math.max(...k.map((x) => Number(x[2]))),
          bas: Math.min(...k.map((x) => Number(x[3]))),
          cloture: Number(k[k.length - 1][4]),
        });
      } catch {
        // prix indisponible : alerte vérifiée au passage suivant
      }
    }),
  );

  let envois = 0;
  let expires = 0;
  const cles = vapid(env);
  for (const { cle, e } of enregistrements) {
    const p = e.preferences;
    const fr = p.langue === 'fr';
    const messages: MessagePush[] = [];
    let modifie = false;

    // 1. Annonces.
    const retenues = nouvellesBilingues.filter((d) => {
      const titre = `${d.titreFr ?? ''} ${d.titreEn ?? ''} ${d.titre}`;
      return p.annonces === 'toutes' || (p.annonces === 'importantes' && d.important) || motCleTrouve(titre, p.motsCles) !== null;
    });
    if (retenues.length > 3) {
      messages.push({
        titre: `FinancialJuice · ${retenues.length} ${fr ? 'nouvelles annonces' : 'new headlines'}`,
        corps: retenues.slice(0, 3).map((d) => `• ${titreLangue(d, p.langue)}`).join('\n'),
        url: `${URL_APP}#actualites`,
        tag: `fj-lot-${fin}`,
      });
    } else {
      for (const d of retenues) {
        const mot = motCleTrouve(`${d.titreFr ?? ''} ${d.titreEn ?? ''} ${d.titre}`, p.motsCles);
        messages.push({
          titre: mot ? `📰 ${mot} · FinancialJuice` : d.important ? `★ FinancialJuice` : 'FinancialJuice',
          corps: titreLangue(d, p.langue),
          url: `${URL_APP}#actualites`,
          tag: `fj-${d.id}`,
        });
      }
    }

    // 2. Rappels avant publication, puis publication du chiffre suivi.
    const suivis = new Set(p.rappels.ids);
    for (const ev of evenements) {
      const concerne = suivis.has(ev.id) || (p.rappels.fortImpactAuto && ev.importance >= 1);
      if (!concerne) continue;
      const nom = fr ? (ev.titreFr ?? ev.titre) : ev.titre;
      const moment = ev.date - p.rappels.delaiMinutes * 60000;
      if (moment >= debut && moment < fin) {
        messages.push({
          titre: `⏰ ${fr ? 'Dans' : 'In'} ${p.rappels.delaiMinutes} min · ${ev.pays}`,
          corps: `${nom} — ${fr ? 'prévision' : 'forecast'} ${valeurTexte(ev.prevision, ev.unite, ev.echelle)}, ${fr ? 'précédent' : 'previous'} ${valeurTexte(ev.precedent, ev.unite, ev.echelle)}`,
          url: `${URL_APP}#calendrier`,
          tag: `rappel-${ev.id}`,
        });
      }
      const clePublie = `publie:${ev.id}`;
      if (ev.actuel !== null && ev.date <= fin && fin - ev.date < 3 * 3600000 && !e.envoyes.includes(clePublie)) {
        const ecart = ev.prevision !== null ? Math.sign(ev.actuel - ev.prevision) : 0;
        messages.push({
          titre: `📊 ${fr ? 'Publié' : 'Released'} · ${ev.pays}`,
          corps: `${nom} — ${fr ? 'réel' : 'actual'} ${valeurTexte(ev.actuel, ev.unite, ev.echelle)}${ecart > 0 ? ' ▲' : ecart < 0 ? ' ▼' : ''}, ${fr ? 'prévision' : 'forecast'} ${valeurTexte(ev.prevision, ev.unite, ev.echelle)}`,
          url: `${URL_APP}#calendrier`,
          tag: `publie-${ev.id}`,
        });
        e.envoyes.push(clePublie);
        modifie = true;
      }
    }

    // 3. Alertes de prix franchies dans la fenêtre.
    for (const a of p.alertes) {
      const cleAlerte = `alerte:${a.id}`;
      if (e.envoyes.includes(cleAlerte)) continue;
      let franchie = false;
      let dernier: number | undefined;
      if (a.symbole.startsWith('BINANCE:')) {
        const b = bougies.get(a.symbole.split(':')[1]);
        if (!b) continue;
        dernier = b.cloture;
        franchie = a.condition === 'au-dessus' ? b.ouverture < a.seuil && b.haut >= a.seuil : b.ouverture > a.seuil && b.bas <= a.seuil;
      } else {
        // Sans bougies : franchissement par rapport au prix de référence (création de l'alerte ou dernier vu).
        dernier = cotations.get(a.symbole);
        if (dernier === undefined || a.reference === undefined) continue;
        franchie = a.condition === 'au-dessus' ? a.reference < a.seuil && dernier >= a.seuil : a.reference > a.seuil && dernier <= a.seuil;
      }
      if (!franchie) continue;
      messages.push({
        titre: `🔔 ${a.symbole.split(':')[1]} ${a.condition === 'au-dessus' ? (fr ? 'au-dessus de' : 'above') : fr ? 'sous' : 'below'} ${a.seuil}`,
        corps: `${fr ? 'Dernier prix' : 'Last price'} ${dernier}${a.note ? ` — ${a.note}` : ''}`,
        url: `${URL_APP}#alertes`,
        tag: `alerte-${a.id}`,
      });
      e.envoyes.push(cleAlerte);
      modifie = true;
    }

    for (const m of messages.slice(0, 6)) {
      if (envois >= 20) break;
      const r = await envoyerPush(e.abonnement, m, cles);
      envois += 1;
      if (r === 'expire') {
        await env.ANNONCES.delete(cle);
        expires += 1;
        modifie = false;
        break;
      }
    }
    if (modifie) {
      e.envoyes = e.envoyes.slice(-200);
      await env.ANNONCES.put(cle, JSON.stringify(e), { expirationTtl: 60 * 86400 });
    }
  }
  return `${enregistrements.length} abonné(s), ${nouvelles.length} annonce(s) dans la fenêtre, ${envois} envoi(s), ${expires} expiré(s)`;
}
