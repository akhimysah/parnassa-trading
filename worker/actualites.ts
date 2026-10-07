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

interface Env {
  ANNONCES: KVNamespace;
}

let envGlobal: Env | undefined;
const CLE_KV_FJ = 'financialjuice-rss';
let memoireFJ: { lueLe: number; texte: string | null } | null = null;

/**
 * FinancialJuice bloque les adresses qui l'interrogent trop souvent. Seule la tâche planifiée l'appelle
 * (toutes les 2 min) et dépose le flux dans KV ; les requêtes lisent cette copie (mémoire de l'isolat 20 s).
 */
async function texteFinancialJuice(): Promise<string | null> {
  if (memoireFJ && Date.now() - memoireFJ.lueLe < 20000) return memoireFJ.texte;
  const texte = envGlobal ? await envGlobal.ANNONCES.get(CLE_KV_FJ) : null;
  memoireFJ = { lueLe: Date.now(), texte };
  return texte;
}

async function rafraichirFinancialJuice(env: Env): Promise<string> {
  try {
    const r = await fetch(FLUX_FINANCIALJUICE.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParnassaTrading/1.0; +https://akhimysah.github.io/parnassa-trading/)', Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return `refus ${r.status}`;
    const texte = await r.text();
    if (!/<item>/i.test(texte)) return 'flux vide';
    const actuel = await env.ANNONCES.get(CLE_KV_FJ);
    if (actuel === texte) return 'inchangé';
    await env.ANNONCES.put(CLE_KV_FJ, texte);
    return 'mis à jour';
  } catch (e) {
    return `erreur ${e instanceof Error ? e.message : ''}`;
  }
}

async function lireFlux(flux: Flux): Promise<Depeche[]> {
  if (flux.source === 'FinancialJuice') {
    const texte = await texteFinancialJuice();
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

function json(donnees: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(donnees), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async scheduled(_evenement: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(rafraichirFinancialJuice(env).then((etat) => console.log(`FinancialJuice : ${etat}`)));
  },

  async fetch(requete: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    envGlobal = env;
    if (requete.method === 'OPTIONS') return json(null, 86400);
    const url = new URL(requete.url);
    origine = url.origin;
    if (url.pathname.startsWith('/__cache/')) return json({ erreur: 'Route inconnue.' }, 0);
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
    } else if (url.pathname === '/' || url.pathname === '/sante') {
      reponse = json({ service: 'parnassa-actualites', flux: FLUX.length, routes: ['/flux', '/annonces', '/calendrier', '/recherche?q=…&ticker=…'] }, 0);
    } else {
      return json({ erreur: 'Route inconnue.' }, 0);
    }
    ctx.waitUntil(Promise.all([cache.put(cleCache, reponse.clone()), sauverSecours(), sauverDictionnaires()]));
    return reponse;
  },
};
